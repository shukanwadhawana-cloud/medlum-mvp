import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

const appUrl = (process.env.MEDLUM_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "MedLum – Clinical Intelligence", template: "%s | MedLum" },
  description: "Secure multi-doctor clinical operations platform for modern healthcare teams.",
  applicationName: "MedLum",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "MedLum",
    title: "MedLum – Clinical Intelligence",
    description: "Secure multi-doctor clinical operations platform for modern healthcare teams.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "MedLum – Clinical Intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MedLum – Clinical Intelligence",
    description: "Secure multi-doctor clinical operations platform for modern healthcare teams.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#140a1f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
