import fs from "node:fs";
import path from "node:path";

/**
 * Desktop shell loads the deployed MedLum HTTPS URL at runtime
 * (see desktop-packaging.yml + docs/PHASE_12_DESKTOP_PACKAGING.md).
 * Tauri still requires a frontendDist directory; provide a minimal
 * placeholder so we never run a static Next.js export against API routes.
 */
const outDir = path.join(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MedLum</title>
  </head>
  <body>
    <p>MedLum desktop shell — production window URL is injected at package time.</p>
  </body>
</html>
`
);
console.log("Prepared desktop web placeholder at out/index.html");
