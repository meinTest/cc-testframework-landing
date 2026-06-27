import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { offeredProducts, type ProductId } from "./products";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Per-product SEO copy. The combined (both-offered) variant is the default.
const PRODUCT_META: Record<ProductId, { title: string; description: string }> = {
  "cc-testframework": {
    title:
      "CC-Testframework — TypeScript-Test-Framework für Web, Desktop & Mobile",
    description:
      "TypeScript-Test-Framework mit eingebauten Konventionen für Web, Desktop und Mobile. Playwright und Appium unter einer Oberfläche.",
  },
  "cc-tmgmt": {
    title:
      "CC-Testmanagement — Git-basiertes Test-Management als lokale Windows-App",
    description:
      "Git-basiertes Test-Management-Tool: Fachtester bearbeiten TypeScript-Test-Specs, ganz ohne Git-Handgriffe. Nutzt CC-Testframework als Engine.",
  },
};

// Mirrors PRODUCTS_OFFERED so the title/description match what the site shows.
export async function generateMetadata(): Promise<Metadata> {
  const offered = offeredProducts();
  if (offered.length === 1) {
    return PRODUCT_META[offered[0]];
  }
  return {
    title:
      "CC-Testframework & CC-Testmanagement — Test-Toolchain für Web, Desktop & Mobile",
    description:
      "Zwei Werkzeuge für konsistentes Testen: das TypeScript-Test-Framework CC-Testframework und das Git-basierte Test-Management-Tool CC-Testmanagement.",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
