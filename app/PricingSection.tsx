"use client";

import { useState } from "react";
import Link from "next/link";
import type { PricingCopy } from "./content";
import {
  CURRENCIES,
  unitPrice,
  formatPrice,
  type BillingCycle,
  type Currency,
} from "./pricing";

interface PricingSectionProps {
  copy: PricingCopy;
  // Where each bucket's CTA goes (trial is flag-aware, resolved server-side).
  trialHref: string;
  subscriptionBaseHref: string; // selected cycle/currency appended on click
  onetimeHref: string;
}

export default function PricingSection({
  copy,
  trialHref,
  subscriptionBaseHref,
  onetimeHref,
}: PricingSectionProps) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<Currency>("CHF");

  const price = formatPrice(unitPrice(currency, cycle), currency);
  const perUnit = cycle === "monthly" ? copy.perUserMonth : copy.perUserYear;
  const subscriptionHref = `${subscriptionBaseHref}&cycle=${cycle}&currency=${currency}`;

  return (
    <div className="mt-10">
      {/* Controls: billing cycle + currency */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <SegmentedControl
          options={[
            { value: "monthly", label: copy.cycleMonthly },
            { value: "yearly", label: copy.cycleYearly },
          ]}
          value={cycle}
          onChange={(v) => setCycle(v as BillingCycle)}
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {copy.currencyLabel}
          </span>
          <SegmentedControl
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={currency}
            onChange={(v) => setCurrency(v as Currency)}
          />
        </div>
        {cycle === "yearly" && (
          <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
            {copy.yearlyNote}
          </span>
        )}
      </div>

      {/* Buckets */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Bucket
          name={copy.trial.name}
          price={copy.trial.price}
          tagline={copy.trial.tagline}
          features={copy.trial.features}
          cta={copy.trial.cta}
          href={trialHref}
        />
        <Bucket
          name={copy.subscription.name}
          price={price}
          priceSuffix={perUnit}
          tagline={copy.subscription.tagline}
          features={copy.subscription.features}
          cta={copy.subscription.cta}
          href={subscriptionHref}
          recommended={copy.recommended}
        />
        <Bucket
          name={copy.onetime.name}
          price={copy.onetime.price}
          tagline={copy.onetime.tagline}
          features={copy.onetime.features}
          cta={copy.onetime.cta}
          href={onetimeHref}
        />
      </div>
    </div>
  );
}

interface BucketProps {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: string;
  href: string;
  recommended?: string;
}

function Bucket({
  name,
  price,
  priceSuffix,
  tagline,
  features,
  cta,
  href,
  recommended,
}: BucketProps) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border p-8 ${
        recommended
          ? "border-brand shadow-sm"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      {recommended && (
        <span className="absolute -top-3 left-8 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white">
          {recommended}
        </span>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
        {name}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tagline}</p>
      <p className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {price}
        </span>
        {priceSuffix && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {priceSuffix}
          </span>
        )}
      </p>
      <ul className="mt-6 flex-1 space-y-3">
        {features.map((f) => (
          <li
            key={f}
            className="flex gap-2 text-sm text-slate-600 dark:text-slate-300"
          >
            <span aria-hidden className="mt-0.5 text-brand">
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-8 inline-flex items-center justify-center rounded-md px-5 py-2.5 text-base font-semibold ${
          recommended
            ? "bg-brand text-white hover:bg-brand-strong"
            : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 p-0.5 dark:border-slate-700">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`rounded px-3 py-1.5 text-sm font-medium transition ${
            o.value === value
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
