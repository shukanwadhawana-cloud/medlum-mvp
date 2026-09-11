"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiMe } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const me = await apiMe();
      if (me.success && me.doctor) router.replace("/dashboard");
      else router.replace("/login");
    })();
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white">
      Loading MedLum...
    </div>
  );
}
