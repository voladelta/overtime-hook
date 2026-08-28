import { describe, expect, test } from "bun:test";

import { deriveFreshness, interpolateChainTime } from "../src/freshness.js";

describe("deriveFreshness", () => {
  const current = 1_000;

  test("does not report Live before the first authoritative snapshot", () => {
    expect(
      deriveFreshness({
        hasSnapshot: false,
        hasError: false,
        hasWatchError: false,
        updatedAt: 0,
        nowSeconds: current,
      }),
    ).toBe("syncing");
  });

  test("distinguishes block-watch fallback from stale data", () => {
    expect(
      deriveFreshness({
        hasSnapshot: true,
        hasError: false,
        hasWatchError: true,
        updatedAt: (current - 5) * 1_000,
        nowSeconds: current,
      }),
    ).toBe("polling");
    expect(
      deriveFreshness({
        hasSnapshot: true,
        hasError: false,
        hasWatchError: false,
        updatedAt: (current - 26) * 1_000,
        nowSeconds: current,
      }),
    ).toBe("stale");
  });

  test("reports an unavailable first read and a failed stale fallback as offline", () => {
    expect(
      deriveFreshness({
        hasSnapshot: false,
        hasError: true,
        hasWatchError: true,
        updatedAt: 0,
        nowSeconds: current,
      }),
    ).toBe("offline");
    expect(
      deriveFreshness({
        hasSnapshot: true,
        hasError: true,
        hasWatchError: true,
        updatedAt: (current - 30) * 1_000,
        nowSeconds: current,
      }),
    ).toBe("offline");
  });
});

test("chain time advances from the last observed block without moving backwards", () => {
  expect(interpolateChainTime(500n, 995_000, 1_000)).toBe(505n);
  expect(interpolateChainTime(500n, 1_005_000, 1_000)).toBe(500n);
});
