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

export default function AppShell({ doctor, children }: { doctor: Doctor; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <header className="bg-[#140a1f] text-white sticky top-0 z-40">
        <div className="px-3 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
            <span className="font-bold text-base shrink-0">MedLum</span>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
                  pathname === item.href ? "bg-[#c2183a] font-medium" : "text-white/70"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="text-xs text-red-300 shrink-0"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 px-3 py-4">{children}</main>
    </div>
  );
}
