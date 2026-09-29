#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const warnings = [];
const ok = (condition, message) => {
  if (condition) console.log("OK:", message);
  else {
    failures.push(message);
    console.error("FAIL:", message);
  }
};
const warn = (condition, message) => {
  if (condition) console.log("OK:", message);
  else {
    warnings.push(message);
    console.warn(\n  session.includes("prisma.authSession.findUnique") && logout.includes("revokeSession("),\n  "server-side revocation is wired into both session validation and logout"\n);

console.log(`\nASVS 5.0 hardening verification: ${failures.length ? "FAILED" : "PASSED"}`);
if (warnings.length) {
  console.log(`Open hardening warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(" -", warning);
}
if (failures.length) process.exit(1);
