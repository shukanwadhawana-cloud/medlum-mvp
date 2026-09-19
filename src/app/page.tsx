"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useDoctor } from "@/components/DoctorProvider";

export default function Home() {
  const { doctor, loading } = useDoctor();

  useEffect(() => {
    // Authenticated clinical users still go directly to their workspace.
    if (!loading && doctor) {
      window.location.replace("/dashboard");
    }
  }, [doctor, loading]);

  if (loading || doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">
        Loading MedLum...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#140a1f] text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tight">MedLum</h1>
          <p className="mt-3 text-lg text-red-200/90">Clinical Intelligence</p>
          <p className="mt-4 text-white/70 max-w-xl mx-auto">
            Secure access for clinical teams and a dedicated, separate portal for patients.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-2xl">
            <div className="text-sm font-semibold text-[#c2183a] uppercase tracking-wide">
              Clinical workspace
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Doctors, Staff & Admin</h2>
            <p className="mt-3 text-gray-500">
              Sign in to manage patients, prescriptions, clinical workflows and the MedLum platform.
            </p>
            <Link
              href="/login"
              className="mt-8 flex h-12 items-center justify-center rounded-xl bg-[#c2183a] text-white font-semibold hover:opacity-90"
            >
              Doctor / Staff / Admin Login
            </Link>
          </section>

          <section className="rounded-3xl border border-white/15 bg-white/10 p-8 backdrop-blur">
            <div className="text-sm font-semibold text-red-200 uppercase tracking-wide">
              Patient access
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Patient Portal</h2>
            <p className="mt-3 text-white/70">
              Access appointments, telemedicine and your patient information through the separate portal.
            </p>
            <Link
              href="/portal/login"
              className="mt-8 flex h-12 items-center justify-center rounded-xl border border-white/30 bg-white text-[#140a1f] font-semibold hover:bg-white/90"
            >
              Patient Portal Login
            </Link>
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-white/40">
          Patient and clinical authentication remain separate.
        </p>
      </div>
    </main>
  );
}
