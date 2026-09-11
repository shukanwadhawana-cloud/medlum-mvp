"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDoctor } from "@/components/DoctorProvider";

export default function Home() {
  const router = useRouter();
  const { doctor, loading } = useDoctor();

  useEffect(() => {
    if (loading) return;
    if (doctor) router.replace("/dashboard");
    else router.replace("/login");
  }, [doctor, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">
      Loading MedLum...
    </div>
  );
}
