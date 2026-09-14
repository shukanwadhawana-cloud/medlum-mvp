"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

let initialized = false;

export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    const track = () => {
      if (window.localStorage.getItem("medlum-analytics-consent") !== "accepted") return;
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      if (!key) return;

      void import("posthog-js").then(({ default: posthog }) => {
        if (!initialized) {
          posthog.init(key, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
            capture_pageview: false,
            autocapture: false,
            capture_pageleave: false,
            persistence: "localStorage+cookie",
            disable_session_recording: true,
          });
          initialized = true;
        }
        posthog.capture("page_view", { path: pathname });
      });
    };

    track();
    window.addEventListener("medlum-consent-changed", track);
    return () => window.removeEventListener("medlum-consent-changed", track);
  }, [pathname]);

  return null;
}
