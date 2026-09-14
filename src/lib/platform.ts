import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const PLATFORM_ROLES = ["PlatformAdmin", "PlatformSupport", "PlatformDeveloper", "PlatformBilling"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function isPlatformRole(role: string): role is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(role);
}

export async function getPlatformAccess() {
  const session = await getSession();
  if (!session) return null;
  const memberships = await prisma.clinicMember.findMany({ where: { doctorId: session.doctorId, isActive: true }, select: { clinicId: true, role: true, clinic: { select: { name: true } } } });
  const platform = memberships.find((m) => isPlatformRole(m.role));
  return platform ? { session, clinicId: platform.clinicId, role: platform.role as PlatformRole, clinicName: platform.clinic.name } : null;
}

export async function requirePlatformAccess(roles?: PlatformRole[]) {
  const access = await getPlatformAccess();
  if (!access) return null;
  if (roles && !roles.includes(access.role)) return null;
  return access;
}

export async function getClinicSubscription(clinicId: string) {
  const latest = await prisma.auditLog.findFirst({ where: { entity: "ClinicSubscription", entityId: clinicId }, orderBy: { createdAt: "desc" }, select: { meta: true, createdAt: true } });
  let meta: any = {};
  try { meta = latest ? JSON.parse(latest.meta || "{}") : {}; } catch { meta = {}; }
  const patientLimit = Number.isInteger(Number(meta.patientLimit)) && Number(meta.patientLimit) > 0 ? Number(meta.patientLimit) : 200;
  const dueDate = meta.dueDate ? String(meta.dueDate) : null;
  const status = String(meta.status || "ACTIVE").toUpperCase();
  const expired = dueDate ? new Date(dueDate).getTime() < Date.now() : false;
  return { patientLimit, dueDate, status: expired && status === "ACTIVE" ? "EXPIRED" : status, plan: String(meta.plan || "Pilot"), lastUpdated: latest?.createdAt.toISOString() || null };
}
