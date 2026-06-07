import crypto from "node:crypto";

const DEFAULT_VALIDITY_HOURS = 24;

export interface ActionPayload {
  name: string;
  email: string;
  company: string;
  useCase: string;
  iat: number;
  exp: number;
}

export interface ActionPayloadInput {
  name: string;
  email: string;
  company: string;
  useCase: string;
  validityHours?: number;
}

export function signActionToken(input: ActionPayloadInput): string {
  const secret = required("SALES_API_KEY");
  const now = Date.now();
  const validityHours = input.validityHours ?? DEFAULT_VALIDITY_HOURS;
  const payload: ActionPayload = {
    name: input.name,
    email: input.email,
    company: input.company,
    useCase: input.useCase,
    iat: now,
    exp: now + validityHours * 60 * 60 * 1000,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(Buffer.from(payloadJson, "utf8"));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest();
  const signatureB64 = base64urlEncode(signature);
  return `${payloadB64}.${signatureB64}`;
}

export type VerifyResult =
  | { ok: true; payload: ActionPayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

export function verifyActionToken(token: string): VerifyResult {
  const secret = process.env.SALES_API_KEY;
  if (!secret) return { ok: false, reason: "bad-signature" };

  const dot = token.indexOf(".");
  if (dot < 0) return { ok: false, reason: "malformed" };
  const payloadB64 = token.slice(0, dot);
  const signatureB64 = token.slice(dot + 1);
  if (!payloadB64 || !signatureB64) return { ok: false, reason: "malformed" };

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest();
  const providedSig = base64urlDecode(signatureB64);
  if (!providedSig) return { ok: false, reason: "malformed" };
  if (expectedSig.length !== providedSig.length) {
    return { ok: false, reason: "bad-signature" };
  }
  if (!crypto.timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: "bad-signature" };
  }

  let payload: ActionPayload;
  try {
    const decoded = base64urlDecode(payloadB64);
    if (!decoded) return { ok: false, reason: "malformed" };
    payload = JSON.parse(decoded.toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof payload?.name !== "string" ||
    typeof payload?.email !== "string" ||
    typeof payload?.company !== "string" ||
    typeof payload?.useCase !== "string" ||
    typeof payload?.iat !== "number" ||
    typeof payload?.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.exp < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}

function base64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
