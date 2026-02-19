# Bitbucket Cloud MCP Server

[![CI](https://github.com/or2ooo/bitbucket-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/or2ooo/bitbucket-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@or2ooo/bitbucket-mcp)](https://www.npmjs.com/package/@or2ooo/bitbucket-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server for the Bitbucket Cloud REST API v2.0. Works with any MCP client — Claude Code, GitHub Copilot, OpenAI Codex, and more. Provides 26 tools across 5 toolsets with safety controls and compact LLM-optimized output.

## Setup

### Prerequisites

- Node.js v24+
- Atlassian API token (see below)

### Create an API Token

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token with scopes"**
3. Name the token (e.g., "Bitbucket MCP") and set expiration
4. Select app: **Bitbucket**
5. Enable the scopes listed below
6. Click **Create** and copy the token

**Read-only scopes** (6 scopes — sufficient when using `BITBUCKET_READONLY=true`):

| Scope | Enables |
|-------|---------|
| `read:user:bitbucket` | `bb_whoami` |
| `read:workspace:bitbucket` | `bb_list_workspaces` |
| `read:repository:bitbucket` | `bb_list_repositories`, `bb_get_repository`, `bb_list_branches`, `bb_list_commits`, `bb_get_file` |
| `read:pullrequest:bitbucket` | `bb_list_pull_requests`, `bb_get_pull_request`, `bb_get_pull_request_diff`, `bb_get_pull_request_diffstat`, `bb_list_pull_request_activity` |
| `read:issue:bitbucket` | `bb_list_issues`, `bb_get_issue` |
| `read:pipeline:bitbucket` | `bb_list_pipelines`, `bb_get_pipeline` |

**Write scopes** (add these 4 for full access):

| Scope | Enables |
|-------|---------|
| `write:repository:bitbucket` | `bb_create_commit_files` |
| `write:pullrequest:bitbucket` | `bb_create_pull_request`, `bb_add_pull_request_comment`, `bb_approve_pull_request`, `bb_request_changes_pull_request`, `bb_merge_pull_request`, `bb_decline_pull_request` |
| `write:issue:bitbucket` | `bb_create_issue`, `bb_comment_issue` |
| `write:pipeline:bitbucket` | `bb_trigger_pipeline` |

### Add to Your MCP Client

<details open>
<summary><strong>Claude Code</strong></summary>

One command — no clone or build needed:

```bash
claude mcp add bitbucket \
  -e ATLASSIAN_USER_EMAIL=your-email@example.com \
  -e ATLASSIAN_API_TOKEN=your-api-token \
  -e BITBUCKET_READONLY=false \
  -- npx -y @or2ooo/bitbucket-mcp@latest
```

Verify with:
```bash
claude mcp list
```

</details>

<details>
<summary><strong>GitHub Copilot (VS Code)</strong></summary>

Add to `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "bitbucket": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@or2ooo/bitbucket-mcp@latest"],
      "env": {
        "ATLASSIAN_USER_EMAIL": "your-email@example.com",
        "ATLASSIAN_API_TOKEN": "your-api-token",
        "BITBUCKET_READONLY": "false"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>OpenAI Codex CLI</strong></summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.bitbucket]
command = "npx"
args = ["-y", "@or2ooo/bitbucket-mcp@latest"]
env = { ATLASSIAN_USER_EMAIL = "your-email@example.com", ATLASSIAN_API_TOKEN = "your-api-token", BITBUCKET_READONLY = "false" }
```

</details>

<details>
<summary><strong>From source (for development)</strong></summary>

```bash
git clone https://github.com/or2ooo/bitbucket-mcp.git
cd bitbucket-mcp
npm install && npm run build

claude mcp add bitbucket \
  -e ATLASSIAN_USER_EMAIL=your-email@example.com \
  -e ATLASSIAN_API_TOKEN=your-api-token \
  -e BITBUCKET_READONLY=true \
  -- node $(pwd)/dist/index.js
```

</details>

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ATLASSIAN_USER_EMAIL` | Yes | Atlassian account email |
| `ATLASSIAN_API_TOKEN` | Yes | Atlassian API token (see [Create an API Token](#create-an-api-token)) |
| `BITBUCKET_DEFAULT_WORKSPACE` | No | Default workspace slug |
| `BITBUCKET_ALLOWED_WORKSPACES` | No | Comma-separated allowlist of workspace slugs |
| `BITBUCKET_ALLOWED_REPOS` | No | Comma-separated allowlist (`slug` or `workspace/slug`) |
| `BITBUCKET_READONLY` | No | `true` to block all write operations |
| `BITBUCKET_BASE_URL` | No | Override API base URL |

## Safety Controls

- **Readonly mode**: Set `BITBUCKET_READONLY=true` to prevent any write operations.
- **Workspace allowlist**: Restrict access to specific workspaces.
- **Repository allowlist**: Restrict access to specific repositories.
- **Destructive action confirmation**: Merge and decline PR tools require explicit `confirm: true`.

## Tool Reference

### Context (2 tools)
| Tool | Description |
|------|-------------|
| `bb_whoami` | Get current authenticated user |
| `bb_list_workspaces` | List accessible workspaces |

### Repositories (6 tools)
| Tool | Description |
|------|-------------|
| `bb_list_repositories` | List repositories in a workspace |
| `bb_get_repository` | Get repository details |
| `bb_list_branches` | List branches |
| `bb_list_commits` | List commits (optionally for a branch/tag) |
| `bb_get_file` | Get file content at a specific revision |
| `bb_create_commit_files` | Create a commit with file changes (write) |

### Pull Requests (11 tools)
| Tool | Description |
|------|-------------|
| `bb_list_pull_requests` | List PRs with optional state filter |
| `bb_get_pull_request` | Get PR details |
| `bb_create_pull_request` | Create a new PR (write) |
| `bb_get_pull_request_diff` | Get PR diff (raw text) |
| `bb_get_pull_request_diffstat` | Get PR diffstat summary |
| `bb_list_pull_request_activity` | List PR activity (comments, approvals, updates) |
| `bb_add_pull_request_comment` | Add a comment to a PR (write) |
| `bb_approve_pull_request` | Approve a PR (write) |
| `bb_request_changes_pull_request` | Request changes on a PR (write) |
| `bb_merge_pull_request` | Merge a PR (destructive, requires confirm) |
| `bb_decline_pull_request` | Decline a PR (destructive, requires confirm) |

### Issues (4 tools)
| Tool | Description |
|------|-------------|
| `bb_list_issues` | List issues with optional query |
| `bb_get_issue` | Get issue details |
| `bb_create_issue` | Create a new issue (write) |
| `bb_comment_issue` | Add a comment to an issue (write) |

### Pipelines (3 tools)
| Tool | Description |
|------|-------------|
| `bb_list_pipelines` | List recent pipelines |
| `bb_get_pipeline` | Get pipeline details |
| `bb_trigger_pipeline` | Trigger a pipeline run (write) |

## Development

```bash
npm test         # Run tests
npm run lint     # Lint
npm run build    # Compile
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT
