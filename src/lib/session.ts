import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "medlum_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const PLATFORM_ROLES = new Set(["PlatformAdmin", "PlatformSupport", "PlatformDeveloper", "PlatformBilling"]);

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  return new TextEncoder().encode("medlum-dev-secret-change-me-32b");
}

export type SessionPayload = { doctorId: string; email: string };

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ doctorId: payload.doctorId, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, cookieOptions);
}

async function subscriptionIsActive(clinicId: string): Promise<boolean> {
  const latest = await prisma.auditLog.findFirst({
    where: { entity: "ClinicSubscription", entityId: clinicId },
    orderBy: { createdAt: "desc" },
    select: { meta: true },
  });
  if (!latest) return true; // existing clinics remain active until platform billing is configured
  try {
    const meta = JSON.parse(latest.meta || "{}");
    const status = String(meta.status || "ACTIVE").toUpperCase();
    if (["SUSPENDED", "EXPIRED", "CANCELLED", "PAST_DUE"].includes(status)) return false;
    if (meta.dueDate) {
      const due = new Date(String(meta.dueDate));
      if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const doctorId = payload.doctorId as string | undefined;
    const email = payload.email as string | undefined;
    if (!doctorId || !email) return null;

    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { isActive: true, email: true, clinicMemberships: { where: { isActive: true }, select: { clinicId: true, role: true } } },
    });
    if (!doctor || !doctor.isActive || doctor.email !== email) return null;

    const nonPlatformMemberships = doctor.clinicMemberships.filter((m) => !PLATFORM_ROLES.has(m.role));
    if (nonPlatformMemberships.length > 0) {
      const states = await Promise.all(nonPlatformMemberships.map((m) => subscriptionIsActive(m.clinicId)));
      if (states.every((active) => !active)) {
        jar.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
        return null;
      }
    }

    return { doctorId, email };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
}
