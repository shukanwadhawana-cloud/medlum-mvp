export type Doctor = { id: string; name: string; email: string; password: string; clinicName: string; phone: string; createdAt: string; };
export type Patient = { id: string; doctorId: string; name: string; age: number; gender: string; phone: string; notes: string; createdAt: string; };
export type Appointment = { id: string; doctorId: string; patientId: string; patientName: string; date: string; time: string; type: string; status: "Scheduled" | "Completed" | "Cancelled" | "No-show"; createdAt: string; };
export type Prescription = { id: string; doctorId: string; patientId: string; patientName: string; medicines: string; advice: string; createdAt: string; };
export type Invoice = { id: string; doctorId: string; patientId: string; patientName: string; amount: number; status: "Paid" | "Pending" | "Overdue"; note: string; createdAt: string; };

const DOCTORS_KEY = "medlum_doctors"; const SESSION_KEY = "medlum_session"; const PATIENTS_KEY = "medlum_patients";
const APPTS_KEY = "medlum_appointments"; const RX_KEY = "medlum_prescriptions"; const INV_KEY = "medlum_invoices";

function read<T>(key: string): T[] { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
function write<T>(key: string, data: T[]) { localStorage.setItem(key, JSON.stringify(data)); }
function getDoctors(): Doctor[] { return read<Doctor>(DOCTORS_KEY); }

export function signup(data: { name: string; email: string; password: string; clinicName: string; phone: string; }) {
  const doctors = getDoctors();
  if (doctors.find(d => d.email.toLowerCase() === data.email.toLowerCase())) return { success: false, error: "Email already registered" };
  if (data.password.length < 8) return { success: false, error: "Password must be at least 8 characters" };
  const doctor: Doctor = { id: "doc_" + Date.now(), name: data.name, email: data.email.toLowerCase(), password: data.password, clinicName: data.clinicName, phone: data.phone, createdAt: new Date().toISOString() };
  doctors.push(doctor); write(DOCTORS_KEY, doctors);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ doctorId: doctor.id }));
  return { success: true, doctor };
}
export function login(email: string, password: string) {
  const doctor = getDoctors().find(d => d.email.toLowerCase() === email.toLowerCase() && d.password === password);
  if (!doctor) return { success: false, error: "Invalid email or password" };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ doctorId: doctor.id }));
  return { success: true, doctor };
}
export function logout() { localStorage.removeItem(SESSION_KEY); }
export function getCurrentDoctor(): Doctor | null {
  if (typeof window === "undefined") return null;
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); if (!s?.doctorId) return null; return getDoctors().find(d => d.id === s.doctorId) || null; } catch { return null; }
}
export function getMyPatients(): Patient[] {
  const doctor = getCurrentDoctor(); if (!doctor) return [];
  return read<Patient>(PATIENTS_KEY).filter(p => p.doctorId === doctor.id);
}
export function addPatient(data: { name: string; age: number; gender: string; phone: string; notes?: string; }) {
  const doctor = getCurrentDoctor(); if (!doctor) return { success: false, error: "Not authenticated" };
  const patient: Patient = { id: "pat_" + Date.now(), doctorId: doctor.id, name: data.name, age: data.age, gender: data.gender, phone: data.phone, notes: data.notes || "", createdAt: new Date().toISOString() };
  const all = read<Patient>(PATIENTS_KEY); all.push(patient); write(PATIENTS_KEY, all);
  return { success: true, patient };
}
export function getMyAppointments(): Appointment[] {
  const doctor = getCurrentDoctor(); if (!doctor) return [];
  return read<Appointment>(APPTS_KEY).filter(a => a.doctorId === doctor.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
export function addAppointment(data: { patientId: string; patientName: string; date: string; time: string; type: string; }) {
  const doctor = getCurrentDoctor(); if (!doctor) return { success: false, error: "Not authenticated" };
  const appt: Appointment = { id: "apt_" + Date.now(), doctorId: doctor.id, patientId: data.patientId, patientName: data.patientName, date: data.date, time: data.time, type: data.type, status: "Scheduled", createdAt: new Date().toISOString() };
  const all = read<Appointment>(APPTS_KEY); all.push(appt); write(APPTS_KEY, all);
  return { success: true };
}
export function updateAppointmentStatus(id: string, status: Appointment["status"]) {
  const all = read<Appointment>(APPTS_KEY); const idx = all.findIndex(a => a.id === id);
  if (idx >= 0) { all[idx].status = status; write(APPTS_KEY, all); }
}
export function getMyPrescriptions(): Prescription[] {
  const doctor = getCurrentDoctor(); if (!doctor) return [];
  return read<Prescription>(RX_KEY).filter(r => r.doctorId === doctor.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function addPrescription(data: { patientId: string; patientName: string; medicines: string; advice: string; }) {
  const doctor = getCurrentDoctor(); if (!doctor) return { success: false, error: "Not authenticated" };
  const rx: Prescription = { id: "rx_" + Date.now(), doctorId: doctor.id, patientId: data.patientId, patientName: data.patientName, medicines: data.medicines, advice: data.advice, createdAt: new Date().toISOString() };
  const all = read<Prescription>(RX_KEY); all.push(rx); write(RX_KEY, all);
  return { success: true };
}
export function getMyInvoices(): Invoice[] {
  const doctor = getCurrentDoctor(); if (!doctor) return [];
  return read<Invoice>(INV_KEY).filter(i => i.doctorId === doctor.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function addInvoice(data: { patientId: string; patientName: string; amount: number; note?: string; }) {
  const doctor = getCurrentDoctor(); if (!doctor) return { success: false, error: "Not authenticated" };
  const inv: Invoice = { id: "inv_" + Date.now(), doctorId: doctor.id, patientId: data.patientId, patientName: data.patientName, amount: data.amount, status: "Pending", note: data.note || "", createdAt: new Date().toISOString() };
  const all = read<Invoice>(INV_KEY); all.push(inv); write(INV_KEY, all);
  return { success: true };
}
export function updateInvoiceStatus(id: string, status: Invoice["status"]) {
  const all = read<Invoice>(INV_KEY); const idx = all.findIndex(i => i.id === id);
  if (idx >= 0) { all[idx].status = status; write(INV_KEY, all); }
}
