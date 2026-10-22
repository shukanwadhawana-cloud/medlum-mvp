#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = read("src/app/clinic/setup/page.tsx");
const route = read("src/app/api/clinic/setup/route.ts");
const licenseInput = page.match(/<input name="licenseNumber"[\s\S]*?\/>/)?.[0];

assert(licenseInput, "Clinical setup licence input must exist");
assert(!/\brequired(?:\s|=|>)/.test(licenseInput), "Hospital licence input must remain optional");
assert(
  licenseInput.includes("Hospital licence number (if applicable)"),
  "Hospital licence placeholder must explain that the field is optional",
);
assert(
  /name="registrationNumber"[^>]*required=\{form\.facilityType === "HOSPITAL"\}/.test(page),
  "Hospital registration number must remain required in the form",
);
assert(
  route.includes('facilityType === "HOSPITAL" && !String(values.registrationNumber || "").trim()'),
  "API must still require a hospital registration number",
);
assert(
  !/facilityType === "HOSPITAL" && \([\s\S]{0,150}values\.licenseNumber/.test(route),
  "API must not reject a hospital setup merely because licence number is blank",
);

console.log("Clinical setup licence optionality and registration safeguards verified.");
