import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isHiddenFromCustomer, withdrawIssue } from "../../app/api/feedback/lib/issues";

// Tests for the withdraw behaviour (#28): withdrawn/client-hidden reports must be
// hidden from GET so they never surface as "rejected".

describe("isHiddenFromCustomer", () => {
  test("hides withdrawn reports (#28)", () => {
    assert.equal(isHiddenFromCustomer(["withdrawn"]), true);
    assert.equal(isHiddenFromCustomer(["customer:abc", "type:bug", "withdrawn"]), true);
  });

  test("still hides legacy client-hidden reports", () => {
    assert.equal(isHiddenFromCustomer(["client-hidden"]), true);
  });

  test("keeps ordinary reports visible", () => {
    assert.equal(isHiddenFromCustomer(["customer:abc", "type:bug"]), false);
    assert.equal(isHiddenFromCustomer([]), false);
  });
});

describe("withdrawIssue (DRY_RUN)", () => {
  test("is a no-op that resolves without touching GitHub", async () => {
    await assert.doesNotReject(
      withdrawIssue(
        { number: 1, state: "open", body: "", labels: [], updatedAt: "" },
        true,
      ),
    );
  });
});
