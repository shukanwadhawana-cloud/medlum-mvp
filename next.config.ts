import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild ? { output: "export" as const, trailingSlash: true } : {}),
  // Keep native/runtime-only packages external while preserving the
  // Capacitor static-export switch and the R2/PDF integrations.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "pdf-parse",
  ],
};

export default nextConfig;
