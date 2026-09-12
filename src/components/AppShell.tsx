"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDoctor } from "./DoctorProvider";

const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<string, React.ReactNode> = {
    brand: <><path d="M4 17V7l4 4 4-6 4 6 4-4v10"/><path d="M8 17h8"/></>,
    patients: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.2 2.5-5 6-5s6 1.8 6 5"/><path d="M17 11a3 3 0 1 0-1-5.8"/><path d="M17 15c2.5.2 4 1.8 4 5"/></>,
    ai: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="5"/><path d="m10 12 1.4 1.5L14.5 10"/></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></>,
    emergency: <><path d="M12 3 21 20H3z"/><path d="M12 9v5M12 17h.01"/></>,
    labs: <><path d="M9 3h6M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-8V3"/><path d="M8 16h8"/></>,
    diagnostics: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5M10.5 8v5"/></>,
    pharmacy: <><path d="m7 3 14 14-4 4L3 7z"/><path d="m14 6-8 8"/></>,
    blood: <><path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z"/><path d="M9 15c.4 1.4 1.3 2.2 2.7 2.5"/></>,
    insurance: <><path d="M12 3 20 6v6c0 5-3.2 8-8 9-4.8-1-8-4-8-9V6z"/><path d="m8 12 2.5 2.5L16 9"/></>,
    reports: <><path d="M5 20V9M12 20V4M19 20v-7"/><path d="M3 20h18"/></>,
    rx: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h5M8 12h8M8 16h4"/><path d="m14 8 3 3"/></>,
    billing: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h3"/><path d="M15 15h1"/></>,
    clinic: <><path d="M4 21V6l8-3 8 3v15"/><path d="M8 21v-5h8v5M9 9h6M12 7v4M10 9h4"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 4h5v16h-5"/></>,
  };
  return <svg {...common}>{paths[name] ?? paths.brand}</svg>;
};

const nav = [
  { href: "/patients", label: "Patients", icon: "patients" },
  { href: "/appointments", label: "Appts", icon: "calendar" },
  { href: "/emergency", label: "Emergency", icon: "emergency" },
  { href: "/labs", label: "Labs", icon: "labs" },
  { href: "/diagnostics", label: "Diagnostics", icon: "diagnostics" },
  { href: "/pharmacy", label: "Pharmacy", icon: "pharmacy" },
  { href: "/blood-bank", label: "Blood", icon: "blood" },
  { href: "/insurance", label: "Insurance", icon: "insurance" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/prescriptions", label: "Rx", icon: "rx" },
  { href: "/billing", label: "Billing", icon: "billing" },
  { href: "/clinic", label: "Clinic", icon: "clinic" },
  { href: "/clinical-assist", label: "AI Assist", icon: "ai" },
  { href: "/telemedicine", label: "Video", icon: "video" },
];

const isActive = (pathname: string, href: string) => pathname === href || (href === "/patients" && pathname.startsWith("/patients/")) || (href === "/telemedicine" && pathname.startsWith("/telemedicine"));

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useDoctor();
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <header className="bg-[#140a1f] text-white sticky top-0 z-40 shadow-sm">
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-6">
          <div className="h-12 sm:h-14 flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-base sm:text-lg shrink-0" aria-label="MedLum dashboard"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15"><Icon name="brand" size={17} /></span><span>MedLum</span></Link>
            <nav aria-label="Primary navigation" className="hidden md:flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">{nav.map((item) => <Link key={item.href} href={item.href} prefetch title={item.label} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 transition-colors ${isActive(pathname, item.href) ? "bg-[#c2183a] font-medium" : "text-white/70 hover:text-white hover:bg-white/10"}`}><Icon name={item.icon} size={14}/><span>{item.label}</span></Link>)}</nav>
            <div className="hidden md:block shrink-0"><button type="button" onClick={() => logout()} title="Logout" className="inline-flex items-center gap-1.5 text-xs text-red-300 hover:text-red-200 px-1 py-2"><Icon name="logout" size={14}/><span>Logout</span></button></div>
            <nav aria-label="Mobile navigation" className="md:hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none overscroll-x-contain">{nav.map((item) => <Link key={item.href} href={item.href} prefetch title={item.label} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 ${isActive(pathname, item.href) ? "bg-[#c2183a] font-medium" : "text-white/70"}`}><Icon name={item.icon} size={14}/><span>{item.label}</span></Link>)}<button type="button" onClick={() => logout()} title="Logout" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 text-red-300"><Icon name="logout" size={14}/><span>Logout</span></button></nav>
          </div>
        </div>
      </header>
      <main className="flex-1 min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 max-w-7xl w-full mx-auto pb-20 md:pb-6">{children}</main>
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 safe-area-bottom"><nav aria-label="Quick navigation" className="mx-auto grid max-w-lg grid-cols-4">{[nav[0], nav[1], nav[2], nav[nav.length - 1]].map((item) => <Link key={item.href} href={item.href} title={item.label} className={`flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-[11px] font-medium ${isActive(pathname, item.href) ? "text-[#c2183a]" : "text-gray-500"}`}><Icon name={item.icon} size={18}/><span>{item.label}</span></Link>)}</nav></div>
    </div>
  );
}
