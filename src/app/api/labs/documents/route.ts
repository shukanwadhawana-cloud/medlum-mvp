import { NextResponse } from "next/server";

export const runtime = "nodejs";
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
      checksum: true,
      ocrStatus: true,
      ocrDraft: true,
      verifiedAt: true,
      createdAt: true,
      uploadedBy: true,
    },
  });

  const provider = getStorageProvider();
  const [usage, documentCount] = await Promise.all([
    provider.name === "database"
      ? prisma.storedBinaryObject.aggregate({ where: { clinicId }, _sum: { sizeBytes: true } })
      : prisma.medicalDocument.aggregate({ where: { clinicId, deletedAt: null }, _sum: { sizeBytes: true } }),
    prisma.medicalDocument.count({ where: { clinicId, deletedAt: null } }),
  ]);

  return NextResponse.json({
    documents: docs,
    storage: {
      usedBytes: usage._sum.sizeBytes || 0,
      fileCount: documentCount,
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

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: `File size must be 1 byte–${MAX_UPLOAD_BYTES} bytes. Clinical Assist supports reports up to 8 MB.` },
        { status: 413 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const suppliedMime = String(file.type || "").toLowerCase().trim();
    const signatureMime =
      buf.subarray(0, 5).toString("ascii") === "%PDF-" ? "application/pdf" :
      buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? "image/jpeg" :
      buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" :
      "";
    const extensionMime = /\.pdf$/i.test(file.name) ? "application/pdf" :
      /\.jpe?g$/i.test(file.name) ? "image/jpeg" :
      /\.png$/i.test(file.name) ? "image/png" : "";
    const normalizedMime = signatureMime || (suppliedMime === "image/jpg" ? "image/jpeg" : suppliedMime) || extensionMime;
    if (!ALLOWED_MIME.has(normalizedMime)) {
      return NextResponse.json(
        { success: false, error: "Unsupported or unreadable file type. Upload a valid PDF, JPG/JPEG, or PNG report." },
        { status: 400 }
      );
    }
    const checksum = createHash("sha256").update(buf).digest("hex");

    const provider = getStorageProvider();
    if (provider.name === "processed") {
      return NextResponse.json({
        success: false,
        code: "DURABLE_STORAGE_REQUIRED",
        error: "This storage mode does not retain report files. Configure R2 or use the durable database storage fallback before uploading clinical documents.",
      }, { status: 503 });
    }

    const existing = await prisma.medicalDocument.findFirst({
      where: { clinicId, labOrderId, checksum, deletedAt: null },
    });
    if (existing) {
      // Re-upload the exact original to restore binaries for older metadata-only
      // records, without creating a duplicate document or modifying verified values.
      const stored = await provider.getObject(existing.storageKey);
      if (!stored) await provider.upload(existing.storageKey, buf, normalizedMime);

      let updated = existing;
      if (existing.ocrStatus === "NONE") {
        updated = await prisma.medicalDocument.update({
          where: { id: existing.id },
          data: {
            storageProvider: provider.name,
            ocrStatus: "PENDING",
            ocrDraft: JSON.stringify({
              candidates: {},
              rawTextPreview: "",
              warnings: [],
              message: "The original report is saved. Clinical Assist will extract an editable draft on this device.",
              machineExtracted: false,
              verified: false,
            }),
            ocrExtractedAt: null,
          },
        });
      } else if (existing.storageProvider !== provider.name) {
        updated = await prisma.medicalDocument.update({
          where: { id: existing.id },
          data: { storageProvider: provider.name },
        });
      }

      const needsClientExtraction = ["PENDING", "FAILED"].includes(updated.ocrStatus);
      if (needsClientExtraction) {
        await writeAudit({
          doctorId: session.doctorId,
          action: "LAB_DOCUMENT_OCR_RETRY_QUEUED",
          entity: "MedicalDocument",
          entityId: existing.id,
          meta: { clinicId, labOrderId, patientId, source: "duplicate-upload", extractionMethod: "clinical-assist-on-device" },
        });
      }
      return NextResponse.json({
        success: true,
        document: updated,
        deduplicated: true,
        needsClientExtraction,
        ocr: {
          status: updated.ocrStatus,
          message: needsClientExtraction
            ? "The original report is saved. Clinical Assist will extract an editable draft on this device."
            : "This report already exists. Its current extraction status and draft have been loaded.",
          verified: updated.ocrStatus === "VERIFIED",
        },
      });
    }

    // Only genuinely new documents consume quota; retries of duplicates must still work at quota.
    const usedUsage = provider.name === "database"
      ? await prisma.storedBinaryObject.aggregate({ where: { clinicId }, _sum: { sizeBytes: true } })
      : await prisma.medicalDocument.aggregate({ where: { clinicId, deletedAt: null }, _sum: { sizeBytes: true } });
    const used = usedUsage._sum.sizeBytes || 0;
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

    const documentId = randomUUID().replace(/-/g, "").slice(0, 24);
    const ext =
      normalizedMime.includes("pdf") ? "pdf" : normalizedMime.includes("png") ? "png" : "jpg";
    const storageKey = buildStorageKey(clinicId, patientId, labOrderId, documentId, ext);
    await provider.upload(storageKey, buf, normalizedMime);
    const ocrMessage = "Report uploaded and stored. Clinical Assist will extract an editable draft in your browser; no clinical result is written until a clinician verifies it.";
    let doc;
    try {
      doc = await prisma.medicalDocument.create({
        data: {
          id: documentId,
          clinicId,
          patientId,
          labOrderId,
          encounterId: order.encounterId,
          storageProvider: provider.name,
          storageKey,
          originalFileName: file.name.slice(0, 200),
          mimeType: normalizedMime,
          sizeBytes: buf.length,
          checksum,
          uploadedBy: session.doctorId,
          ocrStatus: "PENDING",
          ocrDraft: JSON.stringify({
            candidates: {},
            rawTextPreview: "",
            warnings: [],
            message: ocrMessage,
            machineExtracted: false,
            verified: false,
            extractionMethod: "clinical-assist-on-device",
          }),
          ocrExtractedAt: null,
        },
      });
    } catch (error) {
      // Best-effort cleanup if metadata creation fails after the file was stored.
      await provider.delete(storageKey).catch(() => {});
      throw error;
    }

    await writeAudit({
      doctorId: session.doctorId,
      action: "LAB_DOCUMENT_UPLOADED",
      entity: "MedicalDocument",
      entityId: doc.id,
      meta: { clinicId, labOrderId, patientId, sizeBytes: buf.length, mimeType: doc.mimeType, ocrStatus: "PENDING", storageProvider: provider.name },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "LAB_DOCUMENT_OCR_QUEUED",
      entity: "MedicalDocument",
      entityId: doc.id,
      meta: { clinicId, labOrderId, patientId, ocrStatus: "PENDING", extractionMethod: "clinical-assist-on-device" },
    });

    return NextResponse.json({
      success: true,
      document: doc,
      deduplicated: false,
      needsClientExtraction: true,
      ocr: { status: "PENDING", message: ocrMessage, verified: false },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    console.error("lab document upload", message);
    const quotaExceeded = /quota exceeded/i.test(message);
    return NextResponse.json(
      { success: false, error: message },
      { status: quotaExceeded ? 413 : 500 }
    );
  }
}
