import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dbSource = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const healthSource = readFileSync(new URL("../src/app/api/health/route.ts", import.meta.url), "utf8");

assert.match(dbSource, /export function isDatabaseUrlValid/);
assert.match(dbSource, /postgresql:/);
assert.match(dbSource, /export async function withDatabaseRecovery/);
assert.match(dbSource, /P1001/);
assert.match(dbSource, /P1017/);
assert.match(dbSource, /P2024/);
assert.match(dbSource, /RETRYABLE_READ_OPERATIONS/);
assert.match(dbSource, /return withDatabaseRecovery\(\(\) => Promise\.resolve\(query\(args\)\)\)/);

const retryBlock = dbSource.match(/const RETRYABLE_READ_OPERATIONS = new Set\(([\s\S]*?)\);/);
assert.ok(retryBlock, "A bounded list of retry-safe read operations must exist");
assert.doesNotMatch(retryBlock[1], /create|update|upsert|delete|execute/i, "Writes must never be automatically retried");

assert.match(healthSource, /isDatabaseUrlValid/);
assert.match(healthSource, /SELECT 1/);
assert.match(healthSource, /checks: \{ database \}/);
assert.match(healthSource, /status: ready \? 200 : 503/);
assert.doesNotMatch(healthSource, /error\.message|DATABASE_URL/);

console.log("Production database resilience checks passed.");
