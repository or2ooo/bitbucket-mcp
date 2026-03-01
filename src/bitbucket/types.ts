export interface PaginatedResponse<T> {
  values: T[];
  next?: string;
  page: number;
  size: number;
  pagelen: number;
}

export interface Link {
  href: string;
  name?: string;
}

export interface Links {
  self?: Link;
  html?: Link;
  avatar?: Link;
  [key: string]: Link | undefined;
}

export interface User {
  display_name: string;
  uuid: string;
  nickname: string;
  account_id?: string;
  links?: Links;
  type: string;
}

export interface Workspace {
  uuid: string;
  name: string;
  slug: string;
  links?: Links;
  type: string;
}

export interface Project {
  key: string;
  name: string;
  uuid: string;
  type: string;
}

export interface Repository {
  uuid: string;
  name: string;
  full_name: string;
  slug: string;
  description: string;
  is_private: boolean;
  language: string;
  created_on: string;
  updated_on: string;
  size: number;
  mainbranch?: { name: string; type: string };
  project?: Project;
  links?: Links;
  type: string;
}

export interface Branch {
  name: string;
  target: Commit;
  type: string;
}

export interface Commit {
  hash: string;
  message: string;
  date: string;
  author: {
    raw: string;
    user?: User;
  };
  parents?: { hash: string }[];
  type: string;
}

export interface Participant {
  user: User;
  role: string;
  approved: boolean;
  state: string | null;
}

export interface PullRequest {
  id: number;
  title: string;
  description: string;
  state: string;
  author: User;
  source: {
    branch: { name: string };
    repository?: { full_name: string };
  };
  destination: {
    branch: { name: string };
    repository?: { full_name: string };
  };
  merge_commit?: { hash: string };
  close_source_branch: boolean;
  created_on: string;
  updated_on: string;
  comment_count: number;
  task_count: number;
  reason: string;
  participants: Participant[];
  reviewers: User[];
  links?: Links;
  type: string;
}

export interface PullRequestComment {
  id: number;
  content: { raw: string; markup: string; html: string };
  created_on: string;
  updated_on: string;
  user: User;
  inline?: {
    path: string;
    from?: number | null;
    to?: number | null;
  };
  parent?: { id: number };
  deleted: boolean;
  type: string;
}

export interface PullRequestActivity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approval?: any;
  update?: {
    state: string;
    title: string;
    date: string;
    author: User;
  };
  comment?: PullRequestComment;
}

export interface DiffStatEntry {
  status: string;
  old?: { path: string };
  new?: { path: string };
  lines_added: number;
  lines_removed: number;
  type: string;
}

export interface Issue {
  id: number;
  title: string;
  state: string;
  priority: string;
  kind: string;
  content: { raw: string; markup: string; html: string };
  reporter: User;
  assignee?: User;
  created_on: string;
  updated_on: string;
  votes: number;
  watches: number;
  links?: Links;
  type: string;
}

export interface IssueComment {
  id: number;
  content: { raw: string; markup: string; html: string };
  created_on: string;
  updated_on: string;
  user: User;
  type: string;
}

export interface DirectoryEntry {
  path: string;
  type: string; // "commit_directory" or "commit_file"
  size?: number;
}

export interface CodeSearchResult {
  type: string;
  content_match_count: number;
  content_matches: Array<{
    lines: Array<{
      line: number;
      segments: Array<{ text: string; match?: boolean }>;
    }>;
  }>;
  path_matches: Array<{ text: string; match?: boolean }>;
  file: { path: string; type: string; links?: Links };
}

export interface PipelineTarget {
  ref_type?: string;
  ref_name?: string;
  selector?: { type: string; pattern: string };
  type: string;
}

export interface Pipeline {
  uuid: string;
  build_number: number;
  state: {
    name: string;
    result?: { name: string };
    stage?: { name: string };
  };
  target: PipelineTarget;
  creator: User;
  created_on: string;
  completed_on?: string;
  duration_in_seconds?: number;
  type: string;
}
