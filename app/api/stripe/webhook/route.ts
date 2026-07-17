import { NextResponse } from "next/server";
import Stripe from "stripe";
import { resolveProduct, productLabel } from "../../../products";
import {
  createPaidLicense,
  listSubscriptionLicenses,
  updateLicenseExpiry,
  suspendLicense,
  reinstateLicense,
  type SubscriptionLicense,
} from "../../signup/lib/keygen";
import { sendSubscriptionKeys } from "../../signup/lib/resend";

// Stripe → Keygen. Maps subscription lifecycle to one license/key per seat:
//   paid/created/updated → ensure N active keys, expiry = current_period_end
//   downgrade            → suspend surplus seats
//   canceled             → suspend all seats
// Idempotent via a per-seat metadata (subscriptionId + seatIndex).

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

async function reconcile(
  stripe: Stripe,
  subscriptionId: string,
  dryRun: boolean,
): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  const quantity = Math.max(1, item?.quantity ?? 1);
  const product = resolveProduct(sub.metadata?.app_product);
  // current_period_end lives on the subscription item in recent Stripe API versions.
  const periodEnd = item?.current_period_end ?? Math.floor(Date.now() / 1000);
  const expiresAt = new Date(periodEnd * 1000).toISOString();

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

  const existing = await listSubscriptionLicenses(subscriptionId, dryRun);
  const bySeat = new Map<number, SubscriptionLicense>(
    existing.map((l) => [l.seatIndex, l]),
  );

  const activeKeys: string[] = [];
  let createdAny = false;
  for (let seatIndex = 0; seatIndex < quantity; seatIndex++) {
    const seat = bySeat.get(seatIndex);
    if (!seat) {
      const created = await createPaidLicense(
        { product, company, email, subscriptionId, seatIndex, expiresAt },
        dryRun,
      );
      activeKeys.push(created.key);
      createdAny = true;
    } else {
      if (seat.status === "SUSPENDED") await reinstateLicense(seat.id, dryRun);
      await updateLicenseExpiry(seat.id, expiresAt, dryRun);
      activeKeys.push(seat.key);
    }
  }

  // Suspend surplus seats on a downgrade.
  for (const l of existing) {
    if (l.seatIndex >= quantity && l.status !== "SUSPENDED") {
      await suspendLicense(l.id, dryRun);
    }
  }

  // Email the keys when new seats were provisioned (initial or upgrade).
  if (createdAny && email) {
    await sendSubscriptionKeys(
      { toEmail: email, company, productName: productLabel(product), keys: activeKeys, expiresAt },
      dryRun,
    );
  }
  console.log(
    `${LOG_PREFIX} reconciled ${subscriptionId}: ${quantity} seat(s), ${activeKeys.length} active`,
  );
}

async function suspendAll(subscriptionId: string, dryRun: boolean): Promise<void> {
  const existing = await listSubscriptionLicenses(subscriptionId, dryRun);
  for (const l of existing) {
    if (l.status !== "SUSPENDED") await suspendLicense(l.id, dryRun);
  }
  console.log(`${LOG_PREFIX} suspended ${existing.length} license(s) for ${subscriptionId}`);
}
