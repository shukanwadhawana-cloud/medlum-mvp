import { fileURLToPath } from "node:url";

/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "tesseract.js"],
  webpack: (config) => {
    // Route every clinical catalog UI import through the expanded catalog so
    // the full specialty lab + imaging menu is present in production builds.
    config.resolve.alias["@/lib/diagnostic-catalog"] = fileURLToPath(
      new URL("./src/lib/diagnostic-catalog-extended.ts", import.meta.url)
    );
    return config;
  },
};

export default nextConfig;
