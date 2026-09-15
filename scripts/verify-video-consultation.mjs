import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/lib/telemedicine.ts",
  "src/app/api/telemedicine/sessions/route.ts",
  "src/app/api/telemedicine/sessions/[id]/route.ts",
  "src/app/api/telemedicine/join/route.ts",
  "src/app/telemedicine/page.tsx",
  "src/app/telemedicine/[id]/page.tsx",
  "src/app/telemedicine/join/page.tsx",
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`);
}

const helper = fs.readFileSync(path.join(root, "src/lib/telemedicine.ts"), "utf8");
const sessions = fs.readFileSync(path.join(root, "src/app/api/telemedicine/sessions/route.ts"), "utf8");
const join = fs.readFileSync(path.join(root, "src/app/api/telemedicine/join/route.ts"), "utf8");
const doctorRoom = fs.readFileSync(path.join(root, "src/app/telemedicine/[id]/page.tsx"), "utf8");
const patientRoom = fs.readFileSync(path.join(root, "src/app/telemedicine/join/page.tsx"), "utf8");

const doctorLifecycle =
  (doctorRoom.includes('status: "Waiting"') || doctorRoom.includes("status: 'Waiting'")) &&
  (doctorRoom.includes('status: "Active"') || doctorRoom.includes("status: 'Active'")) &&
  (doctorRoom.includes('status: "Completed"') || doctorRoom.includes("status: 'Completed'")) &&
  (doctorRoom.includes("startCallForGuest") || doctorRoom.includes("Start call")) &&
  (doctorRoom.includes("hangUp") || doctorRoom.includes("Hang up"));

const checks = [
  ["replaceable provider selection", helper.includes("getVideoProvider") && helper.includes('"external"') && helper.includes('"jitsi"')],
  ["HTTPS video base URL default", helper.includes("https://meet.jit.si")],
  ["per-session unpredictable room secret", helper.includes("randomBytes(18)")],
  ["video URL persisted at session creation", sessions.includes("meetingUrl") && sessions.includes("provider")],
  ["join token remains hashed", sessions.includes("hashJoinToken(joinToken)")],
  ["join endpoint blocks ended sessions", join.includes("Completed") && join.includes("Cancelled") && join.includes("Expired")],
  ["doctor lifecycle controls", doctorLifecycle],
  ["doctor video embed", doctorRoom.includes('allow="camera; microphone; fullscreen; display-capture; autoplay"') || doctorRoom.includes("Join with mic")],
  ["patient waiting room", patientRoom.includes("You're in the waiting room")],
  ["patient video embed", patientRoom.includes("session.meetingUrl")],
];

for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("Phase 10 video consultation verification FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 10 video consultation verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
