"use client";

import { useState } from "react";

type FormState = "idle" | "submitting" | "ok" | "error";

export default function SignupPage() {
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      company: formData.get("company"),
      githubUsername: formData.get("githubUsername"),
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
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Thank you
          </h1>
          <p className="mt-4 text-base text-slate-600">
            Your trial request has been received. The backend that processes
            trial signups is not connected yet — we will follow up manually for
            now. Once the automation goes live, you will receive your license
            key and a GitHub invite within minutes.
          </p>
          <p className="mt-6 text-sm text-slate-500">
            For questions reach out to{" "}
            <a
              href="mailto:sales@itsbusiness.ch"
              className="underline hover:text-slate-700"
            >
              sales@itsbusiness.ch
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Start your trial
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          14 days, full feature set, no payment information required.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <Field
            name="name"
            label="Full name"
            required
            autoComplete="name"
          />
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
          <Field
            name="githubUsername"
            label="GitHub username"
            required
            hint="Used to send your repository invite."
          />

          <button
            type="submit"
            disabled={state === "submitting"}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {state === "submitting" ? "Submitting…" : "Request trial"}
          </button>

          {state === "error" && errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
        </form>

        <p className="mt-8 text-xs text-slate-400">
          By submitting you agree to be contacted regarding your trial.
        </p>
      </div>
    </main>
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

function Field({ name, label, type = "text", required, autoComplete, hint }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-slate-700"
      >
        {label}
        {required && <span className="text-slate-400"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
