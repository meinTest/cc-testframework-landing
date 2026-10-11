import crypto from "node:crypto";

// Short-lived, opaque token for CUSTOMER-FACING mail/return links, so the raw
// license key never travels in a URL (#37). A license key is a long-lived
// standing credential (it gates npm, updates, portal, status); in a URL it is
// captured by infrastructure the customer doesn't control — platform/CDN access
// logs (Vercel), corporate mail proxies, and especially URL-detonation security
// (Microsoft Defender Safe Links, Proofpoint) that auto-GETs every link in a mail.
//
// Design: the key is AES-256-GCM *encrypted* into the token (not merely signed),
// so the token is opaque — reading it from a log reveals nothing. The token also
// carries a `purpose` (so a download link can't open the portal) and an `exp`
// (short TTL); both are authenticated by the GCM tag. Stateless — no server store.
//
// NOTE: a strict single-use token would be burned by mail-scanner pre-fetch
// before the human clicks, breaking the link. So these are EXPIRING, not
// single-use. The legacy `?key=` path stays supported for already-sent mails.

// What a token may be redeemed for. Binding a token to one purpose stops a link
// minted for one action being replayed for another.
export type LinkPurpose = "portal" | "download" | "add-product" | "account";

// Mailed links are clicked days later → a week. In-session links (the portal's
// "Return to…" target and the /account page's own buttons) are minted fresh on
// each request and pass a shorter TTL explicitly.
const DEFAULT_TTL_HOURS = 24 * 7;

interface LinkPayload {
  k: string; // the license key
  p: LinkPurpose;
  exp: number; // epoch ms
}

// 32-byte key derived from a dedicated secret, falling back to SALES_API_KEY so
// this works out of the box without a new env var (SALES_API_KEY is already the
// HMAC secret for the sales action tokens and is always set).
function secretKey(): Buffer {
  const secret = process.env.LICENSE_LINK_SECRET || process.env.SALES_API_KEY;
  if (!secret) {
    throw new Error("Missing env var: LICENSE_LINK_SECRET (or SALES_API_KEY fallback)");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/** Mint an opaque, expiring token that stands in for `key` in a URL. */
export function createLinkToken(
  key: string,
  purpose: LinkPurpose,
  ttlHours: number = DEFAULT_TTL_HOURS,
): string {
  const payload: LinkPayload = {
    k: key,
    p: purpose,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // iv(12) || tag(16) || ciphertext
  return base64urlEncode(Buffer.concat([iv, tag, ciphertext]));
}

export type RedeemResult =
  | { ok: true; key: string }
  | { ok: false; reason: "malformed" | "bad-token" | "expired" | "wrong-purpose" };

/** Recover the license key from a token, enforcing purpose + expiry. */
export function redeemLinkToken(token: string, expected: LinkPurpose): RedeemResult {
  const raw = base64urlDecode(token);
  // need at least iv(12) + tag(16) + 1 byte of ciphertext
  if (!raw || raw.length < 12 + 16 + 1) return { ok: false, reason: "malformed" };

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  let json: string;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // tampered/forged token or wrong secret → auth tag mismatch
    return { ok: false, reason: "bad-token" };
  }

  let payload: LinkPayload;
  try {
    payload = JSON.parse(json);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload?.k !== "string" ||
    typeof payload?.p !== "string" ||
    typeof payload?.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.p !== expected) return { ok: false, reason: "wrong-purpose" };
  if (payload.exp < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, key: payload.k };
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64urlDecode(value: string): Buffer | null {
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64");
  } catch {
    return null;
  }
}
