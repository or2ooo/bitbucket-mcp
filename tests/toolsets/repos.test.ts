import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { BitbucketClient } from "../../src/bitbucket/client.js";
import { Config } from "../../src/config.js";
import type {
  Repository,
  Branch,
  Commit,
  PaginatedResponse,
  DirectoryEntry,
  CodeSearchResult,
} from "../../src/bitbucket/types.js";
import {
  formatRepositoryList,
  formatRepository,
  formatBranch,
  formatBranchList,
  formatCommitList,
  formatDirectoryEntry,
  formatDirectoryListing,
  formatCodeSearchResult,
  formatCodeSearchResults,
} from "../../src/formatting.js";
import {
  resolveWorkspace,
  assertWorkspaceAllowed,
  assertRepoAllowed,
  assertNotReadonly,
  assertConfirmed,
} from "../../src/safety.js";

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

const mockRepo: Repository = {
  uuid: "{repo-uuid-1}",
  name: "My Repo",
  full_name: "test-workspace/my-repo",
  slug: "my-repo",
  description: "A test repository",
  is_private: true,
  language: "typescript",
  created_on: "2024-01-01T00:00:00Z",
  updated_on: "2024-06-15T12:00:00Z",
  size: 1024,
  mainbranch: { name: "main", type: "branch" },
  project: { key: "PROJ", name: "My Project", uuid: "{proj-uuid}", type: "project" },
  type: "repository",
};

const mockCommit: Commit = {
  hash: "abc123def456789012345678901234567890abcd",
  message: "Initial commit\n\nAdded project files",
  date: "2024-06-15T12:00:00Z",
  author: {
    raw: "Test User <test@example.com>",
    user: {
      display_name: "Test User",
      uuid: "{user-uuid}",
      nickname: "testuser",
      type: "user",
    },
  },
  parents: [],
  type: "commit",
};

const mockBranch: Branch = {
  name: "main",
  target: mockCommit,
  type: "branch",
};

