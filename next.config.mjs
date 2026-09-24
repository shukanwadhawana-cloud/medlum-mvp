/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "tesseract.js"],
  webpack: (config) => {
    config.resolve.alias["@/lib/diagnostic-catalog"] = require.resolve("./src/lib/diagnostic-catalog-extended.ts");
    return config;
  },
};

export default nextConfig;
