import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { resolveSessionSecretBytes } from "@/lib/session-secret";

const COOKIE_NAME = "medlum_patient_session";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret() {
  return resolveSessionSecretBytes();
}

export async function setPortalSession(patientId: string, accountId: string) {
  const token = await new SignJWT({ patientId, accountId, kind: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getPortalSession(): Promise<{ patientId: string; accountId: string } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const patientId = payload.patientId as string | undefined;
    const accountId = payload.accountId as string | undefined;
    if (!patientId || !accountId) return null;
    return { patientId, accountId };
  } catch {
    return null;
  }
}

export async function clearPortalSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
