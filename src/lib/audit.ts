import { prisma } from "./db";

/**
 * Write an immutable audit record.
 * Actor name is snapshotted into meta.actorName for display ("Done by Vijay · …").
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
    if (params.doctorId) {
      const doc = await prisma.doctor.findUnique({
        where: { id: params.doctorId },
        select: { name: true },
      });
      actorName = doc?.name || undefined;
    }
    const meta = {
      ...(params.meta || {}),
      ...(actorName ? { actorName } : {}),
      ...(params.clinicId ? { clinicId: params.clinicId } : {}),
      at: new Date().toISOString(),
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

/** Format audit meta for UI: "Done by Vijay · 20 Sep 2026, 00:42" */
export function formatAuditAttribution(
  metaJson: string | null | undefined,
  createdAt?: Date | string | null
): string {
  let actor = "System";
  try {
    const m = JSON.parse(metaJson || "{}");
    if (m.actorName) actor = String(m.actorName);
  } catch {
    /* ignore */
  }
  let when = "";
  if (createdAt) {
    const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    if (!Number.isNaN(d.getTime())) {
      when = d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return when ? `Done by ${actor} · ${when}` : `Done by ${actor}`;
}
