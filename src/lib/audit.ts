import { prisma } from "./db";
import { formatIst, istIsoLabel } from "./time";

/**
 * Write an immutable audit record.
 * Snapshots actorName, staffCode, role, clinicId into meta for clinical attribution.
 * Audit rows are append-only; no public API mutates/deletes them.
 */
export async function writeAudit(params: {
  doctorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  clinicId?: string | null;
}) {
  try {
    let actorName: string | undefined;
    let staffCode: string | undefined;
    let role: string | undefined;
    let resolvedClinicId = params.clinicId || undefined;

    if (params.doctorId) {
      const doc = await prisma.doctor.findUnique({
        where: { id: params.doctorId },
        select: { name: true },
      });
      actorName = doc?.name || undefined;

      const membership = await prisma.clinicMember.findFirst({
        where: {
          doctorId: params.doctorId,
          isActive: true,
          ...(params.clinicId ? { clinicId: params.clinicId } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { staffCode: true, role: true, clinicId: true, designation: true },
      });
      if (membership) {
        staffCode = membership.staffCode || undefined;
        role = membership.designation || membership.role || undefined;
        if (!resolvedClinicId) resolvedClinicId = membership.clinicId;
      }
    }

    const now = new Date();
    const meta = {
      ...(params.meta || {}),
      ...(actorName ? { actorName } : {}),
      ...(staffCode ? { staffCode } : {}),
      ...(role ? { role } : {}),
      ...(resolvedClinicId ? { clinicId: resolvedClinicId } : {}),
      at: now.toISOString(),
      atIst: istIsoLabel(now),
    };
    await prisma.auditLog.create({
      data: {
        doctorId: params.doctorId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        meta: JSON.stringify(meta),
      },
    });
  } catch (e) {
    console.error("audit write failed", e);
  }
}

/** Format audit meta for UI with Staff ID + IST. */
export function formatAuditAttribution(
  metaJson: string | null | undefined,
  createdAt?: Date | string | null
): string {
  let actor = "System";
  let staffCode = "";
  let role = "";
  try {
    const m = JSON.parse(metaJson || "{}");
    if (m.actorName) actor = String(m.actorName);
    if (m.staffCode) staffCode = String(m.staffCode);
    if (m.role) role = String(m.role);
  } catch {
    /* ignore */
  }
  const when = formatIst(createdAt);
  const idPart = staffCode ? ` (${staffCode})` : "";
  const rolePart = role ? ` · ${role}` : "";
  return when !== "—"
    ? `${actor}${idPart}${rolePart} · ${when}`
    : `${actor}${idPart}${rolePart}`;
}
