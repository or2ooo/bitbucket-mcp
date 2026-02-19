export interface Config {
  email: string;
  apiToken: string;
  defaultWorkspace: string | undefined;
  allowedWorkspaces: string[] | undefined;
  allowedRepos: string[] | undefined;
  readonly: boolean;
  baseUrl: string;
}

export function loadConfig(): Config {
  const email = process.env.ATLASSIAN_USER_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;

  if (!email || !apiToken) {
    throw new Error(
      "ATLASSIAN_USER_EMAIL and ATLASSIAN_API_TOKEN environment variables are required"
    );
  }

  const allowedWorkspacesRaw = process.env.BITBUCKET_ALLOWED_WORKSPACES;
  const allowedReposRaw = process.env.BITBUCKET_ALLOWED_REPOS;

  return {
    email,
    apiToken,
    defaultWorkspace: process.env.BITBUCKET_DEFAULT_WORKSPACE || undefined,
    allowedWorkspaces: allowedWorkspacesRaw
      ? allowedWorkspacesRaw.split(",").map((s) => s.trim().toLowerCase())
      : undefined,
    allowedRepos: allowedReposRaw
      ? allowedReposRaw.split(",").map((s) => s.trim().toLowerCase())
      : undefined,
    readonly: process.env.BITBUCKET_READONLY === "true",
    baseUrl:
      process.env.BITBUCKET_BASE_URL || "https://api.bitbucket.org/2.0",
  };
}
