import { prisma } from "@/lib/db";

/** Role → clinical Staff ID prefix (unique within a clinic). */
export function staffIdPrefix(role: string): string {
  const r = (role || "").toLowerCase();
  if (r === "owner") return "OWN";
  if (r === "admin") return "ADM";
  if (r === "manager") return "MGR";
  if (r === "consultant" || r === "doctor") return "DOC";
  if (r === "rmo") return "RMO";
  if (r === "nurse") return "NUR";
  if (r === "laboratory" || r === "lab") return "LAB";
  if (r === "pharmacy" || r === "pharmacist") return "PHARM";
  if (r === "billing") return "BILL";
  if (r === "receptionist") return "REC";
  return "STF";
}

/**
 * Allocate next Staff ID for clinic+prefix without races.
 * Uses max existing numeric suffix for the prefix within the clinic.
 * Staff ID is permanent clinical identity and must not be user-editable.
 */
export async function allocateStaffCode(clinicId: string, role: string): Promise<string> {
  const prefix = staffIdPrefix(role);
  const existing = await prisma.clinicMember.findMany({
    where: { clinicId, staffCode: { startsWith: `${prefix}-` } },
    select: { staffCode: true },
  });
  let max = 0;
  for (const row of existing) {
    const m = String(row.staffCode || "").match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const n = max + 1 + attempt;
    const code = `${prefix}-${String(n).padStart(4, "0")}`;
    const clash = await prisma.clinicMember.findFirst({
      where: { clinicId, staffCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}
