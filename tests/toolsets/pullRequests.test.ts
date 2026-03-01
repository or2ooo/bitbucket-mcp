import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { BitbucketClient } from "../../src/bitbucket/client.js";
import { Config } from "../../src/config.js";
import type {
  PullRequest,
  DiffStatEntry,
  PullRequestComment,
  PullRequestActivity,
  PaginatedResponse,
} from "../../src/bitbucket/types.js";
import {
  formatPullRequest,
  formatPullRequestList,
  formatDiffStat,
  formatPRActivity,
  formatPRComment,
} from "../../src/formatting.js";
import {
  assertNotReadonly,
  assertRepoAllowed,
  assertWorkspaceAllowed,
  assertConfirmed,
  resolveWorkspace,
} from "../../src/safety.js";

const BASE_URL = "https://api.bitbucket.org/2.0";

const mockConfig: Config = {
  email: "test@example.com",
  apiToken: "test-token",
  defaultWorkspace: "test-workspace",
  allowedWorkspaces: undefined,
  allowedRepos: undefined,
  readonly: false,
  baseUrl: BASE_URL,
};

const mswServer = setupServer();

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    title: "Test PR",
    description: "A test pull request",
    state: "OPEN",
    author: {
      display_name: "Test User",
      uuid: "{user-uuid}",
      nickname: "testuser",
      type: "user",
    },
    source: {
      branch: { name: "feature/test" },
    },
    destination: {
      branch: { name: "main" },
    },
    close_source_branch: false,
    created_on: "2025-01-01T00:00:00Z",
    updated_on: "2025-01-02T00:00:00Z",
    comment_count: 2,
    task_count: 0,
    reason: "",
    participants: [],
    reviewers: [],
    type: "pullrequest",
    ...overrides,
  };
}

function makeComment(
  overrides: Partial<PullRequestComment> = {}
): PullRequestComment {
  return {
    id: 10,
    content: { raw: "Looks good!", markup: "markdown", html: "<p>Looks good!</p>" },
    created_on: "2025-01-03T00:00:00Z",
    updated_on: "2025-01-03T00:00:00Z",
    user: {
      display_name: "Reviewer",
      uuid: "{reviewer-uuid}",
      nickname: "reviewer",
      type: "user",
    },
    deleted: false,
    type: "pullrequest_comment",
    ...overrides,
  };
}

function makeDiffStatEntry(
  overrides: Partial<DiffStatEntry> = {}
): DiffStatEntry {
  return {
    status: "modified",
    old: { path: "src/app.ts" },
    new: { path: "src/app.ts" },
    lines_added: 10,
    lines_removed: 3,
    type: "diffstat",
    ...overrides,
  };
}

// ── Client API call tests ────────────────────────────────────────────

