import { formatEther, type Address } from "viem";

import type { ChallengeQuote, DeploymentManifest } from "./contracts.js";
import {
  ZERO_ADDRESS,
  addressHue,
  formatDuration,
  projectedViewerReward,
  remainingSeconds,
  roundLabel,
  roundPhase,
  shortAddress,
  type GameSnapshot,
} from "./game-state.js";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required interface element: ${id}`);
  return found as T;
}

function setText(id: string, value: string): void {
  element(id).textContent = value;
}

export function formatWeth(value: bigint, fractionDigits = 4): string {
  if (value === 0n) return "0 WETH";
  const [whole, fraction = ""] = formatEther(value).split(".");
  const visibleFraction = fraction.slice(0, fractionDigits).replace(/0+$/, "");
  if (whole === "0" && !visibleFraction) return `<0.${"0".repeat(Math.max(0, fractionDigits - 1))}1 WETH`;
  return `${visibleFraction ? `${whole}.${visibleFraction}` : whole} WETH`;
}

export function renderDeployment(deployment: DeploymentManifest): void {
  setText("network-pill", deployment.network);
  setText("network", `${deployment.network} · chain ${deployment.chainId} · deployment block ${deployment.deploymentBlock}`);
  const list = element<HTMLDListElement>("contracts");
  list.replaceChildren(
    ...Object.entries(deployment.contracts).flatMap(([name, address]) => {
      const term = document.createElement("dt");
      term.textContent = name;
      const value = document.createElement("dd");
      const isolated = document.createElement("bdi");
      isolated.textContent = address;
      value.append(isolated);
      return [term, value];
    }),
  );
}

export function renderQuote(quote?: ChallengeQuote): void {
  setText("game-fee", quote ? formatWeth(quote.gameFee, 6) : "—");
  setText("crown-cost", quote ? formatWeth(quote.crownCost, 6) : "—");
  setText("total-weth", quote ? formatWeth(quote.totalWeth, 6) : "—");
}

export function renderSnapshot(snapshot: GameSnapshot, account?: Address): void {
  const phase = roundPhase(snapshot.round, snapshot.blockTimestamp);
  const active = snapshot.round.leader !== ZERO_ADDRESS;
  const arena = element<HTMLElement>("arena");
  arena.dataset.phase = phase;
  setText("round-id", snapshot.roundId === 0n ? "—" : snapshot.roundId.toString());
  setText("round-state", roundLabel(phase));
  setText("leader", active ? shortAddress(snapshot.round.leader) : "No leader");
  setText("pot", formatWeth(snapshot.round.activePot));
  setText("champion-pool", active ? formatWeth(snapshot.viewerOutcome.championPool) : "—");
  setText("crown-time-pool", active ? formatWeth(snapshot.viewerOutcome.crownTimePool) : "—");

  const leaderDot = element<HTMLElement>("leader-dot");
  leaderDot.style.setProperty("--player-hue", active ? addressHue(snapshot.round.leader).toString() : "330");
  leaderDot.classList.toggle("is-empty", !active);
  setText(
    "leader-tenure",
    active
      ? `Holding for ${formatDuration(snapshot.blockTimestamp > snapshot.round.leaderSince ? snapshot.blockTimestamp - snapshot.round.leaderSince : 0n)}`
      : "The first challenge starts the clock.",
  );

  const finalize = element<HTMLButtonElement>("finalize");
  finalize.hidden = phase !== "expired";
  if (!active) {
    setText("outcome-title", "Waiting for the first challenge.");
    setText("outcome-copy", "A challenge starts a 15-minute Knockout.");
  } else if (phase === "expired") {
    setText("outcome-title", "The crown window has closed.");
    setText("outcome-copy", "Finalize the round to make rewards claimable.");
  } else if (snapshot.viewerOutcome.decision) {
    setText("outcome-title", "This round will end by Decision.");
    setText("outcome-copy", "Crown-time holders split 90%. There is no champion reward.");
  } else {
    setText("outcome-title", `${shortAddress(snapshot.round.leader)} wins if nobody challenges.`);
    setText("outcome-copy", `${formatWeth(snapshot.viewerOutcome.championPool)} champion reward plus crown-time.`);
  }

  renderPlayer(snapshot, account);
  renderStandings(snapshot);
  renderActivity(snapshot);
}

export function renderCountdowns(snapshot: GameSnapshot, now: bigint): void {
  const active = snapshot.round.leader !== ZERO_ADDRESS;
  setText("soft-countdown", active ? formatDuration(remainingSeconds(snapshot.round.softEnd, now)) : "--:--");
  setText("hard-countdown", active ? formatDuration(remainingSeconds(snapshot.round.hardEnd, now)) : "--:--");
  const phase = roundPhase(snapshot.round, now);
  element<HTMLElement>("arena").dataset.phase = phase;
  setText("round-state", roundLabel(phase));
  setText(
    "leader-tenure",
    active
      ? `Holding for ${formatDuration(now > snapshot.round.leaderSince ? now - snapshot.round.leaderSince : 0n)}`
      : "The first challenge starts the clock.",
  );
  element<HTMLButtonElement>("finalize").hidden = phase !== "expired";
  if (phase === "expired") {
    setText("outcome-title", "The crown window has closed.");
    setText("outcome-copy", "Finalize the round to make rewards claimable.");
  }
}

function renderPlayer(snapshot: GameSnapshot, account?: Address): void {
  const empty = element<HTMLElement>("player-empty");
  const data = element<HTMLElement>("player-data");
  empty.hidden = Boolean(account);
  data.hidden = !account;
  if (account) {
    setText("player-reward", formatWeth(projectedViewerReward(snapshot.viewerOutcome)));
    setText("player-time", formatDuration(snapshot.viewerOutcome.playerCrownSeconds));
    setText("player-champion-reward", formatWeth(snapshot.viewerOutcome.championReward));
    setText("player-time-reward", formatWeth(snapshot.viewerOutcome.crownTimeReward));
  }

  const claimList = element<HTMLElement>("claim-list");
  const claimCount = snapshot.claims.reduce(
    (count, claim) => count + Number(claim.championReward > 0n) + Number(claim.crownTimeReward > 0n),
    Number(snapshot.refundCredit > 0n),
  );
  setText("claim-count", claimCount.toString());
  if (!account) {
    claimList.replaceChildren(emptyParagraph("Connect a wallet to check rewards."));
    return;
  }
  const rows: HTMLElement[] = [];
  for (const claim of snapshot.claims) {
    if (claim.championReward > 0n) {
      rows.push(claimRow(`Round ${claim.roundId} champion`, formatWeth(claim.championReward), "champion", claim.roundId));
    }
    if (claim.crownTimeReward > 0n) {
      rows.push(claimRow(`Round ${claim.roundId} crown-time`, formatWeth(claim.crownTimeReward), "crown-time", claim.roundId));
    }
  }
  if (snapshot.refundCredit > 0n) {
    rows.push(claimRow("Same-block refund", formatWeth(snapshot.refundCredit), "refund"));
  }
  claimList.replaceChildren(...(rows.length ? rows : [emptyParagraph("No claimable rewards.")]));
}

function claimRow(label: string, amount: string, action: string, roundId?: bigint): HTMLElement {
  const row = document.createElement("div");
  row.className = "claim-row";
  const copy = document.createElement("div");
  const title = document.createElement("p");
  title.textContent = label;
  const value = document.createElement("strong");
  value.textContent = amount;
  copy.append(title, value);
  const button = document.createElement("button");
  button.className = "button button-small button-crown";
  button.type = "button";
  button.dataset.claim = action;
  if (roundId !== undefined) button.dataset.roundId = roundId.toString();
  button.textContent = "Claim";
  row.append(copy, button);
  return row;
}

function renderStandings(snapshot: GameSnapshot): void {
  const list = element<HTMLOListElement>("standings-list");
  if (!snapshot.standings.length) {
    list.replaceChildren(emptyListItem("No players in this round."));
    return;
  }
  list.replaceChildren(
    ...snapshot.standings.map((standing, index) => {
      const item = document.createElement("li");
      item.className = "standing-row";
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      const dot = document.createElement("span");
      dot.className = "player-dot";
      dot.style.setProperty("--player-hue", addressHue(standing.address).toString());
      dot.setAttribute("aria-hidden", "true");
      const identity = document.createElement("div");
      identity.className = "standing-identity";
      const address = document.createElement("bdi");
      address.textContent = shortAddress(standing.address);
      const tenure = document.createElement("span");
      tenure.textContent = `${formatDuration(standing.crownSeconds)} if the round ends now`;
      identity.append(address, tenure);
      if (standing.isLeader) {
        const badge = document.createElement("span");
        badge.className = "leader-tag";
        badge.textContent = "Crown";
        identity.firstChild?.after(badge);
      }
      const reward = document.createElement("strong");
      reward.textContent = formatWeth(standing.projectedReward);
      item.append(rank, dot, identity, reward);
      return item;
    }),
  );
}

function renderActivity(snapshot: GameSnapshot): void {
  const list = element<HTMLOListElement>("activity-list");
  if (!snapshot.activity.length) {
    list.replaceChildren(emptyListItem("The first challenge will appear here."));
    return;
  }
  list.replaceChildren(
    ...snapshot.activity.map((activity) => {
      const item = document.createElement("li");
      item.className = `activity-row activity-${activity.kind}`;
      const marker = document.createElement("span");
      marker.className = "activity-marker";
      marker.setAttribute("aria-hidden", "true");
      const copy = document.createElement("div");
      const title = document.createElement("p");
      title.textContent = activity.title;
      const detail = document.createElement("span");
      detail.textContent = activity.detail;
      copy.append(title, detail);
      const time = document.createElement("time");
      if (activity.timestamp !== undefined) {
        const date = new Date(Number(activity.timestamp) * 1_000);
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else {
        time.textContent = `Block ${activity.blockNumber}`;
      }
      item.append(marker, copy, time);
      return item;
    }),
  );
}

function emptyParagraph(copy: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-copy";
  paragraph.textContent = copy;
  return paragraph;
}

function emptyListItem(copy: string): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "empty-copy";
  item.textContent = copy;
  return item;
}
