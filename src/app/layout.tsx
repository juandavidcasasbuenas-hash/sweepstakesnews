import type { Metadata } from "next";
import { Archivo, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-body",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Sweepstakes News",
  description: "World Cup 2026 prediction game and live standings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
