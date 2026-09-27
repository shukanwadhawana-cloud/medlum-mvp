"use client";

import { useEffect, useState } from "react";

/**
 * Post-call landing page for the MiroTalk tab.
 *
 * The MiroTalk P2P service redirects here when a participant leaves the room.
 * The video tab was opened by MedLum with window.open(), so this page attempts
 * to close that script-created tab immediately. If the browser refuses the
 * close, the user sees a neutral MedLum message instead of MiroTalk branding.
 */
export default function TelemedicineEndedPage() {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const tryClose = () => {
      attempts += 1;
      try {
        window.close();
      } catch {
        // Ignore browser close restrictions.
      }
      if (window.closed) {
        setClosed(true);
        return;
      }
      if (attempts < 3) {
        window.setTimeout(tryClose, 150);
      }
    };

    // Let the redirect page paint minimally before attempting close.
    const timer = window.setTimeout(tryClose, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <section className="w-full max-w-md rounded-2xl border bg-white p-6 text-center">
        <div className="text-xs font-semibold tracking-wide text-[#c2183a]">MEDLUM</div>
        <h1 className="mt-2 text-lg font-semibold text-[#140a1f]">Video consultation ended</h1>
        <p className="mt-2 text-sm text-gray-500">
          {closed ? "This video tab is closing." : "You can close this video tab and return to MedLum."}
        </p>
        {!closed && (
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-4 rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white"
          >
            Close video tab
          </button>
        )}
      </section>
    </main>
  );
}
