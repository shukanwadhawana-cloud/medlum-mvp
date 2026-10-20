"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDoctor } from "./DoctorProvider";
import { menuNavForRole, primaryNavForRole } from "@/lib/permissions";
import MedLumChat from "./MedLumChat";

const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<string, React.ReactNode> = {
    brand: (<><path d="M4 18V6l8 8 8-8v12" stroke="#9e1430" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 7v10M7 12h10" stroke="#e95c83" strokeWidth="2.2" strokeLinecap="round"/></>),
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
    duty: (<><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>),
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { doctor, logout } = useDoctor();
  const [facilities, setFacilities] = useState<Array<{ clinicId: string; name: string; role: string }>>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [switchingFacility, setSwitchingFacility] = useState(false);
  const [mobileModulesOpen, setMobileModulesOpen] = useState(false);

  const isOwner = Boolean(doctor?.isOwner);
  // Platform Owner navigation is independent of the selected facility membership.
  const activeRole = useMemo(() => {
    if (isOwner) return "Owner";
    if (selectedFacilityId) return facilities.find((f) => f.clinicId === selectedFacilityId)?.role || doctor?.primaryRole || "Consultant";
    return doctor?.primaryRole || "Consultant";
  }, [isOwner, selectedFacilityId, facilities, doctor?.primaryRole]);
  const primaryNav = useMemo(() => primaryNavForRole(activeRole), [activeRole]);
  const mobileWorkflowItems = useMemo(() => ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Dietitian", "Dietician", "Nutritionist", "Physiotherapist"].includes(activeRole)
    ? [{ href: "/physiotherapy", label: "Physiotherapy", icon: "people" }, { href: "/dietitian", label: "Dietitian", icon: "labs" }]
    : [], [activeRole]);
  const sidebarItems = useMemo(() => {
    const items = menuNavForRole(activeRole);
    const ownerItems = isOwner ? [{ href: "/owner", label: "Owner workspace", icon: "owner" }] : [];
    const aiAssist = items.filter((item) => item.href === "/clinical-assist");
    const duty = items.filter((item) => item.href === "/duty");
    const rest = items.filter((item) => item.href !== "/clinical-assist" && item.href !== "/duty");
    const patientsIndex = rest.findIndex((item) => item.href === "/patients");
    const beforeAi = patientsIndex >= 0 ? rest.slice(0, patientsIndex + 1) : rest;
    const afterAi = patientsIndex >= 0 ? rest.slice(patientsIndex + 1) : [];
    const clinicalWorkflowItems = ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Dietitian", "Dietician", "Nutritionist", "Physiotherapist"].includes(activeRole)
      ? [{ href: "/physiotherapy", label: "Physiotherapy", icon: "people" }, { href: "/dietitian", label: "Dietitian / Nutrition", icon: "labs" }]
      : [];
    return [...ownerItems, ...beforeAi, ...aiAssist, ...afterAi, ...duty, ...clinicalWorkflowItems];
  }, [isOwner, activeRole]);

  useEffect(() => {
    if (!doctor) return;
    fetch("/api/clinic/access", { credentials: "include", cache: "no-store" }).then(async (res) => res.ok ? res.json() : null).then((data) => {
      if (!data) return;
      setFacilities(Array.isArray(data.facilities) ? data.facilities : []);
      setSelectedFacilityId(typeof data.clinicId === "string" ? data.clinicId : "");
    }).catch(() => {});
  }, [doctor]);

  const switchFacility = async (clinicId: string) => {
    if (!clinicId || clinicId === selectedFacilityId || switchingFacility) return;
    setSwitchingFacility(true);
    try {
      const res = await fetch("/api/clinic/access", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" }, body: JSON.stringify({ clinicId }) });
      if (!res.ok) return;
      setSelectedFacilityId(clinicId);
      window.location.reload();
    } finally { setSwitchingFacility(false); }
  };


  return (
    <div className="medlum-app min-h-screen bg-[var(--ml-canvas)] text-[var(--ml-ink)]">
      <header className="medlum-topbar">
        <div className="medlum-topbar-inner max-w-7xl">
          <Link href="/dashboard" className="medlum-brand">
            <span className="medlum-brand-mark"><Icon name="brand" size={20}/></span>
            <span><strong>MEDLUM HEALTHCARE</strong><small>Clinical workspace</small></span>
          </Link>
          <div className="medlum-topbar-spacer"/>
          {facilities.length > 0 && <select value={selectedFacilityId} onChange={(e) => switchFacility(e.target.value)} disabled={switchingFacility} className="medlum-facility-select" aria-label="Select facility">{facilities.map((f) => <option key={f.clinicId} value={f.clinicId}>{f.name}</option>)}</select>}
          <span className="medlum-user-name">{doctor?.name || "Clinical user"}</span>
          <button type="button" onClick={() => logout()} className="medlum-top-action medlum-logout-action"><Icon name="logout" size={14}/>Logout</button>
        </div>
      </header>

      <nav className="medlum-primary-nav hidden md:flex" aria-label="Clinical navigation">
        <div className="medlum-primary-nav-inner"><Link href="/dashboard" className="medlum-sidebar-brand"><span className="medlum-brand-mark"><Icon name="brand" size={20}/></span><span><strong>MEDLUM HEALTHCARE</strong><small>Clinical workspace</small></span></Link>
          {sidebarItems.map((item) => <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={`medlum-primary-nav-item ${isActive(pathname, item.href) ? "is-active" : ""}`}><Icon name={item.icon} size={15}/><span>{item.label}</span></Link>)}
        </div>
      </nav>

      <main className="medlum-main">{children}</main>

      {mobileModulesOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="All MedLum modules">
          <button type="button" className="absolute inset-0 h-full w-full bg-black/40" aria-label="Close all modules" onClick={() => setMobileModulesOpen(false)} />
          <section id="mobile-all-modules" className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-2xl border-t border-[var(--ml-border)] bg-[var(--ml-surface)] shadow-2xl safe-area-bottom">
            <div className="flex items-center justify-between border-b border-[var(--ml-border)] px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-[var(--ml-ink)]">All Modules</h2>
                <p className="text-xs text-[var(--ml-muted)]">Every module available to your role</p>
              </div>
              <button type="button" onClick={() => setMobileModulesOpen(false)} className="rounded-lg border px-3 py-2 text-sm font-semibold" aria-label="Close all modules">Close</button>
            </div>
            <nav className="grid grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-3" aria-label="All available modules">
              {sidebarItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileModulesOpen(false)} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium ${isActive(pathname, item.href) ? "border-[#c2183a] bg-red-50 text-[#c2183a]" : "border-[var(--ml-border)] bg-white text-[var(--ml-ink)]"}`}>
                  <Icon name={item.icon} size={18} />
                  <span className="min-w-0">{item.label}</span>
                </Link>
              ))}
            </nav>
          </section>
        </div>
      )}
      <div className="medlum-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur safe-area-bottom md:hidden">
        <nav className="mx-auto flex max-w-full items-stretch gap-1 px-2" aria-label="Mobile navigation">
          <button type="button" onClick={() => setMobileModulesOpen(true)} aria-expanded={mobileModulesOpen} aria-controls="mobile-all-modules" className="flex min-h-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-r border-[var(--ml-border)] px-3 text-[11px] font-bold text-[#c2183a]">
            <Icon name="more" size={19} />
            <span>All Modules</span>
          </button>
          <div className="flex min-w-0 flex-1 overflow-x-auto gap-1 scrollbar-none">
            {primaryNav.map((item) => <Link key={item.href} href={item.href} title={item.label} className={`flex min-w-[66px] min-h-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium ${isActive(pathname, item.href) ? "text-[#c2183a] bg-red-50" : "text-gray-500"}`}><Icon name={item.icon} size={18}/><span className="truncate max-w-[62px]">{item.label}</span></Link>)}
          </div>
        </nav>
      </div>
      <MedLumChat />
    </div>
  );
}
