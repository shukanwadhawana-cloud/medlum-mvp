import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "capacitor.config.ts",
  "next.config.ts",
  "package.json",
  ".github/workflows/mobile-packaging.yml",
  "docs/PHASE_12_MOBILE_PACKAGING.md",
];

for (const file of required) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing Phase 12 file: ${file}`);
}

const pkg = JSON.parse(read("package.json"));
for (const name of ["@capacitor/core", "@capacitor/android", "@capacitor/ios"]) {
  assert.ok(pkg.dependencies?.[name], `Missing Capacitor dependency: ${name}`);
}
assert.ok(pkg.devDependencies?.["@capacitor/cli"], "Missing @capacitor/cli");

const config = read("capacitor.config.ts");
for (const expected of [
  'appId: "com.medlum.app"',
  'appName: "MedLum Health"',
  'webDir: "out"',
  "process.env.CAPACITOR_SERVER_URL",
]) {
  assert.ok(config.includes(expected), `Capacitor config missing: ${expected}`);
}
assert.match(config, /cleartext:\s*false/);

const nextConfig = read("next.config.ts");
assert.ok(nextConfig.includes('process.env.CAPACITOR_BUILD'), "Mobile build switch missing");
assert.ok(nextConfig.includes('output: "export"'), "Static export mode missing");

const workflow = read(".github/workflows/mobile-packaging.yml");
for (const [expected, description] of [
  ["workflow_dispatch:", "manual packaging workflow"],
  ["https://medlumhealth.com", "safe production default URL"],
  ["CAPACITOR_SERVER_URL", "remote production URL binding"],
  ["new URL(process.env.CAPACITOR_SERVER_URL)", "HTTPS URL validation"],
  ["npx cap add android", "Android project generation"],
  ["assembleDebug", "Android APK build"],
  ["medlum-android-debug-apk", "Android APK artifact upload"],
  ["npx cap add ios", "iOS project generation"],
  ["xcodebuild", "native Xcode build"],
  ["Debug-iphonesimulator", "iOS Simulator app output"],
  ["medlum-ios-simulator-app", "iOS Simulator artifact upload"],
  ["medlum-ios-xcode-project", "iOS Xcode project artifact upload"],
  ["MEDLUM_IOS_SIGNING_ENABLED", "opt-in signing gate"],
  ["medlum-ios-signed-ipa", "signed iOS IPA artifact upload"],
]) {
  assert.ok(workflow.includes(expected), `Mobile workflow missing ${description}: ${expected}`);
}
assert.ok(
  !workflow.includes("printf '<!doctype html><html><body>MedLum</body></html>'"),
  "The native package must not silently build the old one-line dummy fallback page",
);

const docs = read("docs/PHASE_12_MOBILE_PACKAGING.md");
for (const expected of [
  "debug APK",
  "iOS Simulator",
  "MEDLUM_IOS_SIGNING_ENABLED",
  "MEDLUM_IOS_CERTIFICATE_P12_BASE64",
  "CAPACITOR_SERVER_URL",
]) {
  assert.ok(docs.includes(expected), `Mobile packaging docs missing: ${expected}`);
}

console.log("Phase 12 mobile packaging verification passed: HTTPS URL binding, Android APK, iOS Simulator build, optional signed IPA, and release prerequisites.");
