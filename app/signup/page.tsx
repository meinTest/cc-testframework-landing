import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  const enabled = process.env.SIGNUP_ENABLED === "true";

  if (!enabled) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Service temporarily unavailable
          </h1>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
            This service is currently disabled. We will enable it in the
            future.
          </p>
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            For questions please contact{" "}
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

  return <SignupForm />;
}
