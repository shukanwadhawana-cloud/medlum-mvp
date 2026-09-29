#!/usr/bin/env node
/**
 * Static checks for telemedicine / video consultation wiring.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const helper = read("src/lib/telemedicine.ts");
const sessions = read("src/app/api/telemedicine/sessions/route.ts");
const join = read("src/app/api/telemedicine/join/route.ts");
const workspace = read("src/app/telemedicine/[id]/page.tsx");
const middleware = read("src/middleware.ts");

const checks = [
  ["replaceable provider selection", helper.includes("getVideoProvider") && helper.includes('"external"') && helper.includes('"mirotalk"') && helper.includes("medlum-mirotalk-p2p")],
  ["HTTPS video base URL default", helper.includes("medlum-mirotalk-p2p")],
  ["Jitsi disabled as production path", !helper.includes('VIDEO_PROVIDERS = ["mirotalk", "jitsi"') && helper.includes("isJitsiMeetingUrl")],
  ["join token hashing", helper.includes("hashJoinToken") && helper.includes("createJoinToken")],
  ["session create uses createVideoMeetingUrl", sessions.includes("createVideoMeetingUrl")],
  ["join route exposes meetingUrl", join.includes("meetingUrl")],
  ["workspace can open meeting", workspace.includes("meetingUrl") || workspace.includes("openVideo")],
  ["CSP allows MiroTalk", middleware.includes("medlum-mirotalk-p2p")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error("FAIL:", name);
    failed += 1;
  } else {
    console.log("OK:", name);
  }
}
if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nVideo consultation checks passed.");
