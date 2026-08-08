import {
  ArrowDownRight,
  ArrowRight,
  Check,
  CircleDot,
  Clock3,
  Crown,
  ExternalLink,
  Gauge,
  RotateCw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trophy,
} from "lucide-react"
import { useState } from "react"
import { formatEther, parseEther, zeroAddress } from "viem"
import {
  useConnect,
  useConnection,
  useConnectors,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"

import { Button } from "@/components/Button"
import { CrownTimeline } from "@/components/CrownTimeline"
import { MechanismSimulator } from "@/components/MechanismSimulator"
import { SegmentedControl } from "@/components/SegmentedControl"
import { WalletControl } from "@/components/WalletControl"
import {
  challengeRouterAbi,
  challengeRouterAddress,
  erc20Abi,
  minimumSqrtPriceLimit,
  minimumTokenOutput,
  overtimeHookAbi,
  overtimeHookAddress,
  overtimePoolKey,
  targetChainId,
  transactionsConfigured,
  wethAddress,
} from "@/contracts"
import { crownCost, useDemoRound } from "@/demo-store"
import { useLiveRound } from "@/hooks/use-live-round"
import { useNow } from "@/hooks/use-now"
import { compactAddress, formatCountdown, formatEth, formatHeld } from "@/lib/format"

type ActionTab = "challenge" | "rewards"

function safeParseEther(value: string) {
  try {
    return parseEther(value)
  } catch {
    return undefined
  }
}

function App() {
  const now = useNow()
  const demo = useDemoRound()
  const live = useLiveRound()
  const useLiveData = transactionsConfigured && live.ready

  const round = useLiveData
    ? {
        active: live.active,
        roundId: live.roundId,
        start: live.active ? live.start : now,
        softEnd: live.active ? live.softEnd : now + 15 * 60_000,
        hardEnd: live.active ? live.hardEnd : now + 60 * 60_000,
        leaderSince: live.active ? live.leaderSince : now,
        leader: live.leader,
        activePot: live.activePot,
        pendingPot: live.pendingPot,
        totalVolume: live.totalVolume,
        uniquePlayers: demo.uniquePlayers,
      }
    : { ...demo, active: true }

  const chartSegments = useLiveData && live.active
    ? [{ holder: live.leader, startedAt: live.leaderSince, color: "#ff6b35" }]
    : useLiveData ? [] : demo.segments

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Overtime home">
          <span className="brand-mark"><Crown size={17} strokeWidth={2.2} /></span>
          <span>Overtime</span>
          <small>v1</small>
        </a>

        <div className="header-meta">
          <span className="network-status">
            <i className={transactionsConfigured ? "is-live" : ""} />
            {transactionsConfigured ? "Ethereum" : "Interactive preview"}
          </span>
          <a className="text-link header-docs" href="#simulator">
            Simulator <ArrowDownRight size={14} />
          </a>
          <WalletControl />
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <div className="eyebrow"><span>Round {round.roundId.toString().padStart(2, "0")}</span><i /> Crown-time game</div>
            <h1 id="hero-title">Every second<br />at the top counts.</h1>
          </div>
          <div className="hero__aside">
            <p>
              Buy through the challenge route to take the crown. Hold it until the soft clock ends for the knockout bonus—or earn your share by time held.
            </p>
            <a className="text-link" href="#arena">Enter the round <ArrowRight size={15} /></a>
          </div>
        </section>

        <section id="arena" className="arena-grid" aria-label="Current Overtime round">
          <RoundArena
            now={now}
            round={round}
            segments={chartSegments}
            actionId={demo.actionId}
            lastAction={demo.lastAction}
            live={useLiveData}
          />
          <ActionRail now={now} activePot={round.activePot} roundId={round.roundId} />
        </section>

        <MechanismSimulator currentPot={round.activePot} />

        <section id="rules" className="rules" aria-labelledby="rules-title">
          <div className="rules__intro">
            <span className="section-number">04 / The game</span>
            <h2 id="rules-title">Two ways to win.<br />One clock that cannot lie.</h2>
          </div>
          <div className="rules__grid">
            <Rule
              number="01"
              icon={TimerReset}
              title="Take the crown"
              text="A settled WETH buy of at least 0.01 starts or extends the soft clock. Ordinary swaps never move it."
            />
            <Rule
              number="02"
              icon={Trophy}
              title="Land the knockout"
              text="Still leading at the soft deadline? Take 40% as champion while crown-time holders share another 50%."
            />
            <Rule
              number="03"
              icon={ShieldCheck}
              title="Reach a decision"
              text="At 60 minutes the bonus disappears. Ninety percent belongs only to the addresses that held the crown."
            />
          </div>
        </section>
      </main>

      <footer>
        <div>
          <Crown size={15} />
          <span>Overtime v1</span>
        </div>
        <span>Uniswap v4 · 110 bps · immutable rounds</span>
        <a href="https://github.com/voladelta/overtime-hook" target="_blank" rel="noreferrer">
          Source <ExternalLink size={13} />
        </a>
      </footer>
    </div>
  )
}

