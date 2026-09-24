/** @type {import("next").NextConfig} */
const nextConfig = {
  // Keep only the native canvas module external at runtime. The OCR/PDF JS
  // packages remain bundleable so Vercel does not attempt to expose their
  // Node-only entrypoints to middleware/edge builds.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
