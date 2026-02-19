import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketClient } from "../bitbucket/client.js";
import { Config } from "../config.js";
import type { User, Workspace } from "../bitbucket/types.js";
import { formatUser, formatWorkspaceList } from "../formatting.js";

export function registerContextTools(
  server: McpServer,
  client: BitbucketClient,
  _config: Config
): void {
  server.tool(
    "bb_whoami",
    "Get the currently authenticated Bitbucket user",
    {},
    async () => {
      try {
        const user = await client.get<User>("/user");
        return {
          content: [{ type: "text" as const, text: formatUser(user) }],
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
    "bb_list_workspaces",
    "List Bitbucket workspaces accessible to the authenticated user",
    {
      role: z
        .string()
        .optional()
        .describe(
          "Filter by role (e.g. 'owner', 'collaborator', 'member')"
        ),
    },
    async (args) => {
      try {
        const workspaces = await client.paginateAll<Workspace>(
          "/workspaces",
          args.role ? { role: args.role } : undefined
        );
        return {
          content: [
            {
              type: "text" as const,
              text: formatWorkspaceList(workspaces),
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
