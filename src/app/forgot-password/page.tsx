"use client";

import Link from "next/link";
import { useState } from "react";

type Step = "request" | "verify";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<Step>("request");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error(body.error || "Too many attempts. Please wait and try again.");
      if (!res.ok || !body.success) throw new Error(body.error || "Unable to start recovery.");
      setStep("verify");
      setMessage(body.message || "If your account has a linked Telegram identity, a reset code will be sent there.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start recovery. Try again later.");
    } finally { setBusy(false); }
  }

  async function completeReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ identifier: identifier.trim(), code, newPassword: password, confirmPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || "Unable to reset password.");
      setMessage("Password updated successfully. You can now sign in with your new password.");
      setCode(""); setPassword(""); setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The code may have expired. Request a new code and try again.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen medlum-canva-auth flex flex-col">
      <header className="medlum-canva-auth-brand">
        <p className="medlum-canva-eyebrow text-white/60">SECURE ACCOUNT RECOVERY</p>
        <h1>MedLum Healthcare</h1>
        <p className="mt-3 text-white/70 text-sm">Recover access to your staff account.</p>
      </header>
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
        <section className="medlum-canva-auth-card w-full max-w-xl">
          <p className="medlum-canva-eyebrow">PASSWORD HELP</p>
          <h2 className="mt-1">Reset your password</h2>
          <p className="mt-2 text-sm text-gray-500">Use the Staff ID or email associated with your MedLum account.</p>
          {error ? <div role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {message ? <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
          {step === "request" ? (
            <form onSubmit={requestCode} className="mt-7 space-y-4">
              <label className="block text-sm font-medium">
                MedLum Staff ID or email
                <input required value={identifier} onChange={(e) => setIdentifier(e.target.value.trimStart())} autoComplete="username" className="mt-1.5 h-12 w-full rounded-xl border px-4" placeholder="e.g. LB00000001 or you@clinic.com" />
              </label>
              <button disabled={busy} className="w-full h-12 rounded-xl bg-[#c2183a] font-semibold text-white disabled:opacity-60">{busy ? "Checking…" : "Send recovery code"}</button>
              <p className="text-xs leading-relaxed text-gray-500">For your protection, the response does not reveal whether an account exists. Self-service codes are delivered only to a previously linked Telegram account.</p>
            </form>
          ) : (
            <form onSubmit={completeReset} className="mt-7 space-y-4">
              <label className="block text-sm font-medium">
                Six-digit code from Telegram
                <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" className="mt-1.5 h-12 w-full rounded-xl border px-4 tracking-[0.3em]" placeholder="000000" />
              </label>
              <label className="block text-sm font-medium">
                New password
                <div className="relative mt-1.5">
                  <input required minLength={12} maxLength={128} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-12 w-full rounded-xl border px-4 pr-20" placeholder="At least 12 characters" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-3 text-sm font-medium text-[var(--ml-primary)]">{showPassword ? "Hide" : "Show"}</button>
                </div>
              </label>
              <label className="block text-sm font-medium">
                Confirm new password
                <input required minLength={12} maxLength={128} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="mt-1.5 h-12 w-full rounded-xl border px-4" />
              </label>
              <button disabled={busy || code.length !== 6 || password.length < 12 || password !== confirmPassword} className="w-full h-12 rounded-xl bg-[#c2183a] font-semibold text-white disabled:opacity-60">{busy ? "Updating password…" : "Reset password"}</button>
              <button type="button" onClick={() => { setStep("request"); setCode(""); setMessage(""); setError(""); }} className="w-full text-sm font-medium text-[var(--ml-primary)]">Request another code</button>
              <p className="text-xs text-gray-500">The code expires after 10 minutes and can be used only once.</p>
            </form>
          )}
          <p className="mt-7 text-center text-sm text-gray-500">No linked Telegram or cannot access it? Ask your clinic administrator to issue a secure, time-limited staff reset link.</p>
          <p className="mt-4 text-center text-sm"><Link className="font-semibold text-[#c2183a]" href="/login">Back to sign in</Link></p>
        </section>
      </div>
    </main>
  );
}
