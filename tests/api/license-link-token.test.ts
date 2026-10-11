import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createLinkToken, redeemLinkToken } from "../../app/api/license/lib/link-token";

// #37 — opaque, expiring, purpose-bound mail-link tokens (no server store).

const KEY = "6A99EF-28A07B-188E68-9AC881-880007-V3";

beforeEach(() => {
  process.env.LICENSE_LINK_SECRET = "unit-test-secret";
  delete process.env.SALES_API_KEY;
});

describe("createLinkToken / redeemLinkToken", () => {
  test("round-trips the key for the matching purpose", () => {
    const token = createLinkToken(KEY, "download");
    const r = redeemLinkToken(token, "download");
    assert.deepEqual(r, { ok: true, key: KEY });
  });

  test("the raw key never appears in the token", () => {
    const token = createLinkToken(KEY, "portal");
    assert.ok(!token.includes(KEY));
    assert.ok(!token.includes("28A07B"));
  });

  test("a token minted for one purpose is rejected for another", () => {
    const token = createLinkToken(KEY, "download");
    const r = redeemLinkToken(token, "portal");
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, "wrong-purpose");
  });

  test("an expired token is rejected", () => {
    const token = createLinkToken(KEY, "portal", -1); // already expired
    const r = redeemLinkToken(token, "portal");
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, "expired");
  });

  test("a tampered token fails authentication", () => {
    const token = createLinkToken(KEY, "portal");
    // flip some characters in the middle (ciphertext/tag) → GCM auth fails
    const i = Math.floor(token.length / 2);
    const flipped =
      token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
    const r = redeemLinkToken(flipped, "portal");
    assert.equal(r.ok, false);
    assert.ok(["bad-token", "malformed"].includes((r as { reason: string }).reason));
  });

  test("garbage input is malformed, not a crash", () => {
    const r = redeemLinkToken("not-a-token", "portal");
    assert.equal(r.ok, false);
    assert.ok(["malformed", "bad-token"].includes((r as { reason: string }).reason));
  });

  test("a token minted under a different secret cannot be redeemed", () => {
    const token = createLinkToken(KEY, "account");
    process.env.LICENSE_LINK_SECRET = "a-different-secret";
    const r = redeemLinkToken(token, "account");
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, "bad-token");
  });

  test("falls back to SALES_API_KEY when LICENSE_LINK_SECRET is unset", () => {
    delete process.env.LICENSE_LINK_SECRET;
    process.env.SALES_API_KEY = "sales-secret-fallback";
    const token = createLinkToken(KEY, "add-product");
    assert.deepEqual(redeemLinkToken(token, "add-product"), { ok: true, key: KEY });
  });
});
