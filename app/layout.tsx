import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { NetworkGuard } from "@/components/network-guard";
const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });
export const metadata: Metadata = {
  title: "Nexo Rosa · EIRA",
  description: "Un mismo cuidado. Un expediente único.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nexo Rosa" },
};
export const viewport: Viewport = {
  themeColor: "#E4007C",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={montserrat.className}>
        <NetworkGuard />
        {children}
      </body>
    </html>
  );
}
