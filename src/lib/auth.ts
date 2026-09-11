// Simple client-side auth + data isolation using localStorage
// This is for MVP demo. Replace with real backend later.

export type Doctor = {
  id: string;
  name: string;
  email: string;
  password: string;
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
  notes: string;
  createdAt: string;
};

const DOCTORS_KEY = "medlum_doctors";
const SESSION_KEY = "medlum_session";
const PATIENTS_KEY = "medlum_patients";

function getDoctors(): Doctor[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DOCTORS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveDoctors(doctors: Doctor[]) {
  localStorage.setItem(DOCTORS_KEY, JSON.stringify(doctors));
}

export function signup(data: {
  name: string;
  email: string;
  password: string;
  clinicName: string;
  phone: string;
}): { success: boolean; error?: string; doctor?: Doctor } {
  const doctors = getDoctors();
  if (doctors.find((d) => d.email.toLowerCase() === data.email.toLowerCase())) {
    return { success: false, error: "Email already registered" };
  }
  if (data.password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const doctor: Doctor = {
    id: "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    name: data.name,
    email: data.email.toLowerCase(),
    password: data.password,
    clinicName: data.clinicName,
    phone: data.phone,
    createdAt: new Date().toISOString(),
  };

  doctors.push(doctor);
  saveDoctors(doctors);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ doctorId: doctor.id }));
  return { success: true, doctor };
}

export function login(email: string, password: string): { success: boolean; error?: string; doctor?: Doctor } {
  const doctors = getDoctors();
  const doctor = doctors.find(
    (d) => d.email.toLowerCase() === email.toLowerCase() && d.password === password
  );
  if (!doctor) {
    return { success: false, error: "Invalid email or password" };
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ doctorId: doctor.id }));
  return { success: true, doctor };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function getCurrentDoctor(): Doctor | null {
  if (typeof window === "undefined") return null;
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session?.doctorId) return null;
    const doctors = getDoctors();
    return doctors.find((d) => d.id === session.doctorId) || null;
  } catch {
    return null;
  }
}

function getAllPatients(): Patient[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PATIENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getMyPatients(): Patient[] {
  const doctor = getCurrentDoctor();
  if (!doctor) return [];
  return getAllPatients().filter((p) => p.doctorId === doctor.id);
}

export function addPatient(data: {
  name: string;
  age: number;
  gender: string;
  phone: string;
  notes?: string;
}): { success: boolean; error?: string; patient?: Patient } {
  const doctor = getCurrentDoctor();
  if (!doctor) return { success: false, error: "Not authenticated" };

  const patient: Patient = {
    id: "pat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    doctorId: doctor.id,
    name: data.name,
    age: data.age,
    gender: data.gender,
    phone: data.phone,
    notes: data.notes || "",
    createdAt: new Date().toISOString(),
  };

  const all = getAllPatients();
  all.push(patient);
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(all));
  return { success: true, patient };
}