type RoundArenaProps = {
  now: number
  round: {
    roundId: number
    active: boolean
    start: number
    softEnd: number
    hardEnd: number
    leaderSince: number
    leader: string
    activePot: number
    pendingPot: number
    totalVolume: number
    uniquePlayers: number
  }
  segments: ReturnType<typeof useDemoRound.getState>["segments"]
  actionId: number
  lastAction: string
  live: boolean
}

function RoundArena({ now, round, segments, actionId, lastAction, live }: RoundArenaProps) {
  const softRemaining = round.softEnd - now
  const hardRemaining = round.hardEnd - now
  const hardProgress = Math.min(100, Math.max(0, ((now - round.start) / (round.hardEnd - round.start)) * 100))

  return (
    <article className="round-arena">
      <div className="round-arena__top">
        <div className="status-pill"><CircleDot size={13} /> {live ? round.active ? "Live round" : "Ready to start" : "Preview round"}</div>
        <div className="countdown" aria-label={`${formatCountdown(softRemaining)} until soft deadline`}>
          <span>{round.active ? "Knockout in" : "Initial clock"}</span>
          <strong>{formatCountdown(softRemaining)}</strong>
        </div>
      </div>

      <div className="leader-row">
        <div className="crown-orbit" aria-hidden="true">
          <span><Crown size={24} strokeWidth={1.7} /></span>
        </div>
        <div>
          <span className="kicker">Crown holder</span>
          <strong>{round.active ? compactAddress(round.leader, 7, 5) : "No holder yet"}</strong>
          <small>{round.active ? `Holding for ${formatHeld(now - round.leaderSince)}` : "The first valid challenge starts the round"}</small>
        </div>
        <div className="pot-block">
          <span className="kicker">Active pot</span>
          <strong>{formatEth(round.activePot, 5)} <small>WETH</small></strong>
          <small>+ {formatEth(round.pendingPot)} waiting next round</small>
        </div>
      </div>

      {lastAction ? (
        <div key={actionId} className="round-notice" role="status">
          <Sparkles size={15} /> {lastAction}
        </div>
      ) : null}

      <div className="round-stats">
        <div><span>Gross volume</span><strong>{formatEth(round.totalVolume, 2)} WETH</strong></div>
        <div><span>Players</span><strong>{round.uniquePlayers}</strong></div>
        <div><span>Hard cap</span><strong>{formatCountdown(hardRemaining)}</strong></div>
        <div><span>Outcome now</span><strong>{round.active ? round.softEnd === round.hardEnd ? "Decision" : "Knockout" : "Unstarted"}</strong></div>
      </div>

      <div className="hard-cap-track" aria-label={`${Math.round(hardProgress)} percent of hard cap elapsed`}>
        <span style={{ width: `${hardProgress}%` }} />
        <small>Round start</small>
        <small>Hard decision · 60m</small>
      </div>

      <CrownTimeline segments={segments} roundStart={round.start} hardEnd={round.hardEnd} now={now} />
    </article>
  )
}

