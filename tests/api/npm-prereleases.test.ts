import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isPrerelease,
  stripPrereleases,
  matchTarball,
} from "../../app/api/tmgmt/lib/npm-registry";

// cc-testframework#216 — pre-release (rc) npm versions are visible only to
// internal (channel:qa) licenses; customers get the stable `latest` chain only.

describe("isPrerelease", () => {
  test("stable versions → false", () => {
    for (const v of ["1.2.3", "0.5.0", "10.0.0"]) assert.equal(isPrerelease(v), false, v);
  });
  test("pre-release versions → true", () => {
    for (const v of ["1.3.0-rc.1", "2.0.0-beta.2", "0.6.0-alpha"]) assert.equal(isPrerelease(v), true, v);
  });
});

describe("stripPrereleases", () => {
  function packument() {
    return {
      "dist-tags": { latest: "1.2.3", rc: "1.3.0-rc.1", next: "2.0.0-beta.1" },
      versions: {
        "1.2.2": { dist: { tarball: "u1" } },
        "1.2.3": { dist: { tarball: "u2" } },
        "1.3.0-rc.1": { dist: { tarball: "u3" } },
        "2.0.0-beta.1": { dist: { tarball: "u4" } },
      },
      time: {
        created: "t0",
        modified: "t1",
        "1.2.3": "t2",
        "1.3.0-rc.1": "t3",
        "2.0.0-beta.1": "t4",
      },
    };
  }

  test("removes pre-release versions, their time entries, and rc/next dist-tags", () => {
    const p = packument();
    stripPrereleases(p);
    assert.deepEqual(Object.keys(p.versions).sort(), ["1.2.2", "1.2.3"]);
    assert.deepEqual(p["dist-tags"], { latest: "1.2.3" });
    assert.deepEqual(Object.keys(p.time).sort(), ["1.2.3", "created", "modified"]);
  });

  test("no-op when there are no pre-releases", () => {
    const p = {
      "dist-tags": { latest: "1.2.3" },
      versions: { "1.2.3": { dist: { tarball: "u" } } },
      time: { created: "t0", modified: "t1", "1.2.3": "t2" },
    };
    stripPrereleases(p);
    assert.deepEqual(Object.keys(p.versions), ["1.2.3"]);
    assert.deepEqual(p["dist-tags"], { latest: "1.2.3" });
  });
});

describe("matchTarball", () => {
  const versions = {
    "1.2.3": { dist: { tarball: "https://gh/pkg/-/aaa" } },
    "1.3.0-rc.1": { dist: { tarball: "https://gh/pkg/-/bbb" } },
  };

  test("stable tarball → ok with url", () => {
    assert.deepEqual(matchTarball(versions, "aaa", false), { kind: "ok", url: "https://gh/pkg/-/aaa" });
  });
  test("pre-release tarball for a customer → forbidden (→ 403)", () => {
    assert.deepEqual(matchTarball(versions, "bbb", false), { kind: "forbidden" });
  });
  test("pre-release tarball for an internal license → ok", () => {
    assert.deepEqual(matchTarball(versions, "bbb", true), { kind: "ok", url: "https://gh/pkg/-/bbb" });
  });
  test("unknown filename → not-found", () => {
    assert.deepEqual(matchTarball(versions, "zzz", false), { kind: "not-found" });
  });
});
