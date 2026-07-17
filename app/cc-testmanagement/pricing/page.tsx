import Link from "next/link";
import { notFound } from "next/navigation";
import PricingSection from "../../PricingSection";
import { content, resolveLang, withLang } from "../../content";
import { isOffered, PRODUCT_LABELS } from "../../products";
import { getDisplayPrices } from "../../lib/stripe-pricing";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ lang?: string | string[] }>;

const PRODUCT = "cc-tmgmt";

export default async function ManagementPricingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isOffered(PRODUCT)) notFound();

  const { lang: langParam } = await searchParams;
  const lang = resolveLang(langParam);
  const t = content[lang];

  // cc-tmgmt has no self-serve trial — the trial bucket routes to sales.
  const trialHref = `/demo-request?product=${PRODUCT}`;
  const prices = await getDisplayPrices(PRODUCT);

  return (
    <main className="flex-1 px-6 py-16 sm:py-24">
      <div className="max-w-5xl mx-auto">
        <Link
          href={withLang("/cc-testmanagement", lang)}
          className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          ← {PRODUCT_LABELS[PRODUCT]}
        </Link>
        <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {PRODUCT_LABELS[PRODUCT]} — {t.pricing.title}
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
          {t.pricing.subtitle}
        </p>

        <PricingSection
          copy={t.pricing}
          prices={prices}
          trialHref={trialHref}
          subscriptionBaseHref={`/demo-request?product=${PRODUCT}&plan=subscription`}
          onetimeHref={`/demo-request?product=${PRODUCT}&plan=onetime`}
        />
      </div>
    </main>
  );
}
