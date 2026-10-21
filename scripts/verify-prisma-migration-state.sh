#!/usr/bin/env bash
# Read-only migration-history preflight for MedLum.
# Never applies schema changes. Usage:
#   DATABASE_URL=... bash scripts/verify-prisma-migration-state.sh
#   DATABASE_URL=... bash scripts/verify-prisma-migration-state.sh --require-clean
set -euo pipefail

MODE="${1:-status}"
if [[ "$MODE" != "status" && "$MODE" != "--require-clean" ]]; then
  echo "Usage: $0 [--require-clean]" >&2
  exit 2
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (value is not printed)." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required; install the PostgreSQL client first." >&2
  exit 2
fi

# One historical production migration row predates the migration files currently
# in Git. Allow only this exact name + checksum + applied state. Do not recreate
# or invent its original SQL. Any other unknown history record is a hard failure.
readonly LEGACY_ORPHAN_NAME="20260923100000_pharmacy_clinic_scope"
readonly LEGACY_ORPHAN_CHECKSUM="07d7fbd76100ec1005e009cd640ea2134a56402cb66bb5a64565f2ae878e2093"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Prisma URLs may include query parameters (such as schema=public) that libpq/psql
# does not understand. Preserve PostgreSQL/libpq options while stripping only
# Prisma-specific parameters; do not print the credential-bearing URL.
psql_url="$(DATABASE_URL="$DATABASE_URL" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL);
for (const key of [
  "schema",
  "connection_limit",
  "pool_timeout",
  "pgbouncer",
  "statement_cache_size",
  "socket_timeout",
  "sslaccept",
  "sslidentity",
]) url.searchParams.delete(key);
process.stdout.write(url.toString());
NODE
)"

# Read only the most recent attempt for each migration. Query output contains
# migration metadata only, never clinical rows or connection credentials.
psql "$psql_url" -X -v ON_ERROR_STOP=1 -qAt -F $'\t' \
  -c 'SELECT DISTINCT ON ("migration_name")
        "migration_name",
        "checksum",
        ("finished_at" IS NOT NULL),
        ("rolled_back_at" IS NOT NULL)
      FROM public."_prisma_migrations"
      ORDER BY "migration_name", "started_at" DESC, "id" DESC' > "$tmp"

declare -A db_checksum db_finished db_rolled_back db_applied
while IFS=
  db_finished["$migration_name"]="$finished"
  db_rolled_back["$migration_name"]="$rolled_back"
done < "$tmp"

