import type {
  User,
  Workspace,
  Repository,
  Branch,
  Commit,
  PullRequest,
  PullRequestComment,
  PullRequestActivity,
  DiffStatEntry,
  Issue,
  IssueComment,
  Pipeline,
  Participant,
} from "./bitbucket/types.js";

export function formatUser(user: User): string {
  return `${user.display_name} (@${user.nickname})`;
}

export function formatWorkspace(ws: Workspace): string {
  return `${ws.name} [${ws.slug}]`;
}

export function formatWorkspaceList(workspaces: Workspace[]): string {
  if (workspaces.length === 0) return "No workspaces found.";
  return workspaces.map((ws) => `- ${formatWorkspace(ws)}`).join("\n");
}

export function formatRepository(repo: Repository): string {
  const parts = [
    `${repo.full_name}${repo.is_private ? " (private)" : " (public)"}`,
    repo.description ? `  Description: ${repo.description}` : null,
    `  Language: ${repo.language || "not set"}`,
    repo.mainbranch ? `  Main branch: ${repo.mainbranch.name}` : null,
    repo.project ? `  Project: ${repo.project.name} [${repo.project.key}]` : null,
    `  Updated: ${repo.updated_on}`,
  ];
  return parts.filter(Boolean).join("\n");
}

export function formatRepositoryList(repos: Repository[]): string {
  if (repos.length === 0) return "No repositories found.";
  return repos
    .map(
      (r) =>
        `- ${r.full_name}${r.is_private ? " (private)" : ""} | ${r.language || "n/a"} | updated ${r.updated_on}`
    )
    .join("\n");
}

export function formatBranch(branch: Branch): string {
  return `${branch.name} → ${branch.target.hash.substring(0, 12)} (${branch.target.message.split("\n")[0]})`;
}

export function formatBranchList(branches: Branch[]): string {
  if (branches.length === 0) return "No branches found.";
  return branches.map((b) => `- ${formatBranch(b)}`).join("\n");
}

export function formatCommit(commit: Commit): string {
  const shortHash = commit.hash.substring(0, 12);
  const firstLine = commit.message.split("\n")[0];
  const author = commit.author.user
    ? commit.author.user.display_name
    : commit.author.raw;
  return `${shortHash} ${firstLine}\n  Author: ${author} | Date: ${commit.date}`;
}

export function formatCommitList(commits: Commit[]): string {
  if (commits.length === 0) return "No commits found.";
  return commits.map((c) => formatCommit(c)).join("\n");
}

function formatParticipant(p: Participant): string {
  const status = p.approved ? "approved" : p.state || "none";
  return `${p.user.display_name} (${p.role}: ${status})`;
}

export function formatPullRequest(pr: PullRequest): string {
  const parts = [
    `PR #${pr.id}: ${pr.title}`,
    `  State: ${pr.state} | Author: ${formatUser(pr.author)}`,
    `  Branch: ${pr.source.branch.name} → ${pr.destination.branch.name}`,
    pr.description ? `  Description: ${pr.description.substring(0, 500)}` : null,
    `  Created: ${pr.created_on} | Updated: ${pr.updated_on}`,
    `  Comments: ${pr.comment_count} | Tasks: ${pr.task_count}`,
    pr.participants.length > 0
      ? `  Participants: ${pr.participants.map(formatParticipant).join(", ")}`
      : null,
    pr.reviewers.length > 0
      ? `  Reviewers: ${pr.reviewers.map((r) => r.display_name).join(", ")}`
      : null,
  ];
  return parts.filter(Boolean).join("\n");
}

export function formatPullRequestList(prs: PullRequest[]): string {
  if (prs.length === 0) return "No pull requests found.";
  return prs
    .map(
      (pr) =>
        `- #${pr.id} [${pr.state}] ${pr.title} (${pr.source.branch.name} → ${pr.destination.branch.name}) by ${pr.author.display_name}`
    )
    .join("\n");
}

export function formatPRComment(comment: PullRequestComment): string {
  const location = comment.inline
    ? ` [${comment.inline.path}${comment.inline.to ? `:${comment.inline.to}` : ""}]`
    : "";
  const parent = comment.parent ? ` (reply to #${comment.parent.id})` : "";
  return `#${comment.id}${location}${parent} by ${comment.user.display_name} at ${comment.created_on}:\n  ${comment.content.raw}`;
}

export function formatPRActivity(activities: PullRequestActivity[]): string {
  if (activities.length === 0) return "No activity found.";
  return activities
    .map((a) => {
      if (a.comment) {
        return `[comment] ${formatPRComment(a.comment)}`;
      }
      if (a.approval) {
        const user = a.approval.user as User;
        return `[approved] by ${user.display_name} at ${a.approval.date}`;
      }
      if (a.update) {
        return `[update] ${a.update.state} by ${a.update.author.display_name} at ${a.update.date}`;
      }
      return "[unknown activity]";
    })
    .join("\n");
}

export function formatDiffStat(entries: DiffStatEntry[]): string {
  if (entries.length === 0) return "No changes.";
  const lines = entries.map((e) => {
    const path = e.new?.path || e.old?.path || "unknown";
    return `${e.status.padEnd(10)} ${path} (+${e.lines_added} -${e.lines_removed})`;
  });
  const totalAdded = entries.reduce((s, e) => s + e.lines_added, 0);
  const totalRemoved = entries.reduce((s, e) => s + e.lines_removed, 0);
  lines.push(`\nTotal: ${entries.length} files changed, +${totalAdded} -${totalRemoved}`);
  return lines.join("\n");
}

export function formatIssue(issue: Issue): string {
  const parts = [
    `#${issue.id}: ${issue.title}`,
    `  State: ${issue.state} | Priority: ${issue.priority} | Kind: ${issue.kind}`,
    `  Reporter: ${formatUser(issue.reporter)}`,
    issue.assignee ? `  Assignee: ${formatUser(issue.assignee)}` : null,
    issue.content.raw
      ? `  Description: ${issue.content.raw.substring(0, 500)}`
      : null,
    `  Created: ${issue.created_on} | Updated: ${issue.updated_on}`,
    `  Votes: ${issue.votes} | Watches: ${issue.watches}`,
  ];
  return parts.filter(Boolean).join("\n");
}

export function formatIssueList(issues: Issue[]): string {
  if (issues.length === 0) return "No issues found.";
  return issues
    .map(
      (i) =>
        `- #${i.id} [${i.state}] ${i.title} (${i.priority}/${i.kind}) by ${i.reporter.display_name}`
    )
    .join("\n");
}

export function formatIssueComment(comment: IssueComment): string {
  return `#${comment.id} by ${comment.user.display_name} at ${comment.created_on}:\n  ${comment.content.raw}`;
}

export function formatPipeline(pipeline: Pipeline): string {
  const state = pipeline.state.result
    ? `${pipeline.state.name}:${pipeline.state.result.name}`
    : pipeline.state.name;
  const ref = pipeline.target.ref_name || "manual";
  const duration = pipeline.duration_in_seconds
    ? `${pipeline.duration_in_seconds}s`
    : "running";
  return `#${pipeline.build_number} [${state}] ref:${ref} by ${pipeline.creator.display_name} (${duration}) started ${pipeline.created_on}`;
}

export function formatPipelineList(pipelines: Pipeline[]): string {
  if (pipelines.length === 0) return "No pipelines found.";
  return pipelines.map((p) => `- ${formatPipeline(p)}`).join("\n");
}
