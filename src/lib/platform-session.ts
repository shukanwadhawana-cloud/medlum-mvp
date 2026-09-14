import { Prisma } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ensureControlPlaneSchema } from "@/lib/platform-control-plane";

const COOKIE_NAME = "medlum_platform_session";
const MAX_AGE = 60 * 60 * 8;

type PlatformSession = { ownerId: string; email: string };

function getSecret() {
  const configured = process.env.PLATFORM_SESSION_SECRET || process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return new TextEncoder().encode(`${configured}:platform-owner`);
  if (process.env.NODE_ENV === "production") throw new Error("PLATFORM_SESSION_SECRET or SESSION_SECRET must be configured with at least 32 characters");
  return new TextEncoder().encode("medlum-platform-dev-secret-change-me-32b");
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/platform",
  maxAge: MAX_AGE,
};

export async function createPlatformSession(owner: PlatformSession): Promise<void> {
  const token = await new SignJWT({ ownerId: owner.ownerId, email: owner.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, cookieOptions);
}

export async function getPlatformSession(): Promise<PlatformOwnerSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const ownerId = payload.ownerId as string | undefined;
    const email = payload.email as string | undefined;
    if (!ownerId || !email) return null;
    await ensureControlPlaneSchema();
    const rows = await prisma.$queryRaw<PlatformOwnerSession[]>(
      Prisma.sql`SELECT "id" AS "ownerId","email","name","isActive" FROM "PlatformOwner" WHERE "id" = ${ownerId} AND "email" = ${email} LIMIT 1`
    );
    const owner = rows[0];
    if (!owner || !owner.isActive) {
      jar.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
      return null;
    }
    return owner;
  } catch {
    return null;
  }
}

export async function destroyPlatformSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
}

export type PlatformOwnerSession = {
  ownerId: string;
  email: string;
  name: string;
  isActive: boolean;
};
