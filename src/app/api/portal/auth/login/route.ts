import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setPortalSession } from "@/lib/portal-session";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");

    const rl = await consumeRateLimit(
      authBucketKey("portal-login", req, phone || "unknown"),
      AUTH_LIMITS.portalLogin.limit,
      AUTH_LIMITS.portalLogin.windowMs
    );
    if (!rl.allowed) {
      const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(b, { status: 429, headers });
    }

    if (!phone || !password) {
      return NextResponse.json({ success: false, error: "Phone and password are required." }, { status: 400 });
    }

    const account = await prisma.patientPortalAccount.findFirst({
      where: { phone },
      select: { id: true, patientId: true, passwordHash: true, status: true },
    });

    if (!account || account.status !== "Active" || !(await bcrypt.compare(password, account.passwordHash))) {
      return NextResponse.json({ success: false, error: "Invalid phone number or password." }, { status: 401 });
    }

    await setPortalSession(account.patientId, account.id);
    await prisma.patientPortalAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("portal login", e);
    return NextResponse.json({ success: false, error: "Unable to sign in." }, { status: 500 });
  }
}
