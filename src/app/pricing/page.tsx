"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { BillingInterval, formatInr, priceFor, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

function PricingInner() {
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteTone, setNoteTone] = useState<"info" | "success" | "error">("info");

  useEffect(() => {
    const razorpay = searchParams.get("razorpay");
    if (!razorpay) return;
    const plan = searchParams.get("plan") || "";
    const billing = searchParams.get("interval") || "";
    const status = (searchParams.get("razorpay_payment_link_status") || "").toLowerCase();
    const paymentId = searchParams.get("razorpay_payment_id") || "";
    if (status === "paid" || razorpay === "success") {
      setNoteTone("success");
      setNote(`Payment successful${plan ? ` for ${plan}` : ""}${billing ? ` (${billing})` : ""}${paymentId ? `. Payment ID: ${paymentId}` : ""}. Keep this MedLum tab; you can close the Razorpay tab.`);
      if (plan) setSelected(plan);
    } else if (status === "cancelled" || status === "expired" || razorpay === "failed") {
      setNoteTone("error");
      setNote(`Payment was not completed (${status || razorpay}). Try again from a plan card.`);
    } else if (razorpay === "return") {
      setNoteTone(status === "paid" ? "success" : "info");
      setNote(status ? `Razorpay returned with status: ${status}${paymentId ? ` · ${paymentId}` : ""}.` : "Returned from Razorpay.");
    }
  }, [searchParams]);

  async function choosePlan(id: string) {
    setSelected(id);
    if (id === "pilot") {
      setNoteTone("info");
      setNote("Pilot selected. No payment is required.");
      return;
    }
    const paymentWindow = window.open("about:blank", "_blank");
    if (!paymentWindow) {
      setNoteTone("error");
      setNote("Allow pop-ups so Razorpay can open in a separate tab.");
      return;
    }
    setLoadingPlan(id);
    setNoteTone("info");
    setNote(`Creating Razorpay Test Mode payment link for ${id} (${interval})…`);
    try {
      const response = await fetch("/api/payments/razorpay/payment-link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ plan: id, interval }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        paymentWindow.close();
        setNoteTone("error");
        setNote("Sign in to MedLum first, then select a paid plan.");
        return;
      }
      if (!response.ok || !data.success || !data.paymentLink) {
        paymentWindow.close();
        throw new Error(data.details || data.error || "Could not create Razorpay payment page.");
      }
      paymentWindow.location.href = data.paymentLink;
      setNoteTone("info");
      setNote(`Razorpay Test Mode opened in a new tab for ${id} (${interval}, ₹${data.amountInr}). This MedLum tab stays open.`);
    } catch (error) {
      try { paymentWindow.close(); } catch { /* ignore */ }
      setNoteTone("error");
      setNote(error instanceof Error ? error.message : "Could not open Razorpay.");
    } finally {
      setLoadingPlan(null);
    }
  }

  const noteClass =
    noteTone === "success" ? "border-green-200 bg-green-50 text-green-900"
    : noteTone === "error" ? "border-red-200 bg-red-50 text-red-900"
    : "border-blue-200 bg-blue-50 text-blue-900";

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link>
        <h1 className="mt-1 text-2xl font-bold">Pricing & subscription</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Paid plans open a Razorpay <strong>hosted Test Mode payment page</strong> in a <strong>new browser tab</strong>. MedLum stays open. After payment, Razorpay returns status here.
        </p>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Billing cycle</span>
        <button type="button" onClick={() => setInterval("monthly")} className={`h-9 rounded-full border px-4 text-xs font-medium ${interval === "monthly" ? "border-[#c2183a] bg-[#c2183a]/10 text-[#c2183a]" : "bg-white"}`}>Monthly</button>
        <button type="button" onClick={() => setInterval("yearly")} className={`h-9 rounded-full border px-4 text-xs font-medium ${interval === "yearly" ? "border-[#c2183a] bg-[#c2183a]/10 text-[#c2183a]" : "bg-white"}`}>Yearly</button>
      </div>
      {note && <div className={`mb-4 rounded-xl border p-3 text-sm ${noteClass}`}>{note}</div>}
      <div className="grid gap-4 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const amount = priceFor(plan, interval);
          const isLoading = loadingPlan === plan.id;
          return (
            <section key={plan.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${plan.popular ? "ring-2 ring-[#c2183a]" : ""} ${selected === plan.id ? "border-[#c2183a]" : ""}`}>
              {plan.popular && <div className="mb-2 inline-block rounded-full bg-[#c2183a]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c2183a]">Most popular</div>}
              <h2 className="text-lg font-bold">{plan.name}</h2>
              <p className="mt-1 text-xs text-gray-500">{plan.tagline}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold">{formatInr(amount)}</span>
                {amount > 0 && <span className="text-sm text-gray-500">/{interval === "yearly" ? "year" : "month"}</span>}
                {interval === "yearly" && plan.yearlySavePct > 0 && amount > 0 && <div className="mt-1 text-xs font-medium text-green-700">Save ~{plan.yearlySavePct}% vs monthly</div>}
              </div>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-700">{plan.features.map((f) => <li key={f} className="flex gap-2"><span className="text-green-600">✓</span><span>{f}</span></li>)}</ul>
              <ul className="mt-3 space-y-1 text-xs text-gray-500">{plan.limits.map((l) => <li key={l}>• {l}</li>)}</ul>
              <button type="button" onClick={() => void choosePlan(plan.id)} disabled={Boolean(loadingPlan)} className={`mt-5 h-11 w-full rounded-xl text-sm font-medium disabled:opacity-60 ${plan.id === "pilot" ? "border bg-white" : "bg-[#140a1f] text-white"}`}>
                {isLoading ? "Opening Razorpay…" : plan.id === "pilot" ? "Continue on Pilot" : "Pay with Razorpay"}
              </button>
            </section>
          );
        })}
      </div>
      <section className="mt-8 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">How payment works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>Sign in, then choose Monthly or Yearly.</li>
          <li>Select Professional or Clinic Plus — MedLum creates a Razorpay Payment Link server-side (secrets never leave the server).</li>
          <li>Razorpay opens in a <strong>new tab</strong>; this MedLum tab stays open (no Checkout modal).</li>
          <li>After pay/cancel, Razorpay returns success/failure status to MedLum.</li>
          <li>Recurring auto-renew is not created by this test payment.</li>
        </ol>
      </section>
    </AppShell>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<AppShell><p className="text-sm text-gray-500">Loading pricing…</p></AppShell>}>
      <PricingInner />
    </Suspense>
  );
}
