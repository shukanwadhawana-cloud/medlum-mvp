import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, canManageTariff } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

const MAX_ROWS = 5000;
const MAX_BODY_CHARS = 2_000_000;

type MappedRow = {
  code?: string;
  name?: string;
  category?: string;
  department?: string;
  unitPrice?: number | string;
  esicCode?: string;
  esicCategory?: string;
  notes?: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      cur.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(cell);
      cell = "";
      if (cur.some((c) => c.trim() !== "")) rows.push(cur);
      cur = [];
    } else cell += ch;
  }
  if (cell.length || cur.length) {
    cur.push(cell);
    if (cur.some((c) => c.trim() !== "")) rows.push(cur);
  }
  return rows;
}

function sheetToMatrix(sheet: any): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const range = XLSX.utils.decode_range(ref);
  const out: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    let any = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      let v = "";
      if (cell != null && cell.v != null) v = String(cell.v).trim();
      if (v) any = true;
      row.push(v);
    }
    if (any) out.push(row);
  }
  return out;
}

function parseExcelBase64(b64: string, preferredSheet?: string): { sheets: string[]; matrix: string[][]; usedSheet: string } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const buf = Buffer.from(b64.replace(/^data:.*?;base64,/, ""), "base64");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheets = wb.SheetNames || [];
  if (!sheets.length) throw new Error("Workbook has no sheets");
  const usedSheet =
    preferredSheet && sheets.includes(preferredSheet) ? preferredSheet : sheets[0];
  const matrix = sheetToMatrix(wb.Sheets[usedSheet]);
  return { sheets, matrix, usedSheet };
}

function autoMap(headers: string[]): Record<string, string> {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const find = (...cands: string[]) => {
    const i = lower.findIndex((h) => cands.some((c) => h === c || h.includes(c)));
    return i >= 0 ? headers[i] : "";
  };
  return {
    name: find("name", "service", "item", "description", "procedure") || headers[0] || "",
    unitPrice: find("unitprice", "unit price", "rate", "hospital rate", "hospital_rate", "price", "amount", "tariff"),
    code: find("code", "item code", "itemcode", "service code"),
    category: find("category", "type", "ward"),
    department: find("department", "dept"),
    esicCode: find("esic code", "esiccode", "esic"),
    esicCategory: find("esic category", "esiccategory"),
    notes: find("notes", "remark", "remarks"),
  };
}

