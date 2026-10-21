"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fromFragment = window.location.hash.startsWith("#token=") ? window.location.hash.slice(7) : "";
    setToken(fromFragment);
    // Keep the one-time secret out of the address bar after reading it.
    if (fromFragment) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 12) {
      setError("Your new password must be at least 12 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match. Please enter the same password in both fields.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ token, newPassword: password, confirmPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || "This reset link may have expired.");
      setMessage("Password changed successfully. Sign in with your new password.");
      setToken(""); setPassword(""); setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password. Request a new link.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen medlum-canva-auth flex flex-col">
      <header className="medlum-canva-auth-brand">
        <p className="medlum-canva-eyebrow text-white/60">SECURE STAFF RECOVERY</p>
        <h1>MedLum Health</h1>
        <p className="mt-3 text-white/70 text-sm">Complete your password reset.</p>
      </header>
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
        <section className="medlum-canva-auth-card w-full max-w-xl">
          <p className="medlum-canva-eyebrow">SET NEW PASSWORD</p>
          <h2 className="mt-1">Choose a new password</h2>
          {error ? <div role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {message ? <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
          {!message ? (
            token ? (
              <form onSubmit={submit} className="mt-7 space-y-4">
                <label className="block text-sm font-medium">
                  New password
                  <span className="mt-1 block text-xs font-normal text-gray-500">Use at least 12 characters. Both password fields must match.</span>
                  <div className="relative mt-1.5">
                    <input required minLength={12} maxLength={128} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-12 w-full rounded-xl border px-4 pr-20" placeholder="At least 12 characters" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-3 text-sm font-medium text-[var(--ml-primary)]">{showPassword ? "Hide" : "Show"}</button>
                  </div>
                </label>
                <label className="block text-sm font-medium">
                  Confirm new password
                  <input required minLength={12} maxLength={128} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="mt-1.5 h-12 w-full rounded-xl border px-4" />
                </label>
                <button type="submit" disabled={busy} aria-describedby="reset-password-requirements" className="w-full h-12 rounded-xl bg-[#c2183a] font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy ? "Updating password…" : "Reset password"}</button>
                <p id="reset-password-requirements" className="text-xs text-gray-500">Minimum 12 characters. After a successful reset, sign in using this new password.</p>
              </form>
            ) : (
              <p className="mt-6 text-sm text-gray-600">This reset link is missing or invalid. Ask your clinic administrator for a new link.</p>
            )
          ) : null}
          <p className="mt-6 text-center text-sm"><Link className="font-semibold text-[#c2183a]" href="/login">Back to sign in</Link></p>
        </section>
      </div>
    </main>
  );
}
