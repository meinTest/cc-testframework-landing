import { NextResponse } from "next/server";
import Stripe from "stripe";
import { resolveProduct, coerceProduct, productLabel } from "../../../products";
import {
  createPaidLicense,
  listSubscriptionLicenses,
  updateLicenseExpiry,
  updateLicenseMaxMachines,
  suspendLicense,
  reinstateLicense,
  type SubscriptionLicense,
} from "../../signup/lib/keygen";
import type { ProductId } from "../../../products";
import { sendSubscriptionKeys } from "../../signup/lib/resend";

// Stripe → Keygen. Maps subscription lifecycle to Keygen licenses, by product:
//   TMT → one key PER seat (device-bound): ensure N active keys, suspend surplus
//         on downgrade, suspend all on cancel. Idempotent via subscriptionId +
//         seatIndex metadata.
//   FW  → ONE floating key with maxMachines = quantity (#41): a quantity change
//         updates that single key's maxMachines in place — no per-seat keys.
// Expiry always mirrors the subscription's current_period_end.

const LOG_PREFIX = "[stripe][webhook]";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) {
    console.error(`${LOG_PREFIX} missing STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const stripe = new Stripe(secret);
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    console.error(`${LOG_PREFIX} signature verification failed`, err);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const dryRun = process.env.DRY_RUN === "true";
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          await reconcile(stripe, String(session.subscription), dryRun);
        }
        break;
      }
      case "customer.subscription.updated": {
        await reconcile(stripe, (event.data.object as Stripe.Subscription).id, dryRun);
        break;
      }
      case "customer.subscription.deleted": {
        await suspendAll((event.data.object as Stripe.Subscription).id, dryRun);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} handling ${event.type} failed`, err);
    return NextResponse.json({ ok: false }, { status: 500 }); // Stripe retries
  }

  return NextResponse.json({ received: true });
}

// Subscription statuses that mean the mirrored license(s) must be suspended:
// a card-less trial that ended (canceled), or a failed conversion/payment.
const DEAD_SUB_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "unpaid",
  "incomplete_expired",
]);

async function reconcile(
  stripe: Stripe,
  subscriptionId: string,
  dryRun: boolean,
): Promise<void> {
  // Expand the price's product so each line item's app_product (FW/TMT) resolves
  // — a Professional subscription carries TWO line items, one per product (#42).
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"],
  });
  if (DEAD_SUB_STATUSES.has(sub.status)) {
    await suspendAll(subscriptionId, dryRun);
    return;
  }

  let email = "";
  let company = "";
  if (sub.customer) {
    const customer = await stripe.customers.retrieve(String(sub.customer));
    if (!("deleted" in customer)) {
      email = customer.email ?? "";
      company =
        customer.name ??
        (typeof customer.metadata?.company === "string" ? customer.metadata.company : "");
    }
  }
  const stripeCustomerId = sub.customer ? String(sub.customer) : "";
  const existing = await listSubscriptionLicenses(subscriptionId, dryRun);

  // One entry per line item: product + purchased quantity + expiry.
  const periodFallback = Math.floor(Date.now() / 1000);
  const lineItems = sub.items.data.map((item) => {
    const prod = item.price?.product;
    const appProduct =
      prod && typeof prod === "object" && !("deleted" in prod)
        ? coerceProduct(prod.metadata?.app_product)
        : null;
    // Fallback to the subscription-level metadata (single-product subs).
    const product = appProduct ?? resolveProduct(sub.metadata?.app_product);
    const periodEnd = item.current_period_end ?? periodFallback;
    return {
      product,
      quantity: Math.max(1, item.quantity ?? 1),
      expiresAt: new Date(periodEnd * 1000).toISOString(),
    };
  });
  const subscribedProducts = new Set(lineItems.map((li) => li.product));

  // Reconcile each product against the licenses that belong to it. FW = one
  // floating key (maxMachines = quantity); TMT = one device-bound key per seat.
  const groups: GroupResult[] = [];
  for (const li of lineItems) {
    const forProduct = existing.filter((l) => l.product === li.product);
    const ctx: ReconcileCtx = {
      product: li.product,
      company,
      email,
      subscriptionId,
      stripeCustomerId,
      expiresAt: li.expiresAt,
      dryRun,
    };
    groups.push(
      li.product === "FW"
        ? await reconcileFloating(forProduct, li.quantity, ctx)
        : await reconcilePerSeat(forProduct, li.quantity, ctx),
    );
  }

  // A product dropped from the subscription → suspend its (now orphaned) licenses.
  for (const l of existing) {
    if (l.product && !subscribedProducts.has(l.product) && l.status !== "SUSPENDED") {
      await suspendLicense(l.id, dryRun);
    }
  }

  // ONE combined mail covering every product that got new keys (#42).
  const fresh = groups.filter((g) => g.created && g.keys.length > 0);
  if (fresh.length > 0 && email) {
    await sendSubscriptionKeys(
      {
        toEmail: email,
        company,
        groups: fresh.map((g) => ({ productName: g.productName, keys: g.keys })),
        expiresAt: lineItems[0]?.expiresAt ?? new Date().toISOString(),
      },
      dryRun,
    );
  }
  console.log(
    `${LOG_PREFIX} reconciled ${subscriptionId}: ${lineItems.map((li) => `${li.product}×${li.quantity}`).join(" + ")}`,
  );
}

interface ReconcileCtx {
  product: ProductId;
  company: string;
  email: string;
  subscriptionId: string;
  stripeCustomerId: string;
  expiresAt: string;
  dryRun: boolean;
}

// What a per-product reconcile produced, for the combined keys mail.
interface GroupResult {
  productName: string;
  keys: string[];
  created: boolean; // at least one NEW key was provisioned
}

// TMT: one device-bound key per seat. Create missing seats, refresh expiry on
// existing ones, suspend surplus on a downgrade.
async function reconcilePerSeat(
  existing: SubscriptionLicense[],
  quantity: number,
  ctx: ReconcileCtx,
): Promise<GroupResult> {
  const bySeat = new Map<number, SubscriptionLicense>(existing.map((l) => [l.seatIndex, l]));
  const activeKeys: string[] = [];
  let createdAny = false;
  for (let seatIndex = 0; seatIndex < quantity; seatIndex++) {
    const seat = bySeat.get(seatIndex);
    if (!seat) {
      const created = await createPaidLicense(
        {
          product: ctx.product,
          company: ctx.company,
          email: ctx.email,
          subscriptionId: ctx.subscriptionId,
          stripeCustomerId: ctx.stripeCustomerId,
          seatIndex,
          expiresAt: ctx.expiresAt,
        },
        ctx.dryRun,
      );
      activeKeys.push(created.key);
      createdAny = true;
    } else {
      if (seat.status === "SUSPENDED") await reinstateLicense(seat.id, ctx.dryRun);
      await updateLicenseExpiry(seat.id, ctx.expiresAt, ctx.dryRun);
      activeKeys.push(seat.key);
    }
  }

  // Suspend surplus seats on a downgrade.
  for (const l of existing) {
    if (l.seatIndex >= quantity && l.status !== "SUSPENDED") {
      await suspendLicense(l.id, ctx.dryRun);
    }
  }

  return { productName: productLabel(ctx.product), keys: activeKeys, created: createdAny };
}

// FW: exactly ONE floating key with maxMachines = quantity (#41). First reconcile
// creates it; later ones update maxMachines + expiry in place. Never adds per-seat
// keys; defensively suspends any stray extra licenses for this product.
async function reconcileFloating(
  existing: SubscriptionLicense[],
  quantity: number,
  ctx: ReconcileCtx,
): Promise<GroupResult> {
  const primary = existing.find((l) => l.seatIndex === 0) ?? existing[0];
  let key: string;
  let created = false;
  if (!primary) {
    const c = await createPaidLicense(
      {
        product: ctx.product,
        company: ctx.company,
        email: ctx.email,
        subscriptionId: ctx.subscriptionId,
        stripeCustomerId: ctx.stripeCustomerId,
        seatIndex: 0,
        expiresAt: ctx.expiresAt,
        maxMachines: quantity,
      },
      ctx.dryRun,
    );
    key = c.key;
    created = true;
  } else {
    if (primary.status === "SUSPENDED") await reinstateLicense(primary.id, ctx.dryRun);
    await updateLicenseExpiry(primary.id, ctx.expiresAt, ctx.dryRun);
    await updateLicenseMaxMachines(primary.id, quantity, ctx.dryRun);
    key = primary.key;
  }

  // FW is single-key for this product — suspend any stray extras (self-heal).
  for (const l of existing) {
    if (l !== primary && l.status !== "SUSPENDED") await suspendLicense(l.id, ctx.dryRun);
  }

  return { productName: productLabel(ctx.product), keys: [key], created };
}

async function suspendAll(subscriptionId: string, dryRun: boolean): Promise<void> {
  const existing = await listSubscriptionLicenses(subscriptionId, dryRun);
  for (const l of existing) {
    if (l.status !== "SUSPENDED") await suspendLicense(l.id, dryRun);
  }
  console.log(`${LOG_PREFIX} suspended ${existing.length} license(s) for ${subscriptionId}`);
}
