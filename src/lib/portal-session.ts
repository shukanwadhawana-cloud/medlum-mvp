import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { resolveSessionSecretBytes } from "@/lib/session-secret";
import type { NextResponse } from "next/server";

export const PORTAL_COOKIE_NAME = "medlum_patient_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

function secret() {
  return resolveSessionSecretBytes();
}

export function portalCookieOptions(maxAge: number = MAX_AGE) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function signPortalToken(patientId: string, accountId: string): Promise<string> {
  return new SignJWT({ patientId, accountId, kind: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

/** Attach portal session cookie to an explicit NextResponse (preferred in Route Handlers). */
export function attachPortalSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(PORTAL_COOKIE_NAME, token, portalCookieOptions());
}

export function clearPortalSessionCookie(res: NextResponse) {
  res.cookies.set(PORTAL_COOKIE_NAME, "", portalCookieOptions(0));
}

/** Legacy helper — still used where response is not available. */
export async function setPortalSession(patientId: string, accountId: string) {
  const token = await signPortalToken(patientId, accountId);
  const jar = await cookies();
  jar.set(PORTAL_COOKIE_NAME, token, portalCookieOptions());
}

export async function getPortalSession(): Promise<{ patientId: string; accountId: string } | null> {
  const jar = await cookies();
  const token = jar.get(PORTAL_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const patientId = payload.patientId as string | undefined;
    const accountId = payload.accountId as string | undefined;
    const kind = payload.kind as string | undefined;
    if (!patientId || !accountId) return null;
    if (kind && kind !== "portal") return null;
    return { patientId, accountId };
  } catch {
    return null;
  }
}

export async function clearPortalSession() {
  const jar = await cookies();
  jar.set(PORTAL_COOKIE_NAME, "", portalCookieOptions(0));
}
