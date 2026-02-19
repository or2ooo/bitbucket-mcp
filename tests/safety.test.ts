import { describe, it, expect } from "vitest";
import {
  assertNotReadonly,
  assertWorkspaceAllowed,
  assertRepoAllowed,
  assertConfirmed,
  resolveWorkspace,
  SafetyError,
} from "../src/safety.js";
import type { Config } from "../src/config.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    email: "test@example.com",
    apiToken: "test-token",
    defaultWorkspace: "my-workspace",
    allowedWorkspaces: undefined,
    allowedRepos: undefined,
    readonly: false,
    baseUrl: "https://api.bitbucket.org/2.0",
    ...overrides,
  };
}

describe("assertNotReadonly", () => {
  it("does nothing when readonly is false", () => {
    expect(() => assertNotReadonly(makeConfig())).not.toThrow();
  });

  it("throws SafetyError when readonly is true", () => {
    expect(() => assertNotReadonly(makeConfig({ readonly: true }))).toThrow(
      SafetyError
    );
  });
});

describe("assertWorkspaceAllowed", () => {
  it("does nothing when allowedWorkspaces is undefined", () => {
    expect(() =>
      assertWorkspaceAllowed(makeConfig(), "any-workspace")
    ).not.toThrow();
  });

  it("does nothing when workspace is in the allowed list", () => {
    const config = makeConfig({ allowedWorkspaces: ["ws1", "ws2"] });
    expect(() => assertWorkspaceAllowed(config, "ws1")).not.toThrow();
    expect(() => assertWorkspaceAllowed(config, "WS2")).not.toThrow(); // case insensitive
  });

  it("throws SafetyError when workspace is not allowed", () => {
    const config = makeConfig({ allowedWorkspaces: ["ws1"] });
    expect(() => assertWorkspaceAllowed(config, "ws2")).toThrow(SafetyError);
  });
});

describe("assertRepoAllowed", () => {
  it("does nothing when allowedRepos is undefined", () => {
    expect(() =>
      assertRepoAllowed(makeConfig(), "ws", "any-repo")
    ).not.toThrow();
  });

  it("allows repo by full name", () => {
    const config = makeConfig({ allowedRepos: ["ws/my-repo"] });
    expect(() => assertRepoAllowed(config, "ws", "my-repo")).not.toThrow();
  });

  it("allows repo by slug only", () => {
    const config = makeConfig({ allowedRepos: ["my-repo"] });
    expect(() => assertRepoAllowed(config, "ws", "my-repo")).not.toThrow();
  });

  it("throws SafetyError when repo is not allowed", () => {
    const config = makeConfig({ allowedRepos: ["ws/allowed-repo"] });
    expect(() => assertRepoAllowed(config, "ws", "other-repo")).toThrow(
      SafetyError
    );
  });

  it("also checks workspace allowed when both are set", () => {
    const config = makeConfig({
      allowedWorkspaces: ["ws1"],
      allowedRepos: ["ws1/repo"],
    });
    expect(() => assertRepoAllowed(config, "ws2", "repo")).toThrow(
      SafetyError
    );
  });
});

describe("assertConfirmed", () => {
  it("does nothing when confirm is true", () => {
    expect(() => assertConfirmed(true, "test action")).not.toThrow();
  });

  it("throws SafetyError when confirm is false", () => {
    expect(() => assertConfirmed(false, "test action")).toThrow(SafetyError);
  });

  it("throws SafetyError when confirm is undefined", () => {
    expect(() => assertConfirmed(undefined, "test action")).toThrow(
      SafetyError
    );
  });
});

describe("resolveWorkspace", () => {
  it("returns provided workspace", () => {
    expect(resolveWorkspace(makeConfig(), "custom-ws")).toBe("custom-ws");
  });

  it("falls back to defaultWorkspace", () => {
    expect(resolveWorkspace(makeConfig())).toBe("my-workspace");
  });

  it("throws SafetyError when no workspace available", () => {
    const config = makeConfig({ defaultWorkspace: undefined });
    expect(() => resolveWorkspace(config)).toThrow(SafetyError);
  });
});
