"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiLogin, apiVerifyOtp } from "@/lib/api";
import { useDoctor } from "@/components/DoctorProvider";

export default function LoginPage() {
  const router = useRouter();
  const { setDoctor } = useDoctor();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [otpExpiry, setOtpExpiry] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [linkStep, setLinkStep] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finishLogin = (doctor: any, isOwner?: boolean) => {
    setDoctor(doctor);
    if (isOwner || doctor.isOwner) router.push("/owner");
    else router.push("/dashboard");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await apiLogin(email, password);
      if (result.success && result.requiresOtp && result.challengeId && result.doctor) {
        setDoctorId(result.doctor.id);
        setChallengeId(result.challengeId);
        setOtpExpiry(result.expiresAt || "");
        setDeliveryChannel(result.deliveryChannel || "telegram");
        setOtpStep(true);
        return;
      }
      if (result.success && result.doctor) finishLogin(result.doctor, result.isOwner);
      else
        setError(
          result.error ||
            (result.requiresTelegramLink
              ? "Link Telegram to this account before privileged login."
              : "Invalid email or password")
        );
    } catch {
      setError("Unable to reach server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramLink = async () => {
    setError("");
    setLinkLoading(true);
    try {
      const res = await fetch("/api/auth/telegram/prelink", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        setError(result.error || "Unable to start Telegram linking.");
        return;
      }
      if (result.alreadyLinked) {
        setError("Telegram is already linked. You can sign in now.");
        return;
      }
      setLinkUrl(result.deepLink || "");
      setLinkStep(true);
    } catch {
      setError("Unable to reach server. Check your connection.");
    } finally {
      setLinkLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await apiVerifyOtp({ doctorId, challengeId, code: otp });
      if (result.success && result.doctor) finishLogin(result.doctor, result.doctor.isOwner);
      else setError(result.error || "Invalid verification code");
    } catch {
      setError("Unable to verify the code. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-[42%] bg-gradient-to-b from-[#8B1538] to-[#140a1f] flex-col justify-between p-12">
        <div>
          <h1 className="text-4xl font-bold text-white">MedLum</h1>
          <p className="mt-3 text-white/70 text-sm leading-relaxed">Hospital & clinic operations — secure privileged access.</p>
        </div>
        <p className="text-white/40 text-xs">OTP for Owner / Admin / Manager is delivered on Telegram.</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-[#140a1f]">Sign in</h2>
          <p className="mt-1 text-sm text-gray-500">Doctor and hospital staff access</p>
          {otpStep ? (
            <form onSubmit={handleOtpSubmit} className="mt-10 space-y-5">
              {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
              <div>
                <label className="block text-sm font-medium mb-1.5">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 tracking-[0.35em] text-center text-lg"
                  placeholder="123456"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <p className="text-sm text-gray-500">
                Verification code sent to Telegram
                {otpExpiry ? " · Expires at " + new Date(otpExpiry).toLocaleTimeString() : ""}.
              </p>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full h-12 rounded-xl bg-[#c2183a] text-white font-semibold disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpStep(false);
                  setOtp("");
                  setChallengeId("");
                  setDoctorId("");
                  setError("");
                }}
                className="w-full text-sm text-[#c2183a] font-medium"
              >
                Back to password
              </button>
            </form>
          ) : linkStep ? (
            <div className="mt-10 space-y-5">
              {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
              <div className="rounded-2xl border border-gray-200 p-5 bg-gray-50">
                <h3 className="font-semibold text-[#140a1f]">Connect Telegram</h3>
                <p className="mt-2 text-sm text-gray-600">Tap the button below, then press <b>Start</b> in the MedLum Login bot. Your Telegram account will be linked to this MedLum account.</p>
              </div>
              {linkUrl && <a href={linkUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center w-full h-12 rounded-xl bg-[#229ED9] text-white font-semibold">Open Telegram & Connect</a>}
              <button type="button" onClick={() => { setLinkStep(false); setLinkUrl(""); setError(""); }} className="w-full text-sm text-[#c2183a] font-medium">Back to login</button>
              <p className="text-xs text-gray-500 text-center">After Telegram says connected, return here and sign in again.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-10 space-y-5">
              {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200"
                  placeholder="you@clinic.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-[#c2183a] text-white font-semibold disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <button type="button" onClick={handleTelegramLink} disabled={linkLoading || loading || !email || !password} className="w-full h-12 rounded-xl border border-[#229ED9] text-[#1688bd] font-semibold disabled:opacity-50">
                {linkLoading ? "Preparing Telegram..." : "Connect Telegram before signing in"}
              </button>
              <p className="text-xs text-gray-500 text-center">Required once for Owner / Admin / Manager accounts.</p>
            </form>
          )}
          <div className="mt-8 space-y-3 text-center text-sm">
            <p className="text-gray-500">
              New doctor?{" "}
              <Link href="/signup" className="text-[#c2183a] font-medium">
                Create an account
              </Link>
            </p>
            <p>
              <Link href="/portal/login" className="text-[#c2183a] font-semibold">
                Patient? Sign in to the Patient Portal →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
