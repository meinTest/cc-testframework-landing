"use client";

import { useState } from "react";
import type { ProductId } from "../products";

type FormState = "idle" | "submitting" | "ok" | "error";

interface IssueResponse {
  ok?: boolean;
  token?: string;
  onboardUrl?: string;
  expiresAt?: string;
  emailDelivered?: boolean;
  message?: string;
}

interface SalesIssueFormProps {
  products: { id: ProductId; label: string }[];
}

export default function SalesIssueForm({ products }: SalesIssueFormProps) {
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<IssueResponse | null>(null);
  const [autoEmail, setAutoEmail] = useState(false);
  const [product, setProduct] = useState<ProductId>(
    products[0]?.id ?? "cc-testframework",
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const expiresIn = formData.get("expiresInDays");
    const apiKey = formData.get("apiKey");
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      company: formData.get("company"),
      expiresInDays: expiresIn ? Number(expiresIn) : undefined,
      product,
    };
    const endpoint = autoEmail
      ? "/api/sales/issue-token-and-email"
      : "/api/sales/issue-token";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      const data: IssueResponse = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(data?.message ?? "Token issuance failed");
      }
      setResult(data);
      setState("ok");
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <main className="flex-1 flex items-start justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Sales — issue trial signup token
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Vet the demo request, then issue a single-use signup link for the
          customer.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="product"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Product
            </label>
            <select
              id="product"
              value={product}
              onChange={(e) => setProduct(e.target.value as ProductId)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <Field name="name" label="Customer full name" required />
          <Field name="email" label="Customer email" type="email" required />
          <Field name="company" label="Company" required />
          <Field
            name="expiresInDays"
            label="Expires in (days)"
            type="number"
            hint="Defaults to 7. Max 30."
          />
          <Field
            name="apiKey"
            label="Sales API key"
            type="password"
            required
            hint="The SALES_API_KEY shared bearer secret."
          />

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={autoEmail}
              onChange={(e) => setAutoEmail(e.target.checked)}
              className="h-4 w-4 rounded border-slate-400"
            />
            Also email the personalized signup URL to the customer
          </label>

          <button
            type="submit"
            disabled={state === "submitting"}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {state === "submitting" ? "Issuing…" : "Issue signup link"}
          </button>

          {state === "error" && errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </form>

        {state === "ok" && result && (
          <div className="mt-10 rounded-md border border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Token issued
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row
                label="Onboard URL"
                value={result.onboardUrl ?? ""}
                mono
                copyable
              />
              <Row label="Token" value={result.token ?? ""} mono copyable />
              <Row
                label="Expires at"
                value={
                  result.expiresAt
                    ? new Date(result.expiresAt).toLocaleString()
                    : ""
                }
              />
              {autoEmail && (
                <Row
                  label="Email delivered"
                  value={result.emailDelivered ? "yes" : "no"}
                />
              )}
            </dl>
            {result.message && (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                {result.message}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

interface FieldProps {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  hint?: string;
}

function Field({ name, label, type = "text", required, hint }: FieldProps) {
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
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
      />
      {hint && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}

function Row({ label, value, mono, copyable }: RowProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-medium text-slate-700 dark:text-slate-200">
        {label}
      </dt>
      <dd
        className={`flex items-center gap-2 break-all ${mono ? "font-mono text-xs" : ""}`}
      >
        <span className="flex-1 text-slate-900 dark:text-slate-100">
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(value)}
            className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Copy
          </button>
        )}
      </dd>
    </div>
  );
}
