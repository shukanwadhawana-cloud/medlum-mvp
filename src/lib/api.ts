/**
 * MedLum API client — production path is PostgreSQL via /api/*
 * Always sends cookies (HTTP-only session).
 */

export type ApiDoctor = {
  id: string;
  name: string;
  email: string;
  clinicName: string;
  phone: string;
  createdAt: string;
};

const opts: RequestInit = {
  credentials: "include",
  headers: { "Content-Type": "application/json" },
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
  const res = await fetch("/api/auth/signup", { ...opts, method: "POST", body: JSON.stringify(data) });
  return json<{ success: boolean; error?: string; doctor?: ApiDoctor }>(res);
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    ...opts,
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return json<{ success: boolean; error?: string; doctor?: ApiDoctor }>(res);
}

export async function apiLogout() {
  await fetch("/api/auth/logout", { ...opts, method: "POST" });
}

export async function apiMe() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return { success: false as const, doctor: null };
    return json<{ success: boolean; doctor: ApiDoctor | null }>(res);
  } catch {
    return { success: false as const, doctor: null };
  }
}

export async function apiGetPatients() {
  try {
    const res = await fetch("/api/patients", { credentials: "include" });
    if (!res.ok) return [];
    const data = await json<{ patients: any[] }>(res);
    return data.patients || [];
  } catch {
    return [];
  }
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
  const res = await fetch("/api/patients", { ...opts, method: "POST", body: JSON.stringify(data) });
  return json<{ success: boolean; error?: string; patient?: any }>(res);
}

export async function apiGetAppointments() {
  try {
    const res = await fetch("/api/appointments", { credentials: "include" });
    if (!res.ok) return [];
    const data = await json<{ appointments: any[] }>(res);
    return data.appointments || [];
  } catch {
    return [];
  }
}

export async function apiAddAppointment(data: {
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  type: string;
}) {
  const res = await fetch("/api/appointments", { ...opts, method: "POST", body: JSON.stringify(data) });
  return json<{ success: boolean; error?: string }>(res);
}

export async function apiUpdateAppointmentStatus(id: string, status: string) {
  const res = await fetch("/api/appointments", { ...opts, method: "PATCH", body: JSON.stringify({ id, status }) });
  return json<{ success: boolean; error?: string }>(res);
}

export async function apiGetPrescriptions() {
  try {
    const res = await fetch("/api/prescriptions", { credentials: "include" });
    if (!res.ok) return [];
    const data = await json<{ prescriptions: any[] }>(res);
    return data.prescriptions || [];
  } catch {
    return [];
  }
}

export async function apiAddPrescription(data: {
  patientId: string;
  patientName: string;
  medicines: string;
  advice: string;
}) {
  const res = await fetch("/api/prescriptions", { ...opts, method: "POST", body: JSON.stringify(data) });
  return json<{ success: boolean; error?: string }>(res);
}

export async function apiGetInvoices() {
  try {
    const res = await fetch("/api/invoices", { credentials: "include" });
    if (!res.ok) return [];
    const data = await json<{ invoices: any[] }>(res);
    return data.invoices || [];
  } catch {
    return [];
  }
}

export async function apiAddInvoice(data: {
  patientId: string;
  patientName: string;
  amount: number;
  note?: string;
}) {
  const res = await fetch("/api/invoices", { ...opts, method: "POST", body: JSON.stringify(data) });
  return json<{ success: boolean; error?: string }>(res);
}

export async function apiUpdateInvoiceStatus(id: string, status: string) {
  const res = await fetch("/api/invoices", { ...opts, method: "PATCH", body: JSON.stringify({ id, status }) });
  return json<{ success: boolean; error?: string }>(res);
}
