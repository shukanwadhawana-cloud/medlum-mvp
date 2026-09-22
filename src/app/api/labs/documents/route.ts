import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import {
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
  buildStorageKey,
  getStorageProvider,
  storageQuotaBytes,
} from "@/lib/storage";

async function clinicIdFor(doctorId: string) {
  const m = await requireActiveClinicMembership(doctorId);
  return m?.clinicId || null;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = await clinicIdFor(session.doctorId);
  if (!clinicId) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const labOrderId = searchParams.get("labOrderId") || undefined;
  const patientId = searchParams.get("patientId") || undefined;

  const docs = await prisma.medicalDocument.findMany({
    where: {
      clinicId,
      deletedAt: null,
      ...(labOrderId ? { labOrderId } : {}),
      ...(patientId ? { patientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      labOrderId: true,
      encounterId: true,
      originalFileName: true,
      mimeType: true,
      sizeBytes: true,
      ocrStatus: true,
      ocrDraft: true,
      verifiedAt: true,
      createdAt: true,
      uploadedBy: true,
    },
  });

  const usage = await prisma.medicalDocument.aggregate({
    where: { clinicId, deletedAt: null },
    _sum: { sizeBytes: true },
    _count: true,
  });

  return NextResponse.json({
    documents: docs,
    storage: {
      usedBytes: usage._sum.sizeBytes || 0,
      fileCount: usage._count,
      quotaBytes: storageQuotaBytes(),
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = await clinicIdFor(session.doctorId);
  if (!clinicId) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const labOrderId = String(form.get("labOrderId") || "");
    const patientId = String(form.get("patientId") || "");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file required" }, { status: 400 });
    }
    if (!labOrderId || !patientId) {
      return NextResponse.json({ success: false, error: "labOrderId and patientId required" }, { status: 400 });
    }

    const order = await prisma.labOrder.findFirst({
      where: { id: labOrderId, patientId, patient: { clinicId, deletedAt: null } },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: "Lab order not found" }, { status: 404 });
    }

    const mimeType = (file.type || "").toLowerCase();
    const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
    if (!ALLOWED_MIME.has(normalizedMime) && !ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Unsupported file type. Allowed: PDF, JPG, PNG" },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: `File size must be 1 byte–${MAX_UPLOAD_BYTES} bytes` },
        { status: 400 }
      );
    }

    const usage = await prisma.medicalDocument.aggregate({
      where: { clinicId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    const used = usage._sum.sizeBytes || 0;
    const quota = storageQuotaBytes();
    if (used + file.size > quota) {
      return NextResponse.json(
        {
          success: false,
          error: "Storage quota would be exceeded. Free space or raise STORAGE_QUOTA_BYTES within free-tier limits.",
          storage: { usedBytes: used, quotaBytes: quota },
        },
        { status: 413 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(buf).digest("hex");

    const existing = await prisma.medicalDocument.findFirst({
      where: { clinicId, labOrderId, checksum, deletedAt: null },
    });
    if (existing) {
      return NextResponse.json({ success: true, document: existing, deduplicated: true });
    }

    const documentId = randomUUID().replace(/-/g, "").slice(0, 24);
    const ext =
      normalizedMime.includes("pdf") ? "pdf" : normalizedMime.includes("png") ? "png" : "jpg";
    const storageKey = buildStorageKey(clinicId, patientId, labOrderId, documentId, ext);
    const provider = getStorageProvider();
    await provider.upload(storageKey, buf, normalizedMime || mimeType);

    const doc = await prisma.medicalDocument.create({
      data: {
        id: documentId,
        clinicId,
        patientId,
        labOrderId,
        encounterId: order.encounterId,
        storageProvider: provider.name,
        storageKey,
        originalFileName: file.name.slice(0, 200),
        mimeType: normalizedMime || mimeType,
        sizeBytes: buf.length,
        checksum,
        uploadedBy: session.doctorId,
        ocrStatus: "NONE",
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "LAB_DOCUMENT_UPLOADED",
      entity: "MedicalDocument",
      entityId: doc.id,
      meta: { clinicId, labOrderId, patientId, sizeBytes: buf.length, mimeType: doc.mimeType },
    });

    return NextResponse.json({ success: true, document: doc, deduplicated: false });
  } catch (e) {
    console.error("lab document upload", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
