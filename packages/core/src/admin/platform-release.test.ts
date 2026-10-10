import { describe, expect, it } from "vitest";
import { readReleaseInfo } from "./platform-release";

// PLATFORM-P1-08.1: the version panel shows what Vercel exposes, and nothing it doesn't.
describe("readReleaseInfo", () => {
  it("reads a Vercel production deployment", () => {
    const info = readReleaseInfo({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "fbd8d970352f73514c0427531bebe20eb07536a1",
      VERCEL_GIT_COMMIT_MESSAGE: "Discovery: grouped alerts (#29)\n\nLonger body",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_PROVIDER: "github",
      VERCEL_GIT_REPO_OWNER: "luvchakra",
      VERCEL_GIT_REPO_SLUG: "founder-collab",
      VERCEL_DEPLOYMENT_ID: "dpl_abc",
      VERCEL_URL: "wonderark-abc.vercel.app",
      WONDERARK_BUILT_AT: "2026-10-10T12:00:00.000Z",
    });
    expect(info).toEqual({
      version: "fbd8d97",
      commitSha: "fbd8d970352f73514c0427531bebe20eb07536a1",
      commitMessage: "Discovery: grouped alerts (#29)",
      commitUrl: "https://github.com/luvchakra/founder-collab/commit/fbd8d970352f73514c0427531bebe20eb07536a1",
      branch: "main",
      deploymentId: "dpl_abc",
      deploymentUrl: "https://wonderark-abc.vercel.app",
      builtAt: "2026-10-10T12:00:00.000Z",
      environment: "production",
    });
  });

  it("reports nothing it can't see when run outside Vercel", () => {
    expect(readReleaseInfo({})).toEqual({
      version: null,
      commitSha: null,
      commitMessage: null,
      commitUrl: null,
      branch: null,
      deploymentId: null,
      deploymentUrl: null,
      builtAt: null,
      environment: "local",
    });
  });

  it("links a commit only on GitHub, and treats blank values as missing", () => {
    const info = readReleaseInfo({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: "abc1234567", VERCEL_GIT_PROVIDER: "gitlab", VERCEL_GIT_REPO_OWNER: "o", VERCEL_GIT_REPO_SLUG: "r", VERCEL_GIT_COMMIT_REF: " " });
    expect(info.commitUrl).toBeNull();
    expect(info.branch).toBeNull();
    expect(info.environment).toBe("preview");
  });
});
