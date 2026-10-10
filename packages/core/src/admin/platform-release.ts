/**
 * PLATFORM-P1-08.1 (Platform Version), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §30:
 * which WonderArk build is running, read from what Vercel exposes to the deployment
 * (https://vercel.com/docs/environment-variables/system-environment-variables) plus the
 * build time next.config.ts stamps in. The version is the commit -- package.json carries no
 * release number -- and anything not exposed reads as null ("Not recorded"), never a guess.
 */

export type ReleaseInfo = {
  /** Short commit SHA, the version an operator can match to GitHub. */
  version: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitUrl: string | null;
  branch: string | null;
  /** Vercel deployment id (dpl_...), the build. */
  deploymentId: string | null;
  deploymentUrl: string | null;
  builtAt: string | null;
  environment: "production" | "preview" | "development" | "local";
};

type Env = Record<string, string | undefined>;

function value(env: Env, key: string): string | null {
  const v = env[key]?.trim();
  return v ? v : null;
}

export function readReleaseInfo(env: Env = process.env): ReleaseInfo {
  const sha = value(env, "VERCEL_GIT_COMMIT_SHA");
  const owner = value(env, "VERCEL_GIT_REPO_OWNER");
  const repo = value(env, "VERCEL_GIT_REPO_SLUG");
  const provider = value(env, "VERCEL_GIT_PROVIDER");
  const vercelEnv = value(env, "VERCEL_ENV");
  const url = value(env, "VERCEL_URL");
  return {
    version: sha ? sha.slice(0, 7) : null,
    commitSha: sha,
    commitMessage: value(env, "VERCEL_GIT_COMMIT_MESSAGE")?.split("\n")[0] ?? null,
    commitUrl: sha && owner && repo && provider === "github" ? `https://github.com/${owner}/${repo}/commit/${sha}` : null,
    branch: value(env, "VERCEL_GIT_COMMIT_REF"),
    deploymentId: value(env, "VERCEL_DEPLOYMENT_ID"),
    deploymentUrl: url ? `https://${url}` : null,
    builtAt: value(env, "WONDERARK_BUILT_AT"),
    environment: vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development" ? vercelEnv : "local",
  };
}
