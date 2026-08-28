import { describe, expect, test } from "bun:test";

import { parseEther } from "viem";

import { MINIMUM_CHALLENGE, parseChallengeValues } from "../src/challenge.js";

describe("parseChallengeValues", () => {
  test("accepts the minimum challenge and a zero token floor", () => {
    expect(parseChallengeValues("0.01", "")).toEqual({
      errors: {},
      values: {
        grossWeth: MINIMUM_CHALLENGE,
        minimumOvertime: 0n,
      },
    });
  });

  test("parses both token amounts with 18 decimals", () => {
    expect(parseChallengeValues("1.25", "42.5")).toEqual({
      errors: {},
      values: {
        grossWeth: parseEther("1.25"),
        minimumOvertime: parseEther("42.5"),
      },
    });
  });

  test("reports both invalid fields in one result", () => {
    expect(parseChallengeValues("nope", "-1")).toEqual({
      errors: {
        grossWeth: "Enter a valid WETH amount.",
        minimumOvertime: "Enter zero or a positive OVERTIME amount.",
      },
    });
  });

  test("rejects a challenge below the contract minimum", () => {
    expect(parseChallengeValues("0.009", "0")).toEqual({
      errors: { grossWeth: "Enter at least 0.01 WETH." },
    });
  });
});
