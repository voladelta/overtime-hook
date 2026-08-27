import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  isAddressEqual,
  type Address,
  type EIP1193Provider,
  type Hash,
} from "viem";

import { erc20Abi, hookAbi, routerAbi } from "./abi.js";
import {
  ZERO_ADDRESS,
  shortAddress,
  type ActivityItem,
  type ActiveRound,
  type ClaimableRound,
  type CurrentOutcome,
  type FinalizedRound,
  type GameSnapshot,
  type PlayerStanding,
} from "./game-state.js";

export interface DeploymentManifest {
  chainId: number;
  deploymentBlock: number;
  network: string;
  rpcUrl: string;
  contracts: Record<string, Address> & {
    challengeRouter: Address;
    hook: Address;
    overtimeToken: Address;
    weth: Address;
  };
  pool: { fee: number; tickSpacing: number; initialSqrtPriceX96: string };
}

export interface ChallengeQuote {
  gameFee: bigint;
  crownCost: bigint;
  totalWeth: bigint;
}

export async function loadDeployment(): Promise<DeploymentManifest> {
  const response = await fetch("/deployment.json");
  if (!response.ok) throw new Error("Deployment data is unavailable. Start the Overtime devnet and try again.");
  const deployment = (await response.json()) as DeploymentManifest;
  if (!Number.isSafeInteger(deployment.deploymentBlock) || deployment.deploymentBlock < 0) {
    throw new Error("Deployment data has an invalid deployment block.");
  }
  return deployment;
}

export class OvertimeClient {
  readonly publicClient;

  constructor(readonly deployment: DeploymentManifest) {
    this.publicClient = createPublicClient({ transport: http(deployment.rpcUrl) });
  }

  async assertChain(): Promise<void> {
    const actual = await this.publicClient.getChainId();
    if (actual !== this.deployment.chainId) {
      throw new Error(`RPC is on chain ${actual}, but Overtime is deployed on chain ${this.deployment.chainId}.`);
    }
  }

  async quoteChallenge(grossWeth: bigint): Promise<ChallengeQuote> {
    const [gameFee, crownCost, totalWeth] = await this.publicClient.readContract({
      address: this.deployment.contracts.hook,
      abi: hookAbi,
      functionName: "previewChallenge",
      args: [grossWeth],
    });
    return { gameFee, crownCost, totalWeth };
  }

  async readSnapshot(account?: Address): Promise<GameSnapshot> {
    const viewer = account ?? ZERO_ADDRESS;
    const hook = this.deployment.contracts.hook;
    const block = await this.publicClient.getBlock();
    const blockNumber = block.number;
    const [roundId, round, viewerOutcome] = await Promise.all([
      this.publicClient.readContract({
        address: hook,
        abi: hookAbi,
        functionName: "latestRoundId",
        blockNumber,
      }),
      this.publicClient.readContract({
        address: hook,
        abi: hookAbi,
        functionName: "currentRound",
        blockNumber,
      }),
      this.publicClient.readContract({
        address: hook,
        abi: hookAbi,
        functionName: "previewCurrentOutcome",
        args: [viewer],
        blockNumber,
      }),
    ]);

    const [roundData, outcomeData] = [round as ActiveRound, viewerOutcome as CurrentOutcome];
    const [standings, activity, claims, refundCredit, allowance] = await Promise.all([
      this.readStandings(roundId, roundData, blockNumber),
      this.readActivity(roundId, blockNumber),
      account ? this.readClaims(account, blockNumber) : Promise.resolve([]),
      account
        ? this.publicClient.readContract({
            address: hook,
            abi: hookAbi,
            functionName: "refundCredit",
            args: [account],
            blockNumber,
          })
        : Promise.resolve(0n),
      account
        ? this.publicClient.readContract({
            address: this.deployment.contracts.weth,
            abi: erc20Abi,
            functionName: "allowance",
            args: [account, this.deployment.contracts.challengeRouter],
            blockNumber,
          })
        : Promise.resolve(0n),
    ]);

    return {
      blockTimestamp: block.timestamp,
      roundId,
      round: roundData,
      viewerOutcome: outcomeData,
      standings,
      activity,
      claims,
      refundCredit,
      allowance,
    };
  }

