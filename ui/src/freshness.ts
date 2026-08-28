export type DataFreshness = "syncing" | "live" | "polling" | "stale" | "offline";

export interface FreshnessInput {
  hasSnapshot: boolean;
  hasError: boolean;
  hasWatchError: boolean;
  updatedAt: number;
  nowSeconds: number;
}

export function deriveFreshness({
  hasSnapshot,
  hasError,
  hasWatchError,
  updatedAt,
  nowSeconds,
}: FreshnessInput): DataFreshness {
  if (!hasSnapshot) return hasError ? "offline" : "syncing";
  const ageSeconds = Math.max(0, nowSeconds - Math.floor(updatedAt / 1_000));
  if (ageSeconds > 25) return hasError ? "offline" : "stale";
  if (hasError || hasWatchError) return "polling";
  return "live";
}

export function interpolateChainTime(blockTimestamp: bigint, updatedAt: number, nowSeconds: number): bigint {
  const elapsedSeconds = Math.max(0, nowSeconds - Math.floor(updatedAt / 1_000));
  return blockTimestamp + BigInt(elapsedSeconds);
}
