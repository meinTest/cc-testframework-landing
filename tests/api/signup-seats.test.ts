import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  validateSignupInput,
  resolveSeatCount,
  expandSeatPlan,
  type SeatCounts,
} from "../../app/api/signup/lib/perform";

// #39 — per-product seat counts threaded through signup. Pure-function tests for
// the seat parsing (validateSignupInput), resolution (resolveSeatCount) and the
// FW-floating / TMT-per-seat expansion (expandSeatPlan). No network.

const BASE = { name: "Jane", email: "jane@acme.test", company: "Acme" };

function seatsOf(r: ReturnType<typeof validateSignupInput>): SeatCounts {
  assert.ok("value" in r);
  return r.value.seats;
}

describe("validateSignupInput — seats (#39)", () => {
  test("no seats → default 1, no per-product overrides", () => {
    const s = seatsOf(validateSignupInput({ ...BASE }));
    assert.equal(s.default, 1);
    assert.deepEqual(s.byProduct, {});
  });

  test("scalar seats → plan-wide default", () => {
    const s = seatsOf(validateSignupInput({ ...BASE, seats: 3 }));
    assert.equal(s.default, 3);
    assert.deepEqual(s.byProduct, {});
    // A single-product TMT trial then resolves to 3 seats.
    assert.equal(resolveSeatCount(s, "TMT"), 3);
    assert.equal(resolveSeatCount(s, "FW"), 3);
  });

  test("numeric string seats are accepted and floored", () => {
    const s = seatsOf(validateSignupInput({ ...BASE, seats: "4.9" }));
    assert.equal(s.default, 4);
  });

  test("explicit fwSeats / tmtSeats (Professional: m FW + n TMT)", () => {
    const s = seatsOf(validateSignupInput({ ...BASE, plan: "professional", fwSeats: 2, tmtSeats: 5 }));
    assert.equal(resolveSeatCount(s, "FW"), 2);
    assert.equal(resolveSeatCount(s, "TMT"), 5);
  });

  test("object seats { FW, TMT }", () => {
    const s = seatsOf(validateSignupInput({ ...BASE, plan: "professional", seats: { FW: 2, TMT: 7 } }));
    assert.equal(resolveSeatCount(s, "FW"), 2);
    assert.equal(resolveSeatCount(s, "TMT"), 7);
  });

  test("explicit per-product fields win over a scalar default", () => {
    const s = seatsOf(validateSignupInput({ ...BASE, plan: "professional", seats: 4, tmtSeats: 9 }));
    assert.equal(s.default, 4);
    assert.equal(resolveSeatCount(s, "FW"), 4); // no override → default
    assert.equal(resolveSeatCount(s, "TMT"), 9); // explicit override
  });

  test("invalid / out-of-range seats are clamped, never rejected", () => {
    assert.equal(seatsOf(validateSignupInput({ ...BASE, seats: 0 })).default, 1);
    assert.equal(seatsOf(validateSignupInput({ ...BASE, seats: -5 })).default, 1);
    assert.equal(seatsOf(validateSignupInput({ ...BASE, seats: "abc" })).default, 1);
    assert.equal(seatsOf(validateSignupInput({ ...BASE, seats: 100000 })).default, 999);
  });
});

describe("resolveSeatCount (#39)", () => {
  test("per-product override wins, else the default", () => {
    const s: SeatCounts = { default: 2, byProduct: { TMT: 6 } };
    assert.equal(resolveSeatCount(s, "TMT"), 6);
    assert.equal(resolveSeatCount(s, "FW"), 2);
  });
});

describe("expandSeatPlan — FW floating vs TMT per-seat (#39)", () => {
  test("TMT → one key per seat, seatIndex 0..n-1, no maxMachines", () => {
    const plan = expandSeatPlan([{ product: "TMT", seats: 3 }]);
    assert.equal(plan.length, 3);
    assert.deepEqual(plan.map((e) => e.seatIndex), [0, 1, 2]);
    assert.ok(plan.every((e) => e.product === "TMT" && e.maxMachines === undefined));
  });

  test("FW → exactly ONE floating key with maxMachines = seats", () => {
    const plan = expandSeatPlan([{ product: "FW", seats: 5 }]);
    assert.equal(plan.length, 1);
    assert.deepEqual(plan[0], { product: "FW", seatIndex: 0, maxMachines: 5 });
  });

  test("Professional: 1 FW key (maxMachines=m) + n TMT keys", () => {
    const plan = expandSeatPlan([
      { product: "TMT", seats: 4 },
      { product: "FW", seats: 2 },
    ]);
    const fw = plan.filter((e) => e.product === "FW");
    const tmt = plan.filter((e) => e.product === "TMT");
    assert.equal(fw.length, 1);
    assert.equal(fw[0].maxMachines, 2);
    assert.equal(tmt.length, 4);
    assert.deepEqual(tmt.map((e) => e.seatIndex), [0, 1, 2, 3]);
  });

  test("seats < 1 are floored to a single key", () => {
    assert.equal(expandSeatPlan([{ product: "TMT", seats: 0 }]).length, 1);
    assert.equal(expandSeatPlan([{ product: "FW", seats: 0 }])[0].maxMachines, 1);
  });
});
