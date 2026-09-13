"use client";

import { useEffect, useRef, useState } from "react";

type JitsiApi = {
  dispose: () => void;
};

type JitsiConstructor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

function getMeetingParts(meetingUrl: string) {
  const url = new URL(meetingUrl);
  const roomName = url.pathname.replace(/^\/+/, "");
  return { domain: url.hostname, roomName };
}

export default function JitsiMeeting({ meetingUrl, displayName }: { meetingUrl: string; displayName: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const start = () => {
      const JitsiMeetExternalAPI = window.JitsiMeetExternalAPI;
      if (cancelled || !containerRef.current || !JitsiMeetExternalAPI) return;
      try {
        const { domain, roomName } = getMeetingParts(meetingUrl);
        if (!roomName) throw new Error("Invalid video room.");

        apiRef.current?.dispose();
        containerRef.current.innerHTML = "";
        apiRef.current = new JitsiMeetExternalAPI(domain, {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName },
          configOverwrite: {
            prejoinConfig: { enabled: true },
            disableInviteFunctions: true,
            disableThirdPartyRequests: true,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to start video room.");
      }
    };

    if (window.JitsiMeetExternalAPI) {
      start();
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-medlum-jitsi="true"]');
      if (existing) {
        existing.addEventListener("load", start, { once: true });
      } else {
        try {
          const script = document.createElement("script");
          script.src = `${new URL(meetingUrl).origin}/external_api.js`;
          script.async = true;
          script.dataset.medlumJitsi = "true";
          script.addEventListener("load", start, { once: true });
          script.addEventListener("error", () => setError("The video service could not be loaded."), { once: true });
          document.head.appendChild(script);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Invalid video room URL.");
        }
      }
    }

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [meetingUrl, displayName]);

  if (error) {
    return <div className="flex h-full min-h-[240px] items-center justify-center bg-black p-6 text-center text-sm text-white">{error}</div>;
  }

  return <div ref={containerRef} className="h-full min-h-[240px] w-full bg-black" />;
}
