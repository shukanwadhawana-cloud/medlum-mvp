"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentDoctor,
  logout,
  getMyPatients,
  addPatient,
  Doctor,
  Patient,
} from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "", notes: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const d = getCurrentDoctor();
    if (!d) {
      router.replace("/login");
      return;
    }
    setDoctor(d);
    setPatients(getMyPatients());
  }, [router]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    const result = addPatient({
      name: form.name,
      age: parseInt(form.age) || 0,
      gender: form.gender,
      phone: form.phone,
      notes: form.notes,
    });
    if (result.success) {
      setPatients(getMyPatients());
      setShowAdd(false);
      setForm({ name: "", age: "", gender: "Male", phone: "", notes: "" });
      setMessage("Patient added successfully");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  if (!doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#140a1f]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#f5f5f7]">
      <aside className="w-64 bg-[#140a1f] text-white flex flex-col shrink-0">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">MedLum</h1>
          <p className="text-sm text-red-300/80 mt-1">Clinical Intelligence</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          <div className="px-4 py-3 rounded-xl bg-[#c2183a] font-medium">Dashboard</div>
          <div className="px-4 py-3 rounded-xl text-white/70">Patients</div>
          <div className="px-4 py-3 rounded-xl text-white/70">Appointments</div>
          <div className="px-4 py-3 rounded-xl text-white/70">Billing</div>
        </nav>
        <div className="p-4 border-t border-white/10">
          <p className="text-sm font-medium truncate">{doctor.name}</p>
          <p className="text-xs text-white/50 truncate">{doctor.clinicName}</p>
          <button onClick={handleLogout} className="mt-3 w-full text-left text-sm text-red-300 hover:text-red-200">
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-[#1a1a1f]">Dashboard</h2>
            <p className="text-[#6b6b75] mt-1">Welcome back, {doctor.name}</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="h-11 px-5 rounded-xl bg-[#c2183a] hover:bg-[#9e1430] text-white font-medium transition"
          >
            + Add Patient
          </button>
        </div>

        {message && (
          <div className="mb-6 bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm border border-green-100">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-sm text-[#6b6b75]">My Patients</p>
            <p className="text-3xl font-bold text-[#c2183a] mt-2">{patients.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-sm text-[#6b6b75]">Clinic</p>
            <p className="text-xl font-semibold mt-2 truncate">{doctor.clinicName}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-sm text-[#6b6b75]">Data Isolation</p>
            <p className="text-xl font-semibold mt-2 text-green-600">Active</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-lg">My Patients</h3>
            <p className="text-sm text-[#6b6b75]">Only you can see these patients (data isolation active)</p>
          </div>

          {patients.length === 0 ? (
            <div className="p-12 text-center text-[#6b6b75]">
              No patients yet. Click “+ Add Patient” to create your first one.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {patients.map((p) => (
                <div key={p.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50">
                  <div>
                    <p className="font-medium text-[#1a1a1f]">{p.name}</p>
                    <p className="text-sm text-[#6b6b75]">
                      {p.age} yrs · {p.gender} · {p.phone}
                    </p>
                  </div>
                  <span className="text-xs text-[#6b6b75]">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-xl font-semibold mb-4">Add New Patient</h3>
            <form onSubmit={handleAddPatient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Age</label>
                  <input
                    type="number"
                    required
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c2183a]/40"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 h-11 rounded-xl border border-gray-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 rounded-xl bg-[#c2183a] text-white font-medium hover:bg-[#9e1430]"
                >
                  Save Patient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
