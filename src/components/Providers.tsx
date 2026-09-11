"use client";

import { DoctorProvider } from "./DoctorProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <DoctorProvider>{children}</DoctorProvider>;
}
