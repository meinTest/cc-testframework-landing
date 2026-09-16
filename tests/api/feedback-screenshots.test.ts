import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  linkifyScreenshotMarkers,
  stripScreenshotLinks,
  extractScreenshotUrls,
  extractBodyFields,
} from "../../app/api/feedback/lib/issues";

// Unit tests for the screenshot marker <-> link handling (landing #27 / TMT#245).
// Pure helpers, no network.

const U1 = "https://github.com/o/r/blob/feedback-assets/uuid/1.png";
const U2 = "https://github.com/o/r/blob/feedback-assets/uuid/2.jpg";

describe("linkifyScreenshotMarkers", () => {
  test("replaces a marker with a link at its position, mapping n -> urls[n-1]", () => {
    assert.equal(
      linkifyScreenshotMarkers("A [screenshot-1.png] B", [U1]),
      `A [screenshot-1.png](${U1}) B`,
    );
  });

  test("maps multiple markers in text and repro order", () => {
    assert.equal(
      linkifyScreenshotMarkers("[screenshot-2.png] then [screenshot-1.png]", [U1, U2]),
      `[screenshot-2.png](${U2}) then [screenshot-1.png](${U1})`,
    );
  });

  test("leaves a marker without a matching upload as plain text", () => {
    assert.equal(
      linkifyScreenshotMarkers("A [screenshot-2.png] B", [U1]), // only 1 image
      "A [screenshot-2.png] B",
    );
  });

  test("leaves non-screenshot filename markers untouched", () => {
    assert.equal(
      linkifyScreenshotMarkers("see [my-photo.png] here", [U1]),
      "see [my-photo.png] here",
    );
  });

  test("is idempotent (does not double-link an already linked marker)", () => {
    const once = linkifyScreenshotMarkers("X [screenshot-1.png] Y", [U1]);
    assert.equal(linkifyScreenshotMarkers(once, [U1]), once);
  });

  test("no images -> text unchanged", () => {
    assert.equal(
      linkifyScreenshotMarkers("A [screenshot-1.png] B", []),
      "A [screenshot-1.png] B",
    );
  });
});

describe("stripScreenshotLinks", () => {
  test("turns a screenshot link back into a bare marker", () => {
    assert.equal(
      stripScreenshotLinks(`A [screenshot-1.png](${U1}) B`),
      "A [screenshot-1.png] B",
    );
  });

  test("round-trips with linkify", () => {
    const original = "Login [screenshot-1.png] fails, retry [screenshot-2.png] later";
    const linked = linkifyScreenshotMarkers(original, [U1, U2]);
    assert.equal(stripScreenshotLinks(linked), original);
  });

  test("leaves ordinary markdown links alone", () => {
    const s = "see [the docs](https://example.test/docs)";
    assert.equal(stripScreenshotLinks(s), s);
  });
});

describe("extractScreenshotUrls", () => {
  test("reads the ordered URLs out of the Screenshots section", () => {
    const body = [
      "## Beschreibung",
      "",
      "text",
      "",
      "## Screenshots",
      "",
      `- [screenshot-1.png](${U1})`,
      `- [screenshot-2.jpg](${U2})`,
    ].join("\n");
    assert.deepEqual(extractScreenshotUrls(body), [U1, U2]);
  });

  test("returns [] when there is no Screenshots section", () => {
    assert.deepEqual(extractScreenshotUrls("## Beschreibung\n\ntext"), []);
  });
});

describe("extractBodyFields", () => {
  test("returns description/repro with links reversed to markers", () => {
    const body = [
      "## Beschreibung",
      "",
      `Login fehlgeschlagen [screenshot-1.png](${U1}) nach OK`,
      "",
      "## Reproduktionsschritte",
      "",
      `1. App öffnen [screenshot-2.jpg](${U2})`,
      "",
      "## Screenshots",
      "",
      `- [screenshot-1.png](${U1})`,
      `- [screenshot-2.jpg](${U2})`,
    ].join("\n");

    const { description, repro } = extractBodyFields(body);
    assert.equal(description, "Login fehlgeschlagen [screenshot-1.png] nach OK");
    assert.equal(repro, "1. App öffnen [screenshot-2.jpg]");
  });

  test("repro is null when the report had none", () => {
    const body = "## Beschreibung\n\nNur Beschreibung, kein Repro.";
    const { description, repro } = extractBodyFields(body);
    assert.equal(description, "Nur Beschreibung, kein Repro.");
    assert.equal(repro, null);
  });

  test("does not truncate a description that contains app-appended ## sections", () => {
    const body = [
      "## Beschreibung",
      "",
      "Fehler tritt auf.",
      "",
      "## Robin-Kontext",
      "",
      "kontext-zeug",
      "",
      "## Reproduktionsschritte",
      "",
      "Schritt 1",
    ].join("\n");

    const { description, repro } = extractBodyFields(body);
    assert.ok(description.includes("## Robin-Kontext"), "keeps embedded section");
    assert.ok(description.startsWith("Fehler tritt auf."));
    assert.equal(repro, "Schritt 1");
  });
});
