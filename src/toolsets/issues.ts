import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketClient } from "../bitbucket/client.js";
import { Config } from "../config.js";
import type {
  Issue,
  IssueComment,
  PaginatedResponse,
} from "../bitbucket/types.js";
import {
  formatIssueList,
  formatIssue,
  formatIssueComment,
} from "../formatting.js";
import {
  resolveWorkspace,
  assertRepoAllowed,
  assertNotReadonly,
} from "../safety.js";

export function registerIssueTools(
  server: McpServer,
  client: BitbucketClient,
  config: Config
): void {
  server.tool(
    "bb_list_issues",
    "List issues in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      query: z
        .string()
        .optional()
        .describe("Bitbucket query language string to filter issues"),
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
        const result = await client.get<PaginatedResponse<Issue>>(
          `/repositories/${ws}/${args.repo_slug}/issues`,
          { q: args.query, page: args.page, pagelen: args.pagelen }
        );
        return {
          content: [
            { type: "text" as const, text: formatIssueList(result.values) },
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
    "bb_get_issue",
    "Get details of a specific issue in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      issue_id: z.number().describe("Issue ID"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const issue = await client.get<Issue>(
          `/repositories/${ws}/${args.repo_slug}/issues/${args.issue_id}`
        );
        return {
          content: [{ type: "text" as const, text: formatIssue(issue) }],
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
    "bb_create_issue",
    "Create a new issue in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      title: z.string().describe("Issue title"),
      content: z
        .string()
        .optional()
        .describe("Issue body in raw markdown format"),
      kind: z
        .enum(["bug", "enhancement", "proposal", "task"])
        .optional()
        .describe("Issue kind"),
      priority: z
        .enum(["trivial", "minor", "major", "critical", "blocker"])
        .optional()
        .describe("Issue priority"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const body: Record<string, unknown> = { title: args.title };
        if (args.content) {
          body.content = { raw: args.content };
        }
        if (args.kind) {
          body.kind = args.kind;
        }
        if (args.priority) {
          body.priority = args.priority;
        }
        const issue = await client.post<Issue>(
          `/repositories/${ws}/${args.repo_slug}/issues`,
          body
        );
        return {
          content: [{ type: "text" as const, text: formatIssue(issue) }],
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
    "bb_comment_issue",
    "Add a comment to an issue in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      issue_id: z.number().describe("Issue ID"),
      content: z.string().describe("Comment body in raw markdown format"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const comment = await client.post<IssueComment>(
          `/repositories/${ws}/${args.repo_slug}/issues/${args.issue_id}/comments`,
          { content: { raw: args.content } }
        );
        return {
          content: [
            { type: "text" as const, text: formatIssueComment(comment) },
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
