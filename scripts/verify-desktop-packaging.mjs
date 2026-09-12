import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  ".github/workflows/desktop-packaging.yml",
  "docs/PHASE_12_DESKTOP_PACKAGING.md",
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing desktop packaging file: ${file}`);
}

const config = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
if (config.identifier !== "com.medlum.app") throw new Error("Desktop identifier mismatch");
if (config.productName !== "MedLum") throw new Error("Desktop product name mismatch");
if (config.build?.frontendDist !== "../out") throw new Error("Tauri frontendDist must point to Next export");
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

console.log("Phase 12 desktop packaging verification passed for Windows, macOS and Linux.");