describe("Pull Request API calls via BitbucketClient", () => {
  const client = new BitbucketClient(mockConfig);

  it("lists pull requests with state filter", async () => {
    const pr = makePR();
    mswServer.use(
      http.get(`${BASE_URL}/repositories/test-workspace/my-repo/pullrequests`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("state")).toBe("OPEN");
        return HttpResponse.json({
          values: [pr],
          page: 1,
          size: 1,
          pagelen: 10,
        } satisfies PaginatedResponse<PullRequest>);
      })
    );

    const response = await client.get<PaginatedResponse<PullRequest>>(
      "/repositories/test-workspace/my-repo/pullrequests",
      { state: "OPEN" }
    );
    expect(response.values).toHaveLength(1);
    expect(response.values[0].id).toBe(1);
  });

  it("gets a single pull request", async () => {
    const pr = makePR({ id: 42, title: "My Feature PR" });
    mswServer.use(
      http.get(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/42`,
        () => HttpResponse.json(pr)
      )
    );

    const result = await client.get<PullRequest>(
      "/repositories/test-workspace/my-repo/pullrequests/42"
    );
    expect(result.id).toBe(42);
    expect(result.title).toBe("My Feature PR");
  });

  it("creates a pull request with full params", async () => {
    const created = makePR({ id: 99, title: "New Feature" });
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.title).toBe("New Feature");
          expect(body.source).toEqual({ branch: { name: "feature/new" } });
          expect(body.destination).toEqual({ branch: { name: "develop" } });
          expect(body.description).toBe("A new feature");
          expect(body.close_source_branch).toBe(true);
          expect(body.reviewers).toEqual([{ uuid: "{rev-1}" }]);
          return HttpResponse.json(created);
        }
      )
    );

    const result = await client.post<PullRequest>(
      "/repositories/test-workspace/my-repo/pullrequests",
      {
        title: "New Feature",
        source: { branch: { name: "feature/new" } },
        destination: { branch: { name: "develop" } },
        description: "A new feature",
        close_source_branch: true,
        reviewers: [{ uuid: "{rev-1}" }],
      }
    );
    expect(result.id).toBe(99);
  });

  it("gets pull request diff as raw text", async () => {
    const diffText = "diff --git a/file.ts b/file.ts\n+added line\n-removed line";
    mswServer.use(
      http.get(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/diff`,
        () => new HttpResponse(diffText, { headers: { "Content-Type": "text/plain" } })
      )
    );

    const result = await client.getRaw(
      "/repositories/test-workspace/my-repo/pullrequests/1/diff"
    );
    expect(result).toContain("+added line");
    expect(result).toContain("-removed line");
  });

  it("gets pull request diffstat with pagination", async () => {
    const entry1 = makeDiffStatEntry({ new: { path: "file1.ts" }, old: { path: "file1.ts" } });
    const entry2 = makeDiffStatEntry({
      status: "added",
      old: undefined,
      new: { path: "file2.ts" },
      lines_added: 20,
      lines_removed: 0,
    });

    let callCount = 0;
    mswServer.use(
      http.get(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/diffstat`,
        () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json({
              values: [entry1],
              page: 1,
              size: 2,
              pagelen: 1,
              next: `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/diffstat?page=2`,
            });
          }
          return HttpResponse.json({
            values: [entry2],
            page: 2,
            size: 2,
            pagelen: 1,
          });
        }
      )
    );

    const entries = await client.paginateAll<DiffStatEntry>(
      "/repositories/test-workspace/my-repo/pullrequests/1/diffstat"
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].new?.path).toBe("file1.ts");
    expect(entries[1].new?.path).toBe("file2.ts");
  });

  it("lists pull request activity with pagination", async () => {
    const activity: PullRequestActivity = {
      comment: makeComment(),
    };
    mswServer.use(
      http.get(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/activity`,
        () =>
          HttpResponse.json({
            values: [activity],
            page: 1,
            size: 1,
            pagelen: 10,
          })
      )
    );

    const activities = await client.paginateAll<PullRequestActivity>(
      "/repositories/test-workspace/my-repo/pullrequests/1/activity"
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].comment?.id).toBe(10);
  });

  it("adds a comment to a pull request", async () => {
    const comment = makeComment({ id: 15 });
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/comments`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.content).toEqual({ raw: "Nice work!" });
          return HttpResponse.json(comment);
        }
      )
    );

    const result = await client.post<PullRequestComment>(
      "/repositories/test-workspace/my-repo/pullrequests/1/comments",
      { content: { raw: "Nice work!" } }
    );
    expect(result.id).toBe(15);
  });

  it("adds a threaded reply comment with parent_id", async () => {
    const comment = makeComment({
      id: 17,
      parent: { id: 10 },
    });
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/comments`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.content).toEqual({ raw: "Thanks, fixed!" });
          expect(body.parent).toEqual({ id: 10 });
          return HttpResponse.json(comment);
        }
      )
    );

    const result = await client.post<PullRequestComment>(
      "/repositories/test-workspace/my-repo/pullrequests/1/comments",
      { content: { raw: "Thanks, fixed!" }, parent: { id: 10 } }
    );
    expect(result.id).toBe(17);
    expect(result.parent?.id).toBe(10);
  });

  it("adds an inline comment with path and line", async () => {
    const comment = makeComment({
      id: 16,
      inline: { path: "src/app.ts", to: 42 },
    });
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/comments`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.inline).toEqual({ path: "src/app.ts", to: 42 });
          return HttpResponse.json(comment);
        }
      )
    );

    const result = await client.post<PullRequestComment>(
      "/repositories/test-workspace/my-repo/pullrequests/1/comments",
      {
        content: { raw: "Fix this line" },
        inline: { path: "src/app.ts", to: 42 },
      }
    );
    expect(result.id).toBe(16);
    expect(result.inline?.path).toBe("src/app.ts");
  });

  it("approves a pull request", async () => {
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/approve`,
        () => HttpResponse.json({ approved: true })
      )
    );

    const result = await client.post<{ approved: boolean }>(
      "/repositories/test-workspace/my-repo/pullrequests/1/approve"
    );
    expect(result.approved).toBe(true);
  });

  it("requests changes on a pull request", async () => {
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/request-changes`,
        () => HttpResponse.json({ })
      )
    );

    await client.post(
      "/repositories/test-workspace/my-repo/pullrequests/1/request-changes"
    );
  });

  it("merges a pull request", async () => {
    const merged = makePR({ id: 1, state: "MERGED" });
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/merge`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.type).toBe("pullrequest");
          expect(body.merge_strategy).toBe("squash");
          expect(body.close_source_branch).toBe(true);
          return HttpResponse.json(merged);
        }
      )
    );

    const result = await client.post<PullRequest>(
      "/repositories/test-workspace/my-repo/pullrequests/1/merge",
      {
        type: "pullrequest",
        merge_strategy: "squash",
        close_source_branch: true,
      }
    );
    expect(result.state).toBe("MERGED");
  });

  it("updates a pull request with title, description, and reviewers", async () => {
    const updated = makePR({ id: 1, title: "Updated Title", description: "New desc" });
    mswServer.use(
      http.put(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.title).toBe("Updated Title");
          expect(body.description).toBe("New desc");
          expect(body.reviewers).toEqual([{ uuid: "{rev-1}" }]);
          return HttpResponse.json(updated);
        }
      )
    );

    const result = await client.put<PullRequest>(
      "/repositories/test-workspace/my-repo/pullrequests/1",
      {
        title: "Updated Title",
        description: "New desc",
        reviewers: [{ uuid: "{rev-1}" }],
      }
    );
    expect(result.id).toBe(1);
    expect(result.title).toBe("Updated Title");
  });

  it("updates a pull request with partial fields", async () => {
    const updated = makePR({ id: 2, title: "Only Title Changed" });
    mswServer.use(
      http.put(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/2`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.title).toBe("Only Title Changed");
          expect(body).not.toHaveProperty("description");
          expect(body).not.toHaveProperty("reviewers");
          return HttpResponse.json(updated);
        }
      )
    );

    const result = await client.put<PullRequest>(
      "/repositories/test-workspace/my-repo/pullrequests/2",
      { title: "Only Title Changed" }
    );
    expect(result.title).toBe("Only Title Changed");
  });

  it("declines a pull request", async () => {
    const declined = makePR({ id: 1, state: "DECLINED" });
    mswServer.use(
      http.post(
        `${BASE_URL}/repositories/test-workspace/my-repo/pullrequests/1/decline`,
        () => HttpResponse.json(declined)
      )
    );

    const result = await client.post<PullRequest>(
      "/repositories/test-workspace/my-repo/pullrequests/1/decline"
    );
    expect(result.state).toBe("DECLINED");
  });
});

// ── Formatting tests ─────────────────────────────────────────────────

describe("Pull Request formatting", () => {
  it("formatPullRequest produces expected output", () => {
    const pr = makePR({
      id: 5,
      title: "Add login",
      state: "OPEN",
      description: "Implements user login flow",
    });
    const text = formatPullRequest(pr);
    expect(text).toContain("PR #5: Add login");
    expect(text).toContain("State: OPEN");
    expect(text).toContain("feature/test → main");
    expect(text).toContain("Implements user login flow");
  });

  it("formatPullRequestList handles empty list", () => {
    expect(formatPullRequestList([])).toBe("No pull requests found.");
  });

  it("formatPullRequestList formats multiple PRs", () => {
    const prs = [
      makePR({ id: 1, title: "PR One" }),
      makePR({ id: 2, title: "PR Two", state: "MERGED" }),
    ];
    const text = formatPullRequestList(prs);
    expect(text).toContain("#1 [OPEN] PR One");
    expect(text).toContain("#2 [MERGED] PR Two");
  });

  it("formatDiffStat shows file changes and totals", () => {
    const entries = [
      makeDiffStatEntry({ new: { path: "a.ts" }, old: { path: "a.ts" }, lines_added: 5, lines_removed: 2 }),
      makeDiffStatEntry({
        status: "added",
        new: { path: "b.ts" },
        old: undefined,
        lines_added: 15,
        lines_removed: 0,
      }),
    ];
    const text = formatDiffStat(entries);
    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
    expect(text).toContain("Total: 2 files changed, +20 -2");
  });

  it("formatDiffStat handles empty list", () => {
    expect(formatDiffStat([])).toBe("No changes.");
  });

  it("formatPRActivity formats various activity types", () => {
    const activities: PullRequestActivity[] = [
      { comment: makeComment({ content: { raw: "LGTM", markup: "markdown", html: "" } }) },
      {
        approval: {
          user: { display_name: "Approver", uuid: "{a}", nickname: "approver", type: "user" },
          date: "2025-01-04T00:00:00Z",
        },
      },
      {
        update: {
          state: "MERGED",
          title: "Test PR",
          date: "2025-01-05T00:00:00Z",
          author: { display_name: "Merger", uuid: "{m}", nickname: "merger", type: "user" },
        },
      },
    ];
    const text = formatPRActivity(activities);
    expect(text).toContain("[comment]");
    expect(text).toContain("LGTM");
    expect(text).toContain("[approved] by Approver");
    expect(text).toContain("[update] MERGED by Merger");
  });

  it("formatPRActivity handles empty list", () => {
    expect(formatPRActivity([])).toBe("No activity found.");
  });

  it("formatPRComment formats inline comment", () => {
    const comment = makeComment({
      id: 20,
      inline: { path: "src/index.ts", to: 10 },
      content: { raw: "Fix this", markup: "markdown", html: "" },
    });
    const text = formatPRComment(comment);
    expect(text).toContain("#20");
    expect(text).toContain("[src/index.ts:10]");
    expect(text).toContain("Fix this");
  });

  it("formatPRComment formats reply comment", () => {
    const comment = makeComment({
      id: 21,
      parent: { id: 20 },
      content: { raw: "Fixed!", markup: "markdown", html: "" },
    });
    const text = formatPRComment(comment);
    expect(text).toContain("(reply to #20)");
    expect(text).toContain("Fixed!");
  });
});

// ── Safety check tests ───────────────────────────────────────────────

describe("Pull Request safety checks", () => {
  it("assertNotReadonly throws in readonly mode", () => {
    const readonlyConfig = { ...mockConfig, readonly: true };
    expect(() => assertNotReadonly(readonlyConfig)).toThrow(
      "not allowed in readonly mode"
    );
  });

  it("assertNotReadonly passes in non-readonly mode", () => {
    expect(() => assertNotReadonly(mockConfig)).not.toThrow();
  });

  it("assertConfirmed throws when confirm is false", () => {
    expect(() => assertConfirmed(false, "merge pull request")).toThrow(
      'Destructive action "merge pull request" requires explicit confirmation'
    );
  });

  it("assertConfirmed throws when confirm is undefined", () => {
    expect(() => assertConfirmed(undefined, "decline pull request")).toThrow(
      'Destructive action "decline pull request" requires explicit confirmation'
    );
  });

  it("assertConfirmed passes when confirm is true", () => {
    expect(() => assertConfirmed(true, "merge pull request")).not.toThrow();
  });

  it("assertWorkspaceAllowed blocks disallowed workspace", () => {
    const restrictedConfig = {
      ...mockConfig,
      allowedWorkspaces: ["allowed-ws"],
    };
    expect(() =>
      assertWorkspaceAllowed(restrictedConfig, "blocked-ws")
    ).toThrow('Workspace "blocked-ws" is not in the allowed list');
  });

  it("assertWorkspaceAllowed passes allowed workspace", () => {
    const restrictedConfig = {
      ...mockConfig,
      allowedWorkspaces: ["allowed-ws"],
    };
    expect(() =>
      assertWorkspaceAllowed(restrictedConfig, "allowed-ws")
    ).not.toThrow();
  });

  it("assertRepoAllowed blocks disallowed repo", () => {
    const restrictedConfig = {
      ...mockConfig,
      allowedRepos: ["test-workspace/allowed-repo"],
    };
    expect(() =>
      assertRepoAllowed(restrictedConfig, "test-workspace", "blocked-repo")
    ).toThrow('Repository "test-workspace/blocked-repo" is not in the allowed list');
  });

  it("assertRepoAllowed passes allowed repo by full name", () => {
    const restrictedConfig = {
      ...mockConfig,
      allowedRepos: ["test-workspace/my-repo"],
    };
    expect(() =>
      assertRepoAllowed(restrictedConfig, "test-workspace", "my-repo")
    ).not.toThrow();
  });

  it("assertRepoAllowed passes allowed repo by slug only", () => {
    const restrictedConfig = {
      ...mockConfig,
      allowedRepos: ["my-repo"],
    };
    expect(() =>
      assertRepoAllowed(restrictedConfig, "test-workspace", "my-repo")
    ).not.toThrow();
  });

  it("resolveWorkspace returns explicit workspace", () => {
    expect(resolveWorkspace(mockConfig, "explicit-ws")).toBe("explicit-ws");
  });

  it("resolveWorkspace returns default workspace when none given", () => {
    expect(resolveWorkspace(mockConfig)).toBe("test-workspace");
  });

  it("resolveWorkspace throws when no workspace available", () => {
    const noDefault = { ...mockConfig, defaultWorkspace: undefined };
    expect(() => resolveWorkspace(noDefault)).toThrow(
      "No workspace specified"
    );
  });

  it("readonly mode blocks write operations (create PR example)", () => {
    const readonlyConfig = { ...mockConfig, readonly: true };
    expect(() => assertNotReadonly(readonlyConfig)).toThrow(
      "not allowed in readonly mode"
    );
  });

  it("readonly mode blocks destructive operations (merge PR example)", () => {
    const readonlyConfig = { ...mockConfig, readonly: true };
    expect(() => assertNotReadonly(readonlyConfig)).toThrow(
      "not allowed in readonly mode"
    );
  });
});
