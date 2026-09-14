"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useDoctor } from "./DoctorProvider";

const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<string, React.ReactNode> = {
    brand: (
      <>
        <path d="M4 17V7l4 4 4-6 4 6 4-4v10" />
        <path d="M8 17h8" />
      </>
    ),
    patients: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.2 2.5-5 6-5s6 1.8 6 5" />
        <path d="M17 11a3 3 0 1 0-1-5.8" />
        <path d="M17 15c2.5.2 4 1.8 4 5" />
      </>
    ),
    ipd: (
      <>
        <path d="M4 21V5h16v16" />
        <path d="M8 9h8M8 13h8M8 17h3M15 15v5M12 17h6" />
      </>
    ),
    ai: (
      <>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        <circle cx="12" cy="12" r="5" />
        <path d="m10 12 1.4 1.5L14.5 10" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3z" />
      </>
    ),
    emergency: (
      <>
        <path d="M12 3 21 20H3z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    labs: (
      <>
        <path d="M9 3h6M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-8V3" />
        <path d="M8 16h8" />
      </>
    ),
    diagnostics: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5M8 10.5h5M10.5 8v5" />
      </>
    ),
    pharmacy: (
      <>
        <path d="m7 3 14 14-4 4L3 7z" />
        <path d="m14 6-8 8" />
      </>
    ),
    blood: (
      <>
        <path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z" />
        <path d="M9 15c.4 1.4 1.3 2.2 2.7 2.5" />
      </>
    ),
    insurance: (
      <>
        <path d="M12 3 20 6v6c0 5-3.2 8-8 9-4.8-1-8-4-8-9V6z" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    reports: (
      <>
        <path d="M5 20V9M12 20V4M19 20v-7" />
        <path d="M3 20h18" />
      </>
    ),
    rx: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 8h5M8 12h8M8 16h4" />
        <path d="m14 8 3 3" />
      </>
    ),
    billing: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8M8 11h8M8 15h3" />
        <path d="M15 15h1" />
      </>
    ),
    clinic: (
      <>
        <path d="M4 21V6l8-3 8 3v15" />
        <path d="M8 21v-5h8v5M9 9h6M12 7v4M10 9h4" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M14 4h5v16h-5" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.5 1-1.5 2.2" />
        <path d="M12 17h.01" />
      </>
    ),
    pricing: (
      <>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
    close: (
      <>
        <path d="M6 6l12 12M18 6 6 18" />
      </>
    ),
  };
  return <svg {...common}>{paths[name] ?? paths.brand}</svg>;
};

const primaryNav = [
  { href: "/dashboard", label: "OPD", icon: "clinic" },
  { href: "/patients", label: "Patients", icon: "patients" },
  { href: "/ipd", label: "IPD", icon: "ipd" },
  { href: "/appointments", label: "Appts", icon: "calendar" },
  { href: "/emergency", label: "Emergency", icon: "emergency" },
  { href: "/labs", label: "Labs", icon: "labs" },
  { href: "/diagnostics", label: "Diagnostics", icon: "diagnostics" },
  { href: "/pharmacy", label: "Pharmacy", icon: "pharmacy" },
  { href: "/telemedicine", label: "Video", icon: "video" },
];

const moreNav = [
  { href: "/pricing", label: "Pricing & plans", icon: "pricing", group: "Account" },
  { href: "/help", label: "Help center & FAQs", icon: "help", group: "Account" },
  { href: "/billing", label: "Patient billing", icon: "billing", group: "Clinic" },
  { href: "/blood-bank", label: "Blood bank", icon: "blood", group: "Clinic" },
  { href: "/insurance", label: "Insurance", icon: "insurance", group: "Clinic" },
  { href: "/reports", label: "Reports", icon: "reports", group: "Clinic" },
  { href: "/prescriptions", label: "Prescriptions", icon: "rx", group: "Clinic" },
  { href: "/clinic", label: "Clinic settings", icon: "clinic", group: "Clinic" },
  { href: "/clinical-assist", label: "AI Assist", icon: "ai", group: "Clinic" },
];

