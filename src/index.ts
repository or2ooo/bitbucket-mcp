import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { BitbucketClient } from "./bitbucket/client.js";
import { registerContextTools } from "./toolsets/context.js";
import { registerRepoTools } from "./toolsets/repos.js";
import { registerPullRequestTools } from "./toolsets/pullRequests.js";
import { registerIssueTools } from "./toolsets/issues.js";
import { registerPipelineTools } from "./toolsets/pipelines.js";

async function main() {
  const config = loadConfig();
  const client = new BitbucketClient(config);

  const server = new McpServer({
    name: "bitbucket-mcp",
    version: "1.0.0",
  });

  registerContextTools(server, client, config);
  registerRepoTools(server, client, config);
  registerPullRequestTools(server, client, config);
  registerIssueTools(server, client, config);
  registerPipelineTools(server, client, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
