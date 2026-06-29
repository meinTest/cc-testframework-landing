import Link from "next/link";
import Image from "next/image";
import LangToggle from "./LangToggle";
import ThemeToggle from "./ThemeToggle";
import logo from "./mTs_logo.png";
import { content, withLang, type Lang } from "./content";

/** Shared site chrome for the marketing pages: brand logo + overview/lang/theme. */
export default function Header({ lang }: { lang: Lang }) {
  const t = content[lang];

  return (
    <header className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
      <Link href={withLang("/", lang)} aria-label="meinTest" className="inline-flex">
        <Image src={logo} alt="meinTest GmbH" priority className="h-12 w-auto sm:h-14" />
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
