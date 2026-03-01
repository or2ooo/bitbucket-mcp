import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketClient } from "../bitbucket/client.js";
import { Config } from "../config.js";
import type {
  Repository,
  Branch,
  Commit,
  PaginatedResponse,
  DirectoryEntry,
  CodeSearchResult,
} from "../bitbucket/types.js";
import {
  formatRepositoryList,
  formatRepository,
  formatBranch,
  formatBranchList,
  formatCommitList,
  formatDirectoryListing,
  formatCodeSearchResults,
} from "../formatting.js";
import {
  resolveWorkspace,
  assertWorkspaceAllowed,
  assertRepoAllowed,
  assertNotReadonly,
  assertConfirmed,
} from "../safety.js";

export function registerRepoTools(
  server: McpServer,
  client: BitbucketClient,
  config: Config
): void {
  server.tool(
    "bb_list_repositories",
    "List repositories in a Bitbucket workspace",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      query: z
        .string()
        .optional()
        .describe("Bitbucket query string to filter repositories"),
      page: z.number().optional().describe("Page number for pagination"),
      pagelen: z
        .number()
        .max(100)
        .optional()
        .describe("Number of results per page (max 100)"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertWorkspaceAllowed(config, ws);
        const result = await client.get<PaginatedResponse<Repository>>(
          `/repositories/${ws}`,
          { q: args.query, page: args.page, pagelen: args.pagelen }
        );
        return {
          content: [
            {
              type: "text" as const,
              text: formatRepositoryList(result.values),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_get_repository",
    "Get details of a specific Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const repo = await client.get<Repository>(
          `/repositories/${ws}/${args.repo_slug}`
        );
        return {
          content: [
            { type: "text" as const, text: formatRepository(repo) },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_list_branches",
    "List branches in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      query: z
        .string()
        .optional()
        .describe("Bitbucket query string to filter branches"),
      page: z.number().optional().describe("Page number for pagination"),
      pagelen: z
        .number()
        .max(100)
        .optional()
        .describe("Number of results per page (max 100)"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const result = await client.get<PaginatedResponse<Branch>>(
          `/repositories/${ws}/${args.repo_slug}/refs/branches`,
          { q: args.query, page: args.page, pagelen: args.pagelen }
        );
        return {
          content: [
            { type: "text" as const, text: formatBranchList(result.values) },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_list_commits",
    "List commits in a Bitbucket repository, optionally for a specific branch/tag/hash",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      revision: z
        .string()
        .optional()
        .describe("Branch name, tag, or commit hash to list commits from"),
      page: z.number().optional().describe("Page number for pagination"),
      pagelen: z
        .number()
        .max(100)
        .optional()
        .describe("Number of results per page (max 100)"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const path = args.revision
          ? `/repositories/${ws}/${args.repo_slug}/commits/${args.revision}`
          : `/repositories/${ws}/${args.repo_slug}/commits`;
        const result = await client.get<PaginatedResponse<Commit>>(path, {
          page: args.page,
          pagelen: args.pagelen,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: formatCommitList(result.values),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_get_file",
    "Get the raw content of a file from a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      commit: z
        .string()
        .describe("Branch name, tag, or commit hash to read from"),
      path: z.string().describe("File path within the repository"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const content = await client.getRaw(
          `/repositories/${ws}/${args.repo_slug}/src/${args.commit}/${args.path}`
        );
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_create_commit_files",
    "Create or update files in a Bitbucket repository by creating a new commit",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      branch: z.string().describe("Target branch for the commit"),
      message: z.string().describe("Commit message"),
      files: z
        .record(z.string())
        .describe(
          "Map of file paths to file contents (e.g. {\"src/main.ts\": \"console.log('hello')\"})"
        ),
      author: z
        .string()
        .optional()
        .describe(
          "Author string in 'Name <email>' format (uses authenticated user if not set)"
        ),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);

        const formData = new FormData();
        formData.set("message", args.message);
        formData.set("branch", args.branch);
        if (args.author) {
          formData.set("author", args.author);
        }
        for (const [filePath, content] of Object.entries(args.files)) {
          formData.set(filePath, content);
        }

        await client.postFormData<Record<string, unknown>>(
          `/repositories/${ws}/${args.repo_slug}/src`,
          formData
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Successfully committed ${Object.keys(args.files).length} file(s) to ${args.branch}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_create_branch",
    "Create a new branch in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      name: z.string().describe("New branch name"),
      target_hash: z
        .string()
        .describe("Commit hash to branch from"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const branch = await client.post<Branch>(
          `/repositories/${ws}/${args.repo_slug}/refs/branches`,
          { name: args.name, target: { hash: args.target_hash } }
        );
        return {
          content: [
            { type: "text" as const, text: formatBranch(branch) },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_delete_branch",
    "Delete a branch from a Bitbucket repository (destructive action, requires confirmation)",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      name: z.string().describe("Branch name to delete"),
      confirm: z
        .boolean()
        .describe("Must be true to confirm this destructive action"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        assertConfirmed(args.confirm, "delete branch");
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        await client.del(
          `/repositories/${ws}/${args.repo_slug}/refs/branches/${encodeURIComponent(args.name)}`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Branch "${args.name}" deleted successfully.`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_list_directory",
    "List the contents of a directory in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      path: z
        .string()
        .optional()
        .describe("Directory path (defaults to repository root)"),
      revision: z
        .string()
        .optional()
        .describe("Branch name, tag, or commit hash (defaults to HEAD)"),
      page: z.number().optional().describe("Page number for pagination"),
      pagelen: z
        .number()
        .max(100)
        .optional()
        .describe("Number of results per page (max 100)"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const revision = args.revision || "HEAD";
        const dirPath = args.path ? `/${args.path}` : "";
        const response = await client.get<PaginatedResponse<DirectoryEntry>>(
          `/repositories/${ws}/${args.repo_slug}/src/${revision}${dirPath}`,
          { page: args.page, pagelen: args.pagelen }
        );
        return {
          content: [
            {
              type: "text" as const,
              text: formatDirectoryListing(response.values),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "bb_search_code",
    "Search for code in a Bitbucket workspace or repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z
        .string()
        .optional()
        .describe(
          "Repository slug (searches workspace-wide if not provided)"
        ),
      query: z.string().describe("Search query string"),
      page: z.number().optional().describe("Page number for pagination"),
      pagelen: z
        .number()
        .max(100)
        .optional()
        .describe("Number of results per page (max 100)"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        if (args.repo_slug) {
          assertRepoAllowed(config, ws, args.repo_slug);
        } else {
          assertWorkspaceAllowed(config, ws);
        }
        const basePath = args.repo_slug
          ? `/repositories/${ws}/${args.repo_slug}/search/code`
          : `/workspaces/${ws}/search/code`;
        const response = await client.get<
          PaginatedResponse<CodeSearchResult>
        >(basePath, {
          search_query: args.query,
          page: args.page,
          pagelen: args.pagelen,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: formatCodeSearchResults(response.values),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
