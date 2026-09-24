/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "tesseract.js"],
};

export default nextConfig;
