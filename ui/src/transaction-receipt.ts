import { isAddressEqual, parseEventLogs, type Address, type TransactionReceipt } from "viem";

import { erc20Abi, hookAbi, routerAbi } from "./abi.js";

type ReceiptLogs = TransactionReceipt["logs"];

function fromContract(logs: ReceiptLogs, address: Address): ReceiptLogs {
  return logs.filter((log) => isAddressEqual(log.address, address));
}

export function receiptProvesApproval(
  logs: ReceiptLogs,
  weth: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
): boolean {
  const events = parseEventLogs({
    abi: erc20Abi,
    eventName: "Approval",
    logs: fromContract(logs, weth),
    strict: true,
  });
  return events.some(
    (event) =>
      isAddressEqual(event.args.owner, owner) &&
      isAddressEqual(event.args.spender, spender) &&
      event.args.value === amount,
  );
}

export function receiptProvesChallenge(
  logs: ReceiptLogs,
  router: Address,
  player: Address,
  grossWeth: bigint,
): boolean {
  const events = parseEventLogs({
    abi: routerAbi,
    eventName: "OvertimeChallengeExecuted",
    logs: fromContract(logs, router),
    strict: true,
  });
  return events.some(
    (event) => isAddressEqual(event.args.player, player) && event.args.grossWeth === grossWeth,
  );
}

export function receiptProvesFinalization(logs: ReceiptLogs, hook: Address): boolean {
  return (
    parseEventLogs({
      abi: hookAbi,
      eventName: "RoundFinalized",
      logs: fromContract(logs, hook),
      strict: true,
    }).length > 0
  );
}

export function receiptProvesChampionClaim(
  logs: ReceiptLogs,
  hook: Address,
  account: Address,
  roundId: bigint,
): boolean {
  const events = parseEventLogs({
    abi: hookAbi,
    eventName: "ChampionRewardClaimed",
    logs: fromContract(logs, hook),
    strict: true,
  });
  return events.some(
    (event) => event.args.roundId === roundId && isAddressEqual(event.args.champion, account),
  );
}

export function receiptProvesCrownTimeClaim(
  logs: ReceiptLogs,
  hook: Address,
  account: Address,
  roundId: bigint,
): boolean {
  const events = parseEventLogs({
    abi: hookAbi,
    eventName: "CrownTimeRewardClaimed",
    logs: fromContract(logs, hook),
    strict: true,
  });
  return events.some((event) => event.args.roundId === roundId && isAddressEqual(event.args.holder, account));
}

export function receiptProvesRefundClaim(logs: ReceiptLogs, hook: Address, account: Address): boolean {
  const events = parseEventLogs({
    abi: hookAbi,
    eventName: "RefundClaimed",
    logs: fromContract(logs, hook),
    strict: true,
  });
  return events.some((event) => isAddressEqual(event.args.beneficiary, account));
}
