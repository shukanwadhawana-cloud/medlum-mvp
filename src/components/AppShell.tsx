"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDoctor } from "./DoctorProvider";
import { menuNavForRole, primaryNavForRole } from "@/lib/permissions";
import MedLumChat from "./MedLumChat";

const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<string, React.ReactNode> = {
    brand: (<><path d="M4 17V7l4 4 4-6 4 6 4-4v10" /><path d="M8 17h8" /></>),
    patients: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.2 2.5-5 6-5s6 1.8 6 5" /><path d="M17 11a3 3 0 1 0-1-5.8" /><path d="M17 15c2.5.2 4 1.8 4 5" /></>),
    ipd: (<><path d="M4 21V5h16v16" /><path d="M8 9h8M8 13h8M8 17h3M15 15v5M12 17h6" /></>),
    ai: (<><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="5" /><path d="m10 12 1.4 1.5L14.5 10" /></>),
    calendar: (<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>),
    video: (<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>),
    emergency: (<><path d="M12 3 21 20H3z" /><path d="M12 9v5M12 17h.01" /></>),
    labs: (<><path d="M9 3h6M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-8V3" /><path d="M8 16h8" /></>),
    diagnostics: (<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M8 10.5h5M10.5 8v5" /></>),
    pharmacy: (<><path d="m7 3 14 14-4 4L3 7z" /><path d="m14 6-8 8" /></>),
    blood: (<><path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z" /><path d="M9 15c.4 1.4 1.3 2.2 2.7 2.5" /></>),
    insurance: (<><path d="M12 3 20 6v6c0 5-3.2 8-8 9-4.8-1-8-4-8-9V6z" /><path d="m8 12 2.5 2.5L16 9" /></>),
    reports: (<><path d="M5 20V9M12 20V4M19 20v-7" /><path d="M3 20h18" /></>),
    rx: (<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h5M8 12h8M8 16h4" /><path d="m14 8 3 3" /></>),
    billing: (<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h3" /><path d="M15 15h1" /></>),
    clinic: (<><path d="M4 21V6l8-3 8 3v15" /><path d="M8 21v-5h8v5M9 9h6M12 7v4M10 9h4" /></>),
    logout: (<><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 4h5v16h-5" /></>),
    more: (<><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>),
    owner: (<><path d="M12 3l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7z" /><path d="M9 12h6M12 9v6" /></>),
    duty: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="M9 16h6" /></>),
    people: (<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3 20c0-3.5 2.5-5.5 6-5.5s6 2 6 5.5" /><path d="M15 15c3 .2 5 1.8 5 5" /></>),
  };
  return <svg {...common}>{paths[name] || paths.more}</svg>;
};

const isActive = (pathname: string, href: string) =>
  pathname === href ||
  (href === "/opd" && pathname.startsWith("/opd")) ||
  (href === "/patients" && pathname.startsWith("/patients/")) ||
  (href === "/telemedicine" && pathname.startsWith("/telemedicine")) ||
  (href === "/help" && pathname.startsWith("/help")) ||
  (href === "/pricing" && pathname.startsWith("/pricing")) ||
  (href === "/more" && pathname.startsWith("/more")) ||
  (href === "/duty" && pathname.startsWith("/duty")) ||
  (href === "/workforce" && pathname.startsWith("/workforce")) ||
  (href === "/people" && pathname.startsWith("/people")) ||
  (href === "/clinic" && (pathname === "/clinic" || pathname.startsWith("/clinic?"))) ||
  (href === "/nursing" && pathname.startsWith("/nursing"));

function MoreSidebar({
  open,
  onClose,
  pathname,
  onLogout,
  menuItems,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  onLogout: () => void;
  menuItems: Array<{ href: string; label: string; icon: string }>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-[min(22rem,92vw)] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-[#140a1f]">Menu</p>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-4">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Operations & settings</p>
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm ${
                  isActive(pathname, item.href) ? "bg-red-50 font-medium text-[#c2183a]" : "text-[#140a1f]"
                }`}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </Link>
            ))}
            <Link href="/help" onClick={onClose} className="mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm text-[#140a1f]">
              <Icon name="reports" size={16} /><span>Help & FAQs</span>
            </Link>
            <Link href="/pricing" onClick={onClose} className="mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm text-[#140a1f]">
              <Icon name="billing" size={16} /><span>Pricing & plans</span>
            </Link>
          </div>
        </div>
        <div className="border-t p-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white"
          >
            Logout
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { doctor, logout } = useDoctor();
  const [moreOpen, setMoreOpen] = useState(false);
  const [facilities, setFacilities] = useState<Array<{ clinicId: string; name: string; role: string }>>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [switchingFacility, setSwitchingFacility] = useState(false);

  const activeRole = useMemo(() => {
    if (selectedFacilityId) {
      const match = facilities.find((f) => f.clinicId === selectedFacilityId);
      if (match?.role) return match.role;
    }
    return doctor?.primaryRole || "Consultant";
  }, [selectedFacilityId, facilities, doctor?.primaryRole]);

  const isOwner = Boolean(doctor?.isOwner);
  const primaryNav = useMemo(() => primaryNavForRole(activeRole), [activeRole]);
  const menuItems = useMemo(() => menuNavForRole(activeRole), [activeRole]);

  useEffect(() => {
    if (!doctor) return;
    fetch("/api/clinic/access", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setFacilities(Array.isArray(data.facilities) ? data.facilities : []);
        setSelectedFacilityId(typeof data.clinicId === "string" ? data.clinicId : "");
      })
      .catch(() => {});
  }, [doctor]);

  const switchFacility = async (clinicId: string) => {
    if (!clinicId || clinicId === selectedFacilityId || switchingFacility) return;
    setSwitchingFacility(true);
    try {
      const res = await fetch("/api/clinic/access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
        body: JSON.stringify({ clinicId }),
      });
      if (!res.ok) {
        setSwitchingFacility(false);
        return;
      }
      setSelectedFacilityId(clinicId);
      window.location.reload();
    } catch {
      setSwitchingFacility(false);
    }
  };

  const moreActive =
    menuItems.some((item) => isActive(pathname, item.href)) ||
    pathname.startsWith("/more") ||
    pathname.startsWith("/owner");

  const quickNav = primaryNav.slice(0, 4);

  return (
    <div className="min-h-screen bg-[var(--ml-canvas)] text-[var(--ml-ink)]"><div className="flex min-h-screen">
      <aside className="medlum-clinical-sidebar sticky top-0 hidden h-screen w-[230px] md:flex shrink-0 overflow-y-auto md:block"><div className="px-5 pt-5"><Link href="/dashboard" className="text-white"><span className="text-[22px] font-bold tracking-tight">MEDLUM</span></Link><p className="mt-0.5 text-xs text-[#b8c2d1]">Clinical workspace</p></div><nav className="mt-7 px-5 pb-5">{primaryNav.map((item)=><Link key={item.href} href={item.href} aria-current={isActive(pathname,item.href)?"page":undefined} className={`medlum-clinical-nav-item mb-1 flex min-h-[38px] items-center gap-2 rounded-[14px] px-3 text-xs font-medium ${isActive(pathname,item.href)?"is-active":""}`}><Icon name={item.icon} size={15}/><span>{item.label}</span></Link>)}<div className="my-4 border-t border-white/10"/>{menuItems.slice(0,5).map((item)=><Link key={item.href} href={item.href} aria-current={isActive(pathname,item.href)?"page":undefined} className={`medlum-clinical-nav-item mb-1 flex min-h-[38px] items-center gap-2 rounded-[14px] px-3 text-xs font-medium ${isActive(pathname,item.href)?"is-active":""}`}><Icon name={item.icon} size={15}/><span>{item.label}</span></Link>)}<button type="button" onClick={()=>setMoreOpen(true)} className="medlum-clinical-nav-item mt-1 flex min-h-[38px] w-full items-center gap-2 rounded-[14px] px-3 text-xs font-medium"><Icon name="more" size={15}/><span>More</span></button></nav></aside>
      <div className="min-w-0 flex-1"><header className="border-b border-[var(--ml-border)] bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-[66px] max-w-[1360px] items-center gap-3 px-4 sm:px-6 lg:px-8"><div className="min-w-0 flex-1"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ml-muted)]">MedLum Clinical Workspace</p><p className="truncate text-lg font-bold tracking-tight text-[var(--ml-ink)]">{doctor?.name || "Clinical dashboard"}</p></div>{facilities.length>0&&<select value={selectedFacilityId} onChange={(e)=>switchFacility(e.target.value)} disabled={switchingFacility} className="hidden h-9 max-w-[13rem] rounded-lg border border-[var(--ml-border)] bg-white px-3 text-xs text-[var(--ml-ink)] sm:block">{facilities.map(f=><option key={f.clinicId} value={f.clinicId}>{f.name}</option>)}</select>}{isOwner&&<Link href="/owner" className="hidden min-h-9 items-center gap-1.5 rounded-lg border border-[var(--ml-border)] bg-white px-2.5 text-xs font-medium text-[var(--ml-ink)] sm:inline-flex"><Icon name="owner" size={14}/><span>Owner</span></Link>}<button type="button" onClick={()=>setMoreOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--ml-border)] bg-white px-2.5 text-xs font-medium text-[var(--ml-ink)]"><Icon name="more" size={14}/><span className="hidden sm:inline">Menu</span></button><button type="button" onClick={()=>logout()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--ml-border)] bg-white px-2.5 text-xs font-medium text-[var(--ml-ink)]"><Icon name="logout" size={14}/><span className="hidden sm:inline">Logout</span></button></div></header><main className="mx-auto w-full max-w-7xl max-w-[1360px] min-w-0 px-4 py-5 pb-24 sm:px-6 md:py-6 lg:px-8">{children}</main></div></div>
      <div className="medlum-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur safe-area-bottom md:hidden"><nav className="mx-auto grid max-w-lg grid-cols-5">{quickNav.map(item=><Link key={item.href} href={item.href} title={item.label} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium ${isActive(pathname,item.href)?"text-[#c2183a]":"text-gray-500"}`}><Icon name={item.icon} size={18}/><span>{item.label}</span></Link>)}<button type="button" onClick={()=>setMoreOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-gray-500"><Icon name="more" size={18}/><span>Menu</span></button></nav></div>
      <MoreSidebar open={moreOpen} onClose={()=>setMoreOpen(false)} pathname={pathname} onLogout={()=>logout()} menuItems={menuItems}/><MedLumChat /></div>
  );
}
