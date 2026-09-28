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
  "src/app/telemedicine/ended/page.tsx",
  "src/app/appointments/page.tsx",
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
const endedRoom = fs.readFileSync(path.join(root, "src/app/telemedicine/ended/page.tsx"), "utf8");
const appointments = fs.readFileSync(path.join(root, "src/app/appointments/page.tsx"), "utf8");

const doctorLifecycle =
  (doctorRoom.includes('status: "Waiting"') || doctorRoom.includes("status: 'Waiting'")) &&
  (doctorRoom.includes('status: "Active"') || doctorRoom.includes("status: 'Active'")) &&
  (doctorRoom.includes('status: "Completed"') || doctorRoom.includes("status: 'Completed'")) &&
  (doctorRoom.includes("startCallForGuest") || doctorRoom.includes("Start call")) &&
  (doctorRoom.includes("hangUp") || doctorRoom.includes("Hang up"));

const checks = [
  ["replaceable provider selection", helper.includes("getVideoProvider") && helper.includes('"external"') && helper.includes('"jitsi"') && helper.includes('"mirotalk"')],
  ["HTTPS video base URL default", helper.includes("https://meet.jit.si") || helper.includes("medlum-mirotalk-p2p")],
  ["per-session unpredictable room secret", helper.includes("randomBytes(24)") || helper.includes("randomBytes(18)")],
  ["video URL persisted at session creation", sessions.includes("meetingUrl") && sessions.includes("provider")],
  ["facility scope is server-derived", sessions.includes("requireActiveClinicMembership") && sessions.includes("findAuthorizedPatient") && !sessions.includes("clinicId || patientClinicId")],
  ["appointment video launch", appointments.includes("/api/telemedicine/sessions") && appointments.includes("Start Video") && appointments.includes("appointmentId")],
  ["duplicate appointment session reuse", sessions.includes("status: { notIn: ["Completed", "Cancelled", "Expired"] }") && sessions.includes("reused: true")],
  ["join token remains hashed", sessions.includes("hashJoinToken(joinToken)")],
  ["join endpoint blocks ended sessions", join.includes("Completed") && join.includes("Cancelled") && join.includes("Expired")],
  ["doctor lifecycle controls", doctorLifecycle],
  ["doctor new-tab join", doctorRoom.includes("openConferenceInNewTab") || doctorRoom.includes("Join video")],
  ["patient waiting room", patientRoom.includes("You're in the waiting room")],
  ["patient join opens meeting", patientRoom.includes("session.meetingUrl") && (patientRoom.includes("openConferenceInNewTab") || patientRoom.includes("Join video call"))],
  ["post-call close page", endedRoom.includes("window.close()") && endedRoom.includes("Video consultation ended")],
];

const uiOnly = doctorRoom + patientRoom;
if (/setTimeout\s*\(\s*[^,]+,\s*300\s*\*?\s*1000|hangup.*5\s*min|call will end after 5/i.test(uiOnly)) {
  failures.push("failed no artificial 5-minute call limit");
}
for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("Phase 10 video consultation verification FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 10 video consultation verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
