import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  parseNpmSpec,
  getProxiedPackument,
  resolveOriginalTarball,
} from "../../app/api/tmgmt/lib/npm-registry";

// #57 — the npm proxy serves BOTH scopes in parallel during the org move:
// @meintest/* (existing customers, no shutdown date) and @itsbusinessag/*
// (framework 1.0.0+). The matched scope is carried through to the upstream
// fetch and the cache key, so the two scopes never cross.

describe("parseNpmSpec — scope allowlist (#57)", () => {
  test("packument in either scope → packument with that scope", () => {
    assert.deepEqual(parseNpmSpec("@meintest/cc-testframework"), {
      kind: "packument",
      scope: "@meintest",
      pkg: "cc-testframework",
    });
    assert.deepEqual(parseNpmSpec("@itsbusinessag/cc-testframework"), {
      kind: "packument",
      scope: "@itsbusinessag",
      pkg: "cc-testframework",
    });
  });

  test("tarball in either scope → tarball with scope + pkg + filename", () => {
    assert.deepEqual(parseNpmSpec("@meintest/cc-testframework/-/abc123"), {
      kind: "tarball",
      scope: "@meintest",
      pkg: "cc-testframework",
      filename: "abc123",
    });
    assert.deepEqual(parseNpmSpec("@itsbusinessag/cc-testframework-authoring/-/deadbeef"), {
      kind: "tarball",
      scope: "@itsbusinessag",
      pkg: "cc-testframework-authoring",
      filename: "deadbeef",
    });
  });

  test("any third scope → reject (→403, never an open mirror)", () => {
    for (const spec of ["@foo/bar", "@npm/thing", "@itsbusiness/x", "@meintestx/y"]) {
      assert.deepEqual(parseNpmSpec(spec), { kind: "reject" }, spec);
    }
  });

  test("allowed scope but unrecognized shape → not-found (→404, not 403)", () => {
    // trailing junk the two regexes don't accept, but the scope IS allowed
    assert.deepEqual(parseNpmSpec("@meintest/pkg/extra/segment"), { kind: "not-found" });
    assert.deepEqual(parseNpmSpec("@itsbusinessag/"), { kind: "not-found" });
  });
});

describe("per-scope upstream + cache isolation (#57)", () => {
  const realFetch = globalThis.fetch;
  let calls: string[];

  function packument() {
    return {
      "dist-tags": { latest: "1.0.0" },
      versions: { "1.0.0": { dist: { tarball: "https://gh/x/-/sha0" } } },
    };
  }

  beforeEach(() => {
    calls = [];
    process.env.GH_PACKAGES_TOKEN = "test-pat"; // avoid the GitHub App path
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify(packument()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GH_PACKAGES_TOKEN;
  });

  test("the requested scope is carried verbatim into the upstream path", async () => {
    await getProxiedPackument("@itsbusinessag", "probe-path", "https://app.itsbusiness.ch/api/tmgmt/npm", false);
    assert.match(calls[0], /npm\.pkg\.github\.com\/@itsbusinessag%2fprobe-path$/);
  });

  test("packument tarball URLs are rewritten under the requested scope", async () => {
    const p = (await getProxiedPackument(
      "@itsbusinessag",
      "probe-rewrite",
      "https://app.itsbusiness.ch/api/tmgmt/npm",
      false,
    )) as { versions: Record<string, { dist: { tarball: string } }> };
    assert.equal(
      p.versions["1.0.0"].dist.tarball,
      "https://app.itsbusiness.ch/api/tmgmt/npm/@itsbusinessag/probe-rewrite/-/sha0",
    );
  });

  test("same package name in both scopes does NOT share a cache slot", async () => {
    // Unique name so neither scope is warm from an earlier test.
    await getProxiedPackument("@meintest", "probe-cache", "base", false);
    await getProxiedPackument("@itsbusinessag", "probe-cache", "base", false);
    assert.equal(calls.length, 2, "each scope must hit its own org upstream");
    assert.match(calls[0], /@meintest%2fprobe-cache$/);
    assert.match(calls[1], /@itsbusinessag%2fprobe-cache$/);
  });

  test("a warm scope is served from cache (same scope+pkg → one upstream call)", async () => {
    await getProxiedPackument("@itsbusinessag", "probe-warm", "base", false);
    await getProxiedPackument("@itsbusinessag", "probe-warm", "base", false);
    assert.equal(calls.length, 1, "second identical request is cached");
  });

  test("rc filtering (#31) holds in the new scope: a customer gets forbidden for a pre-release tarball", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          versions: { "1.1.0-rc.1": { dist: { tarball: "https://gh/x/-/rcsha" } } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const r = await resolveOriginalTarball("@itsbusinessag", "probe-rc", "rcsha", false);
    assert.deepEqual(r, { kind: "forbidden" });
    const ok = await resolveOriginalTarball("@itsbusinessag", "probe-rc", "rcsha", true);
    assert.equal(ok.kind, "ok");
  });
});
