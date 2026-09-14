"use client";

import { DoctorProvider } from "./DoctorProvider";
import CookieConsent from "./CookieConsent";
import Analytics from "./Analytics";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DoctorProvider>
      {children}
      <Analytics />
      <CookieConsent />
    </DoctorProvider>
  );
}
