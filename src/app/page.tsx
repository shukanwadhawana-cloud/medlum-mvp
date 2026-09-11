"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentDoctor } from "@/lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const doctor = getCurrentDoctor();
    if (doctor) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#140a1f]">
      <div className="text-white text-lg">Loading MedLum...</div>
    </div>
  );
}
