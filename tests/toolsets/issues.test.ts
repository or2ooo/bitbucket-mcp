import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketClient } from "../../src/bitbucket/client.js";
import { Config } from "../../src/config.js";
import { registerIssueTools } from "../../src/toolsets/issues.js";
import { registerPipelineTools } from "../../src/toolsets/pipelines.js";

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

const mockIssue = {
  id: 1,
  title: "Fix login bug",
  state: "open",
  priority: "major",
  kind: "bug",
  content: { raw: "Login fails on Chrome", markup: "markdown", html: "<p>Login fails on Chrome</p>" },
  reporter: { display_name: "Alice", uuid: "{uuid-1}", nickname: "alice", type: "user" },
  assignee: { display_name: "Bob", uuid: "{uuid-2}", nickname: "bob", type: "user" },
  created_on: "2025-01-01T00:00:00Z",
  updated_on: "2025-01-02T00:00:00Z",
  votes: 3,
  watches: 5,
  type: "issue",
};

const mockIssueComment = {
  id: 10,
  content: { raw: "Working on this", markup: "markdown", html: "<p>Working on this</p>" },
  created_on: "2025-01-03T00:00:00Z",
  updated_on: "2025-01-03T00:00:00Z",
  user: { display_name: "Alice", uuid: "{uuid-1}", nickname: "alice", type: "user" },
  type: "issue_comment",
};

const mockPipeline = {
  uuid: "{pipeline-uuid-1}",
  build_number: 42,
  state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } },
  target: { ref_type: "branch", ref_name: "main", type: "pipeline_ref_target" },
  creator: { display_name: "Alice", uuid: "{uuid-1}", nickname: "alice", type: "user" },
  created_on: "2025-01-01T00:00:00Z",
  completed_on: "2025-01-01T00:05:00Z",
  duration_in_seconds: 300,
  type: "pipeline",
};

const mswServer = setupServer();

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

// Helper to call a registered tool by simulating what McpServer does
async function callTool(
  toolName: string,
  args: Record<string, unknown>,
  config: Config = mockConfig
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  const mockServer = {
    tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      handlers[name] = handler;
    },
  } as unknown as McpServer;

  const client = new BitbucketClient(config);
  registerIssueTools(mockServer, client, config);
  registerPipelineTools(mockServer, client, config);

  const handler = handlers[toolName];
  if (!handler) throw new Error(`Tool ${toolName} not registered`);
  return handler(args) as Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
}

