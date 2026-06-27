import Link from "next/link";
import Header from "./Header";
import { content, resolveLang, withLang } from "./content";
import { offeredProducts, type ProductId } from "./products";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ lang?: string | string[] }>;

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { lang: langParam } = await searchParams;
  const lang = resolveLang(langParam);
  const t = content[lang];

  const cardFor: Record<ProductId, { name: string; tagline: string; blurb: string; href: string }> = {
    "cc-testframework": {
      ...t.overview.framework,
      href: withLang("/cc-testframework", lang),
    },
    "cc-tmgmt": {
      ...t.overview.mgmt,
      href: withLang("/cc-testmanagement", lang),
    },
  };
  const cards = offeredProducts().map((id) => cardFor[id]);

  return (
    <>
      <Header lang={lang} />
      <main className="flex-1 px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {t.overview.title}
            </h1>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
              {t.overview.subtitle}
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group flex flex-col rounded-xl border border-slate-200 p-8 transition hover:border-slate-400 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-600"
              >
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {card.name}
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                  {card.tagline}
                </p>
                <p className="mt-4 flex-1 text-base text-slate-600 dark:text-slate-300">
                  {card.blurb}
                </p>
                <span className="mt-6 inline-flex items-center text-sm font-medium text-slate-900 group-hover:underline dark:text-white">
                  {t.common.learnMore} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
