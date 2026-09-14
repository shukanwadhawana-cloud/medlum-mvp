import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAccess } from "@/lib/platform";

export async function GET() {
  const access = await requirePlatformAccess(["PlatformAdmin", "PlatformDeveloper", "PlatformSupport"]);
  if (!access) return NextResponse.json({ error: "Platform diagnostics access required" }, { status: 403 });
  const started = Date.now();
  try {
    const [doctors, clinics, patients, auditLogs] = await Promise.all([
      prisma.doctor.count(), prisma.clinic.count(), prisma.patient.count(), prisma.auditLog.count(),
    ]);
    return NextResponse.json({ success: true, checkedAt: new Date().toISOString(), database: { status: "OK", latencyMs: Date.now() - started }, runtime: { nodeEnv: process.env.NODE_ENV || "unknown", appUrlConfigured: Boolean(process.env.MEDLUM_APP_URL), videoProvider: process.env.VIDEO_PROVIDER || "jitsi" }, counts: { doctors, clinics, patients, auditLogs } });
  } catch (e) {
    console.error("platform diagnostics", e);
    return NextResponse.json({ success: false, database: { status: "ERROR", latencyMs: Date.now() - started } }, { status: 500 });
  }
}
