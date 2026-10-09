import {
  createTrialLicense,
  createPaidLicense,
  deleteLicense,
  findPendingLicenseByToken,
} from "./keygen";
import { sendWelcomeEmail, sendTmgmtWelcome, sendProfessionalWelcome, notifySupport } from "./resend";
import { sanitizeTrialDays, DEFAULT_TRIAL_DAYS } from "./trial";
import {
  ensureCustomer,
  createTrialSubscription,
  cancelSubscription,
} from "./stripe-subscription";
import {
  resolveProduct,
  isOffered,
  isVetted,
  productLabel,
  type ProductId,
} from "../../../products";
import { isPlanId, planProducts } from "../../../plans";
import { CURRENCIES, type BillingCycle, type Currency } from "../../../pricing";
import { stripeTrialEnabled } from "../../../flags";

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
  // Per-product seat counts for the trial (#39). `default` applies to any product
  // without an explicit override; `byProduct` holds explicit per-product counts
  // (Professional: m FW + n TMT). FW = one floating key with maxMachines = seats;
  // TMT = one device-bound key per seat.
  seats: SeatCounts;
}

export interface SeatCounts {
  default: number;
  byProduct: Partial<Record<ProductId, number>>;
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
  // Seats: a scalar (applies to all products), an object { FW, TMT }, or the
  // explicit per-product fields fwSeats/tmtSeats (which win over both).
  seats?: unknown;
  fwSeats?: unknown;
  tmtSeats?: unknown;
}

// Seat count ceiling — matches the checkout route's adjustable_quantity maximum.
const MAX_SEATS = 999;

/**
 * Lenient seat parse (mirrors the checkout route): absent → undefined, so the
 * caller can fall back to a default; present but invalid / < 1 → 1; capped at
 * MAX_SEATS. Never throws — an out-of-range value is clamped, not rejected.
 */
function clampSeats(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_SEATS);
}

/** Seats for a product: its explicit override, else the plan-wide default. */
export function resolveSeatCount(seats: SeatCounts, product: ProductId): number {
  return seats.byProduct[product] ?? seats.default;
}

export interface SeatPlanEntry {
  product: ProductId;
  seatIndex: number;
  // FW only: the floating key's maxMachines override (= purchased seats). TMT
  // seats are separate device-bound keys and carry no override.
  maxMachines?: number;
}

/**
 * Expand a plan's per-product seat counts into the concrete list of licenses to
 * provision: FW → ONE floating key (maxMachines = seats, #41); TMT → one
 * device-bound key per seat (seatIndex 0..n-1).
 */
export function expandSeatPlan(items: { product: ProductId; seats: number }[]): SeatPlanEntry[] {
  const out: SeatPlanEntry[] = [];
  for (const { product, seats } of items) {
    const count = product === "FW" ? 1 : Math.max(1, seats);
    for (let seatIndex = 0; seatIndex < count; seatIndex++) {
      out.push({ product, seatIndex, ...(product === "FW" ? { maxMachines: Math.max(1, seats) } : {}) });
    }
  }
  return out;
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

  const seats = parseSeats(payload);

  return { value: { name, email, company, token, products, cycle, currency, seats } };
}

/**
 * Resolve per-product seat counts from the payload (#39). Accepts a scalar
 * `seats` (the plan-wide default), an object `seats: { FW, TMT }`, and the
 * explicit `fwSeats` / `tmtSeats` fields — the latter win over the others. All
 * lenient-clamped; a missing value leaves the default at 1.
 */
