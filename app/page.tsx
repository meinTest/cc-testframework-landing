import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          cc-testframework
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          TypeScript-based test framework with built-in conventions for Web,
          Desktop, and Mobile.
        </p>
        <p className="mt-6 text-base text-slate-500">
          Playwright and Appium under one surface. Naming, structure, and
          reporting conventions come pre-wired so test code stays consistent
          across teams.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800"
          >
            Start 14-day Trial
          </Link>
          <a
            href="https://meinTest.github.io/cc-testframework/"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
          >
            Documentation
          </a>
        </div>

        <p className="mt-12 text-sm text-slate-400">
          Already a customer?{" "}
          <a
            href="mailto:sales@itsbusiness.ch"
            className="underline hover:text-slate-600"
          >
            Contact sales
          </a>
        </p>
      </div>
    </main>
  );
}
