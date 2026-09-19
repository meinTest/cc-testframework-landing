import type { ProductId } from "./products";

// Marketing plans (CMS boxes) → the set of products a trial provisions. A plan
// is a delivery bundle: each product in the set gets its own trial license and
// its own welcome mail. "Starter" delivers a single product; "Professional"
// delivers both. Prices are a separate, later concern (the paid upgrade) — a
// plan carries no price here.
//
// Note on entitlement: a cc-tmgmt license already unlocks the framework via npm,
// so "starter-tmt" and "professional" overlap in raw access. Professional still
// provisions a dedicated framework license so the customer gets the framework
// onboarding mail now and a separate framework subscription at upgrade time.

export type PlanId = "starter-framework" | "starter-tmt" | "professional";

export const PLANS: Record<PlanId, { label: string; products: ProductId[] }> = {
  "starter-framework": { label: "Starter", products: ["cc-testframework"] },
  "starter-tmt": { label: "Starter", products: ["cc-tmgmt"] },
  "professional": { label: "Professional", products: ["cc-tmgmt", "cc-testframework"] },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS, value);
}

/** Products delivered by a plan (in provisioning order). */
export function planProducts(plan: PlanId): ProductId[] {
  return PLANS[plan].products;
}
