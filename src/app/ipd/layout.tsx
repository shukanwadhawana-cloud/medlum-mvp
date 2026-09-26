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

    </>
  );
}
