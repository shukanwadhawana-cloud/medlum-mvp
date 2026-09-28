"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id?: number;
  content?: string;
  message_type?: string;
  created_at?: string | number;
  sender?: { name?: string };
};

export default function MedLumChat() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"chatwoot" | "knowledge" | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem("medlum_chat_conversation") || "");
    if (Number.isInteger(stored) && stored > 0) setConversationId(stored);
    fetch("/api/chatwoot", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setConfigured(Boolean(j.configured)); setMode(j.mode === "knowledge" ? "knowledge" : "chatwoot"); })
      .catch(() => setConfigured(false));
  }, []);

  const loadMessages = async () => {
    if (!conversationId) return;
    try {
      const r = await fetch(`/api/chatwoot?conversationId=${conversationId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        if (r.status === 403 || r.status === 404) {
          window.localStorage.removeItem("medlum_chat_conversation");
          setConversationId(null);
          setMessages([]);
        }
        return;
      }
      setMessages(Array.isArray(j.messages) ? j.messages : []);
    } catch {
      /* ignore transient errors */
    }
  };

  useEffect(() => {
    if (!open || !conversationId) return;
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 5000);
    return () => window.clearInterval(timer);
  }, [open, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/chatwoot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: conversationId ? "message" : "start",
          conversationId,
          content,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Unable to send message");
      if (j.message) { setMessages((prev) => [...prev, j.message]); }
      if (j.conversationId) {
        setConversationId(j.conversationId);
        window.localStorage.setItem("medlum_chat_conversation", String(j.conversationId));
      }
      setText("");
      await loadMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send message");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <section className="fixed bottom-16 right-3 z-[70] flex h-[min(38rem,78vh)] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl md:bottom-5 md:right-5">
          <header className="flex items-center justify-between bg-[#140a1f] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">MedLum Help</p>
              <p className="text-[10px] text-white/65">Staff support · facility-aware</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-sm text-white/75 hover:bg-white/10"
              aria-label="Close chat"
            >
              ×
            </button>
          </header>

          <div className="flex-1 overflow-y-auto bg-gray-50 p-3">
            {configured === false && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Staff support chat is not connected, so MedLum Help is using its free built-in workflow guide. You can still ask questions here.
              </div>
            )}
            {configured && messages.length === 0 && (
              <div className="rounded-xl border bg-white p-3 text-sm text-gray-600">
                <p className="font-medium text-gray-900">How can we help?</p>
                <p className="mt-1 text-xs">
                  Ask about using MedLum, an account/workflow issue, or a technical problem. Your
                  current facility and staff context are attached automatically.
                </p>
              </div>
            )}
            {messages.map((m, i) => {
              const fromSupport = m.message_type === "outgoing";
              return (
                <div key={m.id || i} className={`mb-2 flex ${fromSupport ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      fromSupport ? "border bg-white text-gray-800" : "bg-[#c2183a] text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content || ""}</p>
                    {m.sender?.name && fromSupport && (
                      <p className="mt-1 text-[9px] text-gray-400">{m.sender.name}</p>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {error && <div className="border-t bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex gap-2 border-t bg-white p-3"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={configured !== true || busy}
              maxLength={4000}
              placeholder={configured === false ? "Type a MedLum Help question…" : "Type your message…"}
              className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#c2183a]"
            />
            <button
              type="submit"
              disabled={configured !== true || busy || !text.trim()}
              className="rounded-xl bg-[#c2183a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "…" : "Send"}
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-[4.5rem] right-3 z-[65] flex h-12 items-center gap-2 rounded-full bg-[#c2183a] px-4 text-sm font-semibold text-white shadow-lg md:bottom-5 md:right-5"
        aria-label="Open MedLum Help chat"
      >
        <span aria-hidden="true">💬</span>
        <span className="hidden sm:inline">Help</span>
      </button>
    </>
  );
}
