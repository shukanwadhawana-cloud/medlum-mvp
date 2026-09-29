"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDoctor } from "@/components/DoctorProvider";

type Clinic = { id: string; name: string; role: string; isActive: boolean };
type Overview = { ownerWorkspace?: { myClinics?: Clinic[] } };

export default function OwnerDataMigrationPage() {
  const { doctor, loading } = useDoctor();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinic, setSelectedClinic] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [validating, setValidating] = useState(false);\n  const [packageData, setPackageData] = useState<unknown>(null);\n  const [preflight, setPreflight] = useState(false);\n  const [readyToImport, setReadyToImport] = useState(false);\n  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!doctor?.isOwner) return;
    fetch("/api/owner/overview", { cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Unable to load facilities"); return j as Overview; })
      .then(j => {
        const list = j.ownerWorkspace?.myClinics || [];
        setClinics(list);
        setSelectedClinic(list[0]?.id || "");
      })
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load facilities"));
  }, [doctor]);

  async function validate(file: File) {
    setError(""); setMessage(""); setReadyToImport(false); setValidating(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setPackageData(json);
      const r = await fetch("/api/owner/data-migration/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: json, targetClinicId: selectedClinic }),
      });
      const j = await r.json();
      if (!r.ok || !j.valid) throw new Error((j.errors || ["Migration package preflight failed"]).join(" "));
      setReadyToImport(true);
      setMessage("Package preflight passed. No records were written. Review the target facility and click Import to commit the migration atomically.");
    } catch (e) {
      setPackageData(null);
      setError(e instanceof Error ? e.message : "Could not validate package");
    } finally { setValidating(false); }
  }

  async function executeImport() {
    if (!packageData || !selectedClinic) return;
    setError(""); setMessage(""); setImporting(true);
    try {
      const r = await fetch("/api/owner/data-migration/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageData, targetClinicId: selectedClinic, execute: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.executed) throw new Error((j.errors || ["Migration failed"]).join(" "));
      setReadyToImport(false);
      setPackageData(null);
      setMessage("Migration completed. Existing Master Owner was preserved. Sensitive authentication/storage records remain intentionally deferred.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally { setImporting(false); }
  }
