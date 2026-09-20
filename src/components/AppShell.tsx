"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDoctor } from "./DoctorProvider";

const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<string, React.ReactNode> = {
    brand: (<><path d="M4 17V7l4 4 4-6 4 6 4-4v10" /><path d="M8 17h8" /></>), patients: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.2 2.5-5 6-5s6 1.8 6 5" /><path d="M17 11a3 3 0 1 0-1-5.8" /><path d="M17 15c2.5.2 4 1.8 4 5" /></>), ipd: (<><path d="M4 21V5h16v16" /><path d="M8 9h8M8 13h8M8 17h3M15 15v5M12 17h6" /></>), ai: (<><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1-2.1" /><circle cx="12" cy="12" r="5" /><path d="m10 12 1.4 1.5L14.5 10" /></>), calendar: (<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>), video: (<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>), emergency: (<><path d="M12 3 21 20H3z" /><path d="M12 9v5M12 17h.01" /></>), labs: (<><path d="M9 3h6M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-8V3" /><path d="M8 16h8" /></>), diagnostics: (<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M8 10.5h5M10.5 8v5" /></>), pharmacy: (<><path d="m7 3 14 14-4 4L3 7z" /><path d="m14 6-8 8" /></>), blood: (<><path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z" /><path d="M9 15c.4 1.4 1.3 2.2 2.7 2.5" /></>), insurance: (<><path d="M12 3 20 6v6c0 5-3.2 8-8 9-4.8-1-8-4-8-9V6z" /><path d="m8 12 2.5 2.5L16 9" /></>), reports: (<><path d="M5 20V9M12 20V4M19 20v-7" /><path d="M3 20h18" /></>), rx: (<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h5M8 12h8M8 16h4" /><path d="m14 8 3 3" /></>), billing: (<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h3" /><path d="M15 15h1" /></>), clinic: (<><path d="M4 21V6l8-3 8 3v15" /><path d="M8 21v-5h8v5M9 9h6M12 7v4M10 9h4" /></>), logout: (<><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 4h5v16h-5" /></>), more: (<><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>), owner: (<><path d="M12 3 14.5 8.5 20.5 9.5 16 13.5 17 19.5 12 16.8 7 19.5 8 13.5 3.5 9.5 9.5 8.5z" /></>)
  };
  return <svg {...common}>{paths[name] || paths.more}</svg>;
};

const primaryNav = [
  { href: "/opd", label: "OPD", icon: "clinic" }, { href: "/patients", label: "Patients", icon: "patients" }, { href: "/ipd", label: "IPD", icon: "ipd" }, { href: "/appointments", label: "Appts", icon: "calendar" }, { href: "/emergency", label: "Emergency", icon: "emergency" }, { href: "/labs", label: "Labs", icon: "labs" }, { href: "/diagnostics", label: "Diagnostics", icon: "diagnostics" }, { href: "/pharmacy", label: "Pharmacy", icon: "pharmacy" }, { href: "/telemedicine", label: "Video", icon: "video" },
];
const operationsNav = [
  { href: "/billing", label: "Patient billing", icon: "billing" }, { href: "/blood-bank", label: "Blood bank", icon: "blood" }, { href: "/insurance", label: "Insurance", icon: "insurance" }, { href: "/reports", label: "Reports", icon: "reports" }, { href: "/prescriptions", label: "Prescriptions", icon: "rx" }, { href: "/clinic/setup", label: "Hospital / Clinic setup", icon: "clinic" }, { href: "/clinic", label: "Staff & Clinic settings", icon: "clinic" }, { href: "/clinic/tariffs", label: "Tariff / Rate list", icon: "billing" }, { href: "/clinical-assist", label: "AI Assist", icon: "ai" }, { href: "/mvp-blueprint", label: "MVP Blueprint", icon: "reports" }, { href: "/dashboard", label: "Dashboard", icon: "clinic" },
];
const moreItems = [...primaryNav, ...operationsNav];
const isActive = (pathname: string, href: string) => pathname === href || (href === "/opd" && pathname.startsWith("/opd")) || (href === "/patients" && pathname.startsWith("/patients/")) || (href === "/telemedicine" && pathname.startsWith("/telemedicine")) || (href === "/help" && pathname.startsWith("/help")) || (href === "/pricing" && pathname.startsWith("/pricing")) || (href === "/more" && pathname.startsWith("/more"));

