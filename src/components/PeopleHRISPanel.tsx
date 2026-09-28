import { useEffect, useState } from "react";

const MODULES = [
  ["HRIS", "People directory, employee profiles, organisation structure and documents"],
  ["Lifecycle", "Hire, confirmation, promotion, transfer, exit and rehire"],
  ["Recruit", "Jobs, candidates, screening and offers"],
  ["Onboarding", "Pre-joining tasks, Day-1 checklist and surveys"],
  ["Attendance", "Punches, exceptions, regularisation and reports"],
  ["Leave", "Leave types, balances, requests, approvals and holidays"],
  ["Shifts & Rosters", "Shift templates, rosters, overtime and coverage"],
  ["Payroll", "Payroll inputs, payslips and statutory checklist"],
  ["Expenses", "Claims, receipts, approvals and reimbursement"],
  ["Performance", "Goals, OKR/MBO/BSC, feedback and appraisal cycles"],
  ["Learning", "Courses, assignments, completion and grading"],
  ["Career & Skills", "Skills matrix, gaps and development plans"],
  ["Succession", "Critical roles, talent pools and readiness"],
  ["Discipline & Ethics", "Cases, investigation, action, appeal and audit"],
  ["Compensation", "Salary changes, increments and compensation events"],
  ["Analytics", "Headcount, absenteeism, leave utilisation and attrition"],
  ["Collaboration", "Announcements, tasks, appreciation and HR requests"],
] as const;

type RequestRow = {
  id: string; staffName: string; staffCode: string; requestType: string;
  status: string; dayDate: string; reason: string; createdAt: string;
};

export default function PeopleHRISPanel() {
  const [openModule, setOpenModule] = useState("HRIS");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [requestType, setRequestType] = useState<"LEAVE" | "REGULARIZE">("LEAVE");
  const [dayDate, setDayDate] = useState("");
  const [reason, setReason] = useState("");
  const [requestedInAt, setRequestedInAt] = useState("");
  const [requestedOutAt, setRequestedOutAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRequests() {
    try {
      const res = await fetch("/api/duty/requests?scope=all", { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setRequests(body.requests || []);
    } catch {}
  }

  useEffect(() => { void loadRequests(); }, []);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const payload: Record<string, string> = { requestType, dayDate, reason };
      if (requestType === "REGULARIZE") {
        if (requestedInAt) payload.requestedInAt = new Date(requestedInAt).toISOString();
        if (requestedOutAt) payload.requestedOutAt = new Date(requestedOutAt).toISOString();
      }
      const res = await fetch("/api/duty/requests", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not submit request.");
      setMessage("Request submitted for approval.");
      setReason(""); setRequestedInAt(""); setRequestedOutAt("");
      await loadRequests();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit request."); }
    finally { setBusy(false); }
  }

  async function review(id: string, action: "APPROVE" | "REJECT") {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/duty/requests", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update request.");
      setMessage(`Request ${action === "APPROVE" ? "approved" : "rejected"}.`);
      await loadRequests();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update request."); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">People · HRIS</h2>
            <p className="mt-1 text-xs text-gray-500">The People workspace retains the complete workforce architecture while the operational Staff, Attendance and Records tools remain below.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold">FACILITY-SCOPED</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(([name, description]) => (
            <button key={name} type="button" onClick={() => setOpenModule(name)}
              className={`rounded-xl border p-3 text-left transition ${openModule === name ? "border-[#c2183a] ring-2 ring-[#c2183a]/15" : "hover:border-gray-400"}`}>
              <div className="text-sm font-semibold">{name}</div>
              <div className="mt-1 text-[11px] leading-4 text-gray-500">{description}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <div className="text-sm font-semibold">{openModule}</div>
          <p className="mt-1 text-xs text-gray-600">{MODULES.find(([name]) => name === openModule)?.[1]}</p>
          {openModule !== "Leave" && openModule !== "Attendance" && (
            <p className="mt-2 text-[11px] text-gray-500">Module is retained in the People architecture and uses the persisted WorkforceRecord/audit model. Detailed workflows can be added without changing the clinical or staff architecture.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={submitRequest} className="rounded-2xl border bg-white p-4">
          <h3 className="font-semibold">Leave & attendance requests</h3>
          <p className="mt-1 text-xs text-gray-500">Employee self-service with Owner/Admin/Manager approval and audit trail.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select value={requestType} onChange={e => setRequestType(e.target.value as "LEAVE" | "REGULARIZE")} className="h-10 rounded-lg border px-2 text-sm">
              <option value="LEAVE">Leave request</option><option value="REGULARIZE">Attendance regularisation</option>
            </select>
            <input required type="date" value={dayDate} onChange={e => setDayDate(e.target.value)} className="h-10 rounded-lg border px-2 text-sm" />
            {requestType === "REGULARIZE" && <><input type="datetime-local" value={requestedInAt} onChange={e => setRequestedInAt(e.target.value)} className="h-10 rounded-lg border px-2 text-sm" placeholder="Requested IN" /><input type="datetime-local" value={requestedOutAt} onChange={e => setRequestedOutAt(e.target.value)} className="h-10 rounded-lg border px-2 text-sm" /></>}
          </div>
          <textarea required minLength={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" rows={3} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" />
          <button disabled={busy} className="mt-2 w-full rounded-lg bg-[#140a1f] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Submit request"}</button>
          {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </form>

        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Requests & approvals</h3><button type="button" onClick={() => void loadRequests()} className="text-xs text-[#c2183a]">Refresh</button></div>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto">
            {requests.length === 0 ? <p className="rounded-lg bg-gray-50 p-4 text-xs text-gray-500">No leave or regularisation requests yet.</p> : requests.map(r => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-medium">{r.requestType === "LEAVE" ? "Leave" : "Regularisation"} · {r.staffName}</div><div className="text-[11px] text-gray-500">{r.staffCode} · {r.dayDate} · {r.reason}</div></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px]">{r.status}</span></div>
                {r.status === "PENDING" && <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => void review(r.id, "APPROVE")} className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white">Approve</button><button type="button" disabled={busy} onClick={() => void review(r.id, "REJECT")} className="rounded-lg border px-3 py-1.5 text-xs">Reject</button></div>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
