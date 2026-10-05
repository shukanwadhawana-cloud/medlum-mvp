FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# prisma generate requires DATABASE_URL at build time (placeholder only).
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV SESSION_SECRET="build-time-placeholder-not-used-at-runtime"

RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000
# Clear build placeholders so runtime only uses platform-injected secrets
ENV DATABASE_URL=
ENV SESSION_SECRET=

EXPOSE 10000

# Valid JSON-form CMD. Shell script avoids nested-quote breakage in the array form.
CMD ["sh", "-c", "i=1; while [ $i -le 5 ]; do npx prisma migrate deploy && exec npm start; echo Prisma migration attempt $i failed; retrying in 5s...; i=$((i+1)); sleep 5; done; echo Prisma migrations failed after 5 attempts; exit 1"]
