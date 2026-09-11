import { prisma } from "./db";

export async function writeAudit(params: {
  doctorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        doctorId: params.doctorId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        meta: JSON.stringify(params.meta || {}),
      },
    });
  } catch (e) {
    console.error("audit write failed", e);
  }
}
