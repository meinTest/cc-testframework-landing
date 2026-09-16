// Trial duration (days) — the length of the issued trial license. This is a
// DIFFERENT quantity from the signup-link validity (expiresInDays); see #11.
// Sales picks it in the action UI; it flows through the pending-license metadata
// into createTrialLicense, which sets the license expiry from it. Flows without a
// sales choice (open self-serve / demo) omit it and inherit the Keygen policy
// default.

export const DEFAULT_TRIAL_DAYS = 14;
export const MAX_TRIAL_DAYS = 365;

/**
 * Validate a sales-provided trial duration. Empty/absent → the default (14).
 * Out of range → an error (mirrors the expiresInDays validation).
 */
export function validateTrialDays(
  raw: unknown,
): { value: number } | { error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { value: DEFAULT_TRIAL_DAYS };
  }
  const parsed = typeof raw === "string" ? Number(raw) : (raw as number);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_TRIAL_DAYS) {
    return { error: `trialDays must be a number between 1 and ${MAX_TRIAL_DAYS}` };
  }
  return { value: Math.floor(parsed) };
}

/**
 * Read a trialDays value back out of pending-license metadata. Returns undefined
 * when absent or invalid, so the caller inherits the Keygen policy default
 * instead of applying a bogus expiry.
 */
export function sanitizeTrialDays(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = typeof raw === "string" ? Number(raw) : (raw as number);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_TRIAL_DAYS) {
    return undefined;
  }
  return Math.floor(parsed);
}
