import SignupForm from "./SignupForm";
import { findPendingLicenseByToken } from "../api/signup/lib/keygen";
import { resolveProduct, DEFAULT_PRODUCT } from "../products";

export const dynamic = "force-dynamic";

interface SignupPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const enabled = process.env.SIGNUP_ENABLED === "true";

  if (!enabled) {
    return <Disclaimer />;
  }

  const vetted = process.env.SALES_VETTED_MODE === "true";

  if (!vetted) {
    // Open signups are framework-only (no product context).
    return <SignupForm token={null} product={DEFAULT_PRODUCT} />;
  }

  const { token } = await searchParams;
  if (!token) {
    return (
      <TokenError
        title="Signup link required"
        body="To start a trial, please request a demo first. Sales will send you a personalized signup link."
      />
    );
  }

  const dryRun = process.env.DRY_RUN === "true";
  let pending;
  try {
    pending = await findPendingLicenseByToken(token, dryRun);
  } catch (err) {
    console.error("[signup][page] token lookup failed", err);
    return (
      <TokenError
        title="Signup temporarily unavailable"
        body="We could not validate your signup link. Please try again in a moment or contact support@itsbusiness.ch."
      />
    );
  }

  if (!pending) {
    return (
      <TokenError
        title="Invalid or already used link"
        body="This signup link is no longer valid. Please request a fresh demo to receive a new link."
      />
    );
  }

  if (isExpired(pending.tokenExpiresAt)) {
    return (
      <TokenError
        title="Signup link expired"
        body="This signup link has expired. Please request a fresh demo to receive a new link."
      />
    );
  }

  const md = pending.metadata;
  const name = typeof md.customerName === "string" ? md.customerName : "";
  const email = typeof md.email === "string" ? md.email : "";
  const company = typeof md.company === "string" ? md.company : "";
  // Only prefill when all details are present; otherwise fall back to the form.
  const prefill = name && email && company ? { name, email, company } : undefined;

  return (
    <SignupForm
      token={token}
      product={resolveProduct(md.product)}
      prefill={prefill}
    />
  );
}

function isExpired(tokenExpiresAt: string): boolean {
  if (!tokenExpiresAt) return false;
  return Date.parse(tokenExpiresAt) < Date.now();
}

function Disclaimer() {
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

function TokenError({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
          {body}
        </p>
        <a
          href="/demo-request"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Request a demo
        </a>
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Need help? Contact{" "}
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
