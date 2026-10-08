import Link from "next/link";
import { content, resolveLang, withLang } from "./content";
import { offeredProducts, isVetted, type ProductId } from "./products";

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
    FW: {
      ...t.overview.framework,
      href: withLang("/cc-testframework/pricing", lang),
    },
    TMT: {
      ...t.overview.mgmt,
      href: withLang("/cc-testmanagement/pricing", lang),
    },
  };
  const offered = offeredProducts();
  const cards = offered.map((id) => cardFor[id]);

  // Professional (BOTH) is self-serve only when both products are offered and
  // neither is sales-vetted — then it links to the plan-aware /signup. Otherwise
  // the tile is hidden (sales handles the bundle via /demo-request).
  const showProfessional =
    offered.includes("FW") &&
    offered.includes("TMT") &&
    !isVetted("FW") &&
    !isVetted("TMT");
  const professionalHref = withLang("/signup?plan=professional", lang);

  return (
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
                className="group flex flex-col rounded-xl border border-slate-200 p-8 transition hover:border-brand hover:shadow-sm dark:border-slate-800 dark:hover:border-brand"
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
                <span className="mt-6 inline-flex items-center text-sm font-semibold text-brand group-hover:underline">
                  {t.common.learnMore} →
                </span>
              </Link>
            ))}
          </div>

          {showProfessional && (
            <Link
              href={professionalHref}
              className="group mt-6 flex flex-col rounded-xl border border-brand bg-brand/[0.03] p-8 transition hover:shadow-sm sm:flex-row sm:items-center sm:justify-between dark:bg-brand/[0.06]"
            >
              <div className="max-w-2xl">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {t.overview.professional.name}
                  </h2>
                  <span className="rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white">
                    {t.overview.professional.tagline}
                  </span>
                </div>
                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                  {t.overview.professional.blurb}
                </p>
              </div>
              <span className="mt-6 inline-flex shrink-0 items-center justify-center rounded-md bg-brand px-5 py-2.5 text-base font-semibold text-white group-hover:bg-brand-strong sm:mt-0 sm:ml-8">
                {t.signup.professional.cta} →
              </span>
            </Link>
          )}
        </div>
    </main>
  );
}
