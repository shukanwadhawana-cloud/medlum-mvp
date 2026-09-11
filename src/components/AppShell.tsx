"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Doctor, logout } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/appointments", label: "Appointments" },
  { href: "/prescriptions", label: "Prescriptions" },
  { href: "/billing", label: "Billing" },
];

export default function AppShell({ doctor, children }: { doctor: Doctor; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen flex bg-[#f5f5f7]">
      <aside className="w-52 bg-[#140a1f] text-white flex flex-col shrink-0">
        <div className="px-4 py-5">
          <h1 className="text-xl font-bold tracking-tight">MedLum</h1>
          <p className="text-[11px] text-red-300/80 mt-0.5">Clinical Intelligence</p>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`block px-3 py-2.5 rounded-lg text-sm transition ${
                active ? "bg-[#c2183a] font-medium" : "text-white/70 hover:bg-white/5"
              }`}>{item.label}</Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <p className="text-xs font-medium truncate">{doctor.name}</p>
          <p className="text-[10px] text-white/50 truncate">{doctor.clinicName}</p>
          <button onClick={() => { logout(); router.replace("/login"); }} className="mt-2 text-xs text-red-300 hover:text-red-200">Logout</button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto min-w-0">{children}</main>
    </div>
  );
}
