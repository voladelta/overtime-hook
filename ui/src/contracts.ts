import {
  createPublicClient,
  http,
  isAddressEqual,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Transport,
  type WalletClient,
} from "viem";

import { erc20Abi, hookAbi, routerAbi } from "./abi.js";
import { formatWeth } from "./format.js";
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
import {
  receiptProvesApproval,
  receiptProvesChallenge,
  receiptProvesChampionClaim,
  receiptProvesCrownTimeClaim,
  receiptProvesFinalization,
  receiptProvesRefundClaim,
} from "./transaction-receipt.js";
import { ResolvedTransactionFailure } from "./transaction-state.js";
import { isCurrentWalletAccount } from "./wallet-state.js";

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

export type SubmittedTransactionStatus = "pending" | "success" | "reverted" | "not-found";

export type ConnectedWalletClient = WalletClient<Transport, Chain, Account>;
type SubmissionCallback = (hash: Hash) => void;

export async function loadDeployment(): Promise<DeploymentManifest> {
  const response = await fetch("/deployment.json");
  if (!response.ok)
    throw new Error("Deployment data is unavailable. Start the Overtime devnet and try again.");
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
      throw new Error(
        `RPC is on chain ${actual}, but Overtime is deployed on chain ${this.deployment.chainId}.`,
      );
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

  approve(
    wallet: ConnectedWalletClient,
    account: Address,
    amount: bigint,
    onSubmitted?: SubmissionCallback,
  ): Promise<Hash> {
    return this.write(
      wallet,
      account,
      {
        address: this.deployment.contracts.weth,
        abi: erc20Abi,
        functionName: "approve",
        args: [this.deployment.contracts.challengeRouter, amount],
      },
      onSubmitted,
    );
  }

  async challenge(
    wallet: ConnectedWalletClient,
    account: Address,
    grossWeth: bigint,
    minTokenOut: bigint,
    onSubmitted?: SubmissionCallback,
  ): Promise<Hash> {
    const block = await this.publicClient.getBlock();
    return this.write(
      wallet,
      account,
      {
        address: this.deployment.contracts.challengeRouter,
        abi: routerAbi,
        functionName: "challenge",
        args: [grossWeth, minTokenOut, block.timestamp + 600n, 4_295_128_740n],
      },
      onSubmitted,
    );
  }

  finalize(wallet: ConnectedWalletClient, account: Address, onSubmitted?: SubmissionCallback): Promise<Hash> {
    return this.write(
      wallet,
      account,
      {
        address: this.deployment.contracts.hook,
        abi: hookAbi,
        functionName: "finalizeExpiredRound",
        args: [],
      },
      onSubmitted,
    );
  }

  claimChampion(
    wallet: ConnectedWalletClient,
    account: Address,
    roundId: bigint,
    onSubmitted?: SubmissionCallback,
  ): Promise<Hash> {
    return this.write(
      wallet,
      account,
      {
        address: this.deployment.contracts.hook,
        abi: hookAbi,
        functionName: "claimChampionReward",
        args: [roundId],
      },
      onSubmitted,
    );
  }

  claimCrownTime(
    wallet: ConnectedWalletClient,
    account: Address,
    roundId: bigint,
    onSubmitted?: SubmissionCallback,
  ): Promise<Hash> {
    return this.write(
      wallet,
      account,
      {
        address: this.deployment.contracts.hook,
        abi: hookAbi,
        functionName: "claimCrownTimeReward",
        args: [roundId],
      },
      onSubmitted,
    );
  }

  claimRefund(
    wallet: ConnectedWalletClient,
    account: Address,
    onSubmitted?: SubmissionCallback,
  ): Promise<Hash> {
    return this.write(
      wallet,
      account,
      {
        address: this.deployment.contracts.hook,
        abi: hookAbi,
        functionName: "claimRefund",
        args: [],
      },
      onSubmitted,
    );
  }

  async transactionStatus(hash: Hash): Promise<SubmittedTransactionStatus> {
    await this.assertChain();
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash });
      return receipt.status === "success" ? "success" : "reverted";
    } catch (cause) {
      if (!(cause instanceof TransactionReceiptNotFoundError)) throw cause;
    }

    try {
      await this.publicClient.getTransaction({ hash });
      return "pending";
    } catch (cause) {
      if (cause instanceof TransactionNotFoundError) return "not-found";
      throw cause;
    }
  }

  async verifyApproval(hash: Hash, account: Address, amount: bigint): Promise<boolean> {
    const receipt = await this.successfulReceipt(hash);
    return receiptProvesApproval(
      receipt.logs,
      this.deployment.contracts.weth,
      account,
      this.deployment.contracts.challengeRouter,
      amount,
    );
  }

  async verifyChallenge(hash: Hash, account: Address, grossWeth: bigint): Promise<boolean> {
    const receipt = await this.successfulReceipt(hash);
    return receiptProvesChallenge(
      receipt.logs,
      this.deployment.contracts.challengeRouter,
      account,
      grossWeth,
    );
  }

  async verifyFinalization(hash: Hash): Promise<boolean> {
    const receipt = await this.successfulReceipt(hash);
    return receiptProvesFinalization(receipt.logs, this.deployment.contracts.hook);
  }

  async verifyChampionClaim(hash: Hash, account: Address, roundId: bigint): Promise<boolean> {
    const receipt = await this.successfulReceipt(hash);
    return receiptProvesChampionClaim(receipt.logs, this.deployment.contracts.hook, account, roundId);
  }

  async verifyCrownTimeClaim(hash: Hash, account: Address, roundId: bigint): Promise<boolean> {
    const receipt = await this.successfulReceipt(hash);
    return receiptProvesCrownTimeClaim(receipt.logs, this.deployment.contracts.hook, account, roundId);
  }

  async verifyRefundClaim(hash: Hash, account: Address): Promise<boolean> {
    const receipt = await this.successfulReceipt(hash);
    return receiptProvesRefundClaim(receipt.logs, this.deployment.contracts.hook, account);
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
      items.push(
        this.activity(
          event,
          "start",
          `${shortAddress(leader)} started the round`,
          `${formatWeth(event.args.crownCost ?? 0n, 6)} crown`,
        ),
      );
    }
    for (const event of changes) {
      const next = event.args.newLeader ?? ZERO_ADDRESS;
      const previous = event.args.previousLeader ?? ZERO_ADDRESS;
      items.push(
        this.activity(
          event,
          "crown",
          `${shortAddress(next)} took the crown`,
          `From ${shortAddress(previous)} · ${formatWeth(event.args.crownCost ?? 0n, 6)}`,
        ),
      );
    }
    for (const event of finalizations) {
      items.push(
        this.activity(
          event,
          "finalized",
          event.args.decision
            ? "Round ended by Decision"
            : `${shortAddress(event.args.champion ?? ZERO_ADDRESS)} won the Knockout`,
          `${formatWeth(event.args.championPool ?? 0n, 6)} champion pool`,
        ),
      );
    }
    for (const event of championClaims) {
      items.push(
        this.activity(
          event,
          "champion-claim",
          `${shortAddress(event.args.champion ?? ZERO_ADDRESS)} claimed the champion reward`,
          formatWeth(event.args.amount ?? 0n, 6),
        ),
      );
    }
    for (const event of timeClaims) {
      items.push(
        this.activity(
          event,
          "time-claim",
          `${shortAddress(event.args.holder ?? ZERO_ADDRESS)} claimed crown-time`,
          formatWeth(event.args.amount ?? 0n, 6),
        ),
      );
    }
    for (const event of refunds) {
      items.push(
        this.activity(
          event,
          "refund",
          `${shortAddress(event.args.beneficiary ?? ZERO_ADDRESS)} received a refund credit`,
          formatWeth(event.args.amount ?? 0n, 6),
        ),
      );
    }
    items.sort((left, right) =>
      left.blockNumber === right.blockNumber
        ? right.key.localeCompare(left.key)
        : left.blockNumber > right.blockNumber
          ? -1
          : 1,
    );
    const recent = items.slice(0, 12);
    const blockNumbers = [...new Set(recent.map((item) => item.blockNumber))];
    const timestamps = new Map<bigint, bigint>();
    await Promise.all(
      blockNumbers.map(async (eventBlockNumber) =>
        timestamps.set(
          eventBlockNumber,
          (await this.publicClient.getBlock({ blockNumber: eventBlockNumber })).timestamp,
        ),
      ),
    );
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
    wallet: ConnectedWalletClient,
    account: Address,
    request: Parameters<typeof this.publicClient.simulateContract>[0],
    onSubmitted?: SubmissionCallback,
  ): Promise<Hash> {
    await this.assertWallet(wallet, account);
    const simulation = await this.publicClient.simulateContract({ ...request, account });
    const hash = await wallet.writeContract(simulation.request);
    onSubmitted?.(hash);
    let replacementFailure: "cancelled" | "replaced" | undefined;
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
      timeout: 120_000,
      onReplaced(replacement) {
        onSubmitted?.(replacement.transaction.hash);
        if (replacement.reason !== "repriced") replacementFailure = replacement.reason;
      },
    });
    if (replacementFailure) {
      throw new ResolvedTransactionFailure(
        replacementFailure === "cancelled"
          ? "The transaction was cancelled in the wallet."
          : "The transaction was replaced by a different wallet action.",
      );
    }
    if (receipt.status !== "success") {
      throw new ResolvedTransactionFailure("The transaction was mined but reverted.");
    }
    return receipt.transactionHash;
  }

  private async successfulReceipt(hash: Hash) {
    await this.assertChain();
    const receipt = await this.publicClient.getTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction reverted.");
    return receipt;
  }

  private async assertWallet(wallet: ConnectedWalletClient, account: Address): Promise<void> {
    await this.assertChain();
    const [walletChainId, walletAddresses] = await Promise.all([wallet.getChainId(), wallet.getAddresses()]);
    if (wallet.chain.id !== this.deployment.chainId || walletChainId !== this.deployment.chainId) {
      throw new Error(`Switch your wallet to chain ${this.deployment.chainId} and try again.`);
    }
    if (!isCurrentWalletAccount(wallet.account.address, walletAddresses, account)) {
      throw new Error("The connected wallet account changed. Connect it again and retry the action.");
    }
  }
}
