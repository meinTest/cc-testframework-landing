import Link from "next/link";
import LangToggle from "./LangToggle";
import { content, withLang, type Lang } from "./content";

/** Shared site chrome for the marketing pages: brand/overview link + language switch. */
export default function Header({ lang }: { lang: Lang }) {
  const t = content[lang];

  return (
    <header className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
      <Link
        href={withLang("/", lang)}
        className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white"
      >
        CC&nbsp;Test&nbsp;Tools
      </Link>
      <nav className="flex items-center gap-6">
        <Link
          href={withLang("/", lang)}
          className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          {t.nav.overview}
        </Link>
        <LangToggle lang={lang} />
      </nav>
    </header>
  );
}
