import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.MEDLUM_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard/", "/clinic/", "/ipd/", "/opd/"] }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
