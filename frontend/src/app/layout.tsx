import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reg2Schedg — Command Center",
  description:
    "UCSD academic schedule planner: upload your WebReg schedule, explore course evaluations, and plan your quarter.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${outfit.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} antialiased min-h-screen hub-canvas`}
      >
        {children}
      </body>
    </html>
  );
}
