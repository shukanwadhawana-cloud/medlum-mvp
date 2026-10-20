"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiCreateLabOrder, apiGetLabOrders, apiGetPatients, apiUpdateLabOrder } from "@/lib/api";
import { LAB_CATALOG } from "@/lib/diagnostic-catalog";
import LabResultDocumentPanel from "@/components/LabResultDocumentPanel";
import { formatIst } from "@/lib/time";
import { parseCareSetting } from "@/lib/patient-metadata";

type Patient = { id: string; name: string; uhid?: string; registrationNo?: string; notes?: string };
type LabOrder = {
  id: string;
  patientId: string;
  patientName: string;
  testName: string;
  category: string;
  status: string;
  result: string;
  notes: string;
  orderedAt: string;
  resultedAt?: string | null;
  encounterId?: string | null;
  patientUhid?: string;
  patientRegistrationNo?: string;
  encounterType?: string;
  encounter?: {
    id: string;
    date: string;
    status: string;
    chiefComplaint?: string;
    cancelledAt?: string | null;
  } | null;
};

const ACTIVE_STATUSES = new Set([
  "Ordered",
  "Collected",
  "Sample Pending",
  "Sample Collected",
  "Processing",
  "Result Available",
  "Awaiting Review",
]);
const HISTORY_STATUSES = new Set(["Resulted", "Reviewed", "Cancelled", "Completed"]);

function isActiveStatus(status: string) {
  if (HISTORY_STATUSES.has(status)) return false;
  if (ACTIVE_STATUSES.has(status)) return true;
  return status !== "Resulted" && status !== "Cancelled";
}

function isCbcTest(testName: string): boolean {
  const t = testName.toLowerCase();
  return t.includes("cbc") || t.includes("complete blood");
}

function parseStructuredResult(raw: string): Record<string, string> | null {
  const s = String(raw || "").trim();
  if (!s.startsWith("{")) return null;
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null) continue;
      out[String(k)] = String(v);
    }
    return out;
  } catch {
    return null;
  }
}

function formatResultPreview(raw: string): string {
  const structured = parseStructuredResult(raw);
  if (!structured) return raw || "—";
  return Object.entries(structured)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

function statusBadgeClass(status: string): string {
  if (status === "Ordered" || status === "Sample Pending") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "Collected" || status === "Sample Collected" || status === "Processing")
    return "bg-blue-50 text-blue-800 border-blue-200";
  if (status === "Resulted" || status === "Result Available" || status === "Reviewed")
    return "bg-green-50 text-green-800 border-green-200";
  if (status === "Cancelled") return "bg-gray-100 text-gray-600 border-gray-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

type PatientGroup = {
  patientId: string;
  patientName: string;
  uhid: string;
  registrationNo: string;
  encounterType: string;
  encounterId: string;
  orders: LabOrder[];
  pendingCount: number;
};

function resolveEncounterType(o: LabOrder): string {
  if (o.encounterType && o.encounterType.trim()) return o.encounterType.trim();
  if (o.encounter && !o.encounter.cancelledAt) {
    const datePart = o.encounter.date ? ` · ${o.encounter.date}` : "";
    return `Linked encounter${datePart}`;
  }
  if (o.encounterId) return "Linked encounter";
  return "Encounter not linked";
}

/** Group by patient + encounter so unrelated encounters are not merged. */
function groupByPatient(list: LabOrder[]): PatientGroup[] {
  const map = new Map<string, PatientGroup>();
  for (const o of list) {
    const key = `${o.patientId || o.patientName}::${o.encounterId || "none"}`;
    let g = map.get(key);
    if (!g) {
      g = {
        patientId: o.patientId,
        patientName: o.patientName,
        uhid: o.patientUhid || "",
        registrationNo: o.patientRegistrationNo || "",
        encounterType: resolveEncounterType(o),
        encounterId: o.encounterId || "",
        orders: [],
        pendingCount: 0,
      };
      map.set(key, g);
    }
    g.orders.push(o);
    if (isActiveStatus(o.status)) g.pendingCount += 1;
  }
  return Array.from(map.values()).sort(
    (a, b) => b.pendingCount - a.pendingCount || a.patientName.localeCompare(b.patientName)
  );
}
