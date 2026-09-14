"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";

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
  return (
    <AppShell>
      <div className="mb-4">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-bold">More</h1>
        <p className="mt-1 text-sm text-gray-600">Pricing, help, FAQs, and the rest of MedLum modules.</p>
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
    </AppShell>
  );
}
