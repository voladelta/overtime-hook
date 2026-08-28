import { isAddressEqual, type Address } from "viem";

export function isCurrentWalletAccount(
  walletAccount: Address,
  liveAccounts: readonly Address[],
  expectedAccount: Address,
): boolean {
  return (
    isAddressEqual(walletAccount, expectedAccount) &&
    liveAccounts[0] !== undefined &&
    isAddressEqual(liveAccounts[0], expectedAccount)
  );
}
