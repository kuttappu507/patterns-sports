import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (no build-time Google Fonts network fetch).
import "@fontsource-variable/inter";
import "@fontsource-variable/sora";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "PS-AMS — Pattern Sports Academy Management System",
  description:
    "Offline-first academy management: student profiling, fee collection with POS receipts, attendance, committee showcase, smart reports and A4/thermal printing.",
  icons: {
    icon: "/psams-icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2f5f0",
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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
