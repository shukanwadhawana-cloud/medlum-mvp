"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiSignup } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", clinicName: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await apiSignup(form);
      if (result.success) router.push("/dashboard");
      else setError(result.error || "Signup failed");
    } catch {
      setError("Unable to reach server. Ensure DATABASE_URL is configured.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-[42%] bg-gradient-to-b from-[#8B1538] to-[#140a1f] flex-col justify-between p-12">
        <div>
          <h1 className="text-4xl font-bold text-white">MedLum</h1>
          <p className="mt-3 text-red-200/90 text-lg">Clinical Intelligence</p>
        </div>
        <p className="text-white/80 text-lg max-w-sm">Join and run your practice with complete data isolation.</p>
      </div>
      <div className="flex-1 flex items-center justify-center bg-[#f5f5f7] px-6 py-12">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-semibold">Create account</h2>
          <p className="mt-2 text-gray-500">Start your secure clinical workspace</p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
            <input name="name" required value={form.name} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Full Name" />
            <input name="email" type="email" required value={form.email} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Email" />
            <input name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Password (min 8)" />
            <input name="clinicName" required value={form.clinicName} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Clinic Name" />
            <input name="phone" required value={form.phone} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Phone" />
            <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-[#c2183a] text-white font-semibold disabled:opacity-60">
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account? <Link href="/login" className="text-[#c2183a] font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
