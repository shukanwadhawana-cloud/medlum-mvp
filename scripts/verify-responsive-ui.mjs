import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  ["src/components/AppShell.tsx", ["hidden md:flex", "md:hidden", "safe-area-bottom", "max-w-7xl"]],
  ["src/app/globals.css", ["min-width: 320px", "scrollbar-none", "safe-area-bottom", "telemedicine-video-frame"]],
  ["src/app/layout.tsx", ["viewportFit: \"cover\"", "manifest: \"/manifest.webmanifest\""]],
  ["src/app/manifest.webmanifest", ["\"display\": \"standalone\"", "\"start_url\": \"/dashboard\""]],
  ["src/app/telemedicine/[id]/page.tsx", ["telemedicine-video-frame"]],
  ["src/app/telemedicine/join/page.tsx", ["telemedicine-video-frame", "setInterval"]],
];

const failures = [];
for (const [file, needles] of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    failures.push(`${file}: missing`);
    continue;
  }
  const content = fs.readFileSync(full, "utf8");
  for (const needle of needles) {
    if (!content.includes(needle)) failures.push(`${file}: missing ${needle}`);
  }
}

if (failures.length) {
  console.error("Responsive UI verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Responsive UI verification passed: responsive shell, mobile safe-area handling, viewport/PWA metadata, and telemedicine mobile hardening are present.");
