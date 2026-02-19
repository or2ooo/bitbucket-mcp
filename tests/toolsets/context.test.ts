import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { BitbucketClient } from "../../src/bitbucket/client.js";
import { Config } from "../../src/config.js";
import type { User, Workspace, PaginatedResponse } from "../../src/bitbucket/types.js";
import { formatUser, formatWorkspaceList } from "../../src/formatting.js";

const BASE_URL = "https://api.bitbucket.org/2.0";

const mockConfig: Config = {
  email: "test@example.com",
  apiToken: "test-token",
  defaultWorkspace: "test-workspace",
  allowedWorkspaces: undefined,
  allowedRepos: undefined,
  readonly: false,
  baseUrl: BASE_URL,
};

const mockUser: User = {
  display_name: "Test User",
  uuid: "{test-uuid-1234}",
  nickname: "testuser",
  account_id: "123456",
  type: "user",
};

const mockWorkspaces: Workspace[] = [
  {
    uuid: "{ws-uuid-1}",
    name: "My Workspace",
    slug: "my-workspace",
    type: "workspace",
  },
  {
    uuid: "{ws-uuid-2}",
    name: "Team Workspace",
    slug: "team-workspace",
    type: "workspace",
  },
];

const mswServer = setupServer();

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe("context tools", () => {
  describe("bb_whoami", () => {
    it("returns formatted user on success", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/user`, () => {
          return HttpResponse.json(mockUser);
        })
      );

      const client = new BitbucketClient(mockConfig);
      const user = await client.get<User>("/user");

      expect(user.display_name).toBe("Test User");
      expect(user.nickname).toBe("testuser");
      expect(user.uuid).toBe("{test-uuid-1234}");

      const formatted = formatUser(user);
      expect(formatted).toBe("Test User (@testuser)");
    });

    it("handles API errors gracefully", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/user`, () => {
          return new HttpResponse("Unauthorized", { status: 401 });
        })
      );

      const client = new BitbucketClient(mockConfig);
      await expect(client.get<User>("/user")).rejects.toThrow(
        "Bitbucket API error 401"
      );
    });
  });

  describe("bb_list_workspaces", () => {
    it("returns formatted workspace list", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/workspaces`, () => {
          return HttpResponse.json({
            values: mockWorkspaces,
            page: 1,
            size: 2,
            pagelen: 10,
          } satisfies PaginatedResponse<Workspace>);
        })
      );

      const client = new BitbucketClient(mockConfig);
      const workspaces = await client.paginateAll<Workspace>("/workspaces");

      expect(workspaces).toHaveLength(2);
      expect(workspaces[0].name).toBe("My Workspace");

      const formatted = formatWorkspaceList(workspaces);
      expect(formatted).toContain("My Workspace [my-workspace]");
      expect(formatted).toContain("Team Workspace [team-workspace]");
    });

    it("returns empty message when no workspaces found", () => {
      const formatted = formatWorkspaceList([]);
      expect(formatted).toBe("No workspaces found.");
    });

    it("passes role filter parameter", async () => {
      let capturedUrl: URL | undefined;

      mswServer.use(
        http.get(`${BASE_URL}/workspaces`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({
            values: [mockWorkspaces[0]],
            page: 1,
            size: 1,
            pagelen: 10,
          } satisfies PaginatedResponse<Workspace>);
        })
      );

      const client = new BitbucketClient(mockConfig);
      await client.paginateAll<Workspace>("/workspaces", { role: "owner" });

      expect(capturedUrl).toBeDefined();
      expect(capturedUrl!.searchParams.get("role")).toBe("owner");
    });

    it("handles pagination across multiple pages", async () => {
      let callCount = 0;
      mswServer.use(
        http.get(`${BASE_URL}/workspaces`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json({
              values: [mockWorkspaces[0]],
              page: 1,
              size: 2,
              pagelen: 1,
              next: `${BASE_URL}/workspaces?page=2`,
            });
          }
          return HttpResponse.json({
            values: [mockWorkspaces[1]],
            page: 2,
            size: 2,
            pagelen: 1,
          } satisfies PaginatedResponse<Workspace>);
        })
      );

      const client = new BitbucketClient(mockConfig);
      const workspaces = await client.paginateAll<Workspace>("/workspaces");

      expect(workspaces).toHaveLength(2);
      expect(callCount).toBe(2);
    });
  });
});
