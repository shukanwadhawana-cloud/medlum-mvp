"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = login(email, password);
    setLoading(false);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-[42%] bg-gradient-to-b from-[#8B1538] to-[#140a1f] flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-red-500/40 blur-3xl" />
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">MedLum</h1>
          <p className="mt-3 text-red-200/90 text-lg">Clinical Intelligence</p>
        </div>
        <div className="relative z-10">
          <p className="text-white/80 text-lg leading-relaxed max-w-sm">
            Secure multi-doctor platform for modern clinical practice. Your patients, your data — completely isolated.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#f5f5f7] px-6">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-semibold text-[#1a1a1f]">Welcome back</h2>
          <p className="mt-2 text-[#6b6b75]">Sign in to your clinical workspace</p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#1a1a1f] mb-1.5">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40 focus:border-[#c2183a] transition"
                placeholder="doctor@clinic.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1a1a1f] mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40 focus:border-[#c2183a] transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#c2183a] hover:bg-[#9e1430] text-white font-semibold transition disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[#6b6b75]">
            New doctor?{" "}
            <Link href="/signup" className="text-[#c2183a] font-medium hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
