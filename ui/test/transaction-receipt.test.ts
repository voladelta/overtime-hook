import { describe, expect, test } from "bun:test";

import { encodeAbiParameters, encodeEventTopics, type Address, type Hash, type Hex, type Log } from "viem";

import { erc20Abi, hookAbi, routerAbi } from "../src/abi.js";
import {
  receiptProvesApproval,
  receiptProvesChallenge,
  receiptProvesChampionClaim,
  receiptProvesCrownTimeClaim,
  receiptProvesFinalization,
  receiptProvesRefundClaim,
} from "../src/transaction-receipt.js";

const account = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const router = "0x3333333333333333333333333333333333333333" as Address;
const hook = "0x4444444444444444444444444444444444444444" as Address;
const weth = "0x5555555555555555555555555555555555555555" as Address;
const transactionHash = `0x${"a".repeat(64)}` as Hash;
const blockHash = `0x${"b".repeat(64)}` as Hash;

function receiptLog(address: Address, topics: Log["topics"], data: Hex): Log {
  return {
    address,
    blockHash,
    blockNumber: 10n,
    data,
    logIndex: 0,
    removed: false,
    topics,
    transactionHash,
    transactionIndex: 0,
  };
}

function challengeLog(): Log {
  return receiptLog(
    router,
    encodeEventTopics({
      abi: routerAbi,
      eventName: "OvertimeChallengeExecuted",
      args: { player: account },
    }),
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [10n, 2n, 50n, 1_000n],
    ),
  );
}

function finalizationLog(): Log {
  return receiptLog(
    hook,
    encodeEventTopics({
      abi: hookAbi,
      eventName: "RoundFinalized",
      args: { roundId: 7n, decision: false, champion: account },
    }),
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [70n, 20n, 10n, 900n],
    ),
  );
}

describe("immutable challenge receipt proof", () => {
  test("accepts the submitted router event without consulting current leader or activity", () => {
    expect(receiptProvesChallenge([challengeLog()], router, account, 10n)).toBe(true);
  });

  test("rejects the wrong contract, player, and gross amount", () => {
    const logs = [challengeLog()];
    expect(receiptProvesChallenge(logs, other, account, 10n)).toBe(false);
    expect(receiptProvesChallenge(logs, router, other, 10n)).toBe(false);
    expect(receiptProvesChallenge(logs, router, account, 11n)).toBe(false);
  });
});

describe("immutable action receipt proofs", () => {
  test("proves finalization from its hook event even after a new round can start", () => {
    expect(receiptProvesFinalization([finalizationLog()], hook)).toBe(true);
    expect(receiptProvesFinalization([finalizationLog()], other)).toBe(false);
  });

  test("matches exact approval owner, spender, and cap", () => {
    const log = receiptLog(
      weth,
      encodeEventTopics({ abi: erc20Abi, eventName: "Approval", args: { owner: account, spender: router } }),
      encodeAbiParameters([{ type: "uint256" }], [12n]),
    );
    expect(receiptProvesApproval([log], weth, account, router, 12n)).toBe(true);
    expect(receiptProvesApproval([log], weth, account, router, 13n)).toBe(false);
  });

  test("matches each claim to the caller and round", () => {
    const champion = receiptLog(
      hook,
      encodeEventTopics({
        abi: hookAbi,
        eventName: "ChampionRewardClaimed",
        args: { roundId: 7n, champion: account },
      }),
      encodeAbiParameters([{ type: "uint256" }], [70n]),
    );
    const crownTime = receiptLog(
      hook,
      encodeEventTopics({
        abi: hookAbi,
        eventName: "CrownTimeRewardClaimed",
        args: { roundId: 7n, holder: account },
      }),
      encodeAbiParameters([{ type: "uint256" }], [20n]),
    );
    const refund = receiptLog(
      hook,
      encodeEventTopics({
        abi: hookAbi,
        eventName: "RefundClaimed",
        args: { beneficiary: account },
      }),
      encodeAbiParameters([{ type: "uint256" }], [5n]),
    );

    expect(receiptProvesChampionClaim([champion], hook, account, 7n)).toBe(true);
    expect(receiptProvesChampionClaim([champion], hook, account, 8n)).toBe(false);
    expect(receiptProvesCrownTimeClaim([crownTime], hook, account, 7n)).toBe(true);
    expect(receiptProvesCrownTimeClaim([crownTime], hook, other, 7n)).toBe(false);
    expect(receiptProvesRefundClaim([refund], hook, account)).toBe(true);
    expect(receiptProvesRefundClaim([refund], hook, other)).toBe(false);
  });
});
