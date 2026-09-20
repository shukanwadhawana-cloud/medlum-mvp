"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

const sections = [
  {
    title: "Account",
    items: [
      { href: "/pricing", label: "Pricing & plans", desc: "Pilot, Professional, Clinic Plus — auto-renew" },
      { href: "/help", label: "Help center & FAQs", desc: "Video audio tips, subscription, clinic use" },
    ],
  },
  {
    title: "Clinic modules",
    items: [
      { href: "/billing", label: "Patient billing", desc: "Invoices and payments" },
      { href: "/blood-bank", label: "Blood bank", desc: "Inventory and requests" },
      { href: "/insurance", label: "Insurance", desc: "Policies and claims" },
      { href: "/reports", label: "Reports", desc: "Operational reports" },
      { href: "/prescriptions", label: "Prescriptions", desc: "Rx list" },
      { href: "/clinic", label: "Clinic settings", desc: "Members and clinic profile" },
      { href: "/clinical-assist", label: "AI Assist", desc: "Clinical assistance" },
      { href: "/telemedicine", label: "Video consults", desc: "Start or join telemedicine" },
    ],
  },
];

export default function MorePage() {
  const { doctor, logout } = useDoctor();
  const [tg, setTg] = useState<{
    linked: boolean;
    telegramUsername: string | null;
    loading: boolean;
    error: string;
    deepLink: string;
  }>({
    linked: false,
    telegramUsername: null,
    loading: true,
    error: "",
    deepLink: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/telegram/link", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 403 || res.status === 401) {
          setTg((s) => ({ ...s, loading: false }));
          return;
        }
        setTg((s) => ({
          ...s,
          loading: false,
          linked: Boolean(data.linked),
          telegramUsername: data.telegramUsername || null,
        }));
      } catch {
        if (!cancelled) setTg((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connectTelegram = async () => {
    setTg((s) => ({ ...s, error: "", loading: true }));
    try {
      const res = await fetch("/api/auth/telegram/link", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setTg((s) => ({ ...s, loading: false, error: data.error || "Unable to start Telegram linking." }));
        return;
      }
      setTg((s) => ({ ...s, loading: false, deepLink: data.deepLink || "" }));
      if (data.deepLink) window.open(data.deepLink, "_blank", "noopener,noreferrer");
    } catch {
      setTg((s) => ({ ...s, loading: false, error: "Unable to reach server." }));
    }
  };

  const unlinkTelegram = async () => {
    if (!confirm("Unlink Telegram from this account? Privileged login will require linking again.")) return;
    setTg((s) => ({ ...s, error: "", loading: true }));
    try {
      const res = await fetch("/api/auth/telegram/link", { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTg((s) => ({ ...s, loading: false, error: data.error || "Unable to unlink." }));
        return;
      }
      setTg({ linked: false, telegramUsername: null, loading: false, error: "", deepLink: "" });
    } catch {
      setTg((s) => ({ ...s, loading: false, error: "Unable to reach server." }));
    }
  };

  return (
    <AppShell>
      <div className="mb-4">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-bold">More</h1>
        <p className="mt-1 text-sm text-gray-600">Pricing, help, FAQs, modules, and account.</p>
        {doctor && (
          <p className="mt-1 text-xs text-gray-500">
            Signed in as <span className="font-medium text-[#140a1f]">{doctor.name || doctor.email}</span>
          </p>
        )}
      </div>

      {sections.map((sec) => (
        <section key={sec.title} className="mb-4 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {sec.title}
          </div>
          <ul className="divide-y">
            {sec.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex items-center justify-between gap-3 px-4 py-3.5 active:bg-gray-50">
                  <div>
                    <div className="text-sm font-medium text-[#140a1f]">{item.label}</div>
                    <div className="text-xs text-gray-500">{item.desc}</div>
                  </div>
                  <span className="text-gray-300">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!tg.loading && (tg.linked || doctor) && (
        <section className="mb-4 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Security
          </div>
          <div className="px-4 py-3.5">
            <div className="text-sm font-medium text-[#140a1f]">Telegram login codes</div>
            <p className="mt-1 text-xs text-gray-500">
              Privileged accounts receive verification codes on Telegram after password sign-in.
            </p>
            {tg.linked ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Connected{tg.telegramUsername ? ` · @${tg.telegramUsername}` : ""} ✓
                </span>
                <button type="button" onClick={() => void unlinkTelegram()} className="text-xs text-red-600 underline">
                  Unlink
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void connectTelegram()}
                className="mt-3 rounded-lg bg-[#8B1538] px-3 py-2 text-xs font-semibold text-white"
              >
                Connect Telegram
              </button>
            )}
            {tg.deepLink && !tg.linked && (
              <p className="mt-2 text-xs text-gray-500">
                If Telegram did not open,{" "}
                <a href={tg.deepLink} className="text-[#c2183a] underline" target="_blank" rel="noreferrer">
                  open this link
                </a>
                .
              </p>
            )}
            {tg.error && <p className="mt-2 text-xs text-red-600">{tg.error}</p>}
          </div>
        </section>
      )}

      <section className="mb-8 overflow-hidden rounded-2xl border border-red-100 bg-white">
        <div className="border-b bg-red-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-700">
          Session
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-gray-600">
            Log out to switch accounts (for example, founder/CEO vs clinic doctor). This clears your session on this
            device.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white active:bg-red-700"
          >
            Logout
          </button>
        </div>
      </section>
    </AppShell>
  );
}
