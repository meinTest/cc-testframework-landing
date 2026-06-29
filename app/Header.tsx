import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import LangToggle from "./LangToggle";
import ThemeToggle from "./ThemeToggle";
import logo from "./mTs_logo.png";

/** Global site header (rendered on every page from the root layout). */
export default function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 max-w-5xl mx-auto w-full">
      <Link href="/" aria-label="meinTest — home" className="inline-flex">
        <Image
          src={logo}
          alt="meinTest GmbH"
          priority
          className="h-12 w-auto sm:h-16 lg:h-20"
        />
      </Link>
      <nav className="flex items-center gap-5">
        <Suspense fallback={<span aria-hidden className="w-10" />}>
          <LangToggle />
        </Suspense>
        <ThemeToggle />
      </nav>
    </header>
  );
}
