import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  attachPortalSessionCookie,
  signPortalToken,
} from "@/lib/portal-session";
import { phoneLookupCandidates, normalizePhoneDigits } from "@/lib/phone";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phoneRaw = String(body.phone || body.username || body.email || "").trim();
    const password = String(body.password || "");

    const rl = await consumeRateLimit(
      authBucketKey("portal-login", req, normalizePhoneDigits(phoneRaw) || phoneRaw || "unknown"),
      AUTH_LIMITS.portalLogin.limit,
      AUTH_LIMITS.portalLogin.windowMs
    );
    if (!rl.allowed) {
      const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(b, { status: 429, headers });
    }

    if (!phoneRaw || !password) {
      return NextResponse.json(
        { success: false, error: "Phone and password are required." },
        { status: 400 }
      );
    }

    const candidates = phoneLookupCandidates(phoneRaw);
    let account =
      (await prisma.patientPortalAccount.findFirst({
        where: { phone: { in: candidates } },
        select: { id: true, patientId: true, passwordHash: true, status: true, phone: true },
      })) || null;

    if (!account) {
      const digits = normalizePhoneDigits(phoneRaw);
      if (digits.length >= 8) {
        const recent = await prisma.patientPortalAccount.findMany({
          where: { status: "Active" },
          select: { id: true, patientId: true, passwordHash: true, status: true, phone: true },
          take: 500,
          orderBy: { updatedAt: "desc" },
        });
        account =
          recent.find((a) => normalizePhoneDigits(a.phone) === digits) || null;
      }
    }

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Invalid phone number or password." },
        { status: 401 }
      );
    }

    if (account.status !== "Active") {
      return NextResponse.json(
        { success: false, error: "This portal account is inactive. Contact your clinic." },
        { status: 403 }
      );
    }

    const ok = await bcrypt.compare(password, account.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Invalid phone number or password." },
        { status: 401 }
      );
    }

    const token = await signPortalToken(account.patientId, account.id);
    await prisma.patientPortalAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    const res = NextResponse.json({
      success: true,
      redirectTo: "/portal/dashboard",
    });
    attachPortalSessionCookie(res, token);
    return res;
  } catch (e) {
    console.error("portal login", e instanceof Error ? e.message : "error");
    return NextResponse.json({ success: false, error: "Unable to sign in." }, { status: 500 });
  }
}
