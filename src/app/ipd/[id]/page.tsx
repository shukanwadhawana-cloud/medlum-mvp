"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import MedicationAdministrationPanel from "@/components/ipd/MedicationAdministrationPanel";
import MedOrderPanel from "@/components/ipd/MedOrderPanel";

export default function IPDPatientWorkspace(){
  return <AppShell><div className="p-4"><p className="text-sm">IPD clinical workspace loading… Restore full page via fix-ipd-cprs-simple workflow or re-push from local cprs-ux/ipd-id-page-patched.tsx.</p><p className="text-xs text-gray-500 mt-2">MedOrderPanel is available at @/components/ipd/MedOrderPanel.</p></div></AppShell>;
}
