"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PlatformDeveloperPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/platform/diagnostics", { credentials:"include", cache:"no-store" }).then(async r => { const j=await r.json(); if(!r.ok){setError(j.error||"Access denied"); if(r.status===401||r.status===403) router.replace("/platform/login"); return;} setData(j); }).catch(()=>setError("Diagnostics unavailable")); }, [router]);
  return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-widest text-slate-400">MedLum Platform</div><h1 className="text-3xl font-bold">Developer / Support Diagnostics</h1></div><button onClick={()=>router.push('/platform')} className="rounded-lg border border-slate-700 px-4 py-2">Back</button></div>{error&&<div className="mt-6 rounded-xl bg-red-900/40 p-4">{error}</div>}{data&&<div className="mt-7 grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-slate-900 p-5"><h2 className="font-semibold">Database</h2><p className="mt-3 text-2xl">{data.database.status}</p><p className="text-sm text-slate-400">Latency: {data.database.latencyMs} ms</p></div><div className="rounded-2xl bg-slate-900 p-5"><h2 className="font-semibold">Runtime</h2><p className="mt-3">Environment: {data.runtime.nodeEnv}</p><p>App URL: {data.runtime.appUrlConfigured ? 'configured' : 'missing'}</p><p>Video: {data.runtime.videoProvider}</p></div>{Object.entries(data.counts).map(([k,v])=><div key={k} className="rounded-2xl bg-slate-900 p-5"><div className="text-sm text-slate-400">{k}</div><div className="mt-2 text-3xl font-bold">{String(v)}</div></div>)}</div>}</div></main>;
}