function mapRows(
  headers: string[],
  dataRows: string[][],
  mapping: Record<string, string | number>
): { rows: MappedRow[]; errors: { row: number; message: string }[] } {
  const errors: { row: number; message: string }[] = [];
  const headerIndex = new Map(headers.map((h, i) => [h.trim().toLowerCase(), i]));

  function col(key: string): number | null {
    const m = mapping[key];
    if (m == null || m === "") return null;
    if (typeof m === "number") return m;
    const idx = headerIndex.get(String(m).trim().toLowerCase());
    return idx == null ? null : idx;
  }

  const idxs = {
    code: col("code"),
    name: col("name"),
    category: col("category"),
    department: col("department"),
    unitPrice: col("unitPrice") ?? col("hospitalRate") ?? col("rate"),
    esicCode: col("esicCode"),
    esicCategory: col("esicCategory"),
    notes: col("notes"),
  };

  const rows: MappedRow[] = [];
  dataRows.forEach((cells, i) => {
    const rowNum = i + 2;
    const get = (idx: number | null) => (idx == null ? "" : String(cells[idx] ?? "").trim());
    const name = get(idxs.name);
    const priceRaw = get(idxs.unitPrice).replace(/,/g, "");
    const unitPrice = priceRaw === "" ? NaN : Number(priceRaw);
    if (!name) {
      errors.push({ row: rowNum, message: "Missing name" });
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      errors.push({ row: rowNum, message: `Invalid unitPrice: ${priceRaw || "(empty)"}` });
      return;
    }
    rows.push({
      code: get(idxs.code),
      name,
      category: get(idxs.category) || "General",
      department: get(idxs.department),
      unitPrice,
      esicCode: get(idxs.esicCode),
      esicCategory: get(idxs.esicCategory),
      notes: get(idxs.notes),
    });
  });
  return { rows, errors };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canManageTariff(membership.role)) {
    return NextResponse.json({ error: "Not permitted to import tariffs" }, { status: 403 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ success: false, error: "Payload too large" }, { status: 413 });
  }
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "commit" ? "commit" : "preview";
  let mapped: MappedRow[] = [];
  let parseErrors: { row: number; message: string }[] = [];
  let sheets: string[] = [];
  let usedSheet = "";
  let headers: string[] = [];
  let suggestedMapping: Record<string, string> = {};
  let previewSample: string[][] = [];
  let matrixRowCount = 0;

  try {
    if (typeof body.excelBase64 === "string" && body.excelBase64.trim()) {
      const parsed = parseExcelBase64(body.excelBase64, body.sheetName ? String(body.sheetName) : undefined);
      sheets = parsed.sheets;
      usedSheet = parsed.usedSheet;
      const matrix = parsed.matrix;
      matrixRowCount = Math.max(0, matrix.length - 1);
      if (matrix.length < 2) {
        return NextResponse.json({ success: false, error: "Sheet needs header + at least one data row", sheets, usedSheet }, { status: 400 });
      }
      headers = matrix[0].map((h) => String(h || "").trim());
      suggestedMapping = autoMap(headers);
      const mapping = body.mapping && typeof body.mapping === "object" ? { ...suggestedMapping, ...body.mapping } : suggestedMapping;
      previewSample = matrix.slice(1, 6);
      const result = mapRows(headers, matrix.slice(1), mapping);
      mapped = result.rows;
      parseErrors = result.errors;
    } else if (typeof body.csv === "string" && body.csv.trim()) {
      const table = parseCsv(body.csv);
      if (table.length < 2) {
        return NextResponse.json({ success: false, error: "CSV needs header + at least one data row" }, { status: 400 });
      }
      headers = table[0];
      matrixRowCount = table.length - 1;
      suggestedMapping = autoMap(headers);
      const mapping = body.mapping && typeof body.mapping === "object" ? { ...suggestedMapping, ...body.mapping } : suggestedMapping;
      previewSample = table.slice(1, 6);
      const result = mapRows(headers, table.slice(1), mapping);
      mapped = result.rows;
      parseErrors = result.errors;
    } else if (Array.isArray(body.rows)) {
      body.rows.forEach((r: any, i: number) => {
        const name = String(r.name || "").trim();
        const unitPrice = Number(r.unitPrice);
        if (!name || !Number.isFinite(unitPrice) || unitPrice < 0) {
          parseErrors.push({ row: i + 1, message: "Invalid name or unitPrice" });
          return;
        }
        mapped.push({
          code: String(r.code || ""),
          name,
          category: String(r.category || "General"),
          department: String(r.department || ""),
          unitPrice,
          esicCode: String(r.esicCode || ""),
          esicCategory: String(r.esicCategory || ""),
          notes: String(r.notes || ""),
        });
      });
      matrixRowCount = body.rows.length;
    } else {
      return NextResponse.json(
        { success: false, error: "Provide excelBase64, csv string, or rows array" },
        { status: 400 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Parse failed" }, { status: 400 });
  }

  if (mapped.length > MAX_ROWS) {
    return NextResponse.json({ success: false, error: `Max ${MAX_ROWS} rows per import` }, { status: 400 });
  }

  const seen = new Set<string>();
  const duplicates: number[] = [];
  mapped.forEach((r, i) => {
    const key = `${(r.code || "").toLowerCase()}|${(r.name || "").toLowerCase()}`;
    if (seen.has(key)) duplicates.push(i + 1);
    else seen.add(key);
  });

  if (mode === "preview") {
    return NextResponse.json({
      success: true,
      mode: "preview",
      sheets,
      usedSheet,
      headers,
      suggestedMapping,
      previewSample,
      rowCount: matrixRowCount,
      validCount: mapped.length,
      errorCount: parseErrors.length,
      duplicateCount: duplicates.length,
      errors: parseErrors.slice(0, 50),
      duplicates: duplicates.slice(0, 20),
      sample: mapped.slice(0, 5),
    });
  }

  if (parseErrors.length > 0 && body.allowPartial !== true) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed; fix rows or set allowPartial=true",
        errors: parseErrors.slice(0, 50),
      },
      { status: 400 }
    );
  }

  if (mapped.length === 0) {
    return NextResponse.json({ success: false, error: "No valid rows to import" }, { status: 400 });
  }

  let versionId = String(body.versionId || "");
  let version = versionId
    ? await prisma.tariffVersion.findFirst({ where: { id: versionId, clinicId: membership.clinicId } })
    : null;

  if (version?.isActive) {
    return NextResponse.json(
      { success: false, error: "Cannot import into an active version; create a new draft version first" },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    if (!version) {
      version = await tx.tariffVersion.create({
        data: {
          clinicId: membership.clinicId,
          name: String(body.name || "Imported tariff").slice(0, 120),
          version: String(body.version || new Date().toISOString().slice(0, 10)).slice(0, 40),
          sourceFile: String(body.sourceFile || (body.excelBase64 ? "excel-import" : "csv-import")).slice(0, 200),
          notes: String(body.notes || "").slice(0, 500),
          isActive: false,
          createdBy: session.doctorId,
        },
      });
      versionId = version.id;
    }

    await tx.tariffItem.deleteMany({ where: { tariffVersionId: versionId } });
    await tx.tariffItem.createMany({
      data: mapped.map((r) => ({
        tariffVersionId: versionId,
        code: String(r.code || "").slice(0, 64),
        name: String(r.name).slice(0, 200),
        category: String(r.category || "General").slice(0, 64),
        department: String(r.department || "").slice(0, 64),
        unitPrice: Number(r.unitPrice),
        esicCode: String(r.esicCode || "").slice(0, 64),
        esicCategory: String(r.esicCategory || "").slice(0, 64),
        notes: String(r.notes || "").slice(0, 300),
        isActive: true,
      })),
    });

    if (body.activate === true) {
      await tx.tariffVersion.updateMany({
        where: { clinicId: membership.clinicId, isActive: true },
        data: { isActive: false, effectiveTo: new Date() },
      });
      await tx.tariffVersion.update({
        where: { id: versionId },
        data: { isActive: true, effectiveFrom: new Date(), effectiveTo: null },
      });
    }

    return tx.tariffVersion.findUnique({ where: { id: versionId } });
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "tariff_import",
    entity: "TariffVersion",
    entityId: result!.id,
    meta: {
      clinicId: membership.clinicId,
      itemCount: mapped.length,
      sourceFile: body.sourceFile || (body.excelBase64 ? "excel-import" : "csv-import"),
      errorCount: parseErrors.length,
      activated: body.activate === true,
    },
  });

  return NextResponse.json({
    success: true,
    mode: "commit",
    version: result,
    imported: mapped.length,
    skippedErrors: parseErrors.length,
  });
}
