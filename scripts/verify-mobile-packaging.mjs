import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "capacitor.config.ts",
  "next.config.ts",
  "package.json",
  ".github/workflows/mobile-packaging.yml",
  "docs/PHASE_12_MOBILE_PACKAGING.md",
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing Phase 12 file: ${file}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const name of ["@capacitor/core", "@capacitor/android", "@capacitor/ios"]) {
  if (!pkg.dependencies?.[name]) throw new Error(`Missing Capacitor dependency: ${name}`);
}
if (!pkg.devDependencies?.["@capacitor/cli"]) throw new Error("Missing @capacitor/cli");

const config = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
for (const expected of ["com.medlum.app", "MedLum", 'webDir: "out"']) {
  if (!config.includes(expected)) throw new Error(`Capacitor config missing: ${expected}`);
}

const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
if (!nextConfig.includes('process.env.CAPACITOR_BUILD')) throw new Error("Mobile build switch missing");
if (!nextConfig.includes('output: "export"')) throw new Error("Static export mode missing");

console.log("Phase 12 mobile packaging verification passed.");
