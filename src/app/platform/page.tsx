"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Dashboard = {
  owner: { name: string; email: string };
  products: Array<{ key: string; name: string; slug: string; description: string; active: boolean }>;
  summary: { products: number; organizations: number; activeOrganizations: number; activeUsers: number; activeDoctors: number; patients: number; appointments: number; encounters: number; totalInvoiced: number; totalCollected: number; pendingPayments: number; mrr: number | null; mrrStatus: string };
  trends: Array<{ month: string; collected: number }>;
  productsDetail: Array<{ key: string; name: string; organizations: number; activeUsers: number; patients: number; appointments: number; encounters: number; revenueCollected: number }>;
  organizations: Array<{ id: string; name: string; active: boolean; onboardedAt: string; users: number; doctors: number }>;
};

const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

export default function PlatformPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/platform/control-plane", { credentials: "include", cache: "no-store" });
    if (response.status === 401) { router.replace("/platform/login"); return; }
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Unable to load control plane"); return; }
    setData(result);
  }

  useEffect(() => { load(); }, []);

  async function signOut() {
    await fetch("/api/platform/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/platform/login");
  }

  if (!data) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl">{error ? <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p> : <p>Loading MedLum Control Plane…</p>}</div></main>;

  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><div className="text-xs font-semibold uppercase tracking-widest text-slate-500">MedLum Control Plane</div><h1 className="mt-1 text-3xl font-bold">Platform Owner Dashboard</h1><p className="text-sm text-slate-500">Signed in as {data.owner.name} · {data.owner.email}</p></div>
        <button onClick={signOut} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">Sign out</button>
      </header>

      <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[['Products',data.summary.products],['Organizations',data.summary.organizations],['Active orgs',data.summary.activeOrganizations],['Active users',data.summary.activeUsers],['Patients',data.summary.patients],['Collected',money(data.summary.totalCollected)],['Pending',money(data.summary.pendingPayments)]].map(([label,value])=><div key={String(label)} className="rounded-xl border bg-white p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>)}
      </section>

      <section className="mt-7 rounded-2xl border bg-white p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold">Product portfolio</h2><p className="text-sm text-slate-500">One control plane, with each MedLum product registered independently.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.products.map((product)=><div key={product.key} className="rounded-xl border p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{product.name}</h3><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{product.active ? "Active" : "Inactive"}</span></div><p className="mt-2 text-sm text-slate-500">{product.description}</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div><div className="text-slate-500">Organizations</div><strong>{data.productsDetail.find(p=>p.key===product.key)?.organizations ?? 0}</strong></div><div><div className="text-slate-500">Users</div><strong>{data.productsDetail.find(p=>p.key===product.key)?.activeUsers ?? 0}</strong></div></div></div>)}</div></section>

      <section className="mt-7 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">MedLum MVP overview</h2><div className="mt-4 grid grid-cols-2 gap-4"><div><div className="text-sm text-slate-500">Doctors</div><div className="text-2xl font-bold">{data.summary.activeDoctors}</div></div><div><div className="text-sm text-slate-500">Appointments</div><div className="text-2xl font-bold">{data.summary.appointments}</div></div><div><div className="text-sm text-slate-500">Clinical encounters</div><div className="text-2xl font-bold">{data.summary.encounters}</div></div><div><div className="text-sm text-slate-500">Invoiced</div><div className="text-2xl font-bold">{money(data.summary.totalInvoiced)}</div></div></div><p className="mt-4 text-xs text-slate-500">MRR: {data.summary.mrr === null ? "not available yet" : money(data.summary.mrr)}. {data.summary.mrrStatus}</p></div>
        <div className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Revenue trend</h2>{data.trends.length === 0 ? <p className="mt-4 text-sm text-slate-500">No payment data yet.</p> : <div className="mt-4 space-y-2">{data.trends.map((item)=><div key={item.month} className="flex items-center justify-between border-b pb-2 text-sm"><span>{item.month}</span><strong>{money(item.collected)}</strong></div>)}</div>}</div>
      </section>

      <section className="mt-7 rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Organizations onboarded</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Organization</th><th className="p-2">Status</th><th className="p-2">Users</th><th className="p-2">Doctors</th><th className="p-2">Onboarded</th></tr></thead><tbody>{data.organizations.map((org)=><tr key={org.id} className="border-b"><td className="p-2 font-medium">{org.name}</td><td className="p-2">{org.active ? "Active" : "Inactive"}</td><td className="p-2">{org.users}</td><td className="p-2">{org.doctors}</td><td className="p-2">{new Date(org.onboardedAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div></section>
    </div>
  </main>;
}
