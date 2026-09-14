import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#140a1f] px-6 text-white">
      <section className="max-w-lg text-center">
        <p className="text-sm font-medium text-violet-300">MedLum</p>
        <h1 className="mt-3 text-6xl font-bold">404</h1>
        <h2 className="mt-4 text-2xl font-semibold">Page not found</h2>
        <p className="mt-3 text-slate-400">The page you requested does not exist or is no longer available.</p>
        <Link href="/" className="mt-8 inline-flex rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#140a1f]">Return to MedLum</Link>
      </section>
    </main>
  );
}
