"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiLogin } from "@/lib/api";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const result = await apiLogin(email, password);
    setBusy(false);
    if (!result.success) { setError(result.error || "Login failed"); return; }
    router.replace("/platform");
  }

  return <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">MedLum Platform</div>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Founder / Team Login</h1>
      <p className="mt-2 text-sm text-slate-600">This area is separate from the normal clinical dashboard.</p>
      <label className="mt-6 block text-sm font-medium">Email<input className="mt-1 w-full rounded-lg border p-3" type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
      <label className="mt-4 block text-sm font-medium">Password<input className="mt-1 w-full rounded-lg border p-3" type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="mt-6 w-full rounded-lg bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? "Signing in…" : "Sign in to Platform"}</button>
    </form>
  </main>;
}
