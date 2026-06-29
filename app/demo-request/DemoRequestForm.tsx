"use client";

import { useState } from "react";
import type { ProductId } from "../products";

type FormState = "idle" | "submitting" | "ok" | "error";

interface DemoRequestFormProps {
  product: ProductId;
  productLabel: string;
}

export default function DemoRequestForm({
  product,
  productLabel,
}: DemoRequestFormProps) {
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      company: formData.get("company"),
      useCase: formData.get("useCase"),
      product,
    };

    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message ?? "Request failed");
      }
      setSuccessMessage(data?.message ?? "Request received.");
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
            We will reach out from{" "}
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

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Request a demo
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Tell us a bit about your team and we will send you a personalized
          trial link within one business day.
        </p>

        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <span className="text-slate-400 dark:text-slate-500">Product:</span>
          <span className="font-medium text-slate-900 dark:text-white">
            {productLabel}
          </span>
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
          <TextArea
            name="useCase"
            label="Use case"
            required
            hint="One to three sentences on what you would like to test."
          />

          <button
            type="submit"
            disabled={state === "submitting"}
            className="w-full rounded-md bg-brand px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
          >
            {state === "submitting" ? "Submitting…" : "Request trial link"}
          </button>

          {state === "error" && errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </form>
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

interface TextAreaProps {
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
}

function TextArea({ name, label, required, hint }: TextAreaProps) {
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
      <textarea
        id={name}
        name={name}
        required={required}
        rows={4}
        maxLength={2000}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
      />
      {hint && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}
