"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** /portal → authenticated dashboard or login */
export default function PortalIndex() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/portal/auth/me", { credentials: "include", cache: "no-store" });
        if (cancelled) return;
        if (r.ok) router.replace("/portal/dashboard");
        else router.replace("/portal/login");
      } catch {
        if (!cancelled) router.replace("/portal/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <p className="text-sm text-gray-500">Opening patient portal…</p>
    </main>
  );
}
