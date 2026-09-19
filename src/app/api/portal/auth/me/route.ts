import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-session";

export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const account = await prisma.patientPortalAccount.findUnique({
    where: { id: session.accountId },
    select: { status: true, patientId: true },
  });
  if (!account || account.status !== "Active" || account.patientId !== session.patientId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: { id: true, name: true, age: true, gender: true, phone: true },
  });
  if (!patient) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json(
    { authenticated: true, patient },
    { headers: { "Cache-Control": "no-store" } }
  );
}
