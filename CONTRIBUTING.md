# Contributing to Bitbucket Cloud MCP Server

Thank you for your interest in contributing! This guide will help you get started.

## Reporting Bugs

Use the [bug report template](https://github.com/or2ooo/bitbucket-mcp/issues/new?template=bug_report.md) to file an issue. Include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS

## Suggesting Features

Use the [feature request template](https://github.com/or2ooo/bitbucket-mcp/issues/new?template=feature_request.md). Describe the problem you're solving and any alternatives you considered.

## Development Setup

```bash
git clone https://github.com/or2ooo/bitbucket-mcp.git
cd bitbucket-mcp
npm install
npm run build
npm test
```

Requires Node.js v24+.

## Code Style

- TypeScript strict mode is enabled
- ESLint enforces style — run `npm run lint` before committing
- Follow the module boundaries documented in [CLAUDE.md](CLAUDE.md):
  - **config.ts** — env var parsing only, no API calls
  - **client.ts** — HTTP only, no formatting or safety logic
  - **safety.ts** — pure validation, no side effects
  - **formatting.ts** — string formatting only, no API calls
  - **toolsets/** — tool registration, depends on client/config/safety/formatting

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning. Your commit messages must follow this format:

```
type(scope): description

# Examples:
feat: add bb_search_code tool
fix: handle pagination for large result sets
docs: update environment variable table
chore: upgrade dependencies
```

Types that trigger releases:
- `feat:` — minor version bump
- `fix:` — patch version bump
- `feat!:` or `BREAKING CHANGE:` — major version bump

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests
4. Ensure all checks pass: `npm run lint && npm run build && npm test`
5. Commit using conventional commit format
6. Open a PR against `main`

All PRs require:
- Passing CI (`build-lint-test` status check)
- At least one approving review
- Branch up to date with `main`
