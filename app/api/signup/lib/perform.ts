import {
  createTrialLicense,
  deleteLicense,
  findPendingLicenseByToken,
} from "./keygen";
import { sendWelcomeEmail, sendTmgmtWelcome, notifySupport } from "./resend";
import { sanitizeTrialDays } from "./trial";
import { resolveProduct, isOffered, isVetted, type ProductId } from "../../../products";

// Shared signup core, used by the on-site /api/signup route and the CORS-enabled
// public /api/public/v1/signup route (the CMS posts its own form here). Handles
// both the sales-vetted token path (product + trial length from the token) and
// the open self-serve path (product from the request, only when the product's
// vetting is OFF). Provisions the Keygen trial license, sends the welcome mail,
// notifies support and consumes the pending token — then returns a status + body.

const LOG_PREFIX = "[signup]";

export interface SignupInput {
  name: string;
  email: string;
  company: string;
  // Sales token: drives the vetted path. "" → open self-serve.
  token: string;
  // Only used on the open path; the vetted path takes the product from the token.
  product: ProductId;
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
}

/**
 * Validate the signup fields shared by both routes. Token is optional (the public
 * endpoint never sends one). Product is resolved leniently (defaults to the
 * framework) and re-checked against isOffered/isVetted on the open path.
 */
export function validateSignupInput(
  payload: SignupPayload,
): { value: SignupInput } | { error: string } {
  const name = stringField(payload.name);
  const email = stringField(payload.email);
  const company = stringField(payload.company);
  const token = stringField(payload.token);
  const product = resolveProduct(payload.product);

  if (!name) return { error: "Missing field: name" };
  if (!email) return { error: "Missing field: email" };
  if (!company) return { error: "Missing field: company" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }

  return { value: { name, email, company, token, product } };
}

export async function performSignup(
  input: SignupInput,
  opts: { origin: string; dryRun: boolean },
): Promise<SignupOutcome> {
  const { origin, dryRun } = opts;

  let pendingLicenseId: string | null = null;
  // A token is only ever issued by sales, so its presence drives the vetted path
  // (product from the token). Without a token we allow open self-serve — but only
  // for a product whose vetting is OFF; a vetted product still requires a token.
  let product: ProductId;
  // Sales-chosen trial length (#11); undefined on the open path → policy default.
  let trialDays: number | undefined;

  if (input.token) {
    try {
      const pending = await findPendingLicenseByToken(input.token, dryRun);
      if (!pending) {
        return err(401, "Invalid or already used signup token. Please request a fresh demo at /demo-request.");
      }
      if (pending.tokenExpiresAt && Date.parse(pending.tokenExpiresAt) < Date.now()) {
        return err(401, "Your signup link has expired. Please request a fresh demo at /demo-request.");
      }
      pendingLicenseId = pending.id;
      product = resolveProduct(pending.metadata.product);
      trialDays = sanitizeTrialDays(pending.metadata.trialDays);
    } catch (e) {
      console.error(`${LOG_PREFIX} token lookup failed`, e);
      return err(500, "Could not validate your signup token. Please try again or contact support@itsbusiness.ch.");
    }
  } else {
    product = input.product;
    if (!isOffered(product)) {
      return err(400, "This product is not available.");
    }
    if (isVetted(product)) {
      return err(401, "Token required. Please request a demo at /demo-request to receive a personalized signup link.");
    }
  }

  console.log(`${LOG_PREFIX} received`, {
    email: input.email,
    company: input.company,
    product,
    vetted: isVetted(product),
    tokenPrefix: input.token ? `${input.token.slice(0, 8)}…` : null,
    dryRun,
    at: new Date().toISOString(),
  });

  let license;
  try {
    license = await createTrialLicense(
      { name: input.name, email: input.email, company: input.company, product, trialDays },
      dryRun,
    );
  } catch (e) {
    console.error(`${LOG_PREFIX} keygen step failed`, e);
    return err(500, "Could not provision your trial license. Please contact support@itsbusiness.ch.");
  }

  if (product === "cc-tmgmt") {
    // cc-tmgmt: no GitHub invite. The license key is the access code; the welcome
    // mail carries it plus the gated per-OS download links.
    try {
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
    } catch (e) {
      console.error(`${LOG_PREFIX} cc-tmgmt welcome failed — license is valid, customer needs the access code via manual outreach`, e);
    }
  } else {
    const quickstartUrlEn =
      process.env.QUICKSTART_URL_EN ?? "https://meintest.github.io/cc-testframework/en/quickstart/";
    const quickstartUrlDe =
      process.env.QUICKSTART_URL_DE ?? "https://meintest.github.io/cc-testframework/de/quickstart/";
    try {
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
    } catch (e) {
      console.error(`${LOG_PREFIX} welcome email failed — license is valid, customer needs manual outreach`, e);
    }
  }

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

  if (pendingLicenseId) {
    try {
      await deleteLicense(pendingLicenseId, dryRun);
      console.log(`${LOG_PREFIX} consumed pending license ${pendingLicenseId}`);
    } catch (e) {
      console.error(`${LOG_PREFIX} pending license consume failed (non-fatal)`, e);
    }
  }

  console.log(`${LOG_PREFIX} completed`, {
    licenseId: license.id,
    product,
    vetted: isVetted(product),
    dryRun,
  });

  return {
    status: 200,
    body: {
      ok: true,
      message: dryRun
        ? "Dry-run completed. Check Vercel function logs for the simulated calls."
        : product === "cc-tmgmt"
          ? "Trial activated. Check your email for your download links and access code."
          : "Trial activated. Check your email for your license key and setup instructions.",
    },
  };
}

function err(status: number, message: string): SignupOutcome {
  return { status, body: { ok: false, message } };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
