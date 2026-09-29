import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { resolveSessionSecretBytes } from "@/lib/session-secret";

const COOKIE_NAME = "medlum_session";
const MAX_AGE = 60 * 60 * 24 * 14;

function getSecret() { return resolveSessionSecretBytes(); }

export type SessionPayload = { doctorId: string; email: string; sessionId: string };

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

export async function createSession(payload: Omit<SessionPayload, "sessionId">): Promise<void> {
  const sessionId = randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + MAX_AGE * 1000);
  await prisma.authSession.create({ data: { id: sessionId, doctorId: payload.doctorId, issuedAt, expiresAt } });
  try {
    const token = await new SignJWT({ doctorId: payload.doctorId, email: payload.email, sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setJti(sessionId)
      .sign(getSecret());
    const jar = await cookies();
    jar.set(COOKIE_NAME, token, cookieOptions);
  } catch (error) {
    await prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw error;
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
    const sessionId = (payload.sid || payload.jti) as string | undefined;
    if (!doctorId || !email || !sessionId) return null;
    const authSession = await prisma.authSession.findUnique({ where: { id: sessionId }, select: { doctorId: true, expiresAt: true, revokedAt: true } });
    if (!authSession || authSession.doctorId !== doctorId || authSession.revokedAt || authSession.expiresAt <= new Date()) return null;
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { isActive: true, email: true } });
    if (!doctor || !doctor.isActive || doctor.email !== email) return null;
    return { doctorId, email, sessionId };
  } catch { return null; }
}

export async function revokeSession(sessionId: string, doctorId?: string): Promise<void> {
  await prisma.authSession.updateMany({ where: { id: sessionId, ...(doctorId ? { doctorId } : {}), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
}
