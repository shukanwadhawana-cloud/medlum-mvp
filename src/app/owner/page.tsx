"use client";

import Link from "next/link";
import { useDoctor } from "@/components/DoctorProvider";

export default function OwnerHomePage() {
  const { doctor, logout, loading } = useDoctor();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f5f5f7] text-sm text-gray-500">Loading…</div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f5f5f7]">
        <Link href="/login" className="text-[#c2183a] font-medium">
          Sign in
        </Link>
      </div>
    );
  }

  const isOwner = Boolean(doctor.isOwner || doctor.primaryRole === "Owner");

  return (
    <div className="min-h-screen bg-[#140a1f] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <div className="text-lg font-bold">MedLum Owner</div>
            <div className="text-xs text-white/60">Platform control — not a clinic OPD session</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs text-red-200 hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/70">Signed in as</p>
          <p className="mt-1 text-xl font-semibold">{doctor.name}</p>
          <p className="text-sm text-white/60">{doctor.email}</p>
          <p className="mt-2 inline-block rounded-full bg-[#c2183a]/30 px-3 py-1 text-xs font-medium text-red-100">
            {isOwner ? "Platform owner / founder" : "Clinic account"}
          </p>
        </div>

        {!isOwner && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            This email is not marked as MedLum owner. Set <code className="text-xs">MEDLUM_OWNER_EMAIL</code> on
            Render to your email, or use the founder account.
          </div>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">Owner actions</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <Link
                href="/pricing"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
              >
                <span>Pricing & subscription catalog</span>
                <span className="text-white/40">›</span>
              </Link>
            </li>
            <li>
              <Link
                href="/help"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
              >
                <span>Help center</span>
                <span className="text-white/40">›</span>
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
              >
                <span>Open clinical workspace (optional)</span>
                <span className="text-white/40">›</span>
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-xs text-white/45">
            Clinical OPD is for doctors treating patients. Your default home as owner is this page so you are not stuck
            inside a clinic session when switching roles.
          </p>
        </section>
      </main>
    </div>
  );
}
