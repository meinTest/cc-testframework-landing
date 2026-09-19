import {
  createTrialLicense,
  deleteLicense,
  findPendingLicenseByToken,
  type KeygenLicense,
} from "./keygen";
import { sendWelcomeEmail, sendTmgmtWelcome, notifySupport } from "./resend";
import { sanitizeTrialDays } from "./trial";
import {
  resolveProduct,
  isOffered,
  isVetted,
  productLabel,
  type ProductId,
} from "../../../products";
import { isPlanId, planProducts } from "../../../plans";
import { CURRENCIES, type BillingCycle, type Currency } from "../../../pricing";

// Shared signup core, used by the on-site /api/signup route and the CORS-enabled
// public /api/public/v1/signup route (the CMS posts its own form here).
//
// A signup provisions a trial for a SET of products (a plan): "Starter" delivers
// one product, "Professional" delivers both. Each product gets its own trial
// license and its own welcome mail. The sales-vetted token path stays
// single-product (the token defines it); the open self-serve path takes the
// product set from the request and only allows products whose vetting is OFF.

const LOG_PREFIX = "[signup]";

export interface SignupInput {
  name: string;
  email: string;
  company: string;
  // Sales token: drives the vetted path (single product from the token).
  // "" → open self-serve, which uses `products`.
  token: string;
  // Resolved product set for the open path (from `plan`, or a single `product`).
  products: ProductId[];
  // Billing-cycle/currency preference from the CMS box — stored on the license(s)
  // so the later trial→paid upgrade can pre-select them. Optional.
  cycle?: BillingCycle;
  currency?: Currency;
}

export interface SignupOutcome {
  status: number;
  body: { ok: boolean; message: string };
}

interface SignupPayload {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  token?: unknown;
  product?: unknown;
  plan?: unknown;
  cycle?: unknown;
  currency?: unknown;
}

/**
 * Validate the signup fields shared by both routes. Token is optional (the public
 * endpoint never sends one). The product set comes from `plan` when present
 * (starter-framework | starter-tmt | professional), else from a single `product`
 * (defaults to the framework) — both re-checked against isOffered/isVetted on the
 * open path. cycle/currency are optional preferences (invalid values are ignored).
 */
export function validateSignupInput(
  payload: SignupPayload,
): { value: SignupInput } | { error: string } {
  const name = stringField(payload.name);
  const email = stringField(payload.email);
  const company = stringField(payload.company);
  const token = stringField(payload.token);

  if (!name) return { error: "Missing field: name" };
  if (!email) return { error: "Missing field: email" };
  if (!company) return { error: "Missing field: company" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }

  let products: ProductId[];
  if (payload.plan !== undefined && payload.plan !== null && payload.plan !== "") {
    if (!isPlanId(payload.plan)) {
      return { error: `Unknown plan: ${String(payload.plan)}` };
    }
    products = planProducts(payload.plan);
  } else {
    products = [resolveProduct(payload.product)];
  }

  const cycle: BillingCycle | undefined =
    payload.cycle === "monthly" || payload.cycle === "yearly" ? payload.cycle : undefined;
  const currencyRaw = typeof payload.currency === "string" ? payload.currency.toUpperCase() : "";
  const currency = CURRENCIES.includes(currencyRaw as Currency)
    ? (currencyRaw as Currency)
    : undefined;

  return { value: { name, email, company, token, products, cycle, currency } };
}