const isActive = (pathname: string, href: string) =>
  pathname === href ||
  (href === "/patients" && pathname.startsWith("/patients/")) ||
  (href === "/telemedicine" && pathname.startsWith("/telemedicine")) ||
  (href === "/help" && pathname.startsWith("/help")) ||
  (href === "/pricing" && pathname.startsWith("/pricing"));

function MoreSidebar({
  open,
  onClose,
  pathname,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  onLogout: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const groups = ["Account", "Clinic"] as const;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="More menu">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-[min(100%,20rem)] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-bold text-[#140a1f]">More</div>
            <div className="text-[11px] text-gray-500">Pricing, help, modules & settings</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border text-[#140a1f]"
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{group}</div>
              <ul className="space-y-0.5">
                {moreNav
                  .filter((i) => i.group === group)
                  .map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${
                            active ? "bg-[#c2183a]/10 font-semibold text-[#c2183a]" : "text-gray-800 hover:bg-gray-50"
                          }`}
                        >
                          <span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-[#c2183a]/15" : "bg-gray-100"}`}>
                            <Icon name={item.icon} size={16} />
                          </span>
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t p-3 safe-area-bottom">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-700"
          >
            <Icon name="logout" size={16} />
            Logout
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useDoctor();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreNav.some((i) => isActive(pathname, i.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreButton = (
    <button
      type="button"
      onClick={() => setMoreOpen(true)}
      aria-expanded={moreOpen}
      aria-haspopup="dialog"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
        moreActive || moreOpen ? "bg-[#c2183a] font-medium text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon name="more" size={14} />
      <span>More</span>
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      <header className="sticky top-0 z-40 bg-[#140a1f] text-white shadow-sm">
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-6">
          <div className="flex h-12 items-center gap-2 sm:h-14 sm:gap-3">
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center gap-2 text-base font-bold sm:text-lg"
              aria-label="MedLum dashboard"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon name="brand" size={17} />
              </span>
              <span className="hidden xs:inline sm:inline">MedLum</span>
            </Link>

            <nav
              aria-label="Primary navigation"
              className="hidden md:flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none"
            >
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  title={item.label}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    isActive(pathname, item.href)
                      ? "bg-[#c2183a] font-medium"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon name={item.icon} size={14} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <nav
              aria-label="Mobile navigation"
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-none md:hidden"
            >
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  title={item.label}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs ${
                    isActive(pathname, item.href) ? "bg-[#c2183a] font-medium" : "text-white/70"
                  }`}
                >
                  <Icon name={item.icon} size={14} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Fixed outside the scroll strip so More always receives taps */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {moreButton}
              <button
                type="button"
                onClick={() => logout()}
                title="Logout"
                className="hidden items-center gap-1.5 px-1 py-2 text-xs text-red-300 hover:text-red-200 md:inline-flex"
              >
                <Icon name="logout" size={14} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-3 py-4 pb-20 sm:px-4 sm:py-5 md:pb-6 lg:px-6 lg:py-6">
        {children}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 safe-area-bottom md:hidden">
        <nav aria-label="Quick navigation" className="mx-auto grid max-w-lg grid-cols-5">
          {[primaryNav[0], primaryNav[1], primaryNav[2], primaryNav[3]].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${
                isActive(pathname, item.href) ? "text-[#c2183a]" : "text-gray-500"
              }`}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${
              moreActive || moreOpen ? "text-[#c2183a]" : "text-gray-500"
            }`}
          >
            <Icon name="more" size={18} />
            <span>More</span>
          </button>
        </nav>
      </div>

      <MoreSidebar open={moreOpen} onClose={() => setMoreOpen(false)} pathname={pathname} onLogout={() => logout()} />
    </div>
  );
}
