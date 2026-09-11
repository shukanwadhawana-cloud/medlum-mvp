"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiMe, apiLogout, ApiDoctor } from "@/lib/api";

type Ctx = {
  doctor: ApiDoctor | null;
  loading: boolean;
  refresh: () => Promise<ApiDoctor | null>;
  logout: () => Promise<void>;
  setDoctor: (d: ApiDoctor | null) => void;
};

const DoctorContext = createContext<Ctx>({
  doctor: null,
  loading: true,
  refresh: async () => null,
  logout: async () => {},
  setDoctor: () => {},
});

const PUBLIC = ["/login", "/signup"];

export function DoctorProvider({ children }: { children: React.ReactNode }) {
  const [doctor, setDoctor] = useState<ApiDoctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    const me = await apiMe();
    if (me.success && me.doctor) {
      setDoctor(me.doctor);
      return me.doctor;
    }
    setDoctor(null);
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const me = await apiMe();
      if (cancelled) return;
      if (me.success && me.doctor) setDoctor(me.doctor);
      else setDoctor(null);
      setLoading(false);
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!checked || loading) return;
    if (!doctor && !PUBLIC.includes(pathname)) {
      router.replace("/login");
    }
  }, [checked, loading, doctor, pathname, router]);

  const logout = useCallback(async () => {
    await apiLogout();
    setDoctor(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ doctor, loading, refresh, logout, setDoctor }),
    [doctor, loading, refresh, logout]
  );

  return <DoctorContext.Provider value={value}>{children}</DoctorContext.Provider>;
}

export function useDoctor() {
  return useContext(DoctorContext);
}
