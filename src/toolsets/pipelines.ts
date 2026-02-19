import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitbucketClient } from "../bitbucket/client.js";
import { Config } from "../config.js";
import type { Pipeline, PaginatedResponse } from "../bitbucket/types.js";
import { formatPipelineList, formatPipeline } from "../formatting.js";
import {
  resolveWorkspace,
  assertRepoAllowed,
  assertNotReadonly,
} from "../safety.js";

export function registerPipelineTools(
  server: McpServer,
  client: BitbucketClient,
  config: Config
): void {
  server.tool(
    "bb_list_pipelines",
    "List pipelines in a Bitbucket repository, sorted by newest first",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
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
        const result = await client.get<PaginatedResponse<Pipeline>>(
          `/repositories/${ws}/${args.repo_slug}/pipelines/`,
          {
            page: args.page,
            pagelen: args.pagelen,
            sort: "-created_on",
          }
        );
        return {
          content: [
            {
              type: "text" as const,
              text: formatPipelineList(result.values),
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
    "bb_get_pipeline",
    "Get details of a specific pipeline in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      pipeline_uuid: z.string().describe("Pipeline UUID"),
    },
    async (args) => {
      try {
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);
        const pipeline = await client.get<Pipeline>(
          `/repositories/${ws}/${args.repo_slug}/pipelines/${args.pipeline_uuid}`
        );
        return {
          content: [
            { type: "text" as const, text: formatPipeline(pipeline) },
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
    "bb_trigger_pipeline",
    "Trigger a new pipeline run in a Bitbucket repository",
    {
      workspace: z
        .string()
        .optional()
        .describe("Bitbucket workspace slug (uses default if not set)"),
      repo_slug: z.string().describe("Repository slug"),
      branch: z.string().describe("Branch name to run the pipeline on"),
      pattern: z
        .string()
        .optional()
        .describe("Custom pipeline pattern to run"),
      variables: z
        .array(
          z.object({
            key: z.string(),
            value: z.string(),
            secured: z.boolean().optional(),
          })
        )
        .optional()
        .describe("Pipeline variables"),
    },
    async (args) => {
      try {
        assertNotReadonly(config);
        const ws = resolveWorkspace(config, args.workspace);
        assertRepoAllowed(config, ws, args.repo_slug);

        const target: Record<string, unknown> = {
          ref_type: "branch",
          type: "pipeline_ref_target",
          ref_name: args.branch,
        };
        if (args.pattern) {
          target.selector = { type: "custom", pattern: args.pattern };
        }

        const body: Record<string, unknown> = { target };
        if (args.variables) {
          body.variables = args.variables.map((v) => ({
            key: v.key,
            value: v.value,
            secured: v.secured ?? false,
          }));
        }

        const pipeline = await client.post<Pipeline>(
          `/repositories/${ws}/${args.repo_slug}/pipelines/`,
          body
        );
        return {
          content: [
            { type: "text" as const, text: formatPipeline(pipeline) },
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
