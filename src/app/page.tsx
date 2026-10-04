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
      <div className="min-h-screen flex items-center justify-center bg-[var(--ml-canvas)] text-[var(--ml-ink)] text-sm">
        Loading MedLum...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#140a1f] text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tight">MedLum</h1>
          <p className="mt-3 text-lg text-[var(--ml-primary)]">Clinical Intelligence</p>
          <p className="mt-4 text-[var(--ml-muted)] max-w-xl mx-auto">
            Secure access for clinical teams and a dedicated, separate portal for patients.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-[var(--ml-border)] bg-white p-8 text-gray-900 shadow-[var(--ml-shadow)]">
            <div className="text-sm font-semibold text-[var(--ml-primary)] uppercase tracking-wide">
              Clinical workspace
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Doctors, Staff & Admin</h2>
            <p className="mt-3 text-gray-500">
              Sign in to manage patients, prescriptions, clinical workflows and the MedLum platform.
            </p>
            <Link
              href="/login"
              className="mt-8 flex h-12 items-center justify-center medlum-primary rounded-xl text-white font-semibold"
            >
              Doctor / Staff / Admin Login
            </Link>
          </section>

          <section className="rounded-2xl border border-[var(--ml-border)] bg-white p-8">
            <div className="text-sm font-semibold text-[var(--ml-primary)] uppercase tracking-wide">
              Patient access
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Patient Portal</h2>
            <p className="mt-3 text-[var(--ml-muted)]">
              Access appointments, telemedicine and your patient information through the separate portal.
            </p>
            <Link
              href="/portal/login"
              className="mt-8 flex h-12 items-center justify-center rounded-xl border border-[var(--ml-border)] bg-slate-50 text-[var(--ml-ink)] font-semibold hover:bg-slate-100"
            >
              Patient Portal Login
            </Link>
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Patient and clinical authentication remain separate.
        </p>
      </div>
    </main>
  );
}
