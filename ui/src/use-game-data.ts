import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { useWatchBlockNumber } from "wagmi";

import type { OvertimeClient } from "./contracts.js";

const snapshotKey = ["overtime", "snapshot"] as const;
const quoteKey = ["overtime", "quote"] as const;

interface GameQueryInvalidator {
  invalidateQueries(filters: { queryKey: readonly string[] }): Promise<unknown>;
}

export function invalidateGameQueries(queryClient: GameQueryInvalidator): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: snapshotKey }),
    queryClient.invalidateQueries({ queryKey: quoteKey }),
  ]);
}

export function useGameData(
  client: OvertimeClient,
  chainId: number,
  account: Address | undefined,
  grossWeth: bigint | undefined,
) {
  const queryClient = useQueryClient();
  const [watchError, setWatchError] = useState<Error | undefined>();
  const snapshotQuery = useQuery({
    queryKey: [...snapshotKey, account ?? "guest"],
    queryFn: () => client.readSnapshot(account),
    refetchInterval: 12_000,
    retry: 1,
  });

  const quoteQuery = useQuery({
    queryKey: [...quoteKey, grossWeth?.toString() ?? "invalid"],
    queryFn: () => {
      if (grossWeth === undefined) throw new Error("Challenge amount is unavailable.");
      return client.quoteChallenge(grossWeth);
    },
    enabled: grossWeth !== undefined,
    retry: 1,
    staleTime: 5_000,
  });

  useWatchBlockNumber({
    chainId,
    emitMissed: true,
    emitOnBegin: true,
    onBlockNumber() {
      setWatchError(undefined);
      void invalidateGameQueries(queryClient);
    },
    onError(cause) {
      setWatchError(cause);
    },
  });

  return { quoteQuery, snapshotQuery, watchError };
}
