"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PortalLogin() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MedLum-Requested-With": "MedLum",
        },
        body: JSON.stringify({ phone, password }),
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to sign in");
      router.replace(j.redirectTo || "/portal/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 shadow-sm"
        aria-label="Patient portal sign in"
      >
        <div className="text-2xl font-bold text-[#140a1f]">MedLum</div>
        <div className="font-semibold mt-1 text-[#140a1f]">Patient Portal</div>
        <p className="text-xs text-gray-500 mt-1 mb-5">
          Securely view your appointments, prescriptions, reports, and bills.
        </p>
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-700" role="alert">
            {error}
          </div>
        )}
        <label className="block text-xs font-medium mb-1" htmlFor="portal-phone">
          Registered mobile number
        </label>
        <input
          id="portal-phone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="username"
          className="w-full h-11 border border-gray-200 rounded-lg px-3 mb-3 text-sm"
          placeholder="Mobile number"
        />
        <label className="block text-xs font-medium mb-1" htmlFor="portal-password">
          Password
        </label>
        <input
          id="portal-password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full h-11 border border-gray-200 rounded-lg px-3 mb-4 text-sm"
          placeholder="Password"
        />
        <button
          disabled={loading}
          type="submit"
          className="w-full h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-[11px] text-gray-400 text-center mt-4">
          Need access? Clinic staff can create your portal login from your patient record.
        </p>
        <p className="text-[11px] text-gray-400 text-center mt-2">
          <Link href="/login" className="text-[#c2183a]">
            Clinician sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
