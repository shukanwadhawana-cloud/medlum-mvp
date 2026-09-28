"use client";

import { useCallback, useEffect, useState } from "react";

type TelegramStatus = {
  connected: boolean;
  status: string;
  label: string;
  botUsername: string | null;
  hasChat: boolean;
  lastVerifiedAt: string | null;
  connectionExpiresAt: string | null;
  configured: boolean;
};

export default function FacilityTelegramPanel() {
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deepLink, setDeepLink] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/clinic/telegram", { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 || res.status === 401) {
        setAllowed(false);
        return;
      }
      if (!res.ok) throw new Error(body.error || "Could not load Telegram status.");
      setAllowed(true);
      setTelegram(body.telegram || null);
    } catch (e) {
      setAllowed(false);
      setError(e instanceof Error ? e.message : "Could not load Telegram status.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (allowed === false || allowed === null) return null;

  async function run(action: "connect" | "test") {
    setBusy(action);
    setError("");
    setMessage("");
    setDeepLink("");
    try {
      const res = await fetch("/api/clinic/telegram", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Request failed.");
      if (action === "connect" && body.deepLink) {
        setDeepLink(String(body.deepLink));
        setMessage("Open the link below in Telegram to finish connecting this facility chat.");
      } else {
        setMessage(body.message || "Done.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy("");
    }
  }

  const badge =
    telegram?.status === "CONNECTED"
      ? "bg-green-100 text-green-700"
      : telegram?.status === "ERROR"
        ? "bg-red-100 text-red-700"
        : telegram?.status === "PENDING"
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-600";

  return (
    <section className="mb-3 rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Facility Telegram</h2>
          <p className="mt-1 text-xs text-gray-500">
            Connection status for this facility only. Bot tokens stay on the server.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${badge}`}>{telegram?.label || "Not connected"}</span>
      </div>

      {telegram?.botUsername && (
        <p className="mt-2 text-xs text-gray-600">
          Bot: @{telegram.botUsername}
          {telegram.hasChat ? " · Chat linked" : " · Chat not linked yet"}
        </p>
      )}
      {telegram?.lastVerifiedAt && (
        <p className="text-[11px] text-gray-400">Last verified {new Date(telegram.lastVerifiedAt).toLocaleString()}</p>
      )}

      {!telegram?.configured && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          No facility bot is configured for this clinic yet. Platform administration must attach a bot token when the
          facility is created. Staff personal Telegram linking (login OTP) is separate.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {message && <p className="mt-2 text-xs text-green-700">{message}</p>}
      {deepLink && (
        <a
          href={deepLink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex rounded-lg bg-[#229ED9] px-3 py-2 text-xs font-semibold text-white"
        >
          Open Telegram to connect
        </a>
      )}

      {telegram?.configured && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("connect")}
            className="rounded-xl border border-[#229ED9] px-3 py-2 text-xs font-semibold text-[#1688bd] disabled:opacity-50"
          >
            {busy === "connect" ? "Preparing…" : "Connect / refresh link"}
          </button>
          <button
            type="button"
            disabled={!!busy || telegram.status !== "CONNECTED"}
            onClick={() => void run("test")}
            className="rounded-xl bg-[#140a1f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy === "test" ? "Sending…" : "Send test"}
          </button>
        </div>
      )}
    </section>
  );
}
