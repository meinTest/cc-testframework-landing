import { NextResponse } from "next/server";
import { rateLimit } from "../../tmgmt/lib/rate-limit";

// Per-license abuse cap for the feedback endpoints. A valid license is required
// to reach them, but a licensed client is only semi-trusted — this bounds how
// fast one license can file/edit reports (and, with screenshots, commit blobs).
// In-process per instance (see rate-limit.ts); enough as an abuse cap.
const PER_MIN = Number(process.env.FEEDBACK_RATE_LIMIT_PER_MIN) || 20;

/** Returns a 429 response when the license is over its cap, else null to proceed. */
export function feedbackRateLimit(licenseId: string): NextResponse | null {
  const rl = rateLimit(`feedback:${licenseId}`, PER_MIN, 60_000);
  if (rl.ok) return null;
  return NextResponse.json(
    { ok: false, message: "Rate limit exceeded. Please slow down." },
    {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" },
    },
  );
}
