import Link from "next/link";
import Image from "next/image";
import LangToggle from "./LangToggle";
import ThemeToggle from "./ThemeToggle";
import { content, withLang, type Lang } from "./content";

/** Shared site chrome for the marketing pages: brand logo + overview/lang/theme. */
export default function Header({ lang }: { lang: Lang }) {
  const t = content[lang];

  return (
    <header className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
      <Link href={withLang("/", lang)} aria-label="meinTest" className="inline-flex">
        {/* White chip keeps the light-background logo legible in dark mode too. */}
        <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/60">
          <Image
            src="/meintest-logo.jpg"
            alt="meinTest GmbH"
            width={267}
            height={50}
            priority
            className="h-7 w-auto"
          />
        </span>
      </Link>
      <nav className="flex items-center gap-5">
        <Link
          href={withLang("/", lang)}
          className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          {t.nav.overview}
        </Link>
        <LangToggle lang={lang} />
        <ThemeToggle />
      </nav>
    </header>
  );
}