function ActionRail({ now, activePot, roundId }: { now: number; activePot: number; roundId: number }) {
  const [tab, setTab] = useState<ActionTab>("challenge")

  return (
    <aside className="action-rail">
      <div className="action-rail__header">
        <div>
          <span className="section-number">02 / Your move</span>
          <h2>{tab === "challenge" ? "Take the crown" : "Your rewards"}</h2>
        </div>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          label="Action"
          options={[
            { value: "challenge", label: "Challenge" },
            { value: "rewards", label: "Rewards", count: 2 },
          ]}
        />
      </div>

      {tab === "challenge"
        ? <ChallengeComposer now={now} activePot={activePot} />
        : <RewardsPanel roundId={roundId} />}
    </aside>
  )
}

function ChallengeComposer({ now, activePot }: { now: number; activePot: number }) {
  const [amount, setAmount] = useState("0.05")
  const demo = useDemoRound()
  const connection = useConnection()
  const connectors = useConnectors()
  const connect = useConnect()
  const switchChain = useSwitchChain()
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  const grossWei = safeParseEther(amount)
  const gross = Number(amount)
  const validGross = Number.isFinite(gross) && gross >= 0.01
  const demoCrownCost = crownCost(activePot)
  const hookAddress = overtimeHookAddress ?? zeroAddress
  const routerAddress = challengeRouterAddress ?? zeroAddress
  const quote = useReadContract({
    address: hookAddress,
    abi: overtimeHookAbi,
    functionName: "previewChallenge",
    args: [grossWei ?? 0n],
    query: { enabled: transactionsConfigured && Boolean(grossWei) && validGross },
  })
  const totalWeth = quote.data ? Number(formatEther(quote.data[0])) : gross + demoCrownCost
  const nextCrownCost = quote.data ? Number(formatEther(quote.data[1])) : demoCrownCost
  const totalFee = quote.data ? Number(formatEther(quote.data[2])) : gross * 0.011
  const allowance = useReadContract({
    address: wethAddress ?? zeroAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [connection.address ?? zeroAddress, routerAddress],
    query: { enabled: transactionsConfigured && connection.isConnected },
  })
  const wrongChain = transactionsConfigured && connection.chainId !== targetChainId
  const quotePending = transactionsConfigured && validGross && !quote.data
  const allowancePending = transactionsConfigured
    && connection.isConnected
    && !wrongChain
    && (allowance.isLoading || allowance.data === undefined)
  const needsApproval = Boolean(quote.data && allowance.data !== undefined && allowance.data < quote.data[0])
  const busy = write.isPending || receipt.isLoading || quotePending || allowancePending
  const player = connection.address ?? "0x7A4F668B2d0Ae1C5098b33B5caF735E71F8F91C2"

  const submit = () => {
    if (!validGross || !grossWei) return
    if (!transactionsConfigured) {
      demo.takeCrown(gross, player)
      return
    }
    if (!connection.isConnected) {
      const connector = connectors[0]
      if (connector) connect.mutate({ connector })
      return
    }
    if (wrongChain && targetChainId) {
      switchChain.mutate({ chainId: targetChainId })
      return
    }
    if (!quote.data) return
    if (!challengeRouterAddress || !wethAddress || !minimumTokenOutput || !targetChainId) return
    if (needsApproval && quote.data) {
      write.mutate({
        address: wethAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [challengeRouterAddress, quote.data[0]],
        chainId: targetChainId,
      })
      return
    }
    const key = overtimePoolKey()
    if (!key) return
    write.mutate({
      address: challengeRouterAddress,
      abi: challengeRouterAbi,
      functionName: "challenge",
      args: [
        key,
        grossWei,
        minimumTokenOutput,
        BigInt(Math.floor(now / 1_000) + 20 * 60),
        minimumSqrtPriceLimit,
      ],
      chainId: targetChainId,
    })
  }

  const buttonLabel = !transactionsConfigured
    ? "Take crown in preview"
    : !connection.isConnected
      ? "Connect wallet"
      : wrongChain
        ? "Switch network"
        : quotePending || allowancePending
          ? "Preparing challenge"
        : needsApproval
          ? "Approve WETH"
          : "Take the crown"

  return (
    <div className="challenge-panel">
      <p className="action-copy">
        Your WETH buy settles through the authenticated challenge router. The crown changes hands only if the entire trade clears.
      </p>

      <label className="amount-field">
        <span>Gross WETH buy <small>minimum 0.01</small></span>
        <div>
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby="amount-note"
          />
          <span>WETH</span>
        </div>
      </label>

      <div className="amount-presets" aria-label="Amount presets">
        {["0.01", "0.05", "0.10", "0.25"].map((preset) => (
          <button key={preset} type="button" onClick={() => setAmount(preset)}>{preset}</button>
        ))}
      </div>

      <div className="cost-stack">
        <div><span>Swap amount</span><strong>{validGross ? formatEth(gross) : "—"} WETH</strong></div>
        <div><span>Hook fee · 110 bps</span><strong>{validGross && !quotePending ? formatEth(totalFee, 6) : "—"} WETH</strong></div>
        <div><span>Crown cost</span><strong>{validGross && !quotePending ? formatEth(nextCrownCost, 6) : "—"} WETH</strong></div>
        <div className="cost-total"><span>Wallet total</span><strong>{validGross && !quotePending ? formatEth(totalWeth, 6) : "—"} WETH</strong></div>
      </div>

      <p id="amount-note" className="fee-note">
        <ShieldCheck size={14} /> 10 bps funds Programmable. 100 bps enters the game. Crown cost is added separately.
      </p>

      <Button
        className="challenge-button"
        size="lg"
        leadingIcon={Crown}
        loading={busy || connect.isPending || switchChain.isPending}
        disabled={!validGross || quotePending || allowancePending}
        onClick={submit}
      >
        {buttonLabel}
      </Button>

      <div className="action-assurance">
        <span><Check size={13} /> Exact input</span>
        <span><Check size={13} /> Atomic fill</span>
        <span><Check size={13} /> Pull rewards</span>
      </div>
    </div>
  )
}

function RewardsPanel({ roundId }: { roundId: number }) {
  const reward = useDemoRound((state) => state.crownTimeReward)
  const refund = useDemoRound((state) => state.refundCredit)
  const claimCrownTime = useDemoRound((state) => state.claimCrownTime)
  const claimRefund = useDemoRound((state) => state.claimRefund)

  if (transactionsConfigured) {
    return (
      <div className="rewards-panel rewards-panel--empty">
        <div className="reward-empty-icon"><Gauge size={22} /></div>
        <h3>Index your crown history</h3>
        <p>
          Live claims are address-and-round specific. Add the event indexer before enabling claim buttons so the interface never guesses an earning round.
        </p>
        <div className="reward-note"><ShieldCheck size={15} /> The deployed hook remains the source of truth for claimable amounts.</div>
      </div>
    )
  }

  return (
    <div className="rewards-panel">
      <p className="action-copy">Rewards stay attached to the earning address. No operator can redirect them.</p>
      <div className="reward-card reward-card--accent">
        <div className="reward-card__icon"><Gauge size={19} /></div>
        <span>Crown-time · round {Math.max(1, roundId - 1)}</span>
        <strong>{formatEth(reward, 5)} WETH</strong>
        <small>Pro-rata for 8m 46s held</small>
        <Button variant="secondary" size="sm" disabled={reward === 0} onClick={claimCrownTime}>
          {reward === 0 ? "Claimed" : "Claim reward"}
        </Button>
      </div>
      <div className="reward-card">
        <div className="reward-card__icon"><RotateCw size={19} /></div>
        <span>Same-block refund</span>
        <strong>{formatEth(refund, 5)} WETH</strong>
        <small>Crown contribution only</small>
        <Button variant="ghost" size="sm" disabled={refund === 0} onClick={claimRefund}>
          {refund === 0 ? "Claimed" : "Claim refund"}
        </Button>
      </div>
      <div className="reward-note"><ShieldCheck size={15} /> Claims are pull-based and paid only to your wallet.</div>
    </div>
  )
}

function Rule({
  number,
  icon: Icon,
  title,
  text,
}: {
  number: string
  icon: typeof Clock3
  title: string
  text: string
}) {
  return (
    <article className="rule-card">
      <div><span>{number}</span><Icon size={21} strokeWidth={1.7} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

export default App
