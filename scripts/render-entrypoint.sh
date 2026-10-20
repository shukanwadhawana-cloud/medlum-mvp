#!/bin/sh
set -u

# Keep startup behavior explicit and avoid Render shell-quoting the inline CMD.
# This preserves the existing retry policy for deploy-time Prisma migrations.
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
