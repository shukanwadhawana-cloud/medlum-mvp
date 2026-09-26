"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function IPDLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const match = pathname.match(/^\/ipd\/([^/]+)(?:\/clinical)?$/);
  const patientId = match?.[1];
  if (!patientId) return children;

  return (
    <>
      {children}
      <div className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border bg-white/95 p-1.5 shadow-lg backdrop-blur print:hidden">
        <Link href={`/ipd/${patientId}/timeline`} className="h-8 rounded-xl border px-3 inline-flex items-center text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
          Timeline
        </Link>
        <Link href={`/ipd/${patientId}/orders`} className="h-8 rounded-xl border px-3 inline-flex items-center text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
          Investigations
        </Link>
        <Link href={`/ipd/${patientId}/discharge`} className="h-8 rounded-xl bg-[#c2183a] px-3 inline-flex items-center text-[11px] font-semibold text-white">
          Discharge
        </Link>
      </div>
    </>
  );
}
