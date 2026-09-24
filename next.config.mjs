import { fileURLToPath } from "node:url";

/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "tesseract.js"],
  webpack: (config) => {
    config.resolve.alias["@/lib/diagnostic-catalog"] = fileURLToPath(
      new URL("./src/lib/diagnostic-catalog-extended.ts", import.meta.url)
    );
    return config;
  },
};

export default nextConfig;
