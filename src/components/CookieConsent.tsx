"use client";

import { useEffect, useState } from "react";

const CONSENT_KEY = "medlum-cookie-consent";
const ANALYTICS_KEY = "medlum-analytics-consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(CONSENT_KEY) !== "accepted");
  }, []);

  if (!visible) return null;

  function choose(analytics: boolean) {
    window.localStorage.setItem(CONSENT_KEY, "accepted");
    window.localStorage.setItem(ANALYTICS_KEY, analytics ? "accepted" : "declined");
    setVisible(false);
    window.dispatchEvent(new Event("medlum-consent-changed"));
  }

  return (
    <aside role="dialog" aria-label="Cookie consent" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#140a1f] p-4 text-white shadow-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-300">
          MedLum uses essential browser storage for authentication and security. Optional analytics helps us improve the product and is disabled until you choose it.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => choose(false)} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white">Essential only</button>
          <button type="button" onClick={() => choose(true)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#140a1f]">Allow analytics</button>
          <a href="/privacy" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300">Privacy</a>
        </div>
      </div>
    </aside>
  );
}
