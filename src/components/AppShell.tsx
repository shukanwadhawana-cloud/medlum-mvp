"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDoctor } from "./DoctorProvider";

const nav = [
  { href: "/dashboard", label: "Home" },
  { href: "/patients", label: "Patients" },
  { href: "/clinical-assist", label: "AI Assist" },
  { href: "/appointments", label: "Appts" },
  { href: "/telemedicine", label: "Video" },
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

const isActive = (pathname: string, href: string) =>
  pathname === href ||
  (href === "/patients" && pathname.startsWith("/patients/")) ||
  (href === "/telemedicine" && pathname.startsWith("/telemedicine"));

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useDoctor();

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <header className="bg-[#140a1f] text-white sticky top-0 z-40 shadow-sm">
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-6">
          <div className="h-12 sm:h-14 flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-base sm:text-lg shrink-0" aria-label="MedLum home">
              MedLum
            </Link>

            <nav aria-label="Primary navigation" className="hidden md:flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={`px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 transition-colors ${
                    isActive(pathname, item.href) ? "bg-[#c2183a] font-medium" : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="hidden md:block shrink-0">
              <button type="button" onClick={() => logout()} className="text-xs text-red-300 hover:text-red-200 px-1 py-2">
                Logout
              </button>
            </div>

            <nav aria-label="Mobile navigation" className="md:hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none overscroll-x-contain">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={`px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 ${
                    isActive(pathname, item.href) ? "bg-[#c2183a] font-medium" : "text-white/70"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => logout()}
                className="px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 text-red-300"
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 max-w-7xl w-full mx-auto pb-20 md:pb-6">
        {children}
      </main>

      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 safe-area-bottom">
        <nav aria-label="Quick navigation" className="mx-auto grid max-w-lg grid-cols-4">
          {[nav[0], nav[1], nav[3], nav[4]].map((item) => (
            <Link key={item.href} href={item.href} className={`flex min-h-14 items-center justify-center px-2 text-xs font-medium ${isActive(pathname, item.href) ? "text-[#c2183a]" : "text-gray-500"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
