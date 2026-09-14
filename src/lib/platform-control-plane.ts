import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

export type PlatformOwner = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

export type PlatformProduct = {
  id: string;
  key: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

let initialized: Promise<void> | null = null;

export function ensureControlPlaneSchema(): Promise<void> {
  if (!initialized) {
    initialized = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PlatformOwner" (
          "id" TEXT PRIMARY KEY,
          "email" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "passwordHash" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastLoginAt" TIMESTAMP(3)
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PlatformProduct" (
          "id" TEXT PRIMARY KEY,
          "key" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "slug" TEXT NOT NULL UNIQUE,
          "description" TEXT NOT NULL DEFAULT '',
          "active" BOOLEAN NOT NULL DEFAULT TRUE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}

export async function ensurePlatformBootstrap(): Promise<void> {
  await ensureControlPlaneSchema();
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "PlatformOwner" LIMIT 1`);
  if (existing.length === 0) {
    const email = String(process.env.MEDLUM_PLATFORM_OWNER_EMAIL || "").toLowerCase().trim();
    const password = String(process.env.MEDLUM_PLATFORM_OWNER_PASSWORD || "");
    if (email && password.length >= 12) {
      const name = String(process.env.MEDLUM_PLATFORM_OWNER_NAME || "MedLum Founder").trim() || "MedLum Founder";
      const passwordHash = await hashPassword(password);
      await prisma.$executeRaw(
        Prisma.sql`INSERT INTO "PlatformOwner" ("id","email","name","passwordHash") VALUES (${crypto.randomUUID()},${email},${name},${passwordHash}) ON CONFLICT ("email") DO NOTHING`
      );
    }
  }
  await prisma.$executeRaw(
    Prisma.sql`INSERT INTO "PlatformProduct" ("id","key","name","slug","description") VALUES (${crypto.randomUUID()},${"medlum-mvp"},${"MedLum MVP"},${"medlum-mvp"},${"Clinical operations platform for hospitals and clinics."}) ON CONFLICT ("key") DO NOTHING`
  );
}

export async function getPlatformOwnerByEmail(email: string): Promise<PlatformOwner | null> {
  await ensureControlPlaneSchema();
  const rows = await prisma.$queryRaw<PlatformOwner[]>(Prisma.sql`SELECT "id","email","name","isActive","createdAt","updatedAt","lastLoginAt" FROM "PlatformOwner" WHERE "email" = ${email} LIMIT 1`);
  return rows[0] || null;
}

export async function authenticatePlatformOwner(email: string, password: string): Promise<PlatformOwner | null> {
  await ensurePlatformBootstrap();
  const rows = await prisma.$queryRaw<Array<PlatformOwner & { passwordHash: string }>>(Prisma.sql`SELECT "id","email","name","isActive","createdAt","updatedAt","lastLoginAt","passwordHash" FROM "PlatformOwner" WHERE "email" = ${email} LIMIT 1`);
  const owner = rows[0];
  if (!owner || !owner.isActive || !(await verifyPassword(password, owner.passwordHash))) return null;
  await prisma.$executeRaw(Prisma.sql`UPDATE "PlatformOwner" SET "lastLoginAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${owner.id}`);
  return owner;
}

export async function getPlatformProducts(): Promise<PlatformProduct[]> {
  await ensurePlatformBootstrap();
  return prisma.$queryRaw<PlatformProduct[]>(Prisma.sql`SELECT "id","key","name","slug","description","active","createdAt","updatedAt" FROM "PlatformProduct" WHERE "active" = TRUE ORDER BY "createdAt" ASC`);
}
