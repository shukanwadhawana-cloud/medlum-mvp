import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "medlum_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  // Never allow a predictable fallback in production. A missing/weak
  // production secret must fail closed rather than making sessions forgeable.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }

  return new TextEncoder().encode("medlum-dev-secret-change-me-32b");
}

export type SessionPayload = {
  doctorId: string;
  email: string;
};

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ doctorId: payload.doctorId, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
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
    return { doctorId, email };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
