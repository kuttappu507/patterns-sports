import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no build-time Google Fonts network fetch).
// Sora carries display/headings — geometric, electric, modern.
// Poppins carries body copy — round, sporty, highly readable.
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/poppins/400-italic.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/sora/800.css";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Pattern Sports — Volleyball Academy Management System",
  description:
    "Offline-first volleyball academy management: player profiling, fee collection with POS receipts, attendance, committee showcase, smart reports and A4/thermal printing.",
  icons: {
    icon: "/psams-icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f5fc",
};

// Applied before first paint so the saved theme never flashes.
const themeBootScript = `(function(){try{var t=localStorage.getItem("psams-theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="antialiased font-sans">
        <div className="aurora" aria-hidden>
          <span className="orb-a" />
          <span className="orb-b" />
          <span className="orb-c" />
        </div>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
