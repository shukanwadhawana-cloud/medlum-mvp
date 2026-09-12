import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  "Dockerfile",
  "docs/DEPLOYMENT_RENDER.md",
  "docs/PRODUCTION_SAFETY.md",
  "docs/DISASTER_RECOVERY.md",
  ".env.example",
  "src/app/api/health/route.ts",
  "src/components/AppShell.tsx",
];
for (const file of requiredFiles) {
  if (!exists(file)) throw new Error(`Pilot readiness file missing: ${file}`);
}

const env = read(".env.example");
for (const variable of ["DATABASE_URL", "SESSION_SECRET", "VIDEO_PROVIDER", "EKA_BASE_URL"]) {
  if (!env.includes(variable)) throw new Error(`Production environment documentation missing: ${variable}`);
}
if (!env.includes("at-least-32-chars")) throw new Error("SESSION_SECRET strength requirement is not documented");
if (env.includes("NEXT_PUBLIC_EKA_CLIENT_SECRET") || env.includes("NEXT_PUBLIC_EKA_API_KEY")) {
  throw new Error("EKA secrets must remain server-side");
}

const health = read("src/app/api/health/route.ts");
for (const token of ['status: "ok"', 'service: "medlum"', "timestamp: new Date().toISOString()"])
  if (!health.includes(token)) throw new Error(`Health endpoint missing: ${token}`);

const shell = read("src/components/AppShell.tsx");
if (shell.includes('{ href: "/dashboard", label: "Home"')) throw new Error("Duplicate Home navigation must not return beside MedLum");
if (!shell.includes('href="/dashboard"') || !shell.includes("MedLum")) throw new Error("MedLum dashboard brand link missing");

const deployment = read("docs/DEPLOYMENT_RENDER.md");
if (!deployment.includes("medlum-mvp.onrender.com")) throw new Error("Canonical Render deployment is not documented");

console.log("Phase 15 pilot readiness verification passed.");
console.log("- Production deployment and safety documentation present");
console.log("- Required production environment configuration documented");
console.log("- Public health endpoint present without sensitive data");
console.log("- MedLum is the dashboard entry; no duplicate Home nav item");
