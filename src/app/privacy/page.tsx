export const metadata = {
  title: "Privacy Policy | MedLum",
  description: "How MedLum handles account, clinical, and operational data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12 text-slate-100">
      <div className="space-y-8 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <header>
          <p className="text-sm font-medium text-violet-300">MedLum</p>
          <h1 className="mt-2 text-3xl font-semibold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: September 14, 2026</p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-slate-300">
          <p>MedLum is a clinical operations platform intended for authorized healthcare professionals and organizations. This policy explains the categories of information the service may process and the safeguards we apply.</p>
          <h2 className="text-xl font-semibold text-white">Information we process</h2>
          <p>Depending on how MedLum is configured, this can include account and organization details, patient and clinical information entered by authorized users, operational records, audit information, and technical information required to operate and secure the service.</p>
          <h2 className="text-xl font-semibold text-white">Use of information</h2>
          <p>Information is used to provide clinical workflows, authenticate users, enforce organization and role permissions, maintain auditability, secure the platform, provide support, and improve reliability. We do not intentionally use patient clinical data for advertising.</p>
          <h2 className="text-xl font-semibold text-white">Security</h2>
          <p>MedLum is designed to use encrypted transport, server-side secrets, access controls, audit records, and least-privilege principles. No internet service can guarantee absolute security, so organizations remain responsible for authorized access and appropriate operational safeguards.</p>
          <h2 className="text-xl font-semibold text-white">Cookies and analytics</h2>
          <p>Essential cookies or similar technologies may be used for authentication and security. Optional analytics may be enabled to understand product usage. Analytics should be configured so that patient-identifiable or clinical content is not sent as analytics properties.</p>
          <h2 className="text-xl font-semibold text-white">Your responsibilities</h2>
          <p>Healthcare organizations must ensure that their use of MedLum complies with applicable healthcare, privacy, retention, consent, and professional obligations in their jurisdiction.</p>
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p>For privacy questions or requests, contact the MedLum service administrator through the support channel provided by your organization.</p>
          <p className="pt-4 text-xs text-slate-500">This page is a product-level privacy notice and is not legal advice. Before production use with patient data, have the final policy reviewed for the jurisdictions and contractual arrangements that apply to your organization.</p>
        </section>
      </div>
    </main>
  );
}