describe("Issue Tools", () => {
  describe("bb_list_issues", () => {
    it("lists issues with query filter", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/repositories/test-workspace/my-repo/issues`, ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get("q")).toBe('state="open"');
          return HttpResponse.json({
            values: [mockIssue],
            page: 1,
            size: 1,
            pagelen: 10,
          });
        })
      );

      const result = await callTool("bb_list_issues", {
        repo_slug: "my-repo",
        query: 'state="open"',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("#1");
      expect(result.content[0].text).toContain("Fix login bug");
      expect(result.content[0].text).toContain("open");
    });

    it("returns empty message when no issues", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/repositories/test-workspace/my-repo/issues`, () => {
          return HttpResponse.json({
            values: [],
            page: 1,
            size: 0,
            pagelen: 10,
          });
        })
      );

      const result = await callTool("bb_list_issues", { repo_slug: "my-repo" });
      expect(result.content[0].text).toBe("No issues found.");
    });
  });

  describe("bb_get_issue", () => {
    it("gets a single issue", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/repositories/test-workspace/my-repo/issues/1`, () => {
          return HttpResponse.json(mockIssue);
        })
      );

      const result = await callTool("bb_get_issue", {
        repo_slug: "my-repo",
        issue_id: 1,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("#1: Fix login bug");
      expect(result.content[0].text).toContain("major");
      expect(result.content[0].text).toContain("bug");
      expect(result.content[0].text).toContain("Alice");
    });
  });

  describe("bb_create_issue", () => {
    it("creates an issue", async () => {
      mswServer.use(
        http.post(`${BASE_URL}/repositories/test-workspace/my-repo/issues`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.title).toBe("New bug");
          expect(body.content).toEqual({ raw: "Something broke" });
          expect(body.kind).toBe("bug");
          expect(body.priority).toBe("critical");
          return HttpResponse.json({ ...mockIssue, id: 2, title: "New bug" });
        })
      );

      const result = await callTool("bb_create_issue", {
        repo_slug: "my-repo",
        title: "New bug",
        content: "Something broke",
        kind: "bug",
        priority: "critical",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("New bug");
    });

    it("creates an issue with only title", async () => {
      mswServer.use(
        http.post(`${BASE_URL}/repositories/test-workspace/my-repo/issues`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.title).toBe("Minimal issue");
          expect(body.content).toBeUndefined();
          expect(body.kind).toBeUndefined();
          return HttpResponse.json({ ...mockIssue, id: 3, title: "Minimal issue" });
        })
      );

      const result = await callTool("bb_create_issue", {
        repo_slug: "my-repo",
        title: "Minimal issue",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Minimal issue");
    });
  });

  describe("bb_comment_issue", () => {
    it("comments on an issue", async () => {
      mswServer.use(
        http.post(
          `${BASE_URL}/repositories/test-workspace/my-repo/issues/1/comments`,
          async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            expect(body.content).toEqual({ raw: "I can reproduce this" });
            return HttpResponse.json(mockIssueComment);
          }
        )
      );

      const result = await callTool("bb_comment_issue", {
        repo_slug: "my-repo",
        issue_id: 1,
        content: "I can reproduce this",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("#10");
      expect(result.content[0].text).toContain("Alice");
      expect(result.content[0].text).toContain("Working on this");
    });
  });

  describe("readonly mode blocks writes", () => {
    const readonlyConfig: Config = { ...mockConfig, readonly: true };

    it("blocks bb_create_issue in readonly mode", async () => {
      const result = await callTool(
        "bb_create_issue",
        { repo_slug: "my-repo", title: "blocked" },
        readonlyConfig
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("readonly");
    });

    it("blocks bb_comment_issue in readonly mode", async () => {
      const result = await callTool(
        "bb_comment_issue",
        { repo_slug: "my-repo", issue_id: 1, content: "blocked" },
        readonlyConfig
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("readonly");
    });
  });

  describe("workspace and repo allowed checks", () => {
    it("rejects disallowed workspace", async () => {
      const restrictedConfig: Config = {
        ...mockConfig,
        allowedWorkspaces: ["allowed-ws"],
      };

      const result = await callTool(
        "bb_list_issues",
        { workspace: "forbidden-ws", repo_slug: "my-repo" },
        restrictedConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not in the allowed list");
    });

    it("rejects disallowed repo", async () => {
      const restrictedConfig: Config = {
        ...mockConfig,
        allowedRepos: ["my-repo"],
      };

      const result = await callTool(
        "bb_list_issues",
        { repo_slug: "secret-repo" },
        restrictedConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not in the allowed list");
    });

    it("requires workspace when no default set", async () => {
      const noDefaultConfig: Config = {
        ...mockConfig,
        defaultWorkspace: undefined,
      };

      const result = await callTool(
        "bb_list_issues",
        { repo_slug: "my-repo" },
        noDefaultConfig
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No workspace specified");
    });
  });
});

describe("Pipeline Tools", () => {
  describe("bb_list_pipelines", () => {
    it("lists pipelines sorted by newest first", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/repositories/test-workspace/my-repo/pipelines/`, ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get("sort")).toBe("-created_on");
          return HttpResponse.json({
            values: [mockPipeline],
            page: 1,
            size: 1,
            pagelen: 10,
          });
        })
      );

      const result = await callTool("bb_list_pipelines", {
        repo_slug: "my-repo",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("#42");
      expect(result.content[0].text).toContain("COMPLETED");
      expect(result.content[0].text).toContain("SUCCESSFUL");
    });
  });

  describe("bb_get_pipeline", () => {
    it("gets a single pipeline", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/pipelines/:uuid`,
          () => {
            return HttpResponse.json(mockPipeline);
          }
        )
      );

      const result = await callTool("bb_get_pipeline", {
        repo_slug: "my-repo",
        pipeline_uuid: "{pipeline-uuid-1}",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("#42");
      expect(result.content[0].text).toContain("main");
      expect(result.content[0].text).toContain("300s");
    });
  });

  describe("bb_trigger_pipeline", () => {
    it("triggers a pipeline on a branch", async () => {
      mswServer.use(
        http.post(
          `${BASE_URL}/repositories/test-workspace/my-repo/pipelines/`,
          async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            const target = body.target as Record<string, unknown>;
            expect(target.ref_type).toBe("branch");
            expect(target.ref_name).toBe("develop");
            expect(target.type).toBe("pipeline_ref_target");
            expect(target.selector).toBeUndefined();
            return HttpResponse.json({
              ...mockPipeline,
              build_number: 43,
              state: { name: "PENDING" },
              target: { ref_type: "branch", ref_name: "develop", type: "pipeline_ref_target" },
            });
          }
        )
      );

      const result = await callTool("bb_trigger_pipeline", {
        repo_slug: "my-repo",
        branch: "develop",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("#43");
      expect(result.content[0].text).toContain("develop");
    });

    it("triggers a custom pipeline with variables", async () => {
      mswServer.use(
        http.post(
          `${BASE_URL}/repositories/test-workspace/my-repo/pipelines/`,
          async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            const target = body.target as Record<string, unknown>;
            const selector = target.selector as Record<string, unknown>;
            expect(selector.type).toBe("custom");
            expect(selector.pattern).toBe("deploy-staging");
            const variables = body.variables as Array<Record<string, unknown>>;
            expect(variables).toHaveLength(2);
            expect(variables[0]).toEqual({ key: "ENV", value: "staging", secured: false });
            expect(variables[1]).toEqual({ key: "SECRET", value: "s3cret", secured: true });
            return HttpResponse.json({
              ...mockPipeline,
              build_number: 44,
              state: { name: "PENDING" },
            });
          }
        )
      );

      const result = await callTool("bb_trigger_pipeline", {
        repo_slug: "my-repo",
        branch: "main",
        pattern: "deploy-staging",
        variables: [
          { key: "ENV", value: "staging" },
          { key: "SECRET", value: "s3cret", secured: true },
        ],
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("#44");
    });

    it("blocks trigger in readonly mode", async () => {
      const readonlyConfig: Config = { ...mockConfig, readonly: true };
      const result = await callTool(
        "bb_trigger_pipeline",
        { repo_slug: "my-repo", branch: "main" },
        readonlyConfig
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("readonly");
    });
  });
});
