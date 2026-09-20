"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";

const sections = [
  ["1", "Product shape", "Multi-tenant hospital/clinic workspace with separate OPD and IPD workflows, shared patient records, labs, tariff/versioning, billing, staff roles, auditability and owner oversight."],
  ["2", "Core workflow", "Login → Telegram OTP → Dashboard → Facility → Staff → Patient → OPD/IPD → Investigation/Lab → Tariff → Invoice → Payment → Print/Receipt → Audit → Discharge → Search/Recovery"],
  ["3", "Facility & staff", "Configure hospital/clinic identity, OPD/IPD access, registration details, branding and staff roles. Access remains tenant-scoped."],
  ["4", "Patients", "Register, search, consult/admit, record clinical information, discharge, retain historical search and recover deleted records for authorized users."],
  ["5", "OPD", "Distinct outpatient workflow for registration, consultation, diagnosis, prescription/follow-up, investigations and applicable billing."],
  ["6", "IPD", "Admission, ward/room/bed, consultant, assessment, vitals, notes, investigations, summaries, discharge/transfer/DAMA and settlement."],
  ["7", "Labs / CBC", "Structured laboratory templates. CBC should expose configured parameters instead of relying only on free text."],
  ["8", "Tariff / ESIC", "Upload XLS/XLSX/CSV, inspect/map/preview, import named versions, activate versions and preserve historical tariff snapshots."],
  ["9", "Billing", "Invoice numbering, hospital/ESIC rates, payment recording, partial/final settlement, outstanding balance and printable invoice/receipt."],
  ["10", "Audit", "Records must retain enough attribution to answer who added or changed a record, with tenant boundaries preserved."],
  ["11", "Authentication", "Privileged login uses ID/password followed by Telegram OTP before session creation."],
  ["12", "Acceptance rule", "Fix failed acceptance gates in the smallest existing implementation. Do not redesign or expand architecture merely because another feature could be added."],
];

const gates = [
  "Telegram OTP", "Facility setup", "Staff + roles", "Patient registration", "OPD encounter",
  "IPD admission", "CBC structured result", "Tariff import/version", "Invoice snapshot",
  "Partial + final payment", "Printable invoice/receipt", "User attribution",
  "Discharge + search", "Authorized recovery", "Hospital-to-hospital isolation", "Production health",
];

export default function MvpBlueprintPage() {
  return (
    <AppShell>
      <div className="mb-5">
        <Link href="/dashboard" className="text-xs font-medium text-[#c2183a]">← Dashboard</Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c2183a]">Frozen MVP</p>
            <h1 className="text-2xl font-bold text-[#140a1f]">MedLum Product Blueprint</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">The current implementation, expressed as one visible product map and acceptance checklist. This is a validation baseline, not a new feature roadmap.</p>
          </div>
          <span className="w-fit rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[11px] font-semibold text-green-700">ARCHITECTURE FROZEN</span>
        </div>
      </div>

      <section className="mb-4 rounded-2xl border border-[#140a1f]/10 bg-[#140a1f] p-4 text-white shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">End-to-end acceptance path</p>
        <p className="mt-2 text-sm font-semibold leading-6">Login → Telegram OTP → Dashboard → Patient → OPD/IPD → Lab → Tariff → Invoice → Payment → Print → Audit → Discharge → Search/Recovery</p>
        <p className="mt-2 text-xs leading-5 text-white/60">The MVP is considered validated only when this connected workflow works, including tenant isolation.</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1fr_0.72fr]">
        <section className="rounded-2xl border bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">What exists in MedLum</h2>
            <p className="mt-0.5 text-xs text-gray-500">Current codebase scope, not future architecture.</p>
          </div>
          <div className="divide-y">
            {sections.map(([n, title, body]) => (
              <div key={n} className="flex gap-3 px-4 py-3.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#c2183a]/10 text-xs font-bold text-[#c2183a]">{n}</span>
                <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-gray-600">{body}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="h-fit rounded-2xl border bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Acceptance gates</h2>
            <p className="mt-0.5 text-xs text-gray-500">These are what we validate next.</p>
          </div>
          <div className="space-y-2 p-4">
            {gates.map((gate) => (
              <div key={gate} className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-gray-300 text-[9px] text-gray-400">✓</span>
                <span className="text-xs font-medium text-gray-700">{gate}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-900">Freeze rule</h2>
        <p className="mt-1 text-xs leading-5 text-amber-800">If an acceptance gate fails, fix the smallest existing implementation required to make it pass. Do not start another architecture phase. Existing modules outside the core workflow remain available but do not expand the frozen MVP scope.</p>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/help" className="rounded-xl border bg-white px-4 py-2.5 text-xs font-semibold">Help center</Link>
        <Link href="/clinic" className="rounded-xl border bg-white px-4 py-2.5 text-xs font-semibold">Clinic settings</Link>
        <Link href="/patients" className="rounded-xl bg-[#c2183a] px-4 py-2.5 text-xs font-semibold text-white">Start patient workflow</Link>
      </div>
    </AppShell>
  );
}
