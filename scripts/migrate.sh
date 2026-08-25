#!/usr/bin/env bash

set -euo pipefail

docker compose up -d --wait postgres

schema_initialized=$(docker compose exec -T postgres \
  psql -U postgres -d championship -Atqc \
  "SELECT to_regclass('public.competitions') IS NOT NULL")

if [[ "$schema_initialized" == "t" ]]; then
  echo "Database schema is already initialized."
  exit 0
fi

shopt -s nullglob
migration_files=(apps/backend/migrations/*.sql)
if (( ${#migration_files[@]} == 0 )); then
  echo "No database migrations found." >&2
  exit 1
fi

for migration_file in "${migration_files[@]}"; do
  echo "Applying ${migration_file}"
  docker compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d championship < "$migration_file"
done