mapfile -t local_migrations < <(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | LC_ALL=C sort)
if [[ ${#local_migrations[@]} -eq 0 ]]; then
  echo "ERROR: no local Prisma migration directories were found." >&2
  exit 2
fi

legacy_orphan_seen=0
for migration_name in "${!db_checksum[@]}"; do
  checksum="${db_checksum[$migration_name]}"
  finished="${db_finished[$migration_name]}"
  rolled_back="${db_rolled_back[$migration_name]}"
  migration_file="prisma/migrations/$migration_name/migration.sql"

  if [[ "$finished" == "t" && "$rolled_back" == "t" ]]; then
    echo "ERROR: inconsistent migration state (finished and rolled back): $migration_name" >&2
    exit 1
  fi
  if [[ "$finished" != "t" && "$rolled_back" != "t" ]]; then
    echo "ERROR: unresolved/incomplete migration attempt: $migration_name" >&2
    exit 1
  fi

  if [[ ! -f "$migration_file" ]]; then
    if [[ "$migration_name" == "$LEGACY_ORPHAN_NAME" &&
          "$checksum" == "$LEGACY_ORPHAN_CHECKSUM" &&
          "$finished" == "t" &&
          "$rolled_back" == "f" ]]; then
      legacy_orphan_seen=1
      db_applied["$migration_name"]=1
      echo "Recognized the single documented legacy applied migration absent from Git: $migration_name (checksum verified)."
      continue
    fi
    echo "ERROR: database migration history references a migration file absent from Git: $migration_name" >&2
    exit 1
  fi

  if [[ "$finished" == "t" && "$rolled_back" == "f" ]]; then
    local_checksum="$(sha256sum "$migration_file" | awk '{print $1}')"
    if [[ "$checksum" != "$local_checksum" ]]; then
      echo "ERROR: migration checksum mismatch: $migration_name" >&2
      exit 1
    fi
    db_applied["$migration_name"]=1
  fi
done

pending=()
for migration_name in "${local_migrations[@]}"; do
  if [[ "${db_applied[$migration_name]:-}" == "1" ]]; then
    continue
  fi
  pending+=("$migration_name")
done

echo "Migration inventory verified: ${#local_migrations[@]} local migration directories; no unexpected orphan, checksum mismatch, or incomplete migration attempt."
if [[ "$legacy_orphan_seen" == "1" ]]; then
  echo "Historical exception: exactly one known legacy applied migration was present and its stored checksum matched the reviewed exception."
fi
if [[ ${#pending[@]} -gt 0 ]]; then
  echo "Pending local migrations (${#pending[@]}):"
  printf '  - %s\n' "${pending[@]}"
  if [[ "$MODE" == "--require-clean" ]]; then
    echo "ERROR: migration history is not clean; pending migrations remain." >&2
    exit 1
  fi
else
  echo "No pending local migrations."
fi
\t' read -r migration_name checksum finished rolled_back; do
  [[ -z "${migration_name:-}" ]] && continue
  if [[ ! "$migration_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "ERROR: invalid migration identifier in database history." >&2
    exit 1
  fi
  db_checksum["$migration_name"]="$checksum"
  db_finished["$migration_name"]="$finished"
  db_rolled_back["$migration_name"]="$rolled_back"
done < "$tmp"

mapfile -t local_migrations < <(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | LC_ALL=C sort)
if [[ ${#local_migrations[@]} -eq 0 ]]; then
  echo "ERROR: no local Prisma migration directories were found." >&2
  exit 2
fi

legacy_orphan_seen=0
for migration_name in "${!db_checksum[@]}"; do
  checksum="${db_checksum[$migration_name]}"
  finished="${db_finished[$migration_name]}"
  rolled_back="${db_rolled_back[$migration_name]}"
  migration_file="prisma/migrations/$migration_name/migration.sql"

  if [[ "$finished" == "t" && "$rolled_back" == "t" ]]; then
    echo "ERROR: inconsistent migration state (finished and rolled back): $migration_name" >&2
    exit 1
  fi
  if [[ "$finished" != "t" && "$rolled_back" != "t" ]]; then
    echo "ERROR: unresolved/incomplete migration attempt: $migration_name" >&2
    exit 1
  fi

  if [[ ! -f "$migration_file" ]]; then
    if [[ "$migration_name" == "$LEGACY_ORPHAN_NAME" &&
          "$checksum" == "$LEGACY_ORPHAN_CHECKSUM" &&
          "$finished" == "t" &&
          "$rolled_back" == "f" ]]; then
      legacy_orphan_seen=1
      db_applied["$migration_name"]=1
      echo "Recognized the single documented legacy applied migration absent from Git: $migration_name (checksum verified)."
      continue
    fi
    echo "ERROR: database migration history references a migration file absent from Git: $migration_name" >&2
    exit 1
  fi

  if [[ "$finished" == "t" && "$rolled_back" == "f" ]]; then
    local_checksum="$(sha256sum "$migration_file" | awk '{print $1}')"
    if [[ "$checksum" != "$local_checksum" ]]; then
      echo "ERROR: migration checksum mismatch: $migration_name" >&2
      exit 1
    fi
    db_applied["$migration_name"]=1
  fi
done

pending=()
for migration_name in "${local_migrations[@]}"; do
  if [[ "${db_applied[$migration_name]:-}" == "1" ]]; then
    continue
  fi
  pending+=("$migration_name")
done

echo "Migration inventory verified: ${#local_migrations[@]} local migration directories; no unexpected orphan, checksum mismatch, or incomplete migration attempt."
if [[ "$legacy_orphan_seen" == "1" ]]; then
  echo "Historical exception: exactly one known legacy applied migration was present and its stored checksum matched the reviewed exception."
fi
if [[ ${#pending[@]} -gt 0 ]]; then
  echo "Pending local migrations (${#pending[@]}):"
  printf '  - %s\n' "${pending[@]}"
  if [[ "$MODE" == "--require-clean" ]]; then
    echo "ERROR: migration history is not clean; pending migrations remain." >&2
    exit 1
  fi
else
  echo "No pending local migrations."
fi
