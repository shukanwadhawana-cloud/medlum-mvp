"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

type Module =
  | "overview"
  | "staff"
  | "leave"
  | "attendance"
  | "shifts"
  | "recruitment"
  | "onboarding"
  | "payroll"
  | "expenses"
  | "performance"
  | "training"
  | "discipline"
  | "compensation";

const modules: { id: Module; label: string; desc: string }[] = [
  { id: "overview", label: "Overview", desc: "Workforce dashboard" },
  { id: "staff", label: "Employees", desc: "Staff directory & lifecycle" },
  { id: "leave", label: "Leave", desc: "Requests, balances & approvals" },
  { id: "attendance", label: "Attendance", desc: "Punches & regularisation" },
  { id: "shifts", label: "Shifts & Roster", desc: "Duty planning" },
  { id: "recruitment", label: "Recruitment", desc: "Candidates & vacancies" },
  { id: "onboarding", label: "Onboarding", desc: "Joining checklist" },
  { id: "payroll", label: "Payroll", desc: "Payroll records & periods" },
  { id: "expenses", label: "Expenses", desc: "Staff claims" },
  { id: "performance", label: "Performance", desc: "Reviews & goals" },
  { id: "training", label: "Learning", desc: "Training & certifications" },
  { id: "discipline", label: "Discipline", desc: "Confidential HR records" },
  { id: "compensation", label: "Compensation", desc: "Salary structures & changes" },
];

const typeFor: Record<string, string> = {
  leave: "Leave request",
  shifts: "Roster entry",
  recruitment: "Candidate",
  onboarding: "Onboarding task",
  payroll: "Payroll period",
  expenses: "Expense claim",
  performance: "Performance review",
  training: "Training record",
  discipline: "HR case",
  compensation: "Compensation change",
};

type FormFields = {
  title: string;
  memberId: string;
  status: string;
  startDate: string;
  endDate: string;
  days: string;
  reason: string;
  leaveType: string;
  shiftName: string;
  ward: string;
  candidateName: string;
  roleApplied: string;
  phone: string;
  task: string;
  dueDate: string;
  period: string;
  amount: string;
  currency: string;
  category: string;
  claimDate: string;
  rating: string;
  goals: string;
  course: string;
  provider: string;
  completedOn: string;
  caseType: string;
  summary: string;
  salary: string;
  effectiveFrom: string;
  notes: string;
};

const emptyForm = (): FormFields => ({
  title: "",
  memberId: "",
  status: "DRAFT",
  startDate: "",
  endDate: "",
  days: "",
  reason: "",
  leaveType: "Annual",
  shiftName: "",
  ward: "",
  candidateName: "",
  roleApplied: "",
  phone: "",
  task: "",
  dueDate: "",
  period: "",
  amount: "",
  currency: "INR",
  category: "",
  claimDate: "",
  rating: "",
  goals: "",
  course: "",
  provider: "",
  completedOn: "",
  caseType: "",
  summary: "",
  salary: "",
  effectiveFrom: "",
  notes: "",
});

function buildData(tab: Module, f: FormFields): Record<string, unknown> {
  const notes = f.notes.trim();
  switch (tab) {
    case "leave":
      return {
        leaveType: f.leaveType,
        startDate: f.startDate || undefined,
        endDate: f.endDate || undefined,
        days: f.days ? Number(f.days) : undefined,
        reason: f.reason.trim() || undefined,
        notes: notes || undefined,
      };
    case "shifts":
      return {
        shiftName: f.shiftName.trim() || undefined,
        ward: f.ward.trim() || undefined,
        startDate: f.startDate || undefined,
        endDate: f.endDate || undefined,
        notes: notes || undefined,
      };
    case "recruitment":
      return {
        candidateName: f.candidateName.trim() || f.title.trim() || undefined,
        roleApplied: f.roleApplied.trim() || undefined,
        phone: f.phone.trim() || undefined,
        notes: notes || undefined,
      };
    case "onboarding":
      return {
        task: f.task.trim() || f.title.trim() || undefined,
        dueDate: f.dueDate || undefined,
        notes: notes || undefined,
      };
    case "payroll":
      return {
        period: f.period.trim() || undefined,
        amount: f.amount ? Number(f.amount) : undefined,
        currency: f.currency || "INR",
        notes: notes || undefined,
      };
    case "expenses":
      return {
        category: f.category.trim() || undefined,
        amount: f.amount ? Number(f.amount) : undefined,
        currency: f.currency || "INR",
        claimDate: f.claimDate || undefined,
        notes: notes || undefined,
      };
    case "performance":
      return {
        rating: f.rating.trim() || undefined,
        goals: f.goals.trim() || undefined,
        notes: notes || undefined,
      };
    case "training":
      return {
        course: f.course.trim() || f.title.trim() || undefined,
        provider: f.provider.trim() || undefined,
        completedOn: f.completedOn || undefined,
        notes: notes || undefined,
      };
    case "discipline":
      return {
        caseType: f.caseType.trim() || undefined,
        summary: f.summary.trim() || undefined,
        notes: notes || undefined,
      };
    case "compensation":
      return {
        salary: f.salary ? Number(f.salary) : undefined,
        currency: f.currency || "INR",
        effectiveFrom: f.effectiveFrom || undefined,
        notes: notes || undefined,
      };
    default:
      return notes ? { notes } : {};
  }
}