const mswServer = setupServer();

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe("repo tools", () => {
  describe("bb_list_repositories", () => {
    it("returns formatted repository list", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/repositories/test-workspace`, () => {
          return HttpResponse.json({
            values: [mockRepo],
            page: 1,
            size: 1,
            pagelen: 10,
          } satisfies PaginatedResponse<Repository>);
        })
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<Repository>>(
        "/repositories/test-workspace"
      );

      expect(result.values).toHaveLength(1);
      expect(result.values[0].full_name).toBe("test-workspace/my-repo");

      const formatted = formatRepositoryList(result.values);
      expect(formatted).toContain("test-workspace/my-repo");
      expect(formatted).toContain("private");
      expect(formatted).toContain("typescript");
    });

    it("passes query and pagination parameters", async () => {
      let capturedUrl: URL | undefined;

      mswServer.use(
        http.get(`${BASE_URL}/repositories/test-workspace`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({
            values: [],
            page: 1,
            size: 0,
            pagelen: 25,
          } satisfies PaginatedResponse<Repository>);
        })
      );

      const client = new BitbucketClient(mockConfig);
      await client.get<PaginatedResponse<Repository>>(
        "/repositories/test-workspace",
        { q: 'name ~ "test"', page: 2, pagelen: 25 }
      );

      expect(capturedUrl).toBeDefined();
      expect(capturedUrl!.searchParams.get("q")).toBe('name ~ "test"');
      expect(capturedUrl!.searchParams.get("page")).toBe("2");
      expect(capturedUrl!.searchParams.get("pagelen")).toBe("25");
    });

    it("returns empty message when no repos found", () => {
      const formatted = formatRepositoryList([]);
      expect(formatted).toBe("No repositories found.");
    });
  });

  describe("bb_get_repository", () => {
    it("returns formatted repository details", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo`,
          () => {
            return HttpResponse.json(mockRepo);
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const repo = await client.get<Repository>(
        "/repositories/test-workspace/my-repo"
      );

      expect(repo.slug).toBe("my-repo");
      expect(repo.is_private).toBe(true);

      const formatted = formatRepository(repo);
      expect(formatted).toContain("test-workspace/my-repo");
      expect(formatted).toContain("private");
      expect(formatted).toContain("typescript");
      expect(formatted).toContain("Main branch: main");
      expect(formatted).toContain("My Project [PROJ]");
    });

    it("handles 404 for non-existent repository", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/nonexistent`,
          () => {
            return new HttpResponse("Not Found", { status: 404 });
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      await expect(
        client.get<Repository>("/repositories/test-workspace/nonexistent")
      ).rejects.toThrow("Bitbucket API error 404");
    });
  });

  describe("bb_list_branches", () => {
    it("returns formatted branch list", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/refs/branches`,
          () => {
            return HttpResponse.json({
              values: [mockBranch],
              page: 1,
              size: 1,
              pagelen: 10,
            } satisfies PaginatedResponse<Branch>);
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<Branch>>(
        "/repositories/test-workspace/my-repo/refs/branches"
      );

      expect(result.values).toHaveLength(1);
      expect(result.values[0].name).toBe("main");

      const formatted = formatBranchList(result.values);
      expect(formatted).toContain("main");
      expect(formatted).toContain("abc123def456");
      expect(formatted).toContain("Initial commit");
    });

    it("returns empty message when no branches found", () => {
      const formatted = formatBranchList([]);
      expect(formatted).toBe("No branches found.");
    });
  });

  describe("bb_list_commits", () => {
    it("returns formatted commit list", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/commits`,
          () => {
            return HttpResponse.json({
              values: [mockCommit],
              page: 1,
              size: 1,
              pagelen: 10,
            } satisfies PaginatedResponse<Commit>);
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<Commit>>(
        "/repositories/test-workspace/my-repo/commits"
      );

      expect(result.values).toHaveLength(1);

      const formatted = formatCommitList(result.values);
      expect(formatted).toContain("abc123def456");
      expect(formatted).toContain("Initial commit");
      expect(formatted).toContain("Test User");
    });

    it("fetches commits for a specific revision", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/commits/main`,
          () => {
            return HttpResponse.json({
              values: [mockCommit],
              page: 1,
              size: 1,
              pagelen: 10,
            } satisfies PaginatedResponse<Commit>);
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<Commit>>(
        "/repositories/test-workspace/my-repo/commits/main"
      );

      expect(result.values).toHaveLength(1);
    });

    it("returns empty message when no commits found", () => {
      const formatted = formatCommitList([]);
      expect(formatted).toBe("No commits found.");
    });
  });

  describe("bb_get_file", () => {
    it("returns raw file content", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/src/main/README.md`,
          () => {
            return new HttpResponse("# Hello World\n\nThis is a test.", {
              headers: { "Content-Type": "text/plain" },
            });
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const content = await client.getRaw(
        "/repositories/test-workspace/my-repo/src/main/README.md"
      );

      expect(content).toBe("# Hello World\n\nThis is a test.");
    });

    it("handles 404 for non-existent file", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/src/main/missing.txt`,
          () => {
            return new HttpResponse("Not Found", { status: 404 });
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      await expect(
        client.getRaw(
          "/repositories/test-workspace/my-repo/src/main/missing.txt"
        )
      ).rejects.toThrow("Bitbucket API error 404");
    });
  });

  describe("bb_create_commit_files", () => {
    it("posts form data with files to the correct endpoint", async () => {
      let capturedBody: FormData | undefined;

      mswServer.use(
        http.post(
          `${BASE_URL}/repositories/test-workspace/my-repo/src`,
          async ({ request }) => {
            capturedBody = await request.formData();
            return HttpResponse.json({});
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const formData = new FormData();
      formData.set("message", "Add new files");
      formData.set("branch", "main");
      formData.set("src/index.ts", 'console.log("hello");');
      formData.set("src/utils.ts", "export const foo = 42;");

      await client.postFormData(
        "/repositories/test-workspace/my-repo/src",
        formData
      );

      expect(capturedBody).toBeDefined();
      expect(capturedBody!.get("message")).toBe("Add new files");
      expect(capturedBody!.get("branch")).toBe("main");
      expect(capturedBody!.get("src/index.ts")).toBe('console.log("hello");');
      expect(capturedBody!.get("src/utils.ts")).toBe("export const foo = 42;");
    });

    it("includes author when provided", async () => {
      let capturedBody: FormData | undefined;

      mswServer.use(
        http.post(
          `${BASE_URL}/repositories/test-workspace/my-repo/src`,
          async ({ request }) => {
            capturedBody = await request.formData();
            return HttpResponse.json({});
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const formData = new FormData();
      formData.set("message", "Update file");
      formData.set("branch", "develop");
      formData.set("author", "Custom Author <author@example.com>");
      formData.set("file.txt", "content");

      await client.postFormData(
        "/repositories/test-workspace/my-repo/src",
        formData
      );

      expect(capturedBody!.get("author")).toBe(
        "Custom Author <author@example.com>"
      );
    });
  });

  describe("bb_create_branch", () => {
    it("creates a branch with name and target hash", async () => {
      const newBranch: Branch = {
        name: "feature/new-branch",
        target: mockCommit,
        type: "branch",
      };
      mswServer.use(
        http.post(
          `${BASE_URL}/repositories/test-workspace/my-repo/refs/branches`,
          async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            expect(body.name).toBe("feature/new-branch");
            expect(body.target).toEqual({ hash: "abc123" });
            return HttpResponse.json(newBranch);
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.post<Branch>(
        "/repositories/test-workspace/my-repo/refs/branches",
        { name: "feature/new-branch", target: { hash: "abc123" } }
      );

      expect(result.name).toBe("feature/new-branch");
      const formatted = formatBranch(result);
      expect(formatted).toContain("feature/new-branch");
      expect(formatted).toContain("abc123def456");
    });
  });

  describe("bb_delete_branch", () => {
    it("deletes a branch", async () => {
      mswServer.use(
        http.delete(
          `${BASE_URL}/repositories/test-workspace/my-repo/refs/branches/feature%2Fold-branch`,
          () => new HttpResponse(null, { status: 204 })
        )
      );

      const client = new BitbucketClient(mockConfig);
      await client.del(
        "/repositories/test-workspace/my-repo/refs/branches/feature%2Fold-branch"
      );
    });

    it("assertConfirmed blocks unconfirmed delete", () => {
      expect(() => assertConfirmed(false, "delete branch")).toThrow(
        'Destructive action "delete branch" requires explicit confirmation'
      );
    });

    it("assertConfirmed passes when confirmed", () => {
      expect(() => assertConfirmed(true, "delete branch")).not.toThrow();
    });
  });

  describe("bb_list_directory", () => {
    it("returns formatted directory listing", async () => {
      const entries: DirectoryEntry[] = [
        { path: "src", type: "commit_directory" },
        { path: "README.md", type: "commit_file", size: 1024 },
        { path: "package.json", type: "commit_file", size: 512 },
      ];
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/src/HEAD`,
          () =>
            HttpResponse.json({
              values: entries,
              page: 1,
              size: 3,
              pagelen: 10,
            } satisfies PaginatedResponse<DirectoryEntry>)
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<DirectoryEntry>>(
        "/repositories/test-workspace/my-repo/src/HEAD"
      );

      expect(result.values).toHaveLength(3);
      const formatted = formatDirectoryListing(result.values);
      expect(formatted).toContain("[dir] src");
      expect(formatted).toContain("[file] README.md (1024 bytes)");
      expect(formatted).toContain("[file] package.json (512 bytes)");
    });

    it("returns formatted directory listing for subdirectory", async () => {
      const entries: DirectoryEntry[] = [
        { path: "src/index.ts", type: "commit_file", size: 256 },
      ];
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/src/main/src`,
          () =>
            HttpResponse.json({
              values: entries,
              page: 1,
              size: 1,
              pagelen: 10,
            } satisfies PaginatedResponse<DirectoryEntry>)
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<DirectoryEntry>>(
        "/repositories/test-workspace/my-repo/src/main/src"
      );

      expect(result.values).toHaveLength(1);
    });

    it("handles empty directory", () => {
      expect(formatDirectoryListing([])).toBe("Empty directory.");
    });

    it("formatDirectoryEntry formats directory entry", () => {
      expect(formatDirectoryEntry({ path: "src", type: "commit_directory" })).toBe(
        "[dir] src"
      );
    });

    it("formatDirectoryEntry formats file entry with size", () => {
      expect(
        formatDirectoryEntry({ path: "app.ts", type: "commit_file", size: 100 })
      ).toBe("[file] app.ts (100 bytes)");
    });

    it("formatDirectoryEntry formats file entry without size", () => {
      expect(
        formatDirectoryEntry({ path: "app.ts", type: "commit_file" })
      ).toBe("[file] app.ts");
    });
  });

  describe("bb_search_code", () => {
    const mockSearchResult: CodeSearchResult = {
      type: "code_search_result",
      content_match_count: 2,
      content_matches: [
        {
          lines: [
            {
              line: 10,
              segments: [
                { text: "const " },
                { text: "hello", match: true },
                { text: " = 'world';" },
              ],
            },
          ],
        },
      ],
      path_matches: [{ text: "src/app.ts" }],
      file: { path: "src/app.ts", type: "commit_file" },
    };

    it("searches code in a specific repository", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/repositories/test-workspace/my-repo/search/code`,
          ({ request }) => {
            const url = new URL(request.url);
            expect(url.searchParams.get("search_query")).toBe("hello");
            return HttpResponse.json({
              values: [mockSearchResult],
              page: 1,
              size: 1,
              pagelen: 10,
            } satisfies PaginatedResponse<CodeSearchResult>);
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<CodeSearchResult>>(
        "/repositories/test-workspace/my-repo/search/code",
        { search_query: "hello" }
      );

      expect(result.values).toHaveLength(1);
      expect(result.values[0].file.path).toBe("src/app.ts");
    });

    it("searches code workspace-wide", async () => {
      mswServer.use(
        http.get(
          `${BASE_URL}/workspaces/test-workspace/search/code`,
          ({ request }) => {
            const url = new URL(request.url);
            expect(url.searchParams.get("search_query")).toBe("TODO");
            return HttpResponse.json({
              values: [mockSearchResult],
              page: 1,
              size: 1,
              pagelen: 10,
            } satisfies PaginatedResponse<CodeSearchResult>);
          }
        )
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<PaginatedResponse<CodeSearchResult>>(
        "/workspaces/test-workspace/search/code",
        { search_query: "TODO" }
      );

      expect(result.values).toHaveLength(1);
    });

    it("formatCodeSearchResult formats result with match lines", () => {
      const formatted = formatCodeSearchResult(mockSearchResult);
      expect(formatted).toContain("src/app.ts (2 matches)");
      expect(formatted).toContain("L10: const hello = 'world';");
    });

    it("formatCodeSearchResults handles empty results", () => {
      expect(formatCodeSearchResults([])).toBe("No code matches found.");
    });

    it("formatCodeSearchResults formats multiple results", () => {
      const results = [
        mockSearchResult,
        {
          ...mockSearchResult,
          file: { path: "src/utils.ts", type: "commit_file" },
          content_match_count: 1,
        },
      ];
      const formatted = formatCodeSearchResults(results);
      expect(formatted).toContain("src/app.ts");
      expect(formatted).toContain("src/utils.ts");
    });
  });

  describe("safety checks", () => {
    it("resolveWorkspace returns provided workspace", () => {
      expect(resolveWorkspace(mockConfig, "custom-ws")).toBe("custom-ws");
    });

    it("resolveWorkspace falls back to default workspace", () => {
      expect(resolveWorkspace(mockConfig)).toBe("test-workspace");
    });

    it("resolveWorkspace throws when no workspace available", () => {
      const noDefaultConfig: Config = {
        ...mockConfig,
        defaultWorkspace: undefined,
      };
      expect(() => resolveWorkspace(noDefaultConfig)).toThrow(
        "No workspace specified"
      );
    });

    it("assertWorkspaceAllowed passes when no restrictions", () => {
      expect(() =>
        assertWorkspaceAllowed(mockConfig, "any-workspace")
      ).not.toThrow();
    });

    it("assertWorkspaceAllowed throws for disallowed workspace", () => {
      const restrictedConfig: Config = {
        ...mockConfig,
        allowedWorkspaces: ["allowed-ws"],
      };
      expect(() =>
        assertWorkspaceAllowed(restrictedConfig, "forbidden-ws")
      ).toThrow('Workspace "forbidden-ws" is not in the allowed list');
    });

    it("assertRepoAllowed passes when no restrictions", () => {
      expect(() =>
        assertRepoAllowed(mockConfig, "test-workspace", "any-repo")
      ).not.toThrow();
    });

    it("assertRepoAllowed throws for disallowed repo", () => {
      const restrictedConfig: Config = {
        ...mockConfig,
        allowedRepos: ["allowed-repo"],
      };
      expect(() =>
        assertRepoAllowed(restrictedConfig, "test-workspace", "forbidden-repo")
      ).toThrow(
        'Repository "test-workspace/forbidden-repo" is not in the allowed list'
      );
    });

    it("assertRepoAllowed accepts full name match", () => {
      const restrictedConfig: Config = {
        ...mockConfig,
        allowedRepos: ["test-workspace/my-repo"],
      };
      expect(() =>
        assertRepoAllowed(restrictedConfig, "test-workspace", "my-repo")
      ).not.toThrow();
    });

    it("assertNotReadonly passes when not readonly", () => {
      expect(() => assertNotReadonly(mockConfig)).not.toThrow();
    });

    it("assertNotReadonly throws in readonly mode", () => {
      const readonlyConfig: Config = { ...mockConfig, readonly: true };
      expect(() => assertNotReadonly(readonlyConfig)).toThrow(
        "not allowed in readonly mode"
      );
    });
  });
});
