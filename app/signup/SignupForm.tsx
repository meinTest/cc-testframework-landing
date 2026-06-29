"use client";

import { useState } from "react";
import type { ProductId } from "../products";

type FormState = "idle" | "submitting" | "ok" | "error";

interface Prefill {
  name: string;
  email: string;
  company: string;
}

interface SignupFormProps {
  token: string | null;
  product: ProductId;
  // Present in the vetted flow: customer details already captured at demo-request
  // time (carried in the pending-license metadata). Shown read-only instead of
  // re-collected.
  prefill?: Prefill;
}

export default function SignupForm({ token, product, prefill }: SignupFormProps) {
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const needsGithub = product !== "cc-tmgmt";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: prefill ? prefill.name : formData.get("name"),
      email: prefill ? prefill.email : formData.get("email"),
      company: prefill ? prefill.company : formData.get("company"),
      token: formData.get("token") || undefined,
      ...(needsGithub ? { githubUsername: formData.get("githubUsername") } : {}),
    };

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message ?? "Signup failed");
      }
      setSuccessMessage(data?.message ?? "Trial activated.");
      setState("ok");
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (state === "ok") {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Thank you
          </h1>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
            {successMessage}
          </p>
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            For questions reach out to{" "}
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

  // Vetted flow with nothing left to enter (cc-tmgmt): one-click activation.
  const oneClick = Boolean(prefill) && !needsGithub;

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {oneClick ? "Activate your trial" : "Start your trial"}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          14 days, full feature set, no payment information required.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {prefill ? (
            <Summary prefill={prefill} />
          ) : (
            <>
              <Field name="name" label="Full name" required autoComplete="name" />
              <Field
                name="email"
                label="Work email"
                type="email"
                required
                autoComplete="email"
              />
              <Field
                name="company"
                label="Company"
                required
                autoComplete="organization"
              />
            </>
          )}

          {needsGithub && (
            <Field
              name="githubUsername"
              label="GitHub username"
              required
              hint="Used to send your repository invite."
            />
          )}
          {token && <input type="hidden" name="token" value={token} />}

          <button
            type="submit"
            disabled={state === "submitting"}
            className="w-full rounded-md bg-brand px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
          >
            {state === "submitting"
              ? "Submitting…"
              : prefill
                ? "Activate trial"
                : "Request trial"}
          </button>

          {state === "error" && errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </form>

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          By submitting you agree to be contacted regarding your trial.
        </p>
      </div>
    </main>
  );
}

function Summary({ prefill }: { prefill: Prefill }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Activating trial for
      </p>
      <p className="mt-1 font-medium text-slate-900 dark:text-white">
        {prefill.name}
      </p>
      <p className="text-slate-600 dark:text-slate-300">{prefill.email}</p>
      <p className="text-slate-600 dark:text-slate-300">{prefill.company}</p>
    </div>
  );
}

interface FieldProps {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  hint?: string;
}

function Field({
  name,
  label,
  type = "text",
  required,
  autoComplete,
  hint,
}: FieldProps) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        {label}
        {required && (
          <span className="text-slate-400 dark:text-slate-500"> *</span>
        )}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
      />
      {hint && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}