function formatData(data: any): string {
  if (!data || typeof data !== "object") return "—";
  if (data.details && typeof data.details === "string") return data.details;
  const parts: string[] = [];
  const push = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === "") return;
    parts.push(`${label}: ${v}`);
  };
  push("Type", data.leaveType || data.caseType);
  push("From", data.startDate);
  push("To", data.endDate);
  push("Days", data.days);
  push("Reason", data.reason);
  push("Shift", data.shiftName);
  push("Ward", data.ward);
  push("Candidate", data.candidateName);
  push("Role", data.roleApplied);
  push("Phone", data.phone);
  push("Task", data.task);
  push("Due", data.dueDate);
  push("Period", data.period);
  push("Category", data.category);
  push("Amount", data.amount != null ? `${data.currency || "INR"} ${data.amount}` : undefined);
  push("Claim date", data.claimDate);
  push("Rating", data.rating);
  push("Goals", data.goals);
  push("Course", data.course);
  push("Provider", data.provider);
  push("Completed", data.completedOn);
  push("Summary", data.summary);
  push("Salary", data.salary != null ? `${data.currency || "INR"} ${data.salary}` : undefined);
  push("Effective", data.effectiveFrom);
  push("Notes", data.notes);
  return parts.length ? parts.join(" · ") : "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "h-10 w-full rounded-lg border px-3 text-sm";
const areaCls = "w-full rounded-lg border px-3 py-2 text-sm";

