import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  "scripts/prepare-desktop-web.mjs",
  ".github/workflows/desktop-packaging.yml",
  "docs/PHASE_12_DESKTOP_PACKAGING.md",
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing desktop packaging file: ${file}`);
}

const config = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
if (config.identifier !== "com.medlum.desktop") throw new Error("Desktop identifier mismatch (expected com.medlum.desktop)");
if (config.productName !== "MedLum") throw new Error("Desktop product name mismatch");
if (config.build?.frontendDist !== "../out") throw new Error("Tauri frontendDist must point to Next export");
if (!Array.isArray(config.bundle?.icon) || config.bundle.icon.length < 1) {
  throw new Error("Tauri bundle.icon must list icon assets");
}
const targets = config.bundle?.targets || [];
for (const target of ["nsis", "dmg", "appimage", "deb"]) {
  if (!targets.includes(target)) throw new Error(`Missing desktop bundle target: ${target}`);
}

const cargo = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
if (!cargo.includes('tauri = { version = "2"')) throw new Error("Tauri v2 dependency missing");

const workflow = fs.readFileSync(path.join(root, ".github/workflows/desktop-packaging.yml"), "utf8");
for (const runner of ["windows-latest", "macos-latest", "ubuntu-22.04"]) {
  if (!workflow.includes(runner)) throw new Error(`Missing desktop runner: ${runner}`);
}
if (!workflow.includes("actions/upload-artifact")) throw new Error("Desktop artifacts are not uploaded");
if (!workflow.includes("tauri-apps/tauri-action")) throw new Error("Tauri build action missing");
if (!workflow.includes("npm run build:desktop-web")) throw new Error("Desktop web build step missing");

if (!workflow.includes("vars.MEDLUM_APP_URL")) {
  throw new Error("Desktop workflow must read MEDLUM_APP_URL from vars.MEDLUM_APP_URL");
}
if (!workflow.includes("github.event.inputs.app_url")) {
  throw new Error("Desktop workflow must accept optional workflow_dispatch input app_url");
}
if (workflow.includes("secrets.MEDLUM_APP_URL")) {
  throw new Error("MEDLUM_APP_URL must be a repository Variable, not a Secret");
}
if (workflow.includes("medlum-mvp.onrender.com")) {
  throw new Error("Production URL must not be hardcoded in the desktop packaging workflow");
}
if (!workflow.includes("skip=true") || !workflow.includes("workflow_dispatch")) {
  throw new Error("Desktop workflow must skip native build on push when MEDLUM_APP_URL is unset");
}
if (!workflow.includes("if-no-files-found: error")) {
  throw new Error("Artifact upload must fail when installer files are missing");
}

const prepare = fs.readFileSync(path.join(root, "scripts/prepare-desktop-web.mjs"), "utf8");
if (!prepare.includes("src-tauri") || !prepare.includes("icons")) {
  throw new Error("prepare-desktop-web must generate Tauri icons under src-tauri/icons");
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const desktopWeb = pkg.scripts?.["build:desktop-web"] || "";
if (!desktopWeb.includes("prepare-desktop-web")) {
  throw new Error("build:desktop-web must use prepare-desktop-web placeholder (not static Next export)");
}
if (desktopWeb.includes("next build") || desktopWeb.includes("CAPACITOR_BUILD")) {
  throw new Error("build:desktop-web must not run next build / CAPACITOR_BUILD static export");
}

console.log("Phase 12 desktop packaging verification passed for Windows, macOS and Linux.");
