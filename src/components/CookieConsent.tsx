"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "medlum-cookie-consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(STORAGE_KEY) !== "accepted");
  }, []);

  if (!visible) return null;

  function accept() {
    window.localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  return (
    <aside
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#140a1f] p-4 text-white shadow-2xl"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-300">
          MedLum uses essential browser storage for authentication and security. Optional analytics may be enabled to improve the product. No patient clinical content should be stored in analytics cookies.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={accept} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#140a1f]">
            Continue
          </button>
          <a href="/privacy" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white">
            Privacy
          </a>
        </div>
      </div>
    </aside>
  );
}