function ModuleFields({ tab, form, setForm }: { tab: Module; form: FormFields; setForm: (f: FormFields) => void }) {
  const set = (k: keyof FormFields, v: string) => setForm({ ...form, [k]: v });

  if (tab === "leave") {
    return (
      <>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Leave type">
            <select value={form.leaveType} onChange={(e) => set("leaveType", e.target.value)} className={inputCls}>
              <option>Annual</option>
              <option>Sick</option>
              <option>Casual</option>
              <option>Unpaid</option>
              <option>Maternity / Paternity</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Days">
            <input type="number" min={0} step={0.5} value={form.days} onChange={(e) => set("days", e.target.value)} placeholder="e.g. 2" className={inputCls} />
          </Field>
          <Field label="From date">
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="To date">
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Reason">
          <input value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. Family function" className={inputCls} />
        </Field>
      </>
    );
  }

  if (tab === "shifts") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Shift name">
          <input value={form.shiftName} onChange={(e) => set("shiftName", e.target.value)} placeholder="e.g. Morning / Night" className={inputCls} />
        </Field>
        <Field label="Ward / unit">
          <input value={form.ward} onChange={(e) => set("ward", e.target.value)} placeholder="e.g. ICU, General Ward" className={inputCls} />
        </Field>
        <Field label="From date">
          <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
        </Field>
        <Field label="To date">
          <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputCls} />
        </Field>
      </div>
    );
  }

  if (tab === "recruitment") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Candidate name">
          <input value={form.candidateName} onChange={(e) => set("candidateName", e.target.value)} placeholder="Full name" className={inputCls} />
        </Field>
        <Field label="Role applied">
          <input value={form.roleApplied} onChange={(e) => set("roleApplied", e.target.value)} placeholder="e.g. Staff Nurse" className={inputCls} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Mobile number" className={inputCls} />
        </Field>
      </div>
    );
  }

  if (tab === "onboarding") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Task">
          <input value={form.task} onChange={(e) => set("task", e.target.value)} placeholder="e.g. ID card, system access" className={inputCls} />
        </Field>
        <Field label="Due date">
          <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputCls} />
        </Field>
      </div>
    );
  }

  if (tab === "payroll") {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Period">
          <input value={form.period} onChange={(e) => set("period", e.target.value)} placeholder="e.g. Sep 2026" className={inputCls} />
        </Field>
        <Field label="Amount">
          <input type="number" min={0} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" className={inputCls} />
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
            <option>INR</option>
            <option>USD</option>
          </select>
        </Field>
      </div>
    );
  }

  if (tab === "expenses") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Category">
          <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Travel, Uniform" className={inputCls} />
        </Field>
        <Field label="Claim date">
          <input type="date" value={form.claimDate} onChange={(e) => set("claimDate", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Amount">
          <input type="number" min={0} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" className={inputCls} />
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
            <option>INR</option>
            <option>USD</option>
          </select>
        </Field>
      </div>
    );
  }

  if (tab === "performance") {
    return (
      <>
        <Field label="Rating">
          <input value={form.rating} onChange={(e) => set("rating", e.target.value)} placeholder="e.g. Meets expectations / 4 of 5" className={inputCls} />
        </Field>
        <Field label="Goals">
          <textarea value={form.goals} onChange={(e) => set("goals", e.target.value)} rows={2} placeholder="Goals for this period" className={areaCls} />
        </Field>
      </>
    );
  }

  if (tab === "training") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Course / training">
          <input value={form.course} onChange={(e) => set("course", e.target.value)} placeholder="Course name" className={inputCls} />
        </Field>
        <Field label="Provider">
          <input value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Institute or internal" className={inputCls} />
        </Field>
        <Field label="Completed on">
          <input type="date" value={form.completedOn} onChange={(e) => set("completedOn", e.target.value)} className={inputCls} />
        </Field>
      </div>
    );
  }

  if (tab === "discipline") {
    return (
      <>
        <Field label="Case type">
          <input value={form.caseType} onChange={(e) => set("caseType", e.target.value)} placeholder="e.g. Warning, enquiry" className={inputCls} />
        </Field>
        <Field label="Summary">
          <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} rows={3} placeholder="Brief confidential summary" className={areaCls} />
        </Field>
      </>
    );
  }

  if (tab === "compensation") {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Salary / package">
          <input type="number" min={0} value={form.salary} onChange={(e) => set("salary", e.target.value)} placeholder="0" className={inputCls} />
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
            <option>INR</option>
            <option>USD</option>
          </select>
        </Field>
        <Field label="Effective from">
          <input type="date" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} className={inputCls} />
        </Field>
      </div>
    );
  }

  return null;
}