function MoreSidebar({ open, onClose, pathname, onLogout, isOwner }: { open: boolean; onClose: () => void; pathname: string; onLogout: () => void; isOwner: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !open) return null;
  const groups = [{ label: "Clinical", items: primaryNav }, { label: "Operations & settings", items: operationsNav }];
  return createPortal(
    <div className="fixed inset-0 z-[60] md:hidden">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-[min(20rem,88vw)] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3"><p className="text-sm font-semibold text-[#140a1f]">All modules</p><button type="button" onClick={onClose} className="text-sm text-gray-500">Close</button></div>
        <div className="flex-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} onClick={onClose} className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm ${isActive(pathname, item.href) ? "bg-red-50 font-medium text-[#c2183a]" : "text-[#140a1f]"}`}><Icon name={item.icon} size={16} /><span>{item.label}</span></Link>
              ))}
            </div>
          ))}
          {isOwner && <Link href="/owner" onClick={onClose} className="mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm text-[#140a1f]"><Icon name="owner" size={16} /><span>Owner dashboard</span></Link>}
        </div>
        <div className="border-t p-3"><button type="button" onClick={() => { onClose(); onLogout(); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white">Logout</button></div>
      </aside>
    </div>,
    document.body
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { doctor, logout } = useDoctor();
  const [moreOpen, setMoreOpen] = useState(false);
  const isOwner = Boolean((doctor as any)?.isOwner);
  const moreActive = pathname.startsWith("/more") || moreItems.some((i) => isActive(pathname, i.href));
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f4f7]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#140a1f] text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:px-4">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-1.5 font-semibold"><Icon name="brand" size={18} /><span className="text-sm">MedLum</span></Link>
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">{primaryNav.map((item) => <Link key={item.href} href={item.href} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs ${isActive(pathname, item.href) ? "bg-[#c2183a] font-medium" : "text-white/70"}`}><Icon name={item.icon} size={14} /><span>{item.label}</span></Link>)}</nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {isOwner && <Link href="/owner" className="hidden sm:inline-flex min-h-9 items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/25" title="Return to owner dashboard"><Icon name="owner" size={14} /><span>Owner</span></Link>}
            <Link href="/more" className={`inline-flex min-h-9 min-w-[3.25rem] items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${moreActive ? "bg-[#c2183a] text-white" : "bg-white/15 text-white hover:bg-white/25"}`}><Icon name="more" size={14} /><span>More</span></Link>
            <button type="button" onClick={() => setMoreOpen(true)} className="hidden min-h-9 items-center rounded-md border border-white/20 px-2 text-[10px] text-white/80 hover:bg-white/10 sm:inline-flex" title="Open side menu">Menu</button>
            <button type="button" onClick={() => logout()} title="Logout" className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-200 hover:bg-white/10 hover:text-red-100"><Icon name="logout" size={14} /><span>Logout</span></button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-3 py-4 pb-20 sm:px-4 sm:py-5 md:pb-6 lg:px-6 lg:py-6">{children}</main>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 safe-area-bottom md:hidden">
        <nav aria-label="Quick navigation" className="mx-auto grid max-w-lg grid-cols-5">
          {[primaryNav[0], primaryNav[1], primaryNav[2], primaryNav[3]].map((item) => (
            <Link key={item.href} href={item.href} title={item.label} className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${isActive(pathname, item.href) ? "text-[#c2183a]" : "text-gray-500"}`}><Icon name={item.icon} size={18} /><span>{item.label}</span></Link>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-gray-500"><Icon name="more" size={18} /><span>All modules</span></button>
        </nav>
      </div>
      <MoreSidebar open={moreOpen} onClose={() => setMoreOpen(false)} pathname={pathname} onLogout={() => logout()} isOwner={isOwner} />
    </div>
  );
}