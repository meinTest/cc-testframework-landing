import type { Metadata } from "next";
import { resolveLang } from "../content";
import { licenseCheckoutInfo } from "../api/tmgmt/lib/entitlement";
import { isOffered, isVetted, productLabel, type ProductId } from "../products";

// Keyed self-service hub (#39). This is where the Stripe Customer Portal's
// "Return to…" link lands: we set the portal session's return_url to
// /account?key=<license>, so a returning customer arrives already identified by
// their license key — and can add the OTHER product as a trial on their EXISTING
// Stripe customer (the add-product link resolves the customer from the key),
// instead of starting a fresh signup that would create a second Stripe account.
//
// No index + no referrer: the URL carries the license key.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface AccountPageProps {
  searchParams: Promise<{ key?: string; lang?: string }>;
}

const T = {
  de: {
    title: "Dein Konto",
    intro:
      "Verwalte dein Abo oder nimm ein weiteres Produkt als Testversion dazu — alles auf deinem bestehenden Konto, ohne ein neues anzulegen.",
    addTitle: (name: string) => `${name} dazunehmen`,
    addBody: (name: string) =>
      `Starte eine kostenlose ${name}-Testversion auf demselben Konto — ohne Karte. Du bestätigst bei Stripe und bekommst den Zugang per E-Mail.`,
    addCta: (name: string) => `${name}-Testversion starten`,
    manageTitle: "Rechnung & Abo verwalten",
    manageBody:
      "Zahlungsmethode hinterlegen, Menge ändern oder kündigen — im Stripe-Kundenportal.",
    manageCta: "Zum Kundenportal",
    noKeyTitle: "Kein gültiger Schlüssel",
    noKeyBody:
      "Wir konnten deinen Lizenzschlüssel nicht erkennen. Bitte nutze den Link aus deiner Willkommens-E-Mail oder kontaktiere uns.",
    contact: "Fragen? Schreib uns an",
  },
  en: {
    title: "Your account",
    intro:
      "Manage your subscription or add another product as a trial — all on your existing account, without creating a new one.",
    addTitle: (name: string) => `Add ${name}`,
    addBody: (name: string) =>
      `Start a free ${name} trial on the same account — no card required. You confirm on Stripe and get access by email.`,
    addCta: (name: string) => `Start ${name} trial`,
    manageTitle: "Manage billing & subscription",
    manageBody:
      "Add a payment method, change quantity or cancel — in the Stripe customer portal.",
    manageCta: "Open customer portal",
    noKeyTitle: "No valid key",
    noKeyBody:
      "We couldn't recognize your license key. Please use the link from your welcome email or contact us.",
    contact: "Questions? Email us at",
  },
} as const;

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const { key: keyParam, lang: langParam } = await searchParams;
  const lang = resolveLang(langParam);
  const t = T[lang];
  const key = (keyParam ?? "").trim();

  const info = key
    ? await licenseCheckoutInfo(key, process.env.DRY_RUN === "true")
    : null;

  const resolved = info && info.kind === "ok" ? info : null;
  const other: ProductId | null = resolved
    ? resolved.product === "FW"
      ? "TMT"
      : "FW"
    : null;
  const canAddOther =
    !!other && resolved?.manageable && isOffered(other) && !isVetted(other);

  const enc = encodeURIComponent(key);

  return (
    <main className="flex-1 px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {resolved ? t.title : t.noKeyTitle}
        </h1>
        <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
          {resolved ? t.intro : t.noKeyBody}
        </p>

        {resolved && (
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {canAddOther && other && (
              <section className="rounded-2xl border border-slate-200 p-6 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t.addTitle(productLabel(other))}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t.addBody(productLabel(other))}
                </p>
                <a
                  href={`/api/license/add-product?product=${other}&key=${enc}&lang=${lang}`}
                  className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {t.addCta(productLabel(other))}
                </a>
              </section>
            )}

            {resolved.manageable && (
              <section className="rounded-2xl border border-slate-200 p-6 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t.manageTitle}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t.manageBody}
                </p>
                <a
                  href={`/api/license/portal?key=${enc}&lang=${lang}`}
                  className="mt-4 inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800"
                >
                  {t.manageCta}
                </a>
              </section>
            )}
          </div>
        )}

        <p className="mt-10 text-sm text-slate-500 dark:text-slate-400">
          {t.contact}{" "}
          <a
            href="mailto:support@itsbusiness.ch"
            className="underline hover:text-slate-700 dark:hover:text-slate-200"
          >
            support@itsbusiness.ch
          </a>
          .
        </p>
      </div>
    </main>
  );
}
