"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

const FAQS: { q: string; a: string; cat: string }[] = [
  {
    cat: "Video",
    q: "Video works but I cannot hear audio.",
    a: "1) Tap the mic icon in Jitsi so it is not muted. 2) Allow microphone in Safari/Chrome for the site. 3) On iPad prefer “Open video in new tab”. 4) If both devices are in the same room, use headphones on one device or mute the guest speaker — otherwise echo forces people to mute. 5) Check the device volume is up.",
  },
  {
    cat: "Video",
    q: "Camera or microphone permission error.",
    a: "Settings → Safari (or Chrome) → Camera & Microphone → Allow. Or clear site data for MedLum and open the call again. “Open video in new tab” is more reliable on iOS than the embedded player.",
  },
  {
    cat: "Video",
    q: "How do consultant-to-consultant (iPhone ↔ iPad) calls work?",
    a: "On Telemedicine choose “Consultant peer call (no patient)”, create the session, Copy/Share the invite link to the other device, Open room as host, then Start call (let guest in). Guest only needs the link — no second login.",
  },
  {
    cat: "Subscription",
    q: "What is auto-subscription?",
    a: "You pick Pilot (free), Professional, or Clinic Plus. Paid plans renew monthly or yearly until you cancel. Payment gateway will be attached for production; Pilot needs no card.",
  },
  {
    cat: "Subscription",
    q: "Can I cancel anytime?",
    a: "Yes. Paid plans are designed to cancel anytime; access continues until the end of the paid period. Pilot has no billing.",
  },
  {
    cat: "Clinic",
    q: "Where do I manage patients and IPD?",
    a: "Patients from the Patients menu; admitted care from IPD. Hospital summaries (discharge, transfer, DAMA, etc.) are under IPD → Hospital summaries.",
  },
  {
    cat: "Clinic",
    q: "Is my data shared between clinics?",
    a: "Patients and notes are scoped to your doctor/clinic membership. Clinic isolation is enforced on shared patient access.",
  },
  {
    cat: "Support",
    q: "How do I get help during the pilot?",
    a: "Use this Help center, check Pricing for plan limits, or contact your MedLum pilot coordinator. For urgent clinical issues use your normal hospital escalation — MedLum is a workflow aid, not an emergency service.",
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  const [filter, setFilter] = useState<string>("All");
  const cats = ["All", ...Array.from(new Set(FAQS.map((f) => f.cat)))];
  const list = filter === "All" ? FAQS : FAQS.filter((f) => f.cat === filter);

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Help center</h1>
        <p className="mt-1 text-sm text-gray-600">FAQs for video, subscription, and day-to-day clinic use.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`h-9 rounded-full border px-3 text-xs font-medium ${
              filter === c ? "border-[#140a1f] bg-[#140a1f] text-white" : "bg-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Link href="/pricing" className="rounded-2xl border bg-white p-4 hover:border-[#c2183a]">
          <div className="text-sm font-semibold">Pricing & plans</div>
          <p className="mt-1 text-xs text-gray-500">Pilot, Professional, Clinic Plus — auto-renew options.</p>
        </Link>
        <Link href="/telemedicine" className="rounded-2xl border bg-white p-4 hover:border-[#c2183a]">
          <div className="text-sm font-semibold">Video consults</div>
          <p className="mt-1 text-xs text-gray-500">Start a call, invite link, Jitsi tips.</p>
        </Link>
        <Link href="/clinic" className="rounded-2xl border bg-white p-4 hover:border-[#c2183a]">
          <div className="text-sm font-semibold">Clinic settings</div>
          <p className="mt-1 text-xs text-gray-500">Members, roles, and clinic profile.</p>
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 font-semibold">Frequently asked questions</div>
        <div className="divide-y">
          {list.map((item, idx) => {
            const i = FAQS.indexOf(item);
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                >
                  <div>
                    <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {item.cat}
                    </span>
                    <span className="text-sm font-medium">{item.q}</span>
                  </div>
                  <span className="text-gray-400">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && <div className="px-4 pb-4 text-sm leading-relaxed text-gray-600">{item.a}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-gray-500">
        Still stuck? Note the page URL and what you tapped, then reach your pilot contact.
      </p>
    </AppShell>
  );
}
