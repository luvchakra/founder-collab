#!/bin/bash
# Vercel "Ignored Build Step" (apps/web/vercel.json ignoreCommand; runs from apps/web).
# Exit 0 = skip this deployment, anything else = build it.

# Preview deployments are off, as the dashboard setting this replaces had them.
if [ "$VERCEL_ENV" != "production" ]; then
  echo "Preview deployment: skipped."
  exit 0
fi

# Production: skip when nothing the app is built from changed since the last successful
# production deployment -- docs, migrations (applied to Supabase separately), CI config
# and test scripts don't reach the bundle. No previous SHA, or one the shallow clone
# doesn't have (git exits 128), builds.
if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
  echo "No previous deployment to compare with: building."
  exit 1
fi
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ../../packages ../../package.json ../../package-lock.json
status=$?
if [ "$status" -eq 0 ]; then
  echo "Nothing under apps/web, packages/ or the root package files changed since $VERCEL_GIT_PREVIOUS_SHA: skipped."
  exit 0
fi
echo "App inputs changed since $VERCEL_GIT_PREVIOUS_SHA (git diff exit $status): building."
exit 1
