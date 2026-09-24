#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
const fails = [];
function ok(c, m) { if (!c) fails.push(m); else console.log("OK:", m); }
ok(existsSync("src/lib/duty.ts"), "duty lib");
ok(existsSync("src/lib/saniddhi.ts"), "saniddhi adapter");
ok(existsSync("src/app/api/duty/route.ts"), "duty API");
ok(existsSync("src/app/duty/page.tsx"), "duty UI");
const schema = readFileSync("prisma/schema.prisma", "utf8");
ok(schema.includes("DutyAttendanceEvent"), "DutyAttendanceEvent model");
ok(schema.includes("dutyLat"), "clinic geofence fields");
const api = readFileSync("src/app/api/duty/route.ts", "utf8");
ok(api.includes("requireActiveClinicMembership"), "tenant membership");
ok(api.includes("evaluateGeofence"), "geofence check");
ok(api.includes("DUTY_SELF_PUNCH") || api.includes("DUTY_ADMIN_PUNCH"), "audit actions");
ok(api.includes("pushPunchToSaniddhi"), "saniddhi outbound hook");
const lib = readFileSync("src/lib/duty.ts", "utf8");
ok(lib.includes("distanceMeters"), "haversine");
const adap = readFileSync("src/lib/saniddhi.ts", "utf8");
ok(adap.includes("SANIDDHI_API_KEY"), "env-based credentials");
ok(!adap.includes("sk_live"), "no hard-coded secrets");
if (fails.length) { console.error(fails.join("\n")); process.exit(1); }
console.log("MedLum Duty verification PASSED");