export async function performSignup(
  input: SignupInput,
  opts: { origin: string; dryRun: boolean },
): Promise<SignupOutcome> {
  const { origin, dryRun } = opts;

  // Resolve the effective product set + trial length + pending token.
  let products: ProductId[];
  let trialDays: number | undefined;
  let pendingLicenseId: string | null = null;

  if (input.token) {
    // Sales-vetted path: single product from the token.
    try {
      const pending = await findPendingLicenseByToken(input.token, dryRun);
      if (!pending) {
        return err(401, "Invalid or already used signup token. Please request a fresh demo at /demo-request.");
      }
      if (pending.tokenExpiresAt && Date.parse(pending.tokenExpiresAt) < Date.now()) {
        return err(401, "Your signup link has expired. Please request a fresh demo at /demo-request.");
      }
      pendingLicenseId = pending.id;
      products = [resolveProduct(pending.metadata.product)];
      trialDays = sanitizeTrialDays(pending.metadata.trialDays);
    } catch (e) {
      console.error(`${LOG_PREFIX} token lookup failed`, e);
      return err(500, "Could not validate your signup token. Please try again or contact support@itsbusiness.ch.");
    }
  } else {
    // Open self-serve path: the requested plan's product set. Every product must
    // be offered and NOT sales-vetted.
    products = dedupe(input.products);
    if (products.length === 0) return err(400, "This product is not available.");
    for (const product of products) {
      if (!isOffered(product)) {
        return err(400, "This product is not available.");
      }
      if (isVetted(product)) {
        return err(401, "Token required. Please request a demo at /demo-request to receive a personalized signup link.");
      }
    }
  }

  console.log(`${LOG_PREFIX} received`, {
    email: input.email,
    company: input.company,
    products,
    cycle: input.cycle,
    tokenPrefix: input.token ? `${input.token.slice(0, 8)}…` : null,
    dryRun,
    at: new Date().toISOString(),
  });

  // Provision all licenses first, atomically: if any create fails, roll back the
  // ones already created and fail — so a Professional signup never lands the
  // customer with a half-provisioned account.
  const created: { product: ProductId; license: KeygenLicense }[] = [];
  for (const product of products) {
    try {
      const license = await createTrialLicense(
        {
          name: input.name,
          email: input.email,
          company: input.company,
          product,
          trialDays,
          preferredCycle: input.cycle,
          preferredCurrency: input.currency,
        },
        dryRun,
      );
      created.push({ product, license });
    } catch (e) {
      console.error(`${LOG_PREFIX} keygen step failed for ${product} — rolling back`, e);
      for (const c of created) {
        try {
          await deleteLicense(c.license.id, dryRun);
        } catch (rollbackErr) {
          console.error(`${LOG_PREFIX} rollback failed for ${c.license.id} (non-fatal)`, rollbackErr);
        }
      }
      return err(500, "Could not provision your trial license. Please contact support@itsbusiness.ch.");
    }
  }

  // Deliver each product's welcome mail (best-effort — the license is valid
  // regardless; an email hiccup is logged, not surfaced).
  for (const { product, license } of created) {
    await sendWelcome(product, license, input, origin);
  }

  // Notify support per provisioned product (non-fatal).
  for (const { product, license } of created) {
    try {
      await notifySupport(
        {
          customerName: input.name,
          customerEmail: input.email,
          company: input.company,
          licenseId: license.id,
          licenseKey: license.key,
          product,
        },
        dryRun,
      );
    } catch (e) {
      console.error(`${LOG_PREFIX} support notify failed (non-fatal)`, e);
    }
  }

  // Consume the single-use sales token (vetted path only).
  if (pendingLicenseId) {
    try {
      await deleteLicense(pendingLicenseId, dryRun);
      console.log(`${LOG_PREFIX} consumed pending license ${pendingLicenseId}`);
    } catch (e) {
      console.error(`${LOG_PREFIX} pending license consume failed (non-fatal)`, e);
    }
  }

  console.log(`${LOG_PREFIX} completed`, {
    licenseIds: created.map((c) => c.license.id),
    products,
    dryRun,
  });

  return { status: 200, body: { ok: true, message: successMessage(products, dryRun) } };
}

async function sendWelcome(
  product: ProductId,
  license: KeygenLicense,
  input: SignupInput,
  origin: string,
): Promise<void> {
  const dryRun = process.env.DRY_RUN === "true";
  try {
    if (product === "cc-tmgmt") {
      // cc-tmgmt: the license key is the access code; the welcome mail carries it
      // plus the gated per-OS download links. No GitHub invite.
      await sendTmgmtWelcome(
        {
          toEmail: input.email,
          customerName: input.name,
          company: input.company,
          licenseKey: license.key,
          licenseExpiry: license.expiry,
          origin,
        },
        dryRun,
      );
    } else {
      // cc-testframework: installs from the license-brokered npm registry with the
      // same key — no GitHub account required.
      const quickstartUrlEn =
        process.env.QUICKSTART_URL_EN ?? "https://meintest.github.io/cc-testframework/en/quickstart/";
      const quickstartUrlDe =
        process.env.QUICKSTART_URL_DE ?? "https://meintest.github.io/cc-testframework/de/quickstart/";
      await sendWelcomeEmail(
        {
          toEmail: input.email,
          customerName: input.name,
          company: input.company,
          licenseKey: license.key,
          licenseExpiry: license.expiry,
          origin,
          quickstartUrlEn,
          quickstartUrlDe,
        },
        dryRun,
      );
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} welcome mail failed for ${product} — license is valid, customer needs manual outreach`, e);
  }
}

export function successMessage(products: ProductId[], dryRun: boolean): string {
  if (dryRun) {
    return "Dry-run completed. Check Vercel function logs for the simulated calls.";
  }
  if (products.length > 1) {
    const labels = products.map(productLabel).join(" and ");
    return `Trial activated. Check your email for your setup instructions for ${labels}.`;
  }
  return products[0] === "cc-tmgmt"
    ? "Trial activated. Check your email for your download links and access code."
    : "Trial activated. Check your email for your license key and setup instructions.";
}

function dedupe(products: ProductId[]): ProductId[] {
  return [...new Set(products)];
}

function err(status: number, message: string): SignupOutcome {
  return { status, body: { ok: false, message } };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
