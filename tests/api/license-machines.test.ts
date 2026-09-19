import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  classifyBaseValidity,
  classifyCreateConflict,
} from "../../app/api/tmgmt/lib/machines";
import { POST as ACTIVATE } from "../../app/api/license/activate/route";
import { GET as LIST_MACHINES } from "../../app/api/license/machines/route";
import { DELETE as FREE_MACHINE } from "../../app/api/license/machines/[machineId]/route";

// #29 — device/seat binding. Pure classifiers are unit-tested; the routes are
// exercised in DRY_RUN (network-free).

const BASE = "https://app.itsbusiness.ch";

function activateReq(opts: { key?: string; fingerprint?: string }): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.key) headers.set("authorization", `Bearer ${opts.key}`);
  if (opts.fingerprint) headers.set("x-device-fingerprint", opts.fingerprint);
  return new Request(`${BASE}/api/license/activate`, { method: "POST", headers, body: "{}" });
}

beforeEach(() => {
  process.env.DRY_RUN = "true";
});

describe("classifyBaseValidity", () => {
  test("valid license → null (proceed)", () => {
    assert.equal(classifyBaseValidity({ meta: { valid: true, code: "VALID" } }), null);
  });
  test("machine-scope codes → null (license fine, needs activation)", () => {
    for (const code of ["NO_MACHINE", "NO_MACHINES", "FINGERPRINT_SCOPE_MISMATCH", "TOO_MANY_MACHINES"]) {
      assert.equal(classifyBaseValidity({ meta: { valid: false, code } }), null, code);
    }
  });
  test("EXPIRED → expired 403", () => {
    const r = classifyBaseValidity({ meta: { valid: false, code: "EXPIRED" } });
    assert.deepEqual([r?.reason, r?.status], ["expired", 403]);
  });
  test("SUSPENDED/BANNED → suspended 403", () => {
    assert.equal(classifyBaseValidity({ meta: { valid: false, code: "SUSPENDED" } })?.reason, "suspended");
    assert.equal(classifyBaseValidity({ meta: { valid: false, code: "BANNED" } })?.reason, "suspended");
  });
  test("NOT_FOUND / unknown → invalid 401", () => {
    const r = classifyBaseValidity({ meta: { valid: false, code: "NOT_FOUND" } });
    assert.deepEqual([r?.reason, r?.status], ["invalid", 401]);
  });
});

describe("classifyCreateConflict", () => {
  test("machine-limit codes → seat-limit", () => {
    assert.equal(classifyCreateConflict(422, ["MACHINE_LIMIT_EXCEEDED"]), "seat-limit");
    assert.equal(classifyCreateConflict(422, ["TOO_MANY_MACHINES"]), "seat-limit");
  });
  test("fingerprint-uniqueness signals → device-already-registered", () => {
    assert.equal(classifyCreateConflict(422, ["has already been taken"]), "device-already-registered");
    assert.equal(classifyCreateConflict(422, ["/data/attributes/fingerprint"]), "device-already-registered");
    assert.equal(classifyCreateConflict(409, ["FINGERPRINT_TAKEN"]), "device-already-registered");
  });
  test("unknown → other", () => {
    assert.equal(classifyCreateConflict(500, ["SERVER_ERROR"]), "other");
  });
});

describe("POST /api/license/activate (DRY_RUN)", () => {
  test("activates a device → 200", async () => {
    const res = await ACTIVATE(activateReq({ key: "k", fingerprint: "fp-1" }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; status: string; machineId: string };
    assert.equal(body.ok, true);
    assert.equal(body.status, "activated");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  test("missing fingerprint → 400", async () => {
    const res = await ACTIVATE(activateReq({ key: "k" }));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { reason: string }).reason, "missing-fingerprint");
  });

  test("missing key → 401", async () => {
    const res = await ACTIVATE(activateReq({ fingerprint: "fp-1" }));
    assert.equal(res.status, 401);
  });

  test("seat limit reached → 403 seat-limit (with limit/used)", async () => {
    const res = await ACTIVATE(activateReq({ key: "k", fingerprint: "DRYRUN_SEATFULL" }));
    assert.equal(res.status, 403);
    const body = (await res.json()) as { reason: string; limit: number; used: number };
    assert.equal(body.reason, "seat-limit");
    assert.equal(body.limit, 1);
    assert.equal(body.used, 1);
  });

  test("device already registered → 403 device-already-registered", async () => {
    const res = await ACTIVATE(activateReq({ key: "k", fingerprint: "DRYRUN_TAKEN" }));
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { reason: string }).reason, "device-already-registered");
  });
});

describe("GET /api/license/machines + DELETE (DRY_RUN)", () => {
  test("lists devices", async () => {
    const req = new Request(`${BASE}/api/license/machines`, {
      headers: { authorization: "Bearer k" },
    });
    const res = await LIST_MACHINES(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; devices: unknown[]; limit: number };
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.devices));
    assert.equal(body.limit, 1);
  });

  test("frees a device", async () => {
    const req = new Request(`${BASE}/api/license/machines/m1`, {
      method: "DELETE",
      headers: { authorization: "Bearer k" },
    });
    const res = await FREE_MACHINE(req, { params: Promise.resolve({ machineId: "m1" }) });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
  });
});
