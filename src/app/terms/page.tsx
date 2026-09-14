export const metadata = {
  title: "Terms & Conditions | MedLum",
  description: "Terms governing use of the MedLum clinical operations platform.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12 text-slate-100">
      <div className="space-y-8 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <header>
          <p className="text-sm font-medium text-violet-300">MedLum</p>
          <h1 className="mt-2 text-3xl font-semibold">Terms &amp; Conditions</h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: September 14, 2026</p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-slate-300">
          <h2 className="text-xl font-semibold text-white">Use of MedLum</h2>
          <p>MedLum is a software platform for authorized clinical and healthcare operations. It does not replace professional medical judgment, clinical governance, emergency services, or applicable institutional policies.</p>
          <h2 className="text-xl font-semibold text-white">Authorized access</h2>
          <p>Users must keep credentials and sessions secure and must only access information they are authorized to access. Organizations are responsible for assigning appropriate roles and permissions.</p>
          <h2 className="text-xl font-semibold text-white">Clinical responsibility</h2>
          <p>Healthcare professionals remain responsible for clinical decisions, documentation accuracy, orders, prescriptions, patient communication, and compliance with applicable laws and standards. MedLum does not independently diagnose or treat patients.</p>
          <h2 className="text-xl font-semibold text-white">Acceptable use</h2>
          <p>Users must not attempt to bypass access controls, expose credentials or secrets, introduce malicious code, scrape protected data, or use the platform for unlawful purposes.</p>
          <h2 className="text-xl font-semibold text-white">Availability and changes</h2>
          <p>MedLum may be updated, temporarily unavailable, or changed as security, clinical workflow, infrastructure, and product requirements evolve. Production deployments should use the organization's approved backup and continuity procedures.</p>
          <h2 className="text-xl font-semibold text-white">Data and confidentiality</h2>
          <p>Clinical and organizational information must be handled according to the applicable privacy policy, contracts, security controls, and legal requirements. Users must not enter information they are not authorized to process.</p>
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p>Questions about these terms should be directed to the MedLum service administrator or the support channel designated by the deploying organization.</p>
          <p className="pt-4 text-xs text-slate-500">This is a product-level terms template and is not legal advice. Obtain legal review before production use, particularly for contracts involving hospitals, doctors, patients, payments, or regulated health data.</p>
        </section>
      </div>
    </main>
  );
}
