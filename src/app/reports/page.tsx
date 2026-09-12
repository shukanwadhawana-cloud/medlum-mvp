"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

export default function ReportsPage(){
  const [data,setData]=useState<any>(null); const [error,setError]=useState("");
  async function load(){try{const r=await fetch("/api/reports",{credentials:"include",cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Could not load reports");setData(j)}catch(e){setError(e instanceof Error?e.message:"Could not load reports")}}
  useEffect(()=>{load()},[]);
  const money=(n:number)=>`₹${Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0})}`;
  if(!data&&!error)return <AppShell><p className="text-sm text-gray-500">Loading reports…</p></AppShell>;
  if(error)return <AppShell><Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link><div className="mt-4 rounded-xl border bg-white p-4 text-sm text-red-600">{error}</div></AppShell>;
  return <AppShell><div className="mb-4"><Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link><h1 className="mt-1 text-xl font-semibold">Reports & Analytics</h1><p className="text-xs text-gray-500">Clinic-wide operational, revenue and insurance snapshot.</p></div>
    <div className="grid grid-cols-2 gap-2 mb-4">{[["Patients",data.counts.patients],["Encounters",data.counts.encounters],["Appointments",data.counts.appointments],["Invoices",data.counts.invoices],["Lab orders",data.counts.labOrders],["Diagnostics",data.counts.diagnosticOrders],["Prescriptions",data.counts.prescriptions],["Dispensings",data.counts.dispensings]].map(([k,v])=><div key={k as string} className="bg-white rounded-xl border p-3"><div className="text-[11px] text-gray-500">{k}</div><div className="text-xl font-bold">{v}</div></div>)}</div>
    <div className="bg-white rounded-xl border p-4 mb-3"><h2 className="font-semibold text-sm mb-3">Revenue</h2><div className="grid grid-cols-3 gap-2"><div><div className="text-[11px] text-gray-500">Billed</div><div className="font-bold">{money(data.revenue.billed)}</div></div><div><div className="text-[11px] text-gray-500">Collected</div><div className="font-bold">{money(data.revenue.collected)}</div></div><div><div className="text-[11px] text-gray-500">Outstanding</div><div className="font-bold">{money(data.revenue.outstanding)}</div></div></div></div>
    <div className="bg-white rounded-xl border p-4 mb-3"><h2 className="font-semibold text-sm mb-2">Payment methods</h2>{Object.entries(data.paymentMethods).map(([k,v]:any)=><div key={k} className="flex justify-between py-2 border-b last:border-0 text-sm"><span>{k}</span><span className="font-semibold">{money(v)}</span></div>)}{!Object.keys(data.paymentMethods).length&&<p className="text-xs text-gray-400">No payments yet.</p>}</div>
    <div className="bg-white rounded-xl border p-4 mb-3"><h2 className="font-semibold text-sm mb-2">Insurance performance</h2><div className="grid grid-cols-3 gap-2 mb-2"><div><div className="text-[11px] text-gray-500">Requested</div><div className="font-bold">{money(data.insurance.requested)}</div></div><div><div className="text-[11px] text-gray-500">Approved</div><div className="font-bold">{money(data.insurance.approved)}</div></div><div><div className="text-[11px] text-gray-500">Settled</div><div className="font-bold">{money(data.insurance.settled)}</div></div></div>{Object.entries(data.insurance.byStatus).map(([k,v]:any)=><div key={k} className="flex justify-between py-2 border-b last:border-0 text-sm"><span>{k}</span><span className="font-semibold">{v}</span></div>)}</div>
    <div className="bg-white rounded-xl border p-4"><h2 className="font-semibold text-sm mb-2">Invoice status</h2>{Object.entries(data.invoiceStatuses).map(([k,v]:any)=><div key={k} className="flex justify-between py-2 border-b last:border-0 text-sm"><span>{k}</span><span className="font-semibold">{v}</span></div>)}</div>
  </AppShell>
}
