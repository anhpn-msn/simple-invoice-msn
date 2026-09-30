#!/bin/sh
# One-shot, idempotent secret generator for docker compose.
# It never prints a secret value and never overwrites an existing file,
# because a new DB password would no longer match an initialised Postgres volume.
set -eu
umask 077

OWNER_DIR=/secrets/owner  # volume secrets-owner: mounted by db and migrate only
APP_DIR=/secrets/app      # volume secrets-app: mounted by migrate and backend only
POSTGRES_UID=70   # uid of the postgres user in postgres:17-alpine
NODE_UID=1000     # uid of the node user, runs the backend
MIGRATE_UID=1001  # uid the one-shot migrate service runs as (same image, other user)

# $1 = random bytes, printed as hex (URL safe, so it can sit inside a connection URL)
random_hex() {
  head -c "$1" /dev/urandom | od -An -v -tx1 | tr -d ' \n'
}

# $1 = directory, $2 = file name, $3 = random bytes, $4 = owner uid:gid, $5 = mode
ensure_secret() {
  dir=$1
  name=$2
  bytes=$3
  owner=$4
  mode=$5
  target="$dir/$name"

  if [ -s "$target" ]; then
    echo "secrets-init: $name already exists, keeping it"
  else
    tmp="$dir/.$name.tmp"
    random_hex "$bytes" > "$tmp"
    if [ "$(wc -c < "$tmp")" -ne "$((bytes * 2))" ]; then
      rm -f "$tmp"
      echo "secrets-init: could not generate $name" >&2
      exit 1
    fi
    # rename is atomic, so a crash never leaves a half-written secret in place
    mv "$tmp" "$target"
    echo "secrets-init: created $name"
  fi

  # Re-applied on every run so a wrong owner or mode is repaired without touching the content.
  chown "$owner" "$target"
  chmod "$mode" "$target"
}

chmod 0755 "$OWNER_DIR" "$APP_DIR"

# Schema owner (superuser created by the postgres image). Postgres reads it at first start,
# the migrate service reads it through its group. The backend never mounts this volume.
ensure_secret "$OWNER_DIR" db_password 24 "$POSTGRES_UID:$MIGRATE_UID" 0440
# Least-privilege role the backend connects with. The migrate service sets it on the role.
ensure_secret "$APP_DIR" app_db_password 24 "$NODE_UID:$MIGRATE_UID" 0440
# Only the backend needs the signing key, so nobody else can read it.
ensure_secret "$APP_DIR" jwt_secret 32 "$NODE_UID:$NODE_UID" 0400
