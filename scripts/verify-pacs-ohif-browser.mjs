#!/usr/bin/env node
import fs from "node:fs";
import { chromium } from "playwright";

const studyUid = String(process.env.PACS_TEST_STUDY_UID || fs.readFileSync("study_uid.txt", "utf8")).trim();
if (!studyUid) throw new Error("Missing synthetic StudyInstanceUID");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const url = `http://127.0.0.1:8080/viewer?StudyInstanceUIDs=${encodeURIComponent(studyUid)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((canvas) => canvas.width > 100 && canvas.height > 100),
    undefined,
    { timeout: 90_000 }
  );

  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll("canvas")).some((canvas) => {
      try {
        return canvas.toDataURL("image/png").length > 500;
      } catch {
        return false;
      }
    });
  }, undefined, { timeout: 30_000 });

  const renderedCanvases = await page.locator("canvas").evaluateAll((canvases) =>
    canvases
      .filter((canvas) => canvas.width > 100 && canvas.height > 100)
      .map((canvas) => ({ width: canvas.width, height: canvas.height, pngLength: canvas.toDataURL("image/png").length }))
  );
  if (!renderedCanvases.length || Math.max(...renderedCanvases.map((canvas) => canvas.pngLength)) <= 500) {
    throw new Error("OHIF loaded but no non-empty image canvas was rendered");
  }
  if (pageErrors.length) {
    throw new Error(`OHIF browser errors: ${pageErrors.join("; ")}`);
  }

  console.log(JSON.stringify({ ok: true, studyUid, renderedCanvases }));
} finally {
  await browser.close();
}
