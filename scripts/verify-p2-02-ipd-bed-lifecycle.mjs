import fs from "node:fs";
import assert from "node:assert/strict";

const route=fs.readFileSync("src/app/api/ipd/route.ts","utf8");
const page=fs.readFileSync("src/app/ipd/[id]/page.tsx","utf8");

for(const x of [
  'action==="room-transfer"','parseCareSetting(patient.notes)!=="IPD"','patient.status!=="ACTIVE"',
  'Destination room is not in the hospital directory.','Destination room is already occupied by another active IPD patient.',
  'isolationLevel:"Serializable"','action:"transfer"','fromRoom:currentRoom||null','toRoom:roomNumber',
  'Room already exists in this clinic.'
]) assert(route.includes(x),`P2-02 route regression missing: ${x}`);

for(const x of ['Transfer bed','Transfer IPD patient','Confirm transfer','action:"room-transfer"','rooms.filter((r:any)=>!r.occupied||r.roomNumber===selected.roomNumber)','setShowTransfer(false)'])
  assert(page.includes(x),`P2-02 UI regression missing: ${x}`);

assert(!route.includes('prisma.patient.delete'),"P2-02 must not delete patient records");
assert(!page.includes('Coming Soon'),"P2-02 must not add placeholder UI");
console.log("P2-02 IPD bed lifecycle verification: PASS");
