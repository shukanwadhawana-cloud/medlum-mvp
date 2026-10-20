#!/bin/sh
set -u

attempt=1
while [ "$attempt" -le 5 ]; do
  if npx prisma migrate deploy; then
    exec npm start
  fi
  echo "Prisma migration attempt $attempt failed; retrying in 5s..." >&2
  attempt=$((attempt + 1))
  sleep 5
done

echo "Prisma migrations failed after 5 attempts" >&2
exit 1
