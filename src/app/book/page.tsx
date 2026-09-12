"use client";

import { useEffect, useMemo, useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);

type Clinic = { id: string; name: string };
type Doctor = { id: string; name: string; clinicName: string; role: string };
type Slot = { time: string; available: boolean };

export default function BookingPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", age: "", gender: "Not specified", type: "Consultation" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);

  const selectedDoctor = useMemo(() => doctors.find((d) => d.id === doctorId), [doctors, doctorId]);

  async function loadOptions(nextClinicId = clinicId, nextDoctorId = doctorId, nextDate = date) {
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams();
      if (nextClinicId) q.set("clinicId", nextClinicId);
      if (nextDoctorId) q.set("doctorId", nextDoctorId);
      if (nextDate) q.set("date", nextDate);
      const r = await fetch(`/api/public/booking?${q.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to load booking options.");
      setClinics(j.clinics || []); setDoctors(j.doctors || []); setSlots(j.slots || []);
      if (!nextClinicId && j.clinics?.length) setClinicId(j.clinics[0].id);
      if (nextClinicId && !nextDoctorId) setDoctorId("");
      if (!j.slots?.some((s: Slot) => s.time === time && s.available)) setTime("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load booking options."); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadOptions("", "", date); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSuccess(null);
    if (!clinicId || !doctorId || !time) { setError("Select a clinic, doctor and available time."); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/public/booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clinicId, doctorId, date, time, ...form }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to request appointment.");
      setSuccess(j.appointment); setTime("");
      await loadOptions(clinicId, doctorId, date);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to request appointment."); }
    finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-[#f5f5f7] p-4 sm:p-6">
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-5"><div className="text-2xl font-bold text-[#140a1f]">MedLum</div><h1 className="text-lg font-semibold mt-1">Book an appointment</h1><p className="text-xs text-gray-500 mt-1">Choose your clinic, consultant and a convenient time.</p></div>
      <form onSubmit={submit} className="bg-white rounded-2xl border shadow-sm p-4 space-y-3">
        {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs p-3">{error}</div>}
        {success && <div className="rounded-xl bg-green-50 border border-green-100 p-3"><div className="font-semibold text-sm text-green-900">Appointment requested</div><div className="text-xs text-green-800 mt-1">{success.date} · {success.time} · Dr. {success.doctorName}</div><div className="text-[11px] text-green-700 mt-1">Status: Requested. The clinic can confirm it from MedLum.</div></div>}
        <label className="block text-xs font-medium">Clinic<select value={clinicId} onChange={e => { const v=e.target.value; setClinicId(v); setDoctorId(""); setSlots([]); loadOptions(v,"",date); }} className="mt-1 w-full h-11 rounded-lg border px-3 text-sm"><option value="">Select clinic</option>{clinics.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-xs font-medium">Consultant<select value={doctorId} disabled={!clinicId || loading} onChange={e => { const v=e.target.value; setDoctorId(v); setTime(""); loadOptions(clinicId,v,date); }} className="mt-1 w-full h-11 rounded-lg border px-3 text-sm"><option value="">Select consultant</option>{doctors.map(d=><option key={d.id} value={d.id}>Dr. {d.name}</option>)}</select></label>
        {selectedDoctor && <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Booking with <span className="font-medium">Dr. {selectedDoctor.name}</span></div>}
        <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-medium">Date<input type="date" min={today()} value={date} onChange={e=>{const v=e.target.value;setDate(v);setTime("");loadOptions(clinicId,doctorId,v)}} className="mt-1 w-full h-11 rounded-lg border px-3 text-sm"/></label><label className="block text-xs font-medium">Time<select value={time} disabled={!doctorId || loading} onChange={e=>setTime(e.target.value)} className="mt-1 w-full h-11 rounded-lg border px-3 text-sm"><option value="">Select slot</option>{slots.map(s=><option key={s.time} value={s.time} disabled={!s.available}>{s.time}{s.available?"":" — booked"}</option>)}</select></label></div>
        <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-medium">Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full h-11 rounded-lg border px-3" placeholder="Your name"/></label><label className="block text-xs font-medium">Mobile<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} inputMode="tel" className="mt-1 w-full h-11 rounded-lg border px-3" placeholder="Mobile number"/></label></div>
        <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-medium">Age<input type="number" min="0" max="120" value={form.age} onChange={e=>setForm({...form,age:e.target.value})} className="mt-1 w-full h-11 rounded-lg border px-3" placeholder="Age"/></label><label className="block text-xs font-medium">Gender<select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})} className="mt-1 w-full h-11 rounded-lg border px-3"><option>Not specified</option><option>Male</option><option>Female</option><option>Other</option></select></label></div>
        <label className="block text-xs font-medium">Appointment type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="mt-1 w-full h-11 rounded-lg border px-3"><option>Consultation</option><option>Follow-up</option><option>Lab Review</option></select></label>
        <button disabled={saving || loading} className="w-full h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50">{saving ? "Requesting…" : "Request appointment"}</button>
        <p className="text-[11px] text-gray-400 text-center">This MVP creates a request for the clinic to confirm. No online payment is taken.</p>
      </form>
    </div>
  </main>;
}
