# Bitbucket Cloud MCP Server

MCP server providing Claude Code integration with Bitbucket Cloud REST API v2.0.

## Quick Reference

```bash
npm run build    # Compile TypeScript → dist/
npm run start    # Run the MCP server (requires env vars)
npm test         # Run tests with vitest
npm run lint     # ESLint check
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ATLASSIAN_USER_EMAIL` | Yes | Atlassian account email |
| `ATLASSIAN_API_TOKEN` | Yes | Atlassian API token (app password) |
| `BITBUCKET_DEFAULT_WORKSPACE` | No | Default workspace when not specified in tool calls |
| `BITBUCKET_ALLOWED_WORKSPACES` | No | Comma-separated allowlist of workspace slugs |
| `BITBUCKET_ALLOWED_REPOS` | No | Comma-separated allowlist (slug or workspace/slug) |
| `BITBUCKET_READONLY` | No | Set to `true` to block all write operations |
| `BITBUCKET_BASE_URL` | No | Override API base URL (default: https://api.bitbucket.org/2.0) |

## Project Structure

```
src/
├── index.ts              # Entry point — MCP server setup + transport
├── config.ts             # Environment variable parsing
├── safety.ts             # Access control guards
├── formatting.ts         # LLM-optimized output formatters
├── bitbucket/
│   ├── types.ts          # Bitbucket API type definitions
│   └── client.ts         # HTTP client with auth + pagination
└── toolsets/
    ├── context.ts        # bb_whoami, bb_list_workspaces
    ├── repos.ts          # Repository & file tools
    ├── pullRequests.ts   # PR tools (list, create, diff, merge, etc.)
    ├── issues.ts         # Issue tracker tools
    └── pipelines.ts      # CI/CD pipeline tools
```

## Module Boundaries

- **config.ts**: Only env var parsing. No API calls.
- **client.ts**: HTTP only. No formatting or safety logic.
- **safety.ts**: Pure validation. No side effects.
- **formatting.ts**: String formatting only. No API calls.
- **toolsets/**: Each file registers tools on a McpServer. Depends on client, config, safety, formatting.

## Claude Code Registration

```bash
claude mcp add bitbucket \
  -e ATLASSIAN_USER_EMAIL=your-email@example.com \
  -e ATLASSIAN_API_TOKEN=your-api-token \
  -e BITBUCKET_READONLY=false \
  -- npx -y @or2ooo/bitbucket-mcp@latest
```

For local development, use the absolute path instead:
```bash
claude mcp add bitbucket \
  -e ATLASSIAN_USER_EMAIL=your-email@example.com \
  -e ATLASSIAN_API_TOKEN=your-api-token \
  -- node /absolute/path/to/bitbucket-mcp/dist/index.js
```
