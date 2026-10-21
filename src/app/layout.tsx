import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://medlumhealth.com"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://medlumhealth.com/",
    siteName: "MedLum Health",
    title: "MedLum Health – Clinical Intelligence",
    description: "MedLum Health — secure hospital and clinic operations platform",
  },
  twitter: {
    card: "summary",
    title: "MedLum Health – Clinical Intelligence",
    description: "MedLum Health — secure hospital and clinic operations platform",
  },
  title: "MedLum Health – Clinical Intelligence",
  description: "MedLum Health — secure hospital and clinic operations platform",
  applicationName: "MedLum Health",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/medlum-icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/medlum-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/medlum-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4a0f20",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
