#!/usr/bin/env sh
# Container entrypoint — thin adapter over the db-bootstrap deep module (ADR 0007).
#
#   development : no schema sync here — schema/seed are managed on the host
#                 via `prisma migrate dev` + `prisma:seed`. Just start the app.
#   otherwise   : run db-bootstrap (fail-closed: applies committed migrations;
#                 refuses `db push` when prisma/migrations is missing/empty;
#                 auto-seeds a fresh DB), then start the app.

set -e

# Operational safeguard (not schema logic): flag missing admin password in any env.
if [ -z "${SUPER_ADMIN_INITIAL_PASSWORD}" ]; then
  echo "[entrypoint] WARNING: SUPER_ADMIN_INITIAL_PASSWORD not set — using default seed password."
fi

if [ "${NODE_ENV}" = "development" ]; then
  exec "$@"
fi

node dist/scripts/db-bootstrap.js
exec "$@"