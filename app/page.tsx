import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
          cc-testframework
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
          TypeScript-based test framework with built-in conventions for Web,
          Desktop, and Mobile.
        </p>
        <p className="mt-6 text-base text-slate-500 dark:text-slate-400">
          Playwright and Appium under one surface. Naming, structure, and
          reporting conventions come pre-wired so test code stays consistent
          across teams.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Start 14-day Trial
          </Link>
          <a
            href="https://meinTest.github.io/cc-testframework/"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Documentation
          </a>
        </div>

        <p className="mt-12 text-sm text-slate-400 dark:text-slate-500">
          Already a customer?{" "}
          <a
            href="mailto:sales@itsbusiness.ch"
            className="underline hover:text-slate-600 dark:hover:text-slate-200"
          >
            Contact sales
          </a>
        </p>
      </div>
    </main>
  );
}
