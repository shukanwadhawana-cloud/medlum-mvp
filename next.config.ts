import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild ? { output: "export" as const, trailingSlash: true } : {}),
  // Optional R2 SDK — do not fail the build when not installed
  serverExternalPackages: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner", "pdf-parse"],
};

export default nextConfig;
