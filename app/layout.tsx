import type { Metadata } from "next";
import { Open_Sans, Scada } from "next/font/google";
import "./globals.css";
import SiteHeader from "./Header";
import { offeredProducts, type ProductId } from "./products";

// meinTest CI fonts: Open Sans (body) + Scada (headings).
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
});

const scada = Scada({
  variable: "--font-scada",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Set the theme class before paint to avoid a flash. Default is light; a stored
// preference (from the toggle) wins.
const THEME_INIT = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

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
      "CC Test Management — Git-basiertes Test-Management als lokale Windows-App",
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
      "CC-Testframework & CC Test Management — Test-Toolchain für Web, Desktop & Mobile",
    description:
      "Zwei Werkzeuge für konsistentes Testen: das TypeScript-Test-Framework CC-Testframework und das Git-basierte Test-Management-Tool CC Test Management.",
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
      suppressHydrationWarning
      className={`${openSans.variable} ${scada.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
