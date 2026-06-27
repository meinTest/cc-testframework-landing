"use client";

import { useState } from "react";
import type { ActionPayload } from "../../api/sales/lib/action-token";
import { productLabel } from "../../products";

type FormState = "idle" | "submitting" | "ok" | "error";

interface ActionConfirmProps {
  token: string;
  payload: ActionPayload;
}

interface IssueResponse {
  ok?: boolean;
  emailDelivered?: boolean;
  onboardUrl?: string;
  expiresAt?: string;
  message?: string;
}

export default function ActionConfirm({ token, payload }: ActionConfirmProps) {
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [result, setResult] = useState<IssueResponse | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await fetch("/api/sales/action-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionToken: token, expiresInDays }),
      });
      const data: IssueResponse = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(data?.message ?? "Action failed");
      }
      setResult(data);
      setState("ok");
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (state === "ok" && result) {
    return <Done result={result} customerEmail={payload.email} />;
  }

  return (
    <main className="flex-1 flex items-start justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Approve and issue signup link
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          The customer will receive an automated email with a personalized
          /signup URL. The token below is bound to this request and is
          single-use.
        </p>

        <dl className="mt-8 space-y-3 rounded-md border border-slate-300 bg-slate-50 p-6 text-sm dark:border-slate-700 dark:bg-slate-900">
          <Row label="Product" value={productLabel(payload.product)} />
          <Row label="Name" value={payload.name} />
          <Row label="Email" value={payload.email} />
          <Row label="Company" value={payload.company} />
          <Row label="Use case" value={payload.useCase} preformatted />
        </dl>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="expiresInDays"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Signup link valid for
            </label>
            <select
              id="expiresInDays"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value={3}>3 days</option>
              <option value={7}>7 days (default)</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days (max)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={state === "submitting"}
            className="w-full rounded-md bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {state === "submitting"
              ? "Issuing…"
              : "Issue and email signup link"}
          </button>

          {state === "error" && errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </form>

        <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
          To deny this request, simply close this tab — no token will be
          issued.
        </p>
      </div>
    </main>
  );
}

function Done({
  result,
  customerEmail,
}: {
  result: IssueResponse;
  customerEmail: string;
}) {
  const delivered = result.emailDelivered;
  return (
    <main className="flex-1 flex items-start justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {delivered ? "Done" : "Token issued — manual email needed"}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {delivered
            ? `Customer ${customerEmail} was emailed the personalized signup link.`
            : `Token was issued but the email to ${customerEmail} could not be delivered. Copy the URL below and send it manually.`}
        </p>

        <dl className="mt-8 space-y-3 rounded-md border border-slate-300 bg-slate-50 p-6 text-sm dark:border-slate-700 dark:bg-slate-900">
          <Row
            label="Onboard URL"
            value={result.onboardUrl ?? ""}
            preformatted
            copyable
          />
          <Row
            label="Expires"
            value={
              result.expiresAt
                ? new Date(result.expiresAt).toLocaleString()
                : ""
            }
          />
        </dl>

        {result.message && (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            {result.message}
          </p>
        )}
      </div>
    </main>
  );
}

interface RowProps {
  label: string;
  value: string;
  preformatted?: boolean;
  copyable?: boolean;
}

function Row({ label, value, preformatted, copyable }: RowProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-medium text-slate-700 dark:text-slate-200">
        {label}
      </dt>
      <dd
        className={`flex items-start gap-2 ${preformatted ? "font-mono text-xs whitespace-pre-wrap break-all" : ""}`}
      >
        <span className="flex-1 text-slate-900 dark:text-slate-100">
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(value)}
            className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Copy
          </button>
        )}
      </dd>
    </div>
  );
}
