/**
 * API client for MedLum backend.
 * Progressive migration: UI calls these; localStorage remains in auth.ts as fallback until verified.
 */

export type ApiDoctor = {
  id: string;
  name: string;
  email: string;
  clinicName: string;
  phone: string;
  createdAt: string;
};

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  return data as T;
}

export async function apiSignup(data: {
  name: string;
  email: string;
  password: string;
  clinicName: string;
  phone: string;
}) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return json<{ success: boolean; error?: string; doctor?: ApiDoctor }>(res);
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return json<{ success: boolean; error?: string; doctor?: ApiDoctor }>(res);
}

export async function apiLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function apiMe() {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return { success: false as const, doctor: null };
  return json<{ success: boolean; doctor: ApiDoctor | null }>(res);
}

export async function apiGetPatients() {
  const res = await fetch("/api/patients");
  if (!res.ok) return [];
  const data = await json<{ patients: any[] }>(res);
  return data.patients || [];
}

export async function apiAddPatient(data: {
  name: string;
  age: number;
  gender: string;
  phone: string;
  bp?: string;
  allergies?: string;
  notes?: string;
}) {
  const res = await fetch("/api/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return json<{ success: boolean; error?: string; patient?: any }>(res);
}

export async function apiGetAppointments() {
  const res = await fetch("/api/appointments");
  if (!res.ok) return [];
  const data = await json<{ appointments: any[] }>(res);
  return data.appointments || [];
}

export async function apiAddAppointment(data: {
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  type: string;
}) {
  const res = await fetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return json<{ success: boolean; error?: string }>(res);
}

export async function apiUpdateAppointmentStatus(id: string, status: string) {
  const res = await fetch("/api/appointments", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  return json<{ success: boolean }>(res);
}

export async function apiGetPrescriptions() {
  const res = await fetch("/api/prescriptions");
  if (!res.ok) return [];
  const data = await json<{ prescriptions: any[] }>(res);
  return data.prescriptions || [];
}

export async function apiAddPrescription(data: {
  patientId: string;
  patientName: string;
  medicines: string;
  advice: string;
}) {
  const res = await fetch("/api/prescriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return json<{ success: boolean; error?: string }>(res);
}

export async function apiGetInvoices() {
  const res = await fetch("/api/invoices");
  if (!res.ok) return [];
  const data = await json<{ invoices: any[] }>(res);
  return data.invoices || [];
}

export async function apiAddInvoice(data: {
  patientId: string;
  patientName: string;
  amount: number;
  note?: string;
}) {
  const res = await fetch("/api/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return json<{ success: boolean; error?: string }>(res);
}

export async function apiUpdateInvoiceStatus(id: string, status: string) {
  const res = await fetch("/api/invoices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  return json<{ success: boolean }>(res);
}
