"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiSignup } from "@/lib/api";
import { useDoctor } from "@/components/DoctorProvider";

const initialForm = {
  name: "", email: "", password: "", clinicName: "", phone: "",
  facilityType: "CLINIC" as "HOSPITAL" | "CLINIC", subscriptionModel: "BOTH" as "OPD" | "IPD" | "BOTH",
  licenseNumber: "", registrationNumber: "", ownerName: "", doctorInCharge: "",
  address: "", city: "", state: "", pincode: "",
};

export default function SignupPage() {
  const router = useRouter();
  const { setDoctor } = useDoctor();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const result = await apiSignup(form);
      if (result.success && result.doctor) { setDoctor(result.doctor); router.push("/dashboard"); }
      else setError(result.error || "Signup failed");
    } catch { setError("Unable to reach server. Database may not be configured."); }
    finally { setLoading(false); }
  };
  return <div className="min-h-screen flex">
    <div className="hidden lg:flex w-[42%] bg-gradient-to-b from-[#8B1538] to-[#140a1f] flex-col justify-between p-12">
      <div><h1 className="text-4xl font-bold text-white">MedLum</h1><p className="mt-3 text-red-200/90 text-lg">Clinical Intelligence</p></div>
      <p className="text-white/80 text-lg max-w-sm">Set up the right MedLum clinical workspace from day one. Your OPD/IPD subscription determines which workflows are available.</p>
    </div>
    <div className="flex-1 flex items-center justify-center bg-[#f5f5f7] px-6 py-10">
      <div className="w-full max-w-2xl">
        <h2 className="text-3xl font-semibold">Create your MedLum workspace</h2>
        <p className="mt-2 text-gray-500">Complete the initial clinic/hospital registration before entering the clinical system.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
          <section className="rounded-2xl bg-white border p-4 sm:p-5"><h3 className="font-semibold">1. Account</h3><div className="grid sm:grid-cols-2 gap-3 mt-3"><input name="name" required value={form.name} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Your full name *"/><input name="phone" required value={form.phone} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Phone *"/><input name="email" type="email" required value={form.email} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Email *" autoComplete="email"/><input name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Password (min 8) *" autoComplete="new-password"/></div></section>
          <section className="rounded-2xl bg-white border p-4 sm:p-5"><h3 className="font-semibold">2. Choose your clinical product</h3><p className="mt-1 text-xs text-gray-500">This is the access boundary for this clinic. OPD-only users do not receive IPD access; IPD-only users do not receive OPD access. A combined hospital can select BOTH.</p><div className="grid sm:grid-cols-3 gap-2 mt-4">{(["OPD", "IPD", "BOTH"] as const).map((value) => <label key={value} className={`cursor-pointer rounded-xl border p-3 ${form.subscriptionModel === value ? "border-[#c2183a] bg-[#c2183a]/5" : "border-gray-200"}`}><input type="radio" name="subscriptionModel" value={value} checked={form.subscriptionModel === value} onChange={handleChange} className="mr-2"/><span className="font-medium">{value === "BOTH" ? "OPD + IPD" : value}</span><span className="block mt-1 text-[11px] text-gray-500">{value === "OPD" ? "Outpatient / clinic workflow" : value === "IPD" ? "Inpatient / hospital workflow" : "Combined hospital setup"}</span></label>)}</div></section>
          <section className="rounded-2xl bg-white border p-4 sm:p-5"><h3 className="font-semibold">3. Clinic / hospital registration</h3><div className="grid sm:grid-cols-2 gap-3 mt-3"><label className="text-xs font-medium text-gray-600">Facility type<select name="facilityType" value={form.facilityType} onChange={handleChange} className="mt-1 w-full h-11 px-3 rounded-xl border text-sm"><option value="CLINIC">Clinic / practice</option><option value="HOSPITAL">Hospital / nursing home</option></select></label><input name="clinicName" required value={form.clinicName} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Clinic / hospital name *"/><input name="ownerName" required value={form.ownerName} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Owner / proprietor name *"/><input name="doctorInCharge" required value={form.doctorInCharge} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="Doctor in charge / medical director *"/><input name="licenseNumber" required={form.facilityType === "HOSPITAL"} value={form.licenseNumber} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder={form.facilityType === "HOSPITAL" ? "Hospital license number *" : "License / registration number"}/><input name="registrationNumber" required={form.facilityType === "HOSPITAL"} value={form.registrationNumber} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder={form.facilityType === "HOSPITAL" ? "Hospital registration number *" : "Clinic registration number"}/><input name="address" required value={form.address} onChange={handleChange} className="sm:col-span-2 w-full h-11 px-4 rounded-xl border" placeholder="Full facility address *"/><input name="city" required value={form.city} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="City *"/><input name="state" required value={form.state} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="State *"/><input name="pincode" required value={form.pincode} onChange={handleChange} className="w-full h-11 px-4 rounded-xl border" placeholder="PIN code *"/></div><p className="mt-3 text-[11px] text-gray-400">For a hospital setup, license and registration details are required before the workspace is activated.</p></section>
          <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-[#c2183a] text-white font-semibold disabled:opacity-60">{loading ? "Creating secure workspace…" : "Create Workspace"}</button>
        </form>
        <p className="mt-5 text-center text-sm text-gray-500">Already have an account? <Link href="/login" className="text-[#c2183a] font-medium">Sign in</Link></p>
      </div>
    </div>
  </div>;
}
