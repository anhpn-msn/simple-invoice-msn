#!/bin/sh
# migrate: one-shot job run with the schema owner credentials (compose service "migrate").
# serve:   the long-running API, which connects as the least-privilege runtime role.
set -eu

case "${1:-serve}" in
  migrate)
    node dist/database/migrate.js
    # Does nothing when APP_DB_USER is unset (single-user setups).
    node dist/database/runtime-role.js
    if [ "${SEED_ON_START:-false}" = "true" ]; then
      if [ -n "${APP_DB_USER:-}" ]; then
        # The seed only inserts rows, so it runs with the runtime role's rights, not the owner's.
        DATABASE_URL="" DB_USER="$APP_DB_USER" \
          DB_PASSWORD="${APP_DB_PASSWORD:-}" DB_PASSWORD_FILE="${APP_DB_PASSWORD_FILE:-}" \
          node dist/database/seed/seed.js
      else
        node dist/database/seed/seed.js
      fi
    fi
    ;;
  serve)
    exec node dist/main.js
    ;;
  *)
    echo "usage: docker-entrypoint.sh [migrate|serve]" >&2
    exit 64
    ;;
esac
