"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import {
  BillingInterval,
  formatInr,
  priceFor,
  SUBSCRIPTION_PLANS,
} from "@/lib/subscription-plans";

type RazorpayCheckout = {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selected, setSelected] = useState<{
    id: string;
    interval: BillingInterval;
  } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [recurringAccepted, setRecurringAccepted] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function choosePlan(id: string) {
    if (id === "pilot") {
      setSelected(null);
      setMessage(
        "Pilot is free — no payment method or recurring authorization is required.",
      );
      return;
    }

    setSelected({ id, interval });
    setTermsAccepted(false);
    setRecurringAccepted(false);
    setPdfReady(false);
    setMessage("");
    setError("");
  }

  async function downloadProForma() {
    if (!selected || !termsAccepted || !recurringAccepted) return;

    setBusy("pdf");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/subscriptions/pro-forma", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selected.id,
          interval: selected.interval,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not generate pro forma");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `MedLum-${selected.id}-${selected.interval}-pro-forma.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setPdfReady(true);
      setMessage(
        "Pro forma PDF generated. Review it, then continue to Razorpay.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not generate PDF",
      );
    } finally {
      setBusy("");
    }
  }

  async function loadRazorpay() {
    if (window.Razorpay) return;

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-medlum-razorpay="true"]',
      );

      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Razorpay Checkout could not be loaded")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.medlumRazorpay = "true";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Razorpay Checkout could not be loaded"));
      document.body.appendChild(script);
    });
  }

  async function startPayment() {
    if (!selected || !pdfReady || !termsAccepted || !recurringAccepted) {
      return;
    }

    setBusy("payment");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/subscriptions/razorpay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selected.id,
          interval: selected.interval,
          termsAccepted,
          recurringAccepted,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Unable to start subscription checkout");
      }

      await loadRazorpay();
      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout is unavailable");
      }

      const checkout = new window.Razorpay({
        key: body.keyId,
        subscription_id: body.subscription.id,
        name: "MedLum",
        description: `${body.plan.name} · ${body.plan.interval} auto-renewal`,
        prefill: { email: body.clinic?.email || undefined },
        theme: { color: "#140a1f" },
        modal: {
          ondismiss: () => setBusy(""),
        },
        handler: async (result: Record<string, unknown>) => {
          const verify = await fetch(
            "/api/subscriptions/razorpay/verify",
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(result),
            },
          )
            .then((response) => response.json())
            .catch(() => ({ success: false }));

          if (verify.success) {
            setMessage(
              verify.active
                ? "Payment authorization received. Your MedLum subscription is active."
                : "Payment authorization received. MedLum is waiting for Razorpay to confirm the subscription.",
            );
            setSelected(null);
          } else {
            setError(
              verify.error ||
                "Payment completed but verification needs attention.",
            );
          }
          setBusy("");
        },
      });

      checkout.open();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to open Razorpay",
      );
      setBusy("");
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Pricing & subscription</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Choose a plan, review the subscription document, accept the terms and
          recurring authorization, then complete payment securely through
          Razorpay.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Billing cycle</span>
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`h-9 rounded-full border px-4 text-xs font-medium ${
            interval === "monthly"
              ? "border-[#140a1f] bg-[#140a1f] text-white"
              : "bg-white"
          }`}
        >
          Monthly · auto-renew
        </button>
        <button
          type="button"
          onClick={() => setInterval("yearly")}
          className={`h-9 rounded-full border px-4 text-xs font-medium ${
            interval === "yearly"
              ? "border-[#140a1f] bg-[#140a1f] text-white"
              : "bg-white"
          }`}
        >
          Yearly · auto-renew
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const amount = priceFor(plan, interval);
          return (
            <section
              key={plan.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                plan.popular ? "ring-2 ring-[#c2183a]" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                {plan.popular && (
                  <div className="inline-block rounded-full bg-[#c2183a]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c2183a]">
                    Most popular
                  </div>
                )}
                <span className="text-[10px] text-gray-400">
                  {plan.id === "pilot" ? "No card" : "Razorpay"}
                </span>
              </div>
              <h2 className="mt-2 text-lg font-bold">{plan.name}</h2>
              <p className="mt-1 text-xs text-gray-500">{plan.tagline}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold">{formatInr(amount)}</span>
                {amount > 0 && (
                  <span className="text-sm text-gray-500">
                    /{interval === "yearly" ? "year" : "month"}
                  </span>
                )}
              </div>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-green-600">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1 text-xs text-gray-500">
                {plan.limits.map((limit) => (
                  <li key={limit}>• {limit}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => choosePlan(plan.id)}
                className={`mt-5 h-11 w-full rounded-xl text-sm font-medium ${
                  plan.id === "pilot"
                    ? "border bg-white"
                    : "bg-[#140a1f] text-white"
                }`}
              >
                {plan.id === "pilot" ? "Continue on Pilot" : "Choose plan"}
              </button>
            </section>
          );
        })}
      </div>

      {selected && (
        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#c2183a]">
                Step 1 · Subscription checkout
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {selected.id === "clinic_plus" ? "Clinic Plus" : "Professional"} · {selected.interval}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                You will receive a pending-payment pro forma before Razorpay
                opens. No paid invoice is created before payment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-gray-500"
            >
              Cancel
            </button>
          </div>

          <div className="mt-5 rounded-xl border bg-gray-50 p-4">
            <div className="flex justify-between text-sm">
              <span>Subscription fee</span>
              <strong>
                {formatInr(
                  selected.interval === "yearly"
                    ? selected.id === "clinic_plus"
                      ? 49990
                      : 19990
                    : selected.id === "clinic_plus"
                      ? 4999
                      : 1999,
                )}
              </strong>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              INR · {selected.interval === "yearly" ? "renews yearly" : "renews monthly"} until cancelled
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>
                I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="font-medium text-[#c2183a] underline"
                >
                  MedLum Terms & Conditions
                </Link>
                .
              </span>
            </label>

            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={recurringAccepted}
                onChange={(event) =>
                  setRecurringAccepted(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                I understand this is an <strong>auto-renewing subscription</strong>{" "}
                and authorize recurring billing through Razorpay according to
                the selected billing cycle.
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={!termsAccepted || !recurringAccepted || busy !== ""}
              onClick={downloadProForma}
              className="h-11 rounded-xl border px-4 text-sm font-medium disabled:opacity-40"
            >
              {busy === "pdf"
                ? "Generating PDF…"
                : "Generate / download pro forma PDF"}
            </button>
            <button
              type="button"
              disabled={!pdfReady || busy !== ""}
              onClick={startPayment}
              className="h-11 rounded-xl bg-[#140a1f] px-5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy === "payment" ? "Opening Razorpay…" : "Continue to Razorpay"}
            </button>
          </div>

          {!pdfReady && (
            <p className="mt-2 text-xs text-gray-500">
              Generate the pro forma first; the payment button unlocks after the
              document is generated.
            </p>
          )}
          {pdfReady && (
            <p className="mt-2 text-xs text-green-700">
              ✓ Pro forma generated. You can now continue to Razorpay.
            </p>
          )}
        </section>
      )}

      <section className="mt-8 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">How your subscription works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>Choose your plan and billing cycle.</li>
          <li>
            Accept the Terms & Conditions and recurring billing authorization.
          </li>
          <li>
            Generate the MedLum subscription pro forma PDF. It is marked{" "}
            <strong>Pending payment</strong>, not Paid.
          </li>
          <li>Continue to Razorpay for subscription authorization and payment.</li>
          <li>
            Razorpay confirms the subscription; MedLum records the webhook and
            activates the plan.
          </li>
          <li>
            Future recurring charges are handled by Razorpay until the
            subscription is cancelled or halted.
          </li>
        </ol>
        <p className="mt-3 text-xs text-gray-500">
          Pilot remains free and does not require a payment method.
        </p>
      </section>
    </AppShell>
  );
}
