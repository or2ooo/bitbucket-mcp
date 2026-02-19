# Bitbucket Cloud MCP Server

A Model Context Protocol (MCP) server for the Bitbucket Cloud REST API v2.0, designed for Claude Code integration. Provides 26 tools across 5 toolsets with safety controls and compact LLM-optimized output.

## Setup

### Prerequisites

- Node.js v24+
- Atlassian API token ([create one here](https://id.atlassian.com/manage-profile/security/api-tokens))

### Install & Build

```bash
npm install
npm run build
```

### Claude Code Registration

```bash
claude mcp add bitbucket \
  -e ATLASSIAN_USER_EMAIL=your-email@example.com \
  -e ATLASSIAN_API_TOKEN=your-api-token \
  -e BITBUCKET_DEFAULT_WORKSPACE=your-workspace \
  -e BITBUCKET_READONLY=true \
  -- node /absolute/path/to/bitbucket-mcp/dist/index.js
```

Verify with:
```bash
claude mcp list
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ATLASSIAN_USER_EMAIL` | Yes | Atlassian account email |
| `ATLASSIAN_API_TOKEN` | Yes | [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens) |
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

## License

MIT
