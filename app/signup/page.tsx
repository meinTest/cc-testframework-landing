import { notFound } from "next/navigation";
import SignupForm from "./SignupForm";
import { findPendingLicenseByToken } from "../api/signup/lib/keygen";
import { resolveProduct, isOffered, isVetted } from "../products";
import {
  content,
  resolveLang,
  withLang,
  type Lang,
  type SignupCopy,
} from "../content";

export const dynamic = "force-dynamic";

interface SignupPageProps {
  searchParams: Promise<{ token?: string; product?: string; lang?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { token, product: productParam, lang: langParam } = await searchParams;
  const lang = resolveLang(langParam);
  const c = content[lang].signup;

  const enabled = process.env.SIGNUP_ENABLED === "true";
  if (!enabled) {
    return <Disclaimer c={c} />;
  }

  // No token → open self-serve path. Allowed only for a product whose vetting is
  // OFF; the chosen product comes from ?product= (defaults to framework).
  if (!token) {
    const product = resolveProduct(productParam);
    if (!isOffered(product)) notFound();
    if (isVetted(product)) {
      return (
        <TokenError
          c={c}
          lang={lang}
          title={c.linkRequiredTitle}
          body={c.linkRequiredBody}
        />
      );
    }
    return <SignupForm token={null} product={product} copy={c} />;
  }

  const dryRun = process.env.DRY_RUN === "true";
  let pending;
  try {
    pending = await findPendingLicenseByToken(token, dryRun);
  } catch (err) {
    console.error("[signup][page] token lookup failed", err);
    return (
      <TokenError
        c={c}
        lang={lang}
        title={c.unavailableTitle}
        body={c.unavailableBody}
      />
    );
  }

  if (!pending) {
    return (
      <TokenError c={c} lang={lang} title={c.invalidTitle} body={c.invalidBody} />
    );
  }

  if (isExpired(pending.tokenExpiresAt)) {
    return (
      <TokenError c={c} lang={lang} title={c.expiredTitle} body={c.expiredBody} />
    );
  }

  const md = pending.metadata;
  const name = typeof md.customerName === "string" ? md.customerName : "";
  const email = typeof md.email === "string" ? md.email : "";
  const company = typeof md.company === "string" ? md.company : "";
  // Only prefill when all details are present; otherwise fall back to the form.
  const prefill = name && email && company ? { name, email, company } : undefined;

  return (
    <SignupForm
      token={token}
      product={resolveProduct(md.product)}
      prefill={prefill}
      copy={c}
    />
  );
}

function isExpired(tokenExpiresAt: string): boolean {
  if (!tokenExpiresAt) return false;
  return Date.parse(tokenExpiresAt) < Date.now();
}

function Disclaimer({ c }: { c: SignupCopy }) {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {c.disabledTitle}
        </h1>
        <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
          {c.disabledBody}
        </p>
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          {c.contactForQuestions}{" "}
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

function TokenError({
  c,
  lang,
  title,
  body,
}: {
  c: SignupCopy;
  lang: Lang;
  title: string;
  body: string;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
          {body}
        </p>
        <a
          href={withLang("/demo-request", lang)}
          className="mt-8 inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {c.requestDemoCta}
        </a>
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          {c.needHelp}{" "}
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
