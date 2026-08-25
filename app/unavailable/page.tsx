import { content, resolveLang } from "../content";

// Shown when a purchase is turned off via PURCHASE_ENABLED=false. Reuses the
// same "Dienst vorübergehend nicht verfügbar" copy as the signup disclaimer.
export const dynamic = "force-dynamic";

interface UnavailablePageProps {
  searchParams: Promise<{ lang?: string }>;
}

export default async function UnavailablePage({
  searchParams,
}: UnavailablePageProps) {
  const { lang: langParam } = await searchParams;
  const c = content[resolveLang(langParam)].signup;

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
