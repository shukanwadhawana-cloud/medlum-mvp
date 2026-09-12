"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDoctor } from "./DoctorProvider";

const nav = [
  { href: "/dashboard", label: "Home" },
  { href: "/patients", label: "Patients" },
  { href: "/clinical-assist", label: "AI Assist" },
  { href: "/appointments", label: "Appts" },
  { href: "/emergency", label: "Emergency" },
  { href: "/labs", label: "Labs" },
  { href: "/diagnostics", label: "Diagnostics" },
  { href: "/pharmacy", label: "Pharmacy" },
  { href: "/blood-bank", label: "Blood" },
  { href: "/insurance", label: "Insurance" },
  { href: "/reports", label: "Reports" },
  { href: "/prescriptions", label: "Rx" },
  { href: "/billing", label: "Billing" },
  { href: "/clinic", label: "Clinic" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useDoctor();
  return <div className="min-h-screen bg-[#f5f5f7] flex flex-col"><header className="bg-[#140a1f] text-white sticky top-0 z-40"><div className="px-3 h-12 flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0 overflow-x-auto"><span className="font-bold text-base shrink-0">MedLum</span>{nav.map(item=><Link key={item.href} href={item.href} prefetch={true} className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${pathname===item.href || (item.href==="/patients"&&pathname.startsWith("/patients/")) ? "bg-[#c2183a] font-medium":"text-white/70"}`}>{item.label}</Link>)}</div><button type="button" onClick={()=>logout()} className="text-xs text-red-300 shrink-0 px-1">Logout</button></div></header><main className="flex-1 px-3 py-4 max-w-3xl w-full mx-auto">{children}</main></div>;
}
