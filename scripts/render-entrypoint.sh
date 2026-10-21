#!/bin/sh
set -u

# Fail clearly when Render runtime secrets are missing.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required at runtime. Configure the Render database connection before starting MedLum." >&2
  exit 1
fi

attempt=1
while [ "$attempt" -le 5 ]; do
  echo "Prisma migration attempt ${attempt}/5"
  if npx prisma migrate deploy; then
    echo "Prisma migrations succeeded; starting MedLum."
    exec npm start
  fi
  echo "Prisma migration attempt ${attempt} failed; retrying in 5 seconds..."
  sleep 5
  attempt=$((attempt + 1))
done

echo "Prisma migrations failed after 5 attempts."
exit 1
