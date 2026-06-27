"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANGS, type Lang } from "./content";

/** DE | EN switch that keeps the current path and swaps the `lang` query param. */
export default function LangToggle({ lang }: { lang: Lang }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 text-sm">
      {LANGS.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
          <Link
            href={`${pathname}?lang=${l}`}
            aria-current={l === lang ? "true" : undefined}
            className={
              l === lang
                ? "font-semibold text-slate-900 dark:text-white"
                : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            }
          >
            {l.toUpperCase()}
          </Link>
        </span>
      ))}
    </div>
  );
}
