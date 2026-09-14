import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getRazorpayKeyId } from "@/lib/razorpay";
import { writeAudit } from "@/lib/audit";

function esc(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?");
}

function makePdf(lines: string[]) {
  const safe = lines.flatMap((line) => {
    const words = line.split(/\s+/); const out: string[] = []; let current = "";
    for (const word of words) { if ((current + " " + word).trim().length > 88) { if (current) out.push(current); current = word; } else current = (current + " " + word).trim(); }
    if (current) out.push(current); return out;
  }).slice(0, 45);
  const content = ["BT", "/F1 11 Tf", "50 790 Td", ...safe.flatMap((line) => [`(${esc(line)}) Tj`, "0 -17 Td"]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1"); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const planId = String(body.plan || "");
    const interval = body.interval === "yearly" ? "yearly" : "monthly";
    const catalog: Record<string, { name: string; amount: number }> = {
      professional: { name: "Professional", amount: interval === "yearly" ? 19990 : 1999 },
      clinic_plus: { name: "Clinic Plus", amount: interval === "yearly" ? 49990 : 4999 },
    };
    const plan = catalog[planId];
    if (!plan) return NextResponse.json({ success: false, error: "Paid plan required" }, { status: 400 });
    const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId, isActive: true }, include: { clinic: { select: { id: true, name: true } } } });
    if (!membership) return NextResponse.json({ success: false, error: "No active clinic is associated with this account" }, { status: 400 });
    const invoiceNumber = `MEDLUM-SUB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();
    const lines = [
      "MEDLUM — SUBSCRIPTION PRO FORMA",
      "Status: PENDING PAYMENT — NOT A PAID TAX INVOICE",
      `Pro Forma No: ${invoiceNumber}`,
      `Issued: ${now.toLocaleString("en-IN")}`,
      "",
      `Clinic: ${membership.clinic.name}`,
      `Account email: ${session.email}`,
      `Plan: ${plan.name}`,
      `Billing cycle: ${interval === "yearly" ? "Yearly" : "Monthly"} — auto-renewal",
      `Subscription fee: INR ${plan.amount.toLocaleString("en-IN")}`,
      "Tax: Not separately calculated in this pilot document",
      `Total payable: INR ${plan.amount.toLocaleString("en-IN")}`,
      "",
      "Payment provider: Razorpay",
      "This document records the subscription amount before payment authorization.",
      "After successful payment/authorization, the subscription status is updated by Razorpay webhook.",
      "Auto-renewal continues according to the selected billing cycle until cancelled under the applicable terms.",
      "",
      "Terms: https://medlum.app/terms",
      "Privacy: https://medlum.app/privacy",
    ];
    const pdf = makePdf(lines);
    await writeAudit({ doctorId: session.doctorId, action: "create", entity: "SubscriptionProForma", entityId: membership.clinic.id, meta: { invoiceNumber, plan: plan.name, planId, interval, amount: plan.amount, currency: "INR", status: "PENDING" } });
    return new NextResponse(pdf, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoiceNumber}.pdf"`, "Cache-Control": "no-store", "X-MedLum-Razorpay-Key-Configured": process.env.RAZORPAY_KEY_ID ? "true" : "false" } });
  } catch (error) {
    console.error("subscription pro forma", error);
    return NextResponse.json({ success: false, error: "Unable to generate subscription pro forma" }, { status: 500 });
  }
}
