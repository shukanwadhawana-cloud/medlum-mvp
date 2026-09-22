"use client";

import { useState } from "react";

type PatientAbha = {
  phone?: string;
  abhaStatus?: string;
  abhaNumber?: string;
  abhaAddress?: string;
  abhaLinkedAt?: string | null;
};

export default function AbhaPatientPanel({
  patientId,
  patient,
  onChanged,
}: {
  patientId: string;
  patient: PatientAbha;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [txnId, setTxnId] = useState("");
  const [abhaNumber, setAbhaNumber] = useState("");
  const [abhaAddress, setAbhaAddress] = useState("");
  const status = patient.abhaStatus || "NOT_LINKED";

  async function startLink() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/interoperability/eka/abha/mobile/init", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ patientId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || "Could not start ABHA linking");
      setTxnId(body.txnId || "");
      setMsg(body.hint || "ABHA authentication started. Complete provider steps, then confirm link.");
      await onChanged();
    } catch (e: any) {
      setErr(e.message || "ABHA init failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLink() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/interoperability/eka/abha/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({
          patientId,
          txnId: txnId || undefined,
          abhaNumber: abhaNumber.trim() || undefined,
          abhaAddress: abhaAddress.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || "Could not confirm ABHA link");
      setMsg("ABHA linked successfully.");
      setTxnId("");
      setAbhaNumber("");
      setAbhaAddress("");
      await onChanged();
    } catch (e: any) {
      setErr(e.message || "ABHA confirm failed");
    } finally {
      setBusy(false);
    }
  }

  const badge =
    status === "LINKED"
      ? "bg-emerald-50 text-emerald-800"
      : status === "PENDING"
        ? "bg-amber-50 text-amber-800"
        : status === "FAILED"
          ? "bg-red-50 text-red-700"
          : "bg-gray-100 text-gray-600";

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-3 py-2 border-b">
        <h3 className="font-semibold text-sm">ABHA / ABDM</h3>
      </div>
      <div className="p-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500">Status</span>
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${badge}`}>{status}</span>
        </div>
        {status === "LINKED" ? (
          <div className="text-xs text-gray-700 space-y-1">
            <p>
              ABHA Number:{" "}
              {patient.abhaNumber
                ? `${String(patient.abhaNumber).slice(0, 4)}••••${String(patient.abhaNumber).slice(-4)}`
                : "—"}
            </p>
            {patient.abhaAddress ? <p>ABHA Address: {patient.abhaAddress}</p> : null}
            {patient.abhaLinkedAt ? (
              <p className="text-gray-500">Linked: {new Date(patient.abhaLinkedAt).toLocaleString()}</p>
            ) : null}
            <p className="text-[10px] text-gray-400">
              ABHA link is identity only — it does not grant consent to share health records.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              Link ABHA via EKA/ABDM when configured. Provider OTP is never stored in MedLum.
            </p>
            {status === "PENDING" && (
              <div className="space-y-2">
                <input
                  value={abhaNumber}
                  onChange={(e) => setAbhaNumber(e.target.value)}
                  placeholder="ABHA number (after provider verification)"
                  className="w-full h-10 rounded-lg border px-3 text-sm"
                />
                <input
                  value={abhaAddress}
                  onChange={(e) => setAbhaAddress(e.target.value)}
                  placeholder="ABHA address (optional)"
                  className="w-full h-10 rounded-lg border px-3 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmLink()}
                  className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium disabled:opacity-50"
                >
                  {busy ? "Confirming…" : "Confirm ABHA link"}
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={busy || !patient.phone}
              onClick={() => void startLink()}
              className="h-9 px-3 rounded-lg border text-xs font-medium disabled:opacity-40"
            >
              {busy ? "Working…" : status === "PENDING" ? "Restart ABHA link" : "Link ABHA"}
            </button>
            {!patient.phone && (
              <p className="text-[11px] text-amber-700">Patient mobile number is required to start ABHA linking.</p>
            )}
          </div>
        )}
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
}
