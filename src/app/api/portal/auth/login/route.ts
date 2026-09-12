import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setPortalSession } from "@/lib/portal-session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    if (!phone || !password) return NextResponse.json({ success: false, error: "Phone and password are required." }, { status: 400 });
    const rows = await prisma.$queryRaw<Array<{ id:string; patientId:string; passwordHash:string; status:string }>>`
      SELECT id, "patientId", "passwordHash", status FROM "PatientPortalAccount" WHERE phone = ${phone} LIMIT 1
    `;
    const account = rows[0];
    if (!account || account.status !== "Active" || !(await bcrypt.compare(password, account.passwordHash))) {
      return NextResponse.json({ success: false, error: "Invalid phone number or password." }, { status: 401 });
    }
    await setPortalSession(account.patientId, account.id);
    await prisma.$executeRaw`UPDATE "PatientPortalAccount" SET "lastLoginAt" = NOW(), "updatedAt" = NOW() WHERE id = ${account.id}`;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("portal login", e);
    return NextResponse.json({ success: false, error: "Unable to sign in." }, { status: 500 });
  }
}
