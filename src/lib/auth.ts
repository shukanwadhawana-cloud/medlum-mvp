/**
 * LEGACY — NOT used by Phase B production UI.
 * Production uses /api/* + PostgreSQL via src/lib/api.ts.
 */

export type Doctor = {
  id: string;
  name: string;
  email: string;
  password?: string;
  clinicName: string;
  phone: string;
  createdAt: string;
};

export type Patient = {
  id: string;
  doctorId: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  bp: string;
  allergies: string;
  notes: string;
  createdAt: string;
};

export function getCurrentDoctor(): Doctor | null {
  return null;
}
export function logout() {}
export function getMyPatients(): Patient[] {
  return [];
}
export function getMyAppointments() {
  return [];
}
export function getMyInvoices() {
  return [];
}
export function getMyPrescriptions() {
  return [];
}
