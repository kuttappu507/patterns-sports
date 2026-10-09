import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no build-time Google Fonts network fetch).
// Poppins carries the whole UI — geometric, sporty, athletic letterforms.
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/poppins/400-italic.css";
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
  themeColor: "#f5f7fd",
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
