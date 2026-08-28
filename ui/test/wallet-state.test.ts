import { expect, test } from "bun:test";

import type { Address } from "viem";

import { isCurrentWalletAccount } from "../src/wallet-state.js";

const accountA = "0x1111111111111111111111111111111111111111" as Address;
const accountB = "0x2222222222222222222222222222222222222222" as Address;

test("rejects a stale cached account when the wallet live order changed", () => {
  expect(isCurrentWalletAccount(accountA, [accountB, accountA], accountA)).toBe(false);
  expect(isCurrentWalletAccount(accountA, [accountA, accountB], accountA)).toBe(true);
  expect(isCurrentWalletAccount(accountB, [accountA, accountB], accountA)).toBe(false);
});
