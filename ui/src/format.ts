import { formatEther, type BaseError } from "viem";

export function formatWeth(value: bigint, fractionDigits = 4): string {
  if (value === 0n) return "0 WETH";
  const [whole, fraction = ""] = formatEther(value).split(".");
  const visibleFraction = fraction.slice(0, fractionDigits).replace(/0+$/, "");
  if (whole === "0" && !visibleFraction) {
    return `<0.${"0".repeat(Math.max(0, fractionDigits - 1))}1 WETH`;
  }
  return `${visibleFraction ? `${whole}.${visibleFraction}` : whole} WETH`;
}

export function describeError(cause: unknown): string {
  if (cause && typeof cause === "object" && "shortMessage" in cause) {
    const shortMessage = (cause as BaseError).shortMessage;
    if (typeof shortMessage === "string") return shortMessage;
  }
  return cause instanceof Error ? cause.message : String(cause);
}
