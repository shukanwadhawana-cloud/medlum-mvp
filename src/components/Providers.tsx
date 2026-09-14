"use client";

import { DoctorProvider } from "./DoctorProvider";
import CookieConsent from "./CookieConsent";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DoctorProvider>
      {children}
      <CookieConsent />
    </DoctorProvider>
  );
}