export default function PeoplePage() {
  const [tab, setTab] = useState<Module>("overview");
  const [records, setRecords] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormFields>(emptyForm());
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async (module?: string) => {
    setLoading(true);
    setError("");
    try {
      const url =
        module && module !== "overview" && module !== "staff" && module !== "attendance"
          ? "/api/people?module=" + encodeURIComponent(module)
          : "/api/people";
      const r = await fetch(url, { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load People.");
      setRecords(j.records || []);
      const c: Record<string, number> = {};
      (j.records || []).forEach((x: any) => {
        c[x.module] = (c[x.module] || 0) + 1;
      });
      setCounts(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load People.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const r = await fetch("/api/clinic/staff?status=active", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setStaff(j.members || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load(tab);
    void loadStaff();
  }, [tab, load, loadStaff]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const data = buildData(tab, form);
    const title =
      form.title.trim() ||
      form.candidateName.trim() ||
      form.task.trim() ||
      form.course.trim() ||
      form.shiftName.trim() ||
      typeFor[tab] ||
      "Record";
    const r = await fetch("/api/people", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        module: tab,
        title,
        memberId: form.memberId || null,
        status: form.status,
        recordType: typeFor[tab] || "Record",
        data,
        startAt: form.startDate || form.effectiveFrom || form.dueDate || form.claimDate || null,
        endAt: form.endDate || null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error || "Could not save.");
      return;
    }
    setMessage("People record saved.");
    setShowForm(false);
    setForm(emptyForm());
    void load(tab);
  }

  const current = tab === "overview" ? "overview" : tab;

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <div className="text-xs text-gray-500">
            <Link href="/dashboard" className="text-[#c2183a]">
              Dashboard
            </Link>
            {" · "}People
          </div>
          <h1 className="mt-1 text-2xl font-bold">People</h1>
          <p className="text-sm text-gray-600">
            MedLum workforce & HRIS workspace. Staff, attendance, leave, rostering, recruitment and employee records stay
            facility-scoped.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setTab(m.id);
                setShowForm(false);
                setForm(emptyForm());
              }}
              className={`rounded-xl border p-3 text-left ${
                current === m.id ? "border-[#c2183a] bg-red-50" : "bg-white"
              }`}
            >
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="mt-1 text-[10px] text-gray-500">{m.desc}</div>
            </button>
          ))}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>
        )}

        {tab === "overview" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Active employees" value={String(staff.length)} />
              <Metric label="Leave records" value={String(counts.leave || 0)} />
              <Metric label="Roster records" value={String(counts.shifts || 0)} />
              <Metric label="HR records" value={String(Object.values(counts).reduce((a, b) => a + b, 0))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Card
                title="People modules"
                text="Use the module tabs to manage the employee lifecycle. Existing Staff & Workforce remains available for operational attendance and staff administration."
                href="/workforce"
              />
              <Card
                title="Facility scoped"
                text="Every HRIS record is attached to the active clinic. Client-supplied clinic IDs are never used for authorization."
              />
            </div>
          </>
        )}

        {tab === "staff" && (
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Employees</h2>
                <p className="text-xs text-gray-500">Existing ClinicMember records are the canonical employee identity.</p>
              </div>
              <Link href="/workforce" className="rounded-lg border px-3 py-2 text-xs font-semibold">
                Open Staff Directory
              </Link>
            </div>
            <div className="mt-3 divide-y rounded-xl border">
              {staff.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="font-semibold">{m.doctor?.name}</div>
                    <div className="text-xs text-gray-500">
                      {m.staffCode} · {m.designation || m.role}
                      {m.department ? " · " + m.department : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">Active</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <div className="rounded-2xl border bg-white p-4">
            <h2 className="font-semibold">Attendance</h2>
            <p className="mt-1 text-sm text-gray-600">
              Punch In/Out, geofence and manager attendance board remain on the existing attendance engine.
            </p>
            <Link
              href="/duty"
              className="mt-3 inline-flex rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open Attendance / Duty
            </Link>
          </div>
        )}

        {tab !== "overview" && tab !== "staff" && tab !== "attendance" && (
          <section className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{modules.find((x) => x.id === tab)?.label}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {modules.find((x) => x.id === tab)?.desc}. Records are auditable and facility-scoped.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  if (showForm) setForm(emptyForm());
                }}
                className="rounded-xl bg-[#c2183a] px-3 py-2 text-xs font-semibold text-white"
              >
                {showForm ? "Close" : "Add record"}
              </button>
            </div>

            {showForm && (
              <form onSubmit={save} className="mt-4 space-y-3 rounded-xl border bg-gray-50 p-3">
                <Field label="Staff member">
                  <select
                    value={form.memberId}
                    onChange={(e) => setForm({ ...form, memberId: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Facility-level record</option>
                    {staff.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.doctor?.name} · {m.staffCode}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Title">
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder={
                      tab === "leave"
                        ? "e.g. Annual leave – Oct"
                        : tab === "recruitment"
                          ? "e.g. Staff Nurse vacancy"
                          : "Short title for this record"
                    }
                    className={inputCls}
                  />
                </Field>

                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className={inputCls}
                  >
                    <option>DRAFT</option>
                    <option>PENDING</option>
                    <option>APPROVED</option>
                    <option>REJECTED</option>
                    <option>COMPLETED</option>
                    <option>CANCELLED</option>
                  </select>
                </Field>

                <ModuleFields tab={tab} form={form} setForm={setForm} />

                <Field label="Notes (optional)">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="Any extra details in plain language"
                    className={areaCls}
                  />
                </Field>

                <button type="submit" className="h-10 w-full rounded-lg bg-[#140a1f] text-sm font-semibold text-white">
                  Save
                </button>
              </form>
            )}

            {loading ? (
              <div className="py-6 text-sm text-gray-500">Loading…</div>
            ) : records.length === 0 ? (
              <div className="py-6 text-sm text-gray-500">No records yet for this module.</div>
            ) : (
              <div className="mt-4 divide-y rounded-xl border">
                {records.map((r: any) => (
                  <div key={r.id} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{r.title}</div>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px]">{r.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {r.member?.doctor?.name || "Facility"}
                      {r.member?.staffCode ? ` · ${r.member.staffCode}` : ""} ·{" "}
                      {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </div>
                    <p className="mt-2 text-xs text-gray-700">{formatData(r.data)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Card({ title, text, href }: { title: string; text: string; href?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-gray-600">{text}</p>
      {href && (
        <Link href={href} className="mt-3 inline-block text-xs font-semibold text-[#c2183a]">
          Open →
        </Link>
      )}
    </div>
  );
}
