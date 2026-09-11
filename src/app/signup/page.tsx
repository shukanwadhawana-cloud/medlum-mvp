"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    clinicName: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = signup(form);
    setLoading(false);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Signup failed");
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
            Join MedLum and run your practice with complete data isolation and professional tools built for doctors.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#f5f5f7] px-6 py-12">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-semibold text-[#1a1a1f]">Create account</h2>
          <p className="mt-2 text-[#6b6b75]">Start your secure clinical workspace</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Full Name</label>
              <input name="name" required value={form.name} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40" placeholder="Dr. Sharma" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input name="email" type="email" required value={form.email} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40" placeholder="doctor@clinic.com" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40" placeholder="Min. 8 characters" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Clinic Name</label>
              <input name="clinicName" required value={form.clinicName} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40" placeholder="Sharma Clinic" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Phone</label>
              <input name="phone" required value={form.phone} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40" placeholder="+91 98XXXXXX" />
            </div>

            <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-[#c2183a] hover:bg-[#9e1430] text-white font-semibold transition disabled:opacity-60 mt-2">
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#6b6b75]">
            Already have an account?{" "}
            <Link href="/login" className="text-[#c2183a] font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
