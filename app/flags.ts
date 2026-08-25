// Runtime feature kill-switches (server-side). Opt-out style: enabled unless the
// env var is explicitly "false", so an unset var keeps the current behaviour.

/** Subscription purchase / upgrade. Set PURCHASE_ENABLED=false to disable. */
export function purchasesEnabled(): boolean {
  return process.env.PURCHASE_ENABLED !== "false";
}
