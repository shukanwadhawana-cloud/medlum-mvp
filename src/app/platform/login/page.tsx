"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await fetch("/api/platform/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json()).catch(() => ({ success: false, error: "Network error" }));
    setBusy(false);
    if (!result.success) { setError(result.error || "Login failed"); return; }
    router.replace("/platform");
  }

  return <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">MedLum Control Plane</div>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Platform Owner Login</h1>
      <p className="mt-2 text-sm text-slate-600">Global MedLum access. This identity is separate from every hospital, clinic, and product user.</p>
      <label className="mt-6 block text-sm font-medium">Email<input autoComplete="username" className="mt-1 w-full rounded-lg border p-3" type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
      <label className="mt-4 block text-sm font-medium">Password<input autoComplete="current-password" className="mt-1 w-full rounded-lg border p-3" type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="mt-6 w-full rounded-lg bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? "Signing in…" : "Sign in to MedLum Control Plane"}</button>
    </form>
  </main>;
}
