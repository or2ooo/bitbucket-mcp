import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketClient } from "../bitbucket/client.js";
import { Config } from "../config.js";
import type {
  PullRequest,
  PullRequestActivity,
  DiffStatEntry,
  PaginatedResponse,
  PullRequestComment,
} from "../bitbucket/types.js";
import {
  formatPullRequestList,
  formatPullRequest,
  formatPRActivity,
  formatDiffStat,
  formatPRComment,
} from "../formatting.js";
import {
  resolveWorkspace,
  assertRepoAllowed,
  assertNotReadonly,
  assertConfirmed,
} from "../safety.js";

export function registerPullRequestTools(
  server: McpServer,
  client: BitbucketClient,
  config: Config
): void {
  // 1. List pull requests
  server.tool(
    "bb_list_pull_requests",
    "List pull requests in a Bitbucket repository, optionally filtered by state",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      state: z
        .enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"])
        .optional()
        .describe("Filter by PR state"),
      page: z.number().optional().describe("Page number (1-based)"),
      pagelen: z
        .number()
        .optional()
        .describe("Number of results per page (max 50)"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const response = await client.get<PaginatedResponse<PullRequest>>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests`,
          {
            state: args.state,
            page: args.page,
            pagelen: args.pagelen,
          }
        );
        return {
          content: [
            {
              type: "text" as const,
              text: formatPullRequestList(response.values),
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

  // 2. Get a single pull request
  server.tool(
    "bb_get_pull_request",
    "Get details of a specific pull request",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const pr = await client.get<PullRequest>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}`
        );
        return {
          content: [
            { type: "text" as const, text: formatPullRequest(pr) },
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

  // 3. Create a pull request
  server.tool(
    "bb_create_pull_request",
    "Create a new pull request",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      title: z.string().describe("Pull request title"),
      source_branch: z.string().describe("Source branch name"),
      destination_branch: z
        .string()
        .optional()
        .describe("Destination branch name (defaults to main)"),
      description: z.string().optional().describe("Pull request description"),
      close_source_branch: z
        .boolean()
        .optional()
        .describe("Close source branch after merge"),
      reviewers: z
        .array(z.string())
        .optional()
        .describe("List of reviewer UUIDs"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const body: Record<string, unknown> = {
          title: args.title,
          source: { branch: { name: args.source_branch } },
          destination: {
            branch: { name: args.destination_branch || "main" },
          },
        };
        if (args.description !== undefined)
          body.description = args.description;
        if (args.close_source_branch !== undefined)
          body.close_source_branch = args.close_source_branch;
        if (args.reviewers)
          body.reviewers = args.reviewers.map((uuid) => ({ uuid }));
        const pr = await client.post<PullRequest>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests`,
          body
        );
        return {
          content: [
            { type: "text" as const, text: formatPullRequest(pr) },
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

  // 4. Get pull request diff
  server.tool(
    "bb_get_pull_request_diff",
    "Get the diff of a pull request",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const diff = await client.getRaw(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/diff`
        );
        const text =
          "Note: Diff output may be truncated for large changes. Use bb_get_pull_request_diffstat for a summary of all changed files.\n\n" +
          diff;
        return {
          content: [{ type: "text" as const, text }],
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

  // 5. Get pull request diffstat
  server.tool(
    "bb_get_pull_request_diffstat",
    "Get the diffstat (summary of changed files) of a pull request",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const entries = await client.paginateAll<DiffStatEntry>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/diffstat`
        );
        return {
          content: [
            { type: "text" as const, text: formatDiffStat(entries) },
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

  // 6. List pull request activity
  server.tool(
    "bb_list_pull_request_activity",
    "List activity (comments, approvals, updates) on a pull request",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const activities =
          await client.paginateAll<PullRequestActivity>(
            `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/activity`
          );
        return {
          content: [
            { type: "text" as const, text: formatPRActivity(activities) },
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

  // 7. Add a comment to a pull request
  server.tool(
    "bb_add_pull_request_comment",
    "Add a comment to a pull request, optionally as an inline comment on a specific file and line. Use parent_id to create a threaded reply to an existing comment.",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
      content: z.string().describe("Comment body (raw markup)"),
      inline_path: z
        .string()
        .optional()
        .describe("File path for inline comment"),
      inline_line: z
        .number()
        .optional()
        .describe("Line number for inline comment (the 'to' line)"),
      parent_id: z
        .number()
        .optional()
        .describe("Parent comment ID to create a threaded reply"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const body: Record<string, unknown> = {
          content: { raw: args.content },
        };
        if (args.inline_path) {
          body.inline = {
            path: args.inline_path,
            to: args.inline_line,
          };
        }
        if (args.parent_id) {
          body.parent = { id: args.parent_id };
        }
        const comment = await client.post<PullRequestComment>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/comments`,
          body
        );
        return {
          content: [
            { type: "text" as const, text: formatPRComment(comment) },
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

  // 8. Approve a pull request
  server.tool(
    "bb_approve_pull_request",
    "Approve a pull request",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        await client.post(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/approve`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Pull request #${args.pr_id} approved.`,
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

  // 9. Request changes on a pull request
  server.tool(
    "bb_request_changes_pull_request",
    "Request changes on a pull request",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        await client.post(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/request-changes`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Changes requested on pull request #${args.pr_id}.`,
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

  // 10. Merge a pull request
  server.tool(
    "bb_merge_pull_request",
    "Merge a pull request (destructive action, requires confirmation)",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
      merge_strategy: z
        .enum(["merge_commit", "squash", "fast_forward"])
        .optional()
        .describe("Merge strategy"),
      close_source_branch: z
        .boolean()
        .optional()
        .describe("Close source branch after merge"),
      confirm: z
        .boolean()
        .describe("Must be true to confirm this destructive action"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        assertConfirmed(args.confirm, "merge pull request");
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const body: Record<string, unknown> = {
          type: "pullrequest",
        };
        if (args.merge_strategy !== undefined)
          body.merge_strategy = args.merge_strategy;
        if (args.close_source_branch !== undefined)
          body.close_source_branch = args.close_source_branch;
        const pr = await client.post<PullRequest>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/merge`,
          body
        );
        return {
          content: [
            { type: "text" as const, text: formatPullRequest(pr) },
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

  // 11. Update a pull request
  server.tool(
    "bb_update_pull_request",
    "Update a pull request's title, description, or reviewers",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
      title: z.string().optional().describe("New pull request title"),
      description: z
        .string()
        .optional()
        .describe("New pull request description"),
      reviewers: z
        .array(z.string())
        .optional()
        .describe("New list of reviewer UUIDs (replaces existing reviewers)"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const body: Record<string, unknown> = {};
        if (args.title !== undefined) body.title = args.title;
        if (args.description !== undefined)
          body.description = args.description;
        if (args.reviewers)
          body.reviewers = args.reviewers.map((uuid) => ({ uuid }));
        const pr = await client.put<PullRequest>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}`,
          body
        );
        return {
          content: [
            { type: "text" as const, text: formatPullRequest(pr) },
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

  // 12. Decline a pull request
  server.tool(
    "bb_decline_pull_request",
    "Decline a pull request (destructive action, requires confirmation)",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not provided)"),
      repo_slug: z.string().describe("Repository slug"),
      pr_id: z.number().describe("Pull request ID"),
      confirm: z
        .boolean()
        .describe("Must be true to confirm this destructive action"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        assertConfirmed(args.confirm, "decline pull request");
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const pr = await client.post<PullRequest>(
          `/repositories/${ws}/${args.repo_slug}/pullrequests/${args.pr_id}/decline`
        );
        return {
          content: [
            { type: "text" as const, text: formatPullRequest(pr) },
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
