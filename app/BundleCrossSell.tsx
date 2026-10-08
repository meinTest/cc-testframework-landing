import Link from "next/link";
import type { PricingCopy } from "./content";

// Cross-sell footer shown below a single product's pricing buckets, pointing at
// the Professional (BOTH) plan-aware signup. Rendered only when the bundle is
// self-serve (both products offered and neither sales-vetted) — the caller
// decides; this is just the presentation.
export default function BundleCrossSell({
  copy,
  href,
}: {
  copy: PricingCopy["bundle"];
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group mt-6 flex flex-col rounded-xl border border-brand bg-brand/[0.03] p-6 transition hover:shadow-sm sm:flex-row sm:items-center sm:justify-between dark:bg-brand/[0.06]"
    >
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {copy.title}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {copy.body}
        </p>
      </div>
      <span className="mt-4 inline-flex shrink-0 items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white group-hover:bg-brand-strong sm:mt-0 sm:ml-8">
        {copy.cta} →
      </span>
    </Link>
  );
}
