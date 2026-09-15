/** MedLum API client — cookies + PostgreSQL */

export type ApiMembership = { clinicId: string; clinicName: string; role: "Owner" | "Admin" | "Consultant" | "Staff" };
export type ApiDoctor = {
  id: string;
  name: string;
  email: string;
  clinicName: string;
  phone: string;
  createdAt: string;
  memberships?: ApiMembership[];
  primaryRole?: ApiMembership["role"];
  isOwner?: boolean;
};
const opts: RequestInit = { credentials: "include", headers: { "Content-Type": "application/json" } };
async function json<T>(res: Response): Promise<T> { return (await res.json().catch(() => ({}))) as T; }
export async function apiSignup(data: {
  name: string; email: string; password: string; clinicName: string; phone: string;
  facilityType: "HOSPITAL" | "CLINIC"; subscriptionModel: "OPD" | "IPD" | "BOTH";
  licenseNumber: string; registrationNumber: string; ownerName: string; doctorInCharge: string;
  address: string; city: string; state: string; pincode: string;
}) {
  const res = await fetch("/api/auth/signup", { ...opts, method: "POST", body: JSON.stringify(data) });
  return json<{ success: boolean; error?: string; doctor?: ApiDoctor; productAccess?: { subscriptionModel: string } }>(res);
}
export async function apiLogin(email: string, password: string) { const res = await fetch("/api/auth/login", { ...opts, method: "POST", body: JSON.stringify({ email, password }) }); return json<{ success: boolean; error?: string; doctor?: ApiDoctor; isOwner?: boolean }>(res); }
export async function apiLogout() { await fetch("/api/auth/logout", { ...opts, method: "POST" }); }
export async function apiMe() { try { const res = await fetch("/api/auth/me", { credentials: "include" }); if (!res.ok) return { success: false as const, doctor: null, isOwner: false }; return json<{ success: boolean; doctor: ApiDoctor | null; isOwner?: boolean }>(res); } catch { return { success: false as const, doctor: null, isOwner: false }; } }
export async function apiGetPatients() { try { const res = await fetch("/api/patients", { credentials: "include" }); if (!res.ok) return []; return (await json<{ patients: any[] }>(res)).patients || []; } catch { return []; } }
export async function apiAddPatient(data: any) { const res = await fetch("/api/patients", { ...opts, method: "POST", body: JSON.stringify(data) }); return json<{ success: boolean; error?: string; patient?: any }>(res); }
export async function apiGetAppointments() { try { const res = await fetch("/api/appointments", { credentials: "include" }); if (!res.ok) return []; return (await json<{ appointments: any[] }>(res)).appointments || []; } catch { return []; } }
export async function apiAddAppointment(data: any) { const res = await fetch("/api/appointments", { ...opts, method: "POST", body: JSON.stringify(data) }); return json<{ success: boolean; error?: string; appointment?: any }>(res); }
export async function apiUpdateAppointmentStatus(id: string, status: string) { const res = await fetch("/api/appointments", { ...opts, method: "PATCH", body: JSON.stringify({ id, status }) }); return json<{ success: boolean; error?: string; appointment?: any }>(res); }
export async function apiGetPrescriptions() { try { const res = await fetch("/api/prescriptions", { credentials: "include" }); if (!res.ok) return []; return (await json<{ prescriptions: any[] }>(res)).prescriptions || []; } catch { return []; } }
export async function apiAddPrescription(data: any) { const res = await fetch("/api/prescriptions", { ...opts, method: "POST", body: JSON.stringify(data) }); return json<{ success: boolean; error?: string }>(res); }
export async function apiAddPrescriptionWithEncounter(data: any) { const res = await fetch("/api/prescriptions", { ...opts, method: "POST", body: JSON.stringify(data) }); return json<{ success: boolean; error?: string }>(res); }
export async function apiGetInvoices() { try { const res = await fetch("/api/invoices", { credentials: "include", cache: "no-store" }); if (!res.ok) return []; return (await json<{ invoices: any[] }>(res)).invoices || []; } catch { return []; } }
export async function apiAddInvoice(data: { patientId: string; items: { description: string; category: string; quantity: number; unitPrice: number }[]; discount?: number; tax?: number; note?: string; dueDate?: string }) { const res = await fetch("/api/invoices", { ...opts, method: "POST", body: JSON.stringify(data) }); return json<{ success: boolean; error?: string; invoice?: any }>(res); }
export async function apiAddInvoicePayment(data: { id: string; amount: number; method: string; reference?: string; note?: string; paidAt?: string }) { const res = await fetch("/api/invoices", { ...opts, method: "PATCH", body: JSON.stringify(data) }); return json<{ success: boolean; error?: string; invoice?: any }>(res); }
export async function apiGetEncounters() { try { const res = await fetch("/api/encounters", { credentials: "include" }); if (!res.ok) return []; return (await json<{ encounters: any[] }>(res)).encounters || []; } catch { return []; } }
export async function apiGetLabOrders() { try { const res = await fetch("/api/labs", { credentials: "include" }); if (!res.ok) return []; return (await json<{ orders: any[] }>(res)).orders || []; } catch { return []; } }
export async function apiGetDiagnostics() { try { const res = await fetch("/api/diagnostics", { credentials: "include" }); if (!res.ok) return []; return (await json<{ orders: any[] }>(res)).orders || []; } catch { return []; } }
export async function apiGetBloodBank() { try { const res = await fetch("/api/blood-bank", { credentials: "include" }); if (!res.ok) return { requests: [] }; return json<{ requests: any[] }>(res); } catch { return { requests: [] }; } }
