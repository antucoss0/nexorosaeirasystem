import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import "./theme.css";
import { NetworkGuard } from "@/components/network-guard";
import { Intro, introBootScript } from "@/components/intro";
const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });
export const metadata: Metadata = {
  title: "Nexo Rosa · EIRA",
  description: "Un mismo cuidado. Un expediente único.",
  appleWebApp: { capable: true, title: "Nexo Rosa" },
};
export const viewport: Viewport = {
  themeColor: "#06040a",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introBootScript }} />
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="use-credentials"
        />
      </head>
      <body className={montserrat.className}>
        <Intro />
        <NetworkGuard />
        {children}
      </body>
    </html>
  );
}
