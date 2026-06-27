import Link from "next/link";
import Header from "../Header";
import { content, resolveLang, withLang } from "../content";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ lang?: string | string[] }>;

export default async function FrameworkPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { lang: langParam } = await searchParams;
  const lang = resolveLang(langParam);
  const t = content[lang];
  const p = t.framework;

  const vetted = process.env.SALES_VETTED_MODE === "true";
  const primaryCta = vetted
    ? { href: "/demo-request", label: t.common.requestDemo }
    : { href: "/signup", label: t.common.startTrial };

  return (
    <>
      <Header lang={lang} />
      <main className="flex-1 px-6 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto">
          <Link
            href={withLang("/", lang)}
            className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            {t.nav.backToOverview}
          </Link>

          <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {p.name}
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
            {p.tagline}
          </p>
          <p className="mt-6 text-base text-slate-500 dark:text-slate-400">
            {p.description}
          </p>

          <ul className="mt-10 space-y-4">
            {p.features.map((feature) => (
              <li
                key={feature}
                className="flex gap-3 text-base text-slate-600 dark:text-slate-300"
              >
                <span aria-hidden className="mt-1 text-slate-400">
                  ✓
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {primaryCta.label}
            </Link>
            <a
              href="https://meinTest.github.io/cc-testframework/"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t.common.documentation}
            </a>
          </div>

          <p className="mt-12 text-sm text-slate-400 dark:text-slate-500">
            {t.common.alreadyCustomer}{" "}
            <a
              href="mailto:sales@itsbusiness.ch"
              className="underline hover:text-slate-600 dark:hover:text-slate-200"
            >
              {t.common.contactSales}
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
