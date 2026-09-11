"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Doctor, logout } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Home" },
  { href: "/appointments", label: "Appts" },
  { href: "/prescriptions", label: "Rx" },
  { href: "/billing", label: "Billing" },
];

export default function AppShell({
  doctor,
  children,
}: {
  doctor: Doctor;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <header className="bg-[#140a1f] text-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6 min-w-0">
            <div className="shrink-0">
              <span className="font-bold text-lg tracking-tight">MedLum</span>
            </div>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                      active ? "bg-[#c2183a] font-medium" : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-white/60 hidden sm:inline truncate max-w-[120px]">
              {doctor.name}
            </span>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="text-xs text-red-300 hover:text-red-200"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