  watchBlocks(onBlock: () => void, onError: (cause: Error) => void): () => void {
    return this.publicClient.watchBlockNumber({
      emitOnBegin: false,
      pollingInterval: 4_000,
      onBlockNumber: onBlock,
      onError,
    });
  }

  async connect(provider: EIP1193Provider): Promise<Address> {
    const wallet = createWalletClient({ transport: custom(provider) });
    const currentChainId = await wallet.getChainId();
    if (currentChainId !== this.deployment.chainId) {
      await wallet.switchChain({ id: this.deployment.chainId });
    }
    const [account] = await wallet.requestAddresses();
    if (!account) throw new Error("No account was returned. Unlock your wallet and try again.");
    return account;
  }

  approve(provider: EIP1193Provider, account: Address, amount: bigint): Promise<Hash> {
    return this.write(provider, account, {
      address: this.deployment.contracts.weth,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.deployment.contracts.challengeRouter, amount],
    });
  }

  async challenge(
    provider: EIP1193Provider,
    account: Address,
    grossWeth: bigint,
    minTokenOut: bigint,
  ): Promise<Hash> {
    const block = await this.publicClient.getBlock();
    return this.write(provider, account, {
      address: this.deployment.contracts.challengeRouter,
      abi: routerAbi,
      functionName: "challenge",
      args: [grossWeth, minTokenOut, block.timestamp + 600n, 4_295_128_740n],
    });
  }

  finalize(provider: EIP1193Provider, account: Address): Promise<Hash> {
    return this.write(provider, account, {
      address: this.deployment.contracts.hook,
      abi: hookAbi,
      functionName: "finalizeExpiredRound",
      args: [],
    });
  }

  claimChampion(provider: EIP1193Provider, account: Address, roundId: bigint): Promise<Hash> {
    return this.write(provider, account, {
      address: this.deployment.contracts.hook,
      abi: hookAbi,
      functionName: "claimChampionReward",
      args: [roundId],
    });
  }

  claimCrownTime(provider: EIP1193Provider, account: Address, roundId: bigint): Promise<Hash> {
    return this.write(provider, account, {
      address: this.deployment.contracts.hook,
      abi: hookAbi,
      functionName: "claimCrownTimeReward",
      args: [roundId],
    });
  }

  claimRefund(provider: EIP1193Provider, account: Address): Promise<Hash> {
    return this.write(provider, account, {
      address: this.deployment.contracts.hook,
      abi: hookAbi,
      functionName: "claimRefund",
      args: [],
    });
  }

  private async readStandings(
    roundId: bigint,
    round: ActiveRound,
    blockNumber: bigint,
  ): Promise<PlayerStanding[]> {
    if (roundId === 0n || round.leader === ZERO_ADDRESS) return [];
    const hook = this.deployment.contracts.hook;
    const fromBlock = BigInt(this.deployment.deploymentBlock);
    const [starts, changes] = await Promise.all([
      this.publicClient.getContractEvents({
        address: hook,
        abi: hookAbi,
        eventName: "RoundStarted",
        args: { roundId },
        fromBlock,
        toBlock: blockNumber,
      }),
      this.publicClient.getContractEvents({
        address: hook,
        abi: hookAbi,
        eventName: "CrownChanged",
        args: { roundId },
        fromBlock,
        toBlock: blockNumber,
      }),
    ]);
    const players = new Set<Address>();
    for (const event of starts) if (event.args.leader) players.add(event.args.leader);
    for (const event of changes) {
      if (event.args.previousLeader) players.add(event.args.previousLeader);
      if (event.args.newLeader) players.add(event.args.newLeader);
    }
    players.add(round.leader);

    const standings = await Promise.all(
      [...players].map(async (address): Promise<PlayerStanding> => {
        const outcome = (await this.publicClient.readContract({
          address: hook,
          abi: hookAbi,
          functionName: "previewCurrentOutcome",
          args: [address],
          blockNumber,
        })) as CurrentOutcome;
        return {
          address,
          crownSeconds: outcome.playerCrownSeconds,
          projectedReward: outcome.championReward + outcome.crownTimeReward,
          isLeader: isAddressEqual(address, round.leader),
        };
      }),
    );
    return standings.sort((left, right) => {
      if (left.crownSeconds === right.crownSeconds) return left.address.localeCompare(right.address);
      return left.crownSeconds > right.crownSeconds ? -1 : 1;
    });
  }

  private async readClaims(account: Address, blockNumber: bigint): Promise<ClaimableRound[]> {
    const hook = this.deployment.contracts.hook;
    const fromBlock = BigInt(this.deployment.deploymentBlock);
    const [starts, changes] = await Promise.all([
      this.publicClient.getContractEvents({
        address: hook,
        abi: hookAbi,
        eventName: "RoundStarted",
        args: { leader: account },
        fromBlock,
        toBlock: blockNumber,
      }),
      this.publicClient.getContractEvents({
        address: hook,
        abi: hookAbi,
        eventName: "CrownChanged",
        args: { newLeader: account },
        fromBlock,
        toBlock: blockNumber,
      }),
    ]);
    const roundIds = [
      ...new Set(
        [...starts, ...changes]
          .map((event) => event.args.roundId)
          .filter((roundId): roundId is bigint => roundId !== undefined),
      ),
    ].sort((left, right) => (left > right ? -1 : left < right ? 1 : 0));
    const claims = await Promise.all(
      roundIds.map(async (roundId): Promise<ClaimableRound | undefined> => {
        const [round, seconds, championClaimed, crownTimeClaimed] = await Promise.all([
          this.publicClient.readContract({
            address: hook,
            abi: hookAbi,
            functionName: "finalizedRounds",
            args: [roundId],
            blockNumber,
          }),
          this.publicClient.readContract({
            address: hook,
            abi: hookAbi,
            functionName: "crownSeconds",
            args: [roundId, account],
            blockNumber,
          }),
          this.publicClient.readContract({
            address: hook,
            abi: hookAbi,
            functionName: "championClaimed",
            args: [roundId],
            blockNumber,
          }),
          this.publicClient.readContract({
            address: hook,
            abi: hookAbi,
            functionName: "crownTimeClaimed",
            args: [roundId, account],
            blockNumber,
          }),
        ]);
        const finalized = round as FinalizedRound;
        if (!finalized.finalized) return undefined;
        const championReward =
          isAddressEqual(finalized.champion, account) && !championClaimed ? finalized.championPool : 0n;
        const crownTimeReward =
          !crownTimeClaimed && finalized.totalCrownSeconds > 0n
            ? (finalized.crownTimePool * seconds) / finalized.totalCrownSeconds
            : 0n;
        if (championReward === 0n && crownTimeReward === 0n) return undefined;
        return { roundId, decision: finalized.decision, championReward, crownTimeReward };
      }),
    );
    return claims.filter((claim): claim is ClaimableRound => claim !== undefined);
  }

  private async readActivity(roundId: bigint, blockNumber: bigint): Promise<ActivityItem[]> {
    if (roundId === 0n) return [];
    const hook = this.deployment.contracts.hook;
    const shared = {
      address: hook,
      abi: hookAbi,
      args: { roundId },
      fromBlock: BigInt(this.deployment.deploymentBlock),
      toBlock: blockNumber,
    };
    const [starts, changes, finalizations, championClaims, timeClaims, refunds] = await Promise.all([
      this.publicClient.getContractEvents({ ...shared, eventName: "RoundStarted" }),
      this.publicClient.getContractEvents({ ...shared, eventName: "CrownChanged" }),
      this.publicClient.getContractEvents({ ...shared, eventName: "RoundFinalized" }),
      this.publicClient.getContractEvents({ ...shared, eventName: "ChampionRewardClaimed" }),
      this.publicClient.getContractEvents({ ...shared, eventName: "CrownTimeRewardClaimed" }),
      this.publicClient.getContractEvents({ ...shared, eventName: "SameBlockRefundCredited" }),
    ]);
    const items: ActivityItem[] = [];
    for (const event of starts) {
      const leader = event.args.leader ?? ZERO_ADDRESS;
      items.push(this.activity(event, "start", `${shortAddress(leader)} started the round`, `${formatEther(event.args.crownCost ?? 0n)} WETH crown`));
    }
    for (const event of changes) {
      const next = event.args.newLeader ?? ZERO_ADDRESS;
      const previous = event.args.previousLeader ?? ZERO_ADDRESS;
      items.push(this.activity(event, "crown", `${shortAddress(next)} took the crown`, `From ${shortAddress(previous)} · ${formatEther(event.args.crownCost ?? 0n)} WETH`));
    }
    for (const event of finalizations) {
      items.push(this.activity(event, "finalized", event.args.decision ? "Round ended by Decision" : `${shortAddress(event.args.champion ?? ZERO_ADDRESS)} won the Knockout`, `${formatEther(event.args.championPool ?? 0n)} WETH champion pool`));
    }
    for (const event of championClaims) {
      items.push(this.activity(event, "champion-claim", `${shortAddress(event.args.champion ?? ZERO_ADDRESS)} claimed the champion reward`, `${formatEther(event.args.amount ?? 0n)} WETH`));
    }
    for (const event of timeClaims) {
      items.push(this.activity(event, "time-claim", `${shortAddress(event.args.holder ?? ZERO_ADDRESS)} claimed crown-time`, `${formatEther(event.args.amount ?? 0n)} WETH`));
    }
    for (const event of refunds) {
      items.push(this.activity(event, "refund", `${shortAddress(event.args.beneficiary ?? ZERO_ADDRESS)} received a refund credit`, `${formatEther(event.args.amount ?? 0n)} WETH`));
    }
    items.sort((left, right) => (left.blockNumber === right.blockNumber ? right.key.localeCompare(left.key) : left.blockNumber > right.blockNumber ? -1 : 1));
    const recent = items.slice(0, 12);
    const blockNumbers = [...new Set(recent.map((item) => item.blockNumber))];
    const timestamps = new Map<bigint, bigint>();
    await Promise.all(blockNumbers.map(async (blockNumber) => timestamps.set(blockNumber, (await this.publicClient.getBlock({ blockNumber })).timestamp)));
    return recent.map((item) => ({ ...item, timestamp: timestamps.get(item.blockNumber) }));
  }

  private activity(
    event: { blockNumber: bigint; logIndex: number; transactionHash: Hash },
    kind: ActivityItem["kind"],
    title: string,
    detail: string,
  ): ActivityItem {
    return {
      key: `${event.transactionHash}-${event.logIndex}`,
      kind,
      title,
      detail,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
    };
  }

  private async write(
    provider: EIP1193Provider,
    account: Address,
    request: Parameters<typeof this.publicClient.simulateContract>[0],
  ): Promise<Hash> {
    await this.assertWallet(provider, account);
    const simulation = await this.publicClient.simulateContract({ ...request, account });
    const wallet = createWalletClient({ account, transport: custom(provider) });
    const hash = await wallet.writeContract(simulation.request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction was mined but reverted.");
    return hash;
  }

  private async assertWallet(provider: EIP1193Provider, account: Address): Promise<void> {
    const [chainIdValue, accountsValue] = await Promise.all([
      provider.request({ method: "eth_chainId" }),
      provider.request({ method: "eth_accounts" }),
    ]);
    const chainId = Number.parseInt(String(chainIdValue), 16);
    if (chainId !== this.deployment.chainId) {
      throw new Error(`Switch your wallet to chain ${this.deployment.chainId} and try again.`);
    }
    const accounts = Array.isArray(accountsValue) ? accountsValue.map(String) : [];
    if (!accounts.some((candidate) => candidate.toLowerCase() === account.toLowerCase())) {
      throw new Error("The connected wallet account changed. Connect it again and retry the action.");
    }
  }
}
