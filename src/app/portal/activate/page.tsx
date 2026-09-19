"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ActivatePortal() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const r = await fetch("/api/portal/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Unable to activate portal.");
      router.replace("/portal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to activate portal.");
    } finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
    <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border p-6 shadow-sm">
      <div className="text-2xl font-bold text-[#140a1f]">MedLum</div>
      <div className="font-semibold mt-1">Activate Patient Portal</div>
      <p className="text-xs text-gray-500 mt-1 mb-5">Create your private password to activate your portal.</p>
      {!token && <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">Invalid activation link.</div>}
      {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <label className="block text-xs font-medium mb-1">New password</label>
      <input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" className="w-full h-11 border rounded-lg px-3 mb-3" />
      <label className="block text-xs font-medium mb-1">Confirm password</label>
      <input required minLength={8} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" className="w-full h-11 border rounded-lg px-3 mb-4" />
      <button disabled={loading || !token} className="w-full h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50">{loading ? "Activating…" : "Activate Portal"}</button>
    </form>
  </main>;
}
