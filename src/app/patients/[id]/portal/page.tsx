"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

type PortalAccount = {
  id: string;
  phone: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function makePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#$%&*!";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  const chars = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];
  for (let i = 4; i < bytes.length; i++) chars.push(all[bytes[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export default function PatientPortalCredentialsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patient, setPatient] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [password, setPassword] = useState("");
  const [activationUrl, setActivationUrl] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/accounts?patientId=" + encodeURIComponent(id), {
        credentials: "include",
        headers: { "X-MedLum-Requested-With": "MedLum" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Unable to load portal access.");
      setPatient(data.patient);
      setAccount(data.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load portal access.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    load();
  }, [doctor, authLoading, router, load]);

  const createCredentials = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    const generated = makePassword();
    try {
      const res = await fetch("/api/portal/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ patientId: id, password: generated }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not create portal credentials.");
      setPassword(generated);
      setSuccess(data.created ? "Patient portal credentials created." : "Patient portal password reset.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create portal credentials.");
    } finally {
      setSaving(false);
    }
  };

  const createActivationLink = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/portal/accounts/activation-link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ patientId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not create activation link.");
      setActivationUrl(data.activationUrl);
      setSuccess("Patient activation link created. It expires in 24 hours.");
      await navigator.clipboard.writeText(data.activationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create activation link.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setSuccess("Copied to clipboard.");
    setTimeout(() => setSuccess(""), 1800);
  };

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;

  return (
    <AppShell>
      <div className="mb-3">
        <Link href={id ? `/patients/${id}` : "/patients"} className="text-xs text-[#c2183a]">← Back to patient</Link>
      </div>

      {loading ? <div className="p-6 text-center text-gray-400 text-sm">Loading portal access…</div> : !patient ? <div className="p-6 text-center text-red-600 text-sm">{error || "Patient not found."}</div> : (
        <>
          <div className="mb-4">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Patient Portal</p>
            <h2 className="text-xl font-semibold mt-1">{patient.name}</h2>
            <p className="text-xs text-gray-500 mt-1">Registered phone: {patient.phone || "No phone number"}</p>
          </div>

          {error && <div className="mb-3 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
          {success && <div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{success}</div>}

          <div className="bg-white rounded-xl shadow-sm border p-4 mb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">Portal access</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {account ? `Account exists · ${account.status}` : "No portal account exists yet."}
                </p>
                {account?.lastLoginAt && <p className="text-[11px] text-gray-400 mt-1">Last login: {new Date(account.lastLoginAt).toLocaleString()}</p>}
              </div>
              <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${account?.status === "Active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {account?.status || "Not created"}
              </span>
            </div>

            <button
              type="button"
              onClick={createCredentials}
              disabled={saving || !patient.phone.trim()}
              className="mt-4 w-full h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Working…" : "Create Patient Activation Link"}
            </button>
            <p className="text-xs text-gray-500 mt-2">The patient opens the link, creates their own password, and is signed in automatically. No password needs to be shared by clinic staff.</p>
            {!patient.phone.trim() && <p className="text-xs text-red-600 mt-2">Add a patient phone number before creating portal access.</p>}
            {activationUrl && <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <div className="text-xs font-medium mb-2">Activation link</div>
              <div className="flex gap-2">
                <input readOnly value={activationUrl} className="min-w-0 flex-1 h-10 border rounded-lg px-2 text-xs bg-white" />
                <button type="button" onClick={() => copy(activationUrl)} className="px-3 rounded-lg border text-xs bg-white">Copy</button>
              </div>
              <Link href={activationUrl} target="_blank" className="inline-block mt-2 text-xs text-[#c2183a] underline">Open activation page</Link>
            </div>
          </div>

          {password && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-semibold text-sm">Manual login credentials</h3>
              <p className="text-xs text-amber-800 mt-1">Fallback option: save or securely share these credentials with the patient. The password is only shown here after creation.</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">Phone</span>
                  <code className="flex-1 bg-white rounded-lg px-3 py-2 text-sm">{patient.phone}</code>
                  <button type="button" onClick={() => copy(patient.phone)} className="px-2.5 py-2 rounded-lg border text-xs">Copy</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">Password</span>
                  <code className="flex-1 bg-white rounded-lg px-3 py-2 text-sm font-semibold">{password}</code>
                  <button type="button" onClick={() => copy(password)} className="px-2.5 py-2 rounded-lg border text-xs">Copy</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">Login</span>
                  <Link href="/portal/login" target="_blank" className="flex-1 text-[#c2183a] text-xs underline">Open patient portal login</Link>
                  <button type="button" onClick={() => copy(window.location.origin + "/portal/login")} className="px-2.5 py-2 rounded-lg border text-xs">Copy link</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
