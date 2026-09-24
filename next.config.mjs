/** @type {import("next").NextConfig} */
const nextConfig = {
  // OCR uses native Node modules. Keep them out of the Next/Turbopack bundle
  // and load them at runtime inside the Node serverless/container runtime.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "tesseract.js"],
};

export default nextConfig;
