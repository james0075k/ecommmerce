#!/bin/sh
# ---------------------------------------------------------------------------
# BAZAAR API - container entrypoint  (Phase 12.7)
#
# Runs pending database migrations, then execs whatever CMD asked for. Nothing
# here is Bazaar-specific except the schema path; the interesting decisions are
# in the comments.
# ---------------------------------------------------------------------------
set -eu

SCHEMA="${PRISMA_SCHEMA_PATH:-/app/prisma/schema.prisma}"

# The CLI is invoked through its bin symlink rather than through pnpm: the
# runtime image deliberately has no package manager in it. One less thing
# installed is one less thing to keep patched.
PRISMA="/app/apps/api/node_modules/.bin/prisma"

# Set RUN_MIGRATIONS=false to hand migrations to a dedicated release step
# instead. Which you want depends on the deployment:
#
#   here          simple, and correct even at two instances - `migrate deploy`
#                 takes a Postgres advisory lock, so concurrent starts queue up
#                 rather than racing, and the losers find nothing left to do.
#   release step  better once a migration takes minutes: every instance waiting
#                 on the lock is an instance not serving traffic, and a boot
#                 timeout during a slow migration rolls the deploy back halfway
#                 through it.
#
# The autoscaling floor in railway.toml is 2, which the lock handles. Revisit
# this the first time a migration touches a large table.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations"
  # Not `migrate dev` and never `db push`: both will happily drop a column to
  # make the database match the schema. `deploy` only ever applies migration
  # files that already exist, and fails loudly on drift.
  "$PRISMA" migrate deploy --schema="$SCHEMA"
  echo "[entrypoint] migrations applied"
else
  echo "[entrypoint] RUN_MIGRATIONS=false - skipping migrations"
fi

# exec, so the Node process replaces this shell and becomes the child tini
# signals. Without it SIGTERM stops at /bin/sh and the API is killed rather than
# shut down, mid-request.
echo "[entrypoint] starting: $*"
exec "$@"
