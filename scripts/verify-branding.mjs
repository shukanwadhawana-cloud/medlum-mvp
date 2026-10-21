import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const brand = "MedLum Health";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const noLegacyBrand = /\bMedLum\s+Healthcare\b|\bMedlam\b|MEDLUM\s+HEALTHCARE|Powered by MedLum(?!\s+Health)/i;
const scannedExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".webmanifest", ".html", ".css",
  ".svg", ".plist", ".xml", ".kt", ".swift", ".toml",
]);
const scanRoots = ["src/app", "src/components", "src/lib", "src-tauri", "public"];
const legacyHits = [];

function scanDirectory(relativePath) {
  const absolutePath = path.join(root, relativePath);
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(child);
    } else if (scannedExtensions.has(path.extname(entry.name).toLowerCase())) {
      const content = read(child);
      if (noLegacyBrand.test(content)) legacyHits.push(child);
    }
  }
}

for (const scanRoot of scanRoots) {
  if (fs.existsSync(path.join(root, scanRoot))) scanDirectory(scanRoot);
}
assert.deepEqual(
  legacyHits,
  [],
  `Legacy product branding remains in: ${legacyHits.join(", ")}`,
);

const layout = read("src/app/layout.tsx");
assert.match(layout, /title:\s*"MedLum Health\s+[–-]\s+Clinical Intelligence"/);
assert.match(layout, /applicationName:\s*"MedLum Health"/);
assert.match(layout, /description:\s*"MedLum Health/);

const landing = read("src/app/page.tsx");
assert.match(landing, /<h1[^>]*>MedLum Health<\/h1>/);
assert.match(landing, /Loading MedLum Health/);

for (const file of [
  "src/app/login/page.tsx",
  "src/app/forgot-password/page.tsx",
  "src/app/reset-password/page.tsx",
  "src/app/portal/login/page.tsx",
  "src/components/AppShell.tsx",
]) {
  assert.ok(read(file).includes(brand), `${file} must visibly identify the product as ${brand}`);
}

const manifest = JSON.parse(read("src/app/manifest.webmanifest"));
assert.equal(manifest.name, brand);
assert.equal(manifest.short_name, brand);
assert.ok(manifest.description.startsWith(brand));

const capacitor = read("capacitor.config.ts");
assert.match(capacitor, /appName:\s*"MedLum Health"/);

const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
assert.equal(tauri.productName, brand);
assert.equal(tauri.app?.windows?.[0]?.title, brand);
assert.ok(tauri.bundle?.shortDescription?.startsWith(brand));
assert.ok(tauri.bundle?.longDescription?.startsWith(brand));

const printFiles = [
  "src/app/billing/print/page.tsx",
  "src/app/labs/print/page.tsx",
  "src/app/patients/[id]/print/page.tsx",
  "src/app/prescriptions/print/page.tsx",
  "src/app/telemedicine/join/page.tsx",
];
for (const file of printFiles) {
  assert.ok(read(file).includes("Powered by MedLum Health"), `${file} must use the standard product footer`);
}

assert.ok(read("README.md").includes("https://medlumhealth.com/"));
console.log("MedLum Health branding verification passed across web, PWA, mobile, desktop, print, and documentation surfaces.");
