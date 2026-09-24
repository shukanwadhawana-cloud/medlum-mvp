"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { formatIst } from "@/lib/duty";

type DutyState = {
  clinic: {
    id: string;
    name: string;
    dutyEnabled: boolean;
    dutyLat: number | null;
    dutyLng: number | null;
    dutyRadiusMeters: number;
  };
  me: {
    memberId: string;
    staffCode: string;
    role: string;
    name: string;
    lastPunch: { type: string; punchedAt: string } | null;
    expectedNext: string;
  };
  isAdmin: boolean;
  saniddhiConfigured: boolean;
  todayEvents: Array<{
    id: string;
    type: string;
    punchedAt: string;
    source: string;
    withinGeofence: boolean;
    note: string;
    memberId: string;
  }>;
  members: Array<{ memberId: string; staffCode: string; role: string; name: string }>;
};

export default function DutyPage() {
  const { doctor } = useDoctor();
  const [data, setData] = useState<DutyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [adminMemberId, setAdminMemberId] = useState("");
  const [geoForm, setGeoForm] = useState({ dutyEnabled: false, dutyLat: "", dutyLng: "", dutyRadiusMeters: "200" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/duty", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load duty status");
      setData(body);
      setGeoForm({
        dutyEnabled: Boolean(body.clinic?.dutyEnabled),
        dutyLat: body.clinic?.dutyLat != null ? String(body.clinic.dutyLat) : "",
        dutyLng: body.clinic?.dutyLng != null ? String(body.clinic.dutyLng) : "",
        dutyRadiusMeters: String(body.clinic?.dutyRadiusMeters ?? 200),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function getPosition(): Promise<{ lat: number; lng: number; accuracyMeters: number | null }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location not available on this device"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy ?? null,
          }),
        (err) => reject(new Error(err.message || "Location permission denied")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function punch(type: "IN" | "OUT", memberId?: string) {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let accuracyMeters: number | null = null;
      if (data?.clinic.dutyEnabled) {
        const pos = await getPosition();
        lat = pos.lat;
        lng = pos.lng;
        accuracyMeters = pos.accuracyMeters;
      }
      const res = await fetch("/api/duty", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, memberId, lat, lng, accuracyMeters }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Punch failed");
      setMsg(`${type} recorded at ${formatIst(body.event.punchedAt)}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Punch failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveGeofence() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/duty", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dutyEnabled: geoForm.dutyEnabled,
          dutyLat: geoForm.dutyLat ? Number(geoForm.dutyLat) : null,
          dutyLng: geoForm.dutyLng ? Number(geoForm.dutyLng) : null,
          dutyRadiusMeters: Number(geoForm.dutyRadiusMeters) || 200,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");
      setMsg("Hospital geofence updated");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    getPosition()
      .then((p) => {
        setGeoForm((f) => ({ ...f, dutyLat: String(p.lat), dutyLng: String(p.lng) }));
        setMsg("Location filled from device GPS");
      })
      .catch((e) => setError(e.message));
  }

  const onDuty = data?.me.lastPunch?.type === "IN";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#140a1f]">MedLum Duty</h1>
            <p className="text-sm text-gray-500">Hospital attendance · geofenced punch · IST</p>
          </div>
          <Link href="/dashboard" className="text-sm text-[#c2183a]">Dashboard</Link>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p>}

        {data && (
          <>
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{data.clinic.name}</p>
              <p className="mt-1 text-lg font-medium">{data.me.name}</p>
              <p className="text-sm text-gray-500">
                {data.me.role} · {data.me.staffCode || "No staff code"}
                {data.saniddhiConfigured ? " · Saniddhi sync on" : " · Native only"}
              </p>
              <p className="mt-2 text-sm">
                Status:{" "}
                <span className={onDuty ? "font-semibold text-green-700" : "font-semibold text-gray-600"}>
                  {onDuty ? "ON DUTY" : "OFF DUTY"}
                </span>
                {data.me.lastPunch && (
                  <span className="text-gray-500"> · last {data.me.lastPunch.type} {formatIst(data.me.lastPunch.punchedAt)}</span>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || onDuty}
                  onClick={() => punch("IN")}
                  className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Punch IN
                </button>
                <button
                  type="button"
                  disabled={busy || !onDuty}
                  onClick={() => punch("OUT")}
                  className="rounded-xl bg-[#c2183a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Punch OUT
                </button>
              </div>
              {data.clinic.dutyEnabled && (
                <p className="mt-3 text-xs text-gray-500">
                  Geofence on · radius {data.clinic.dutyRadiusMeters} m · location required
                </p>
              )}
            </section>

            {data.isAdmin && (
              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Admin mark attendance</h2>
                <select
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                  value={adminMemberId}
                  onChange={(e) => setAdminMemberId(e.target.value)}
                >
                  <option value="">Select staff…</option>
                  {data.members.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      {m.name} ({m.staffCode || m.role})
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy || !adminMemberId} onClick={() => punch("IN", adminMemberId)} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Mark IN</button>
                  <button type="button" disabled={busy || !adminMemberId} onClick={() => punch("OUT", adminMemberId)} className="rounded-lg bg-[#c2183a] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Mark OUT</button>
                </div>
              </section>
            )}

            {data.isAdmin && (
              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Hospital geofence</h2>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={geoForm.dutyEnabled} onChange={(e) => setGeoForm((f) => ({ ...f, dutyEnabled: e.target.checked }))} />
                  Require campus location for punch
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Lat" value={geoForm.dutyLat} onChange={(e) => setGeoForm((f) => ({ ...f, dutyLat: e.target.value }))} />
                  <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Lng" value={geoForm.dutyLng} onChange={(e) => setGeoForm((f) => ({ ...f, dutyLng: e.target.value }))} />
                </div>
                <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Radius meters (50–5000)" value={geoForm.dutyRadiusMeters} onChange={(e) => setGeoForm((f) => ({ ...f, dutyRadiusMeters: e.target.value }))} />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={useMyLocation} className="rounded-lg border px-3 py-2 text-xs">Use my GPS</button>
                  <button type="button" disabled={busy} onClick={saveGeofence} className="rounded-lg bg-[#140a1f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save geofence</button>
                </div>
              </section>
            )}

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Today&apos;s punches</h2>
              <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-sm">
                {data.todayEvents.length === 0 && <li className="text-gray-400">No punches yet today</li>}
                {data.todayEvents.map((ev) => (
                  <li key={ev.id} className="flex justify-between gap-2 border-b border-gray-50 py-1.5">
                    <span>
                      <span className={ev.type === "IN" ? "text-green-700" : "text-red-700"}>{ev.type}</span>
                      {" · "}{formatIst(ev.punchedAt)}
                      {" · "}{ev.source}
                      {!ev.withinGeofence && <span className="text-amber-600"> · outside fence</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
