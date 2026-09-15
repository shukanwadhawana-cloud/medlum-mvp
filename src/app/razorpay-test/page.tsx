"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const money = (n: number) => `₹${(n / 100).toFixed(2)}`;
type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type CredentialStatus = { configured: boolean; source: "environment" | "secret-file" | "missing" };

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void }; } }

export default function RazorpayTestPage() {
  const router = useRouter();
  const [amount, setAmount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [credentials, setCredentials] = useState<{ keyId: CredentialStatus; keySecret: CredentialStatus } | null>(null);
  const [message, setMessage] = useState("Checking MedLum's Razorpay server configuration…");
  const [result, setResult] = useState<RazorpayResult | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/payments/razorpay/status")
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not inspect Razorpay configuration");
        if (mounted) {
          setCredentials(data.credentials);
          setMessage(data.credentials.keyId.configured && data.credentials.keySecret.configured ? "Server credentials detected. Ready for a Razorpay Test Mode order." : "Razorpay credentials are missing from the running Render service.");
        }
      })
      .catch(error => mounted && setMessage(error instanceof Error ? error.message : "Could not inspect Razorpay configuration"));

    if (window.Razorpay) { setCheckoutReady(true); return () => { mounted = false; }; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => mounted && setCheckoutReady(true);
    script.onerror = () => mounted && setMessage("Could not load Razorpay Checkout from checkout.razorpay.com.");
    document.body.appendChild(script);
    return () => { mounted = false; };
  }, []);

  async function startTest() {
    setLoading(true); setResult(null); setMessage("Creating a Razorpay Test Mode order…");
    try {
      const value = Number(amount);
      if (!Number.isFinite(value) || value < 1) throw new Error("Enter at least ₹1");
      if (!checkoutReady || !window.Razorpay) throw new Error("Razorpay Checkout is still loading. Try again in a moment.");
      const orderResponse = await fetch("/api/payments/razorpay/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Math.round(value * 100) }) });
      const order = await orderResponse.json();
      if (!orderResponse.ok || !order.success) {
        const sourceHint = order.diagnostics ? ` (key ID: ${order.diagnostics.keyId}; secret: ${order.diagnostics.keySecret})` : "";
        throw new Error(`${order.error || order.details || "Could not create Razorpay order"}${sourceHint}`);
      }
      const checkout = new window.Razorpay({
        key: order.keyId, amount: order.order.amount, currency: order.order.currency, name: "MedLum", description: "MedLum Razorpay Test Payment", order_id: order.order.id, prefill: {}, theme: { color: "#c2183a" },
        handler: async (response: RazorpayResult) => {
          setMessage("Payment returned. Verifying signature on MedLum server…");
          const verificationResponse = await fetch("/api/payments/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) });
          const verification = await verificationResponse.json();
          if (!verificationResponse.ok || !verification.success) throw new Error(verification.error || "Payment verification failed");
          setResult(response); setMessage("✅ Razorpay Test Mode payment verified successfully by MedLum."); setLoading(false);
        },
        modal: { ondismiss: () => { setLoading(false); setMessage("Checkout closed. No payment was verified."); } },
      });
      checkout.open();
    } catch (error) { setLoading(false); setMessage(error instanceof Error ? error.message : "Razorpay test failed"); }
  }

  const credentialsReady = credentials?.keyId.configured && credentials?.keySecret.configured;
  return <main className="min-h-screen bg-gray-50 p-4 sm:p-8"><div className="mx-auto max-w-lg rounded-2xl bg-white border shadow-sm p-5 sm:p-7"><button onClick={() => router.back()} className="text-sm text-gray-500 mb-5">← Back</button><h1 className="text-xl font-bold">Razorpay Test Connection</h1><p className="text-sm text-gray-500 mt-1">This page uses Razorpay Test Mode only. No live money should be used here.</p><div className="mt-5 rounded-xl border bg-gray-50 p-3 text-xs"><b>Server configuration</b><p className="mt-1">Key ID: {credentials ? `${credentials.keyId.configured ? "configured" : "missing"} (${credentials.keyId.source})` : "checking…"}</p><p>Key Secret: {credentials ? `${credentials.keySecret.configured ? "configured" : "missing"} (${credentials.keySecret.source})` : "checking…"}</p><p>Checkout: {checkoutReady ? "loaded" : "loading…"}</p></div><div className="mt-6"><label className="text-sm font-medium">Test amount (INR)</label><input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} className="mt-2 w-full h-11 px-3 rounded-lg border"/><button onClick={startTest} disabled={loading || !credentialsReady || !checkoutReady} className="mt-3 w-full h-11 rounded-lg bg-[#c2183a] text-white font-medium disabled:opacity-50">{loading ? "Working…" : `Pay ${money(Math.round(Number(amount || 0) * 100))} with Razorpay Test Mode`}</button></div><div className="mt-5 rounded-xl bg-gray-50 border p-3 text-sm"><b>Status</b><p className="mt-1 text-gray-600">{message}</p></div>{result&&<div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-3 text-xs break-all"><p><b>Payment ID:</b> {result.razorpay_payment_id}</p><p className="mt-1"><b>Order ID:</b> {result.razorpay_order_id}</p><p className="mt-1"><b>Signature:</b> verified server-side</p></div>}<p className="mt-5 text-xs text-gray-400">Use Razorpay's official Test Mode payment credentials/details in Checkout. Live keys are not used by this page.</p></div></main>;
}