function parseSeats(payload: SignupPayload): SeatCounts {
  let fallback = 1;
  const byProduct: Partial<Record<ProductId, number>> = {};

  const s = payload.seats;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    const obj = s as Record<string, unknown>;
    const fw = clampSeats(obj.FW ?? obj.fw);
    const tmt = clampSeats(obj.TMT ?? obj.tmt);
    if (fw !== undefined) byProduct.FW = fw;
    if (tmt !== undefined) byProduct.TMT = tmt;
  } else {
    fallback = clampSeats(s) ?? 1;
  }

  // Explicit per-product fields always win.
  const fwTop = clampSeats(payload.fwSeats);
  const tmtTop = clampSeats(payload.tmtSeats);
  if (fwTop !== undefined) byProduct.FW = fwTop;
  if (tmtTop !== undefined) byProduct.TMT = tmtTop;

  return { default: fallback, byProduct };
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

  // Provision the trial for each product — two models, chosen by the flag:
  //  - Stripe trial (Variante A): a card-less trialing subscription + a Keygen
  //    license mirroring it (expiry = trial end); conversion via the portal.
  //  - Classic: a card-less Keygen trial license (expiry from the trial policy).
  // Both are atomic: a partial failure rolls back everything already created.
  const provision = stripeTrialEnabled()
    ? await provisionStripeTrials(products, input, trialDays, dryRun)
    : await provisionKeygenTrials(products, input, trialDays, dryRun);
  if (!provision.ok) return provision.outcome;
  const provisioned = provision.provisioned;

  // Deliver the welcome mail(s) (best-effort — the license is valid regardless; an
  // email hiccup is logged, not surfaced). Subscription-backed trials get a
  // billing-portal "add a card to keep going" link (#34). A multi-product plan
  // (Professional) gets ONE combined mail with both products' keys (#42); a
  // single-product plan keeps its product-specific onboarding mail.
  const distinctProducts = new Set(provisioned.map((p) => p.product));
  if (distinctProducts.size > 1) {
    await sendProfessionalWelcomeMail(provisioned, input, origin, dryRun);
  } else {
    // Single product — ONE mail carrying ALL seat keys (TMT may be N keys, #39;
    // FW is always one floating key). The portal link uses the first key.
    const product = provisioned[0].product;
    const keys = provisioned.map((p) => p.key);
    const portalUrl = provisioned[0].manageable
      ? `${origin}/api/license/portal?key=${encodeURIComponent(keys[0])}`
      : undefined;
    // Cross-sell the OTHER product as a self-serve add (#39): a Stripe-hosted
    // Checkout bound to this customer so the added product joins the same
    // customer. Only when the trial is subscription-backed (a Stripe customer
    // exists) and the other product is self-serve (offered & not sales-vetted).
    const other: ProductId = product === "FW" ? "TMT" : "FW";
    const addProductUrl =
      provisioned[0].manageable && isOffered(other) && !isVetted(other)
        ? `${origin}/api/license/add-product?product=${other}&key=${encodeURIComponent(keys[0])}`
        : undefined;
    const addProductLabel = addProductUrl ? productLabel(other) : undefined;
    await sendWelcome(
      product,
      keys,
      provisioned[0].expiry,
      input,
      origin,
      portalUrl,
      addProductUrl,
      addProductLabel,
    );
  }

  // Notify support per provisioned product (non-fatal).
  for (const p of provisioned) {
    try {
      await notifySupport(
        {
          customerName: input.name,
          customerEmail: input.email,
          company: input.company,
          licenseId: p.licenseId,
          licenseKey: p.key,
          product: p.product,
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
    licenseIds: provisioned.map((p) => p.licenseId),
    products,
    dryRun,
  });

  return { status: 200, body: { ok: true, message: successMessage(products, dryRun) } };
}

interface ProvisionedTrial {
  product: ProductId;
  key: string;
  expiry: string | null;
  licenseId: string;
  // Subscription-backed (Variante A) → a billing portal exists → link it in the
  // welcome mail. Classic Keygen trials have no portal.
  manageable: boolean;
}
type ProvisionResult =
  | { ok: true; provisioned: ProvisionedTrial[] }
  | { ok: false; outcome: SignupOutcome };

// Classic model: a card-less Keygen trial license per product (no Stripe).
async function provisionKeygenTrials(
  products: ProductId[],
  input: SignupInput,
  trialDays: number | undefined,
  dryRun: boolean,
): Promise<ProvisionResult> {
  const created: ProvisionedTrial[] = [];
  for (const product of products) {
    try {
      // FW stays a single (floating) trial key; TMT gets one key per seat (#39).
      const seatCount = product === "FW" ? 1 : resolveSeatCount(input.seats, product);
      for (let seatIndex = 0; seatIndex < seatCount; seatIndex++) {
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
        created.push({ product, key: license.key, expiry: license.expiry, licenseId: license.id, manageable: false });
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} keygen step failed for ${product} — rolling back`, e);
      for (const c of created) {
        try {
          await deleteLicense(c.licenseId, dryRun);
        } catch (rb) {
          console.error(`${LOG_PREFIX} rollback failed for ${c.licenseId} (non-fatal)`, rb);
        }
      }
      return {
        ok: false,
        outcome: err(500, "Could not provision your trial license. Please contact support@itsbusiness.ch."),
      };
    }
  }
  return { ok: true, provisioned: created };
}

// Variante A: one Stripe customer + ONE card-less trialing subscription PER
// product (#39 self-serve decision). A Professional signup therefore creates
// TWO independent subscriptions (FW + TMT), so each product can be managed and
// cancelled on its own in the Stripe Customer Portal (no combined subscription;
// the portal cannot add/remove a single product from a shared one). Each product
// is mirrored by Keygen license(s) — FW = one floating key (maxMachines = seats,
// #41); TMT = one device-bound key per seat. Atomic: a failure rolls back every
// created license AND cancels every subscription created so far.
async function provisionStripeTrials(
  products: ProductId[],
  input: SignupInput,
  trialDays: number | undefined,
  dryRun: boolean,
): Promise<ProvisionResult> {
  const days = trialDays ?? DEFAULT_TRIAL_DAYS;
  const cycle: BillingCycle = input.cycle ?? "monthly";
  const currency: Currency = input.currency ?? "CHF";

  // Real per-product seat counts from the signup (#39): FW concurrency and TMT
  // users are independent (see #42). FW → one floating key (maxMachines = seats);
  // TMT → one device-bound key per seat.
  const seatsFor = (product: ProductId): number => resolveSeatCount(input.seats, product);

  let customerId: string;
  try {
    customerId = await ensureCustomer(
      { email: input.email, name: input.name, company: input.company },
      dryRun,
    );
  } catch (e) {
    console.error(`${LOG_PREFIX} stripe customer create failed`, e);
    return { ok: false, outcome: err(502, "Billing is not available right now. Please try again later.") };
  }

  const created: ProvisionedTrial[] = [];
  const createdSubs: string[] = [];
  const rollback = async () => {
    for (const c of created) {
      try {
        await deleteLicense(c.licenseId, dryRun);
      } catch (rb) {
        console.error(`${LOG_PREFIX} rollback license ${c.licenseId} failed (non-fatal)`, rb);
      }
    }
    for (const subId of createdSubs) await cancelSubscription(subId, dryRun);
  };

  try {
    // One separate subscription per product (two for Professional). Each is a
    // single-product sub so the Customer Portal can manage/cancel it on its own.
    for (const product of products) {
      const seats = seatsFor(product);
      const sub = await createTrialSubscription(
        { customerId, product, cycle, currency, trialDays: days, seats },
        dryRun,
      );
      if (!sub) {
        await rollback();
        return {
          ok: false,
          outcome: err(502, "No plan is configured for this product yet. Please contact support@itsbusiness.ch."),
        };
      }
      createdSubs.push(sub.subscriptionId);

      // FW → one floating key (maxMachines = seats); TMT → one key per seat (#39).
      for (const entry of expandSeatPlan([{ product, seats }])) {
        const license = await createPaidLicense(
          {
            product: entry.product,
            company: input.company,
            email: input.email,
            customerName: input.name,
            subscriptionId: sub.subscriptionId,
            stripeCustomerId: customerId,
            seatIndex: entry.seatIndex,
            expiresAt: sub.trialEndsAt,
            ...(entry.maxMachines != null ? { maxMachines: entry.maxMachines } : {}),
          },
          dryRun,
        );
        created.push({ product: entry.product, key: license.key, expiry: sub.trialEndsAt, licenseId: license.id, manageable: true });
      }
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} stripe trial provision failed — rolling back`, e);
    await rollback();
    return {
      ok: false,
      outcome: err(500, "Could not start your trial. Please contact support@itsbusiness.ch."),
    };
  }
  return { ok: true, provisioned: created };
}

async function sendWelcome(
  product: ProductId,
  licenseKeys: string[],
  licenseExpiry: string | null,
  input: SignupInput,
  origin: string,
  portalUrl?: string,
  addProductUrl?: string,
  addProductLabel?: string,
): Promise<void> {
  const dryRun = process.env.DRY_RUN === "true";
  try {
    if (product === "TMT") {
      // cc-tmgmt: each license key is an access code; the welcome mail carries
      // all N seat codes plus the gated per-OS download links. No GitHub invite.
      await sendTmgmtWelcome(
        {
          toEmail: input.email,
          customerName: input.name,
          company: input.company,
          licenseKeys,
          licenseExpiry,
          origin,
          portalUrl,
          addProductUrl,
          addProductLabel,
        },
        dryRun,
      );
    } else {
      // cc-testframework: installs from the license-brokered npm registry with the
      // same key — no GitHub account required.
      const quickstartUrlEn =
        process.env.QUICKSTART_URL_EN ?? "https://meintest.github.io/cc-testframework/en/quickstart";
      const quickstartUrlDe =
        process.env.QUICKSTART_URL_DE ?? "https://meintest.github.io/cc-testframework/de/quickstart";
      await sendWelcomeEmail(
        {
          toEmail: input.email,
          customerName: input.name,
          company: input.company,
          licenseKey: licenseKeys[0],
          licenseExpiry,
          origin,
          quickstartUrlEn,
          quickstartUrlDe,
          portalUrl,
          addProductUrl,
          addProductLabel,
        },
        dryRun,
      );
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} welcome mail failed for ${product} — license is valid, customer needs manual outreach`, e);
  }
}

// One combined welcome mail for a multi-product (Professional) plan (#42): the FW
// key + all TMT keys in a single mail. Best-effort (licenses are valid regardless).
async function sendProfessionalWelcomeMail(
  provisioned: ProvisionedTrial[],
  input: SignupInput,
  origin: string,
  dryRun: boolean,
): Promise<void> {
  const fw = provisioned.filter((p) => p.product === "FW");
  const tmt = provisioned.filter((p) => p.product === "TMT");
  const portalSource = provisioned.find((p) => p.manageable);
  const portalUrl = portalSource
    ? `${origin}/api/license/portal?key=${encodeURIComponent(portalSource.key)}`
    : undefined;
  try {
    await sendProfessionalWelcome(
      {
        toEmail: input.email,
        customerName: input.name,
        company: input.company,
        fwKey: fw[0]?.key ?? "",
        tmtKeys: tmt.map((t) => t.key),
        licenseExpiry: fw[0]?.expiry ?? tmt[0]?.expiry ?? null,
        origin,
        quickstartUrlEn:
          process.env.QUICKSTART_URL_EN ?? "https://meintest.github.io/cc-testframework/en/quickstart",
        quickstartUrlDe:
          process.env.QUICKSTART_URL_DE ?? "https://meintest.github.io/cc-testframework/de/quickstart",
        portalUrl,
      },
      dryRun,
    );
  } catch (e) {
    console.error(`${LOG_PREFIX} Professional welcome mail failed — licenses are valid, manual outreach needed`, e);
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
  return products[0] === "TMT"
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
