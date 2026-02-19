import { Config } from "./config.js";

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyError";
  }
}

export function assertNotReadonly(config: Config): void {
  if (config.readonly) {
    throw new SafetyError(
      "This operation is not allowed in readonly mode. Set BITBUCKET_READONLY=false to enable write operations."
    );
  }
}

export function assertWorkspaceAllowed(
  config: Config,
  workspace: string
): void {
  if (config.allowedWorkspaces) {
    const normalized = workspace.toLowerCase();
    if (!config.allowedWorkspaces.includes(normalized)) {
      throw new SafetyError(
        `Workspace "${workspace}" is not in the allowed list. Allowed: ${config.allowedWorkspaces.join(", ")}`
      );
    }
  }
}

export function assertRepoAllowed(
  config: Config,
  workspace: string,
  repoSlug: string
): void {
  assertWorkspaceAllowed(config, workspace);
  if (config.allowedRepos) {
    const fullName = `${workspace}/${repoSlug}`.toLowerCase();
    const slugOnly = repoSlug.toLowerCase();
    if (
      !config.allowedRepos.includes(fullName) &&
      !config.allowedRepos.includes(slugOnly)
    ) {
      throw new SafetyError(
        `Repository "${workspace}/${repoSlug}" is not in the allowed list. Allowed: ${config.allowedRepos.join(", ")}`
      );
    }
  }
}

export function assertConfirmed(
  confirm: boolean | undefined,
  action: string
): void {
  if (!confirm) {
    throw new SafetyError(
      `Destructive action "${action}" requires explicit confirmation. Set confirm=true to proceed.`
    );
  }
}

export function resolveWorkspace(
  config: Config,
  workspace?: string
): string {
  if (workspace) return workspace;
  if (config.defaultWorkspace) return config.defaultWorkspace;
  throw new SafetyError(
    "No workspace specified and BITBUCKET_DEFAULT_WORKSPACE is not set. Provide a workspace parameter."
  );
}
