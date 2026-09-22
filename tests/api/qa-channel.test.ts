import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { qaChannelVerdict } from "../../app/api/tmgmt/lib/entitlement";
import { GET as QA_UPDATE } from "../../app/api/tmgmt/updates/qa/[file]/route";
import { GET as DOWNLOAD } from "../../app/api/tmgmt/download/route";

// #30 — internal QA channel: entitlement verdict + the qa update feed / download.

const BASE = "https://app.itsbusiness.ch";

function mockBody(metadata: Record<string, unknown>, valid = true) {
  return { meta: { valid }, data: { id: "lic1", attributes: { metadata } } };
}

beforeEach(() => {
  process.env.DRY_RUN = "true";
  delete process.env.KEYGEN_PENDING_POLICY_ID;
});

describe("qaChannelVerdict", () => {
  test("valid + entitled + channel:qa → ok", () => {
    const v = qaChannelVerdict(mockBody({ product: "cc-tmgmt", channel: "qa" }));
    assert.deepEqual(v, { ok: true, licenseId: "lic1" });
  });

  test("valid + entitled but NO channel → 403 qa-channel-not-entitled", () => {
    const v = qaChannelVerdict(mockBody({ product: "cc-tmgmt" }));
    assert.deepEqual(v, { ok: false, status: 403, error: "qa-channel-not-entitled" });
  });

  test("channel other than qa → 403", () => {
    const v = qaChannelVerdict(mockBody({ product: "cc-tmgmt", channel: "beta" }));
    assert.equal((v as { error: string }).error, "qa-channel-not-entitled");
  });

  test("not entitled (unresolvable product) → 403", () => {
    const v = qaChannelVerdict(mockBody({ channel: "qa" })); // no product
    assert.deepEqual(v, { ok: false, status: 403, error: "qa-channel-not-entitled" });
  });

  test("invalid key → 401 invalid-key", () => {
    const v = qaChannelVerdict(mockBody({ product: "cc-tmgmt", channel: "qa" }, false));
    assert.deepEqual(v, { ok: false, status: 401, error: "invalid-key" });
  });
});

function updReq(file: string, key?: string): [Request, { params: Promise<{ file: string }> }] {
  const headers = new Headers();
  if (key) headers.set("authorization", `Bearer ${key}`);
  return [
    new Request(`${BASE}/api/tmgmt/updates/qa/${file}`, { headers }),
    { params: Promise.resolve({ file }) },
  ];
}

describe("GET /api/tmgmt/updates/qa/<file> (DRY_RUN)", () => {
  test("serves qa.yml as text to an entitled key", async () => {
    const res = await QA_UPDATE(...updReq("qa.yml", "k"));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /yaml/);
    const text = await res.text();
    assert.match(text, /0\.6\.0-rc\.1/);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  test("redirects a binary asset (302)", async () => {
    const res = await QA_UPDATE(...updReq("cc-tmgmt-qa-0.6.0-rc.1-win-x64.exe", "k"));
    assert.equal(res.status, 302);
    assert.ok(res.headers.get("location"));
  });

  test("missing key → 401 missing-key (never 404)", async () => {
    const res = await QA_UPDATE(...updReq("qa.yml"));
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: string }).error, "missing-key");
  });
});

describe("GET /api/tmgmt/download?channel=qa (DRY_RUN)", () => {
  function dlReq(query: string, key?: string): Request {
    const headers = new Headers();
    if (key) headers.set("authorization", `Bearer ${key}`);
    return new Request(`${BASE}/api/tmgmt/download${query}`, { headers });
  }

  test("channel=qa → 302 to the QA installer", async () => {
    const res = await DOWNLOAD(dlReq("?os=win&channel=qa", "k"));
    assert.equal(res.status, 302);
    assert.ok(res.headers.get("location"));
  });

  test("no channel → stable download still works", async () => {
    const res = await DOWNLOAD(dlReq("?os=win", "k"));
    assert.equal(res.status, 302);
  });
});
