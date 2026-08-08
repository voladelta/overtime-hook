import { Activity, BarChart3, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/Button"
import {
  DEFAULT_CROWN_CURVES,
  DEFAULT_SIMULATOR_CONFIG,
  simulateComparison,
  type SimulatorConfig,
} from "@/simulator"

type NumericConfigKey = Exclude<keyof SimulatorConfig, "seed">

type SimulatorFieldProps = {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function percent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
}

function weth(value: number, digits = 4) {
  return `${value.toFixed(digits)} WETH`
}

function signedWeth(value: number) {
  const sign = value >= 0 ? "+" : "−"
  return `${sign}${Math.abs(value).toFixed(4)} WETH`
}

function SimulatorField({ label, value, display, min, max, step, onChange }: SimulatorFieldProps) {
  return (
    <label className="sim-field">
      <span><span>{label}</span><strong>{display}</strong></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function MechanismSimulator({ currentPot }: { currentPot: number }) {
  const [config, setConfig] = useState<SimulatorConfig>(() => ({
    ...DEFAULT_SIMULATOR_CONFIG,
    initialPot: Math.max(0.1, Number(currentPot.toFixed(2))),
  }))
  const [maximumCrownCost, setMaximumCrownCost] = useState<number | null>(0.1)
  const curves = useMemo(
    () => DEFAULT_CROWN_CURVES.map((curve) => (
      curve.label.startsWith("Legacy") ? curve : { ...curve, maximum: maximumCrownCost }
    )),
    [maximumCrownCost],
  )
  const results = useMemo(() => simulateComparison(config, curves), [config, curves])
  const challengeScale = Math.max(1, ...results.map((result) => result.averageChallenges))
  const current = results.find((result) => result.curve.label === "Current") ?? results[0]
  const strongest = results[results.length - 1]
  const challengeChange = current.averageChallenges > 0
    ? (strongest.averageChallenges - current.averageChallenges) / current.averageChallenges
    : 0

  const update = (key: NumericConfigKey, value: number) => {
    setConfig((existing) => ({ ...existing, [key]: value }))
  }

  const reset = () => {
    setConfig({
      ...DEFAULT_SIMULATOR_CONFIG,
      initialPot: Math.max(0.1, Number(currentPot.toFixed(2))),
    })
    setMaximumCrownCost(0.1)
  }

  return (
    <section id="simulator" className="simulator" aria-labelledby="simulator-title">
      <div className="simulator__heading">
        <div>
          <span className="section-number">03 / Mechanism lab</span>
          <h2 id="simulator-title">Stress the crown curve<br />before it becomes immutable.</h2>
        </div>
        <p>
          Compare the current 1% rule with its 0.5% predecessor and a steeper 2% curve across 750 seeded rounds. The engine reproduces the soft close, hard decision, fees, bankroll limits, and reward split.
        </p>
      </div>

      <div className="simulator__body">
        <aside className="sim-controls" aria-label="Simulation assumptions">
          <div className="sim-controls__title">
            <span><SlidersHorizontal size={16} /> Assumptions</span>
            <Button variant="ghost" size="sm" leadingIcon={RefreshCw} onClick={reset}>Reset</Button>
          </div>

          <SimulatorField
            label="Starting active pot"
            value={config.initialPot}
            display={weth(config.initialPot, 2)}
            min={0.1}
            max={20}
            step={0.1}
            onChange={(value) => update("initialPot", value)}
          />
          <SimulatorField
            label="Players"
            value={config.players}
            display={config.players.toFixed(0)}
            min={4}
            max={60}
            step={1}
            onChange={(value) => update("players", value)}
          />
          <SimulatorField
            label="Attempts / player / hour"
            value={config.attemptsPerPlayerHour}
            display={config.attemptsPerPlayerHour.toFixed(2)}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(value) => update("attemptsPerPlayerHour", value)}
          />
          <SimulatorField
            label="Deadline pressure"
            value={config.deadlineMultiplier}
            display={`${config.deadlineMultiplier.toFixed(0)}×`}
            min={1}
            max={8}
            step={1}
            onChange={(value) => update("deadlineMultiplier", value)}
          />
          <SimulatorField
            label="Median liquid bankroll"
            value={config.medianBankroll}
            display={weth(config.medianBankroll, 2)}
            min={0.05}
            max={2}
            step={0.05}
            onChange={(value) => update("medianBankroll", value)}
          />
          <SimulatorField
            label="Capital inequality"
            value={config.bankrollSkew}
            display={config.bankrollSkew === 0 ? "Equal" : config.bankrollSkew.toFixed(1)}
            min={0}
            max={1.6}
            step={0.1}
            onChange={(value) => update("bankrollSkew", value)}
          />
          <SimulatorField
            label="Knockout confidence"
            value={config.knockoutConfidence}
            display={percent(config.knockoutConfidence, 0)}
            min={0.01}
            max={0.2}
            step={0.01}
            onChange={(value) => update("knockoutConfidence", value)}
          />
          <SimulatorField
            label="Gas cost"
            value={config.gasCost}
            display={weth(config.gasCost, 4)}
            min={0}
            max={0.004}
            step={0.0001}
            onChange={(value) => update("gasCost", value)}
          />

          <label className="sim-select">
            <span>New-rule crown cap</span>
            <select
              value={maximumCrownCost == null ? "none" : maximumCrownCost.toString()}
              onChange={(event) => setMaximumCrownCost(event.target.value === "none" ? null : Number(event.target.value))}
            >
              <option value="0.05">0.05 WETH</option>
              <option value="0.1">0.10 WETH · current</option>
              <option value="0.25">0.25 WETH</option>
              <option value="none">No cap</option>
            </select>
          </label>

          <button
            type="button"
            className="sim-resample"
            onClick={() => setConfig((existing) => ({ ...existing, seed: existing.seed + 1 }))}
          >
            <RefreshCw size={14} /> New seeded sample <span>#{config.seed}</span>
          </button>
        </aside>

        <div className="sim-results">
          <div className="sim-readout">
            <div><Activity size={18} /></div>
            <p>
              Under these assumptions, the 2% curve produces <strong>{percent(Math.abs(challengeChange), 0)} {challengeChange <= 0 ? "fewer" : "more"} successful challenges</strong> than the current curve, while its top-capital quartile receives <strong>{percent(strongest.topCapitalRewardShare, 0)}</strong> of rewards.
            </p>
          </div>

          <div className="scenario-grid">
            {results.map((result) => (
              <article className="scenario-card" data-current={result.curve.label === "Current" || undefined} key={result.curve.label}>
                <div className="scenario-card__heading">
                  <div>
                    <span>{result.curve.label === "Current" ? "Contract rule" : result.curve.label.startsWith("Legacy") ? "Previous rule" : "Candidate"}</span>
                    <h3>{result.curve.label}</h3>
                  </div>
                  <strong>{percent(result.curve.rate, 1)}</strong>
                </div>

                <div className="scenario-break-even">
                  <span>Knockout-only break-even</span>
                  <strong>{percent(result.breakEvenWinChance, 2)}</strong>
                  <small>Before crown-time value</small>
                </div>

                <div className="scenario-bar" aria-label={`${result.averageChallenges.toFixed(1)} average successful challenges`}>
                  <span style={{ width: `${result.averageChallenges / challengeScale * 100}%` }} />
                </div>

                <dl className="scenario-metrics">
                  <div><dt>Challenges</dt><dd>{result.averageChallenges.toFixed(1)}</dd></div>
                  <div><dt>Unique players</dt><dd>{result.averageUniquePlayers.toFixed(1)}</dd></div>
                  <div><dt>Hard decisions</dt><dd>{percent(result.decisionRate, 0)}</dd></div>
                  <div><dt>Round length</dt><dd>{result.averageDurationMinutes.toFixed(1)}m</dd></div>
                  <div><dt>Final pot</dt><dd>{weth(result.averageFinalPot, 3)}</dd></div>
                  <div><dt>Mean crown cost</dt><dd>{weth(result.averageCrownCost, 4)}</dd></div>
                  <div><dt>Bankroll-blocked</dt><dd>{percent(result.blockedAttemptRate, 1)}</dd></div>
                  <div><dt>Top-capital rewards</dt><dd>{percent(result.topCapitalRewardShare, 0)}</dd></div>
                  <div><dt>Mean net · incl. start pot</dt><dd className={result.averageParticipantNet < 0 ? "is-negative" : ""}>{signedWeth(result.averageParticipantNet)}</dd></div>
                  <div><dt>Next-round rollover</dt><dd>{weth(result.averageRollover, 3)}</dd></div>
                </dl>
              </article>
            ))}
          </div>

          <div className="sim-model-note">
            <BarChart3 size={16} />
            <p>
              <strong>Behavioral stress test, not a Nash proof.</strong> Potential attempts arrive randomly and cluster near the soft deadline. Agents enter when estimated champion and crown-time value covers crown cost, 110 bps, and gas. Gross buys retain their post-fee token value; price impact, MEV, and token-price changes are excluded.
            </p>
          </div>
          <div className="sim-invariant"><ShieldCheck size={14} /> Fixed in every run: 0.01 WETH gross buy, 15m initial clock, 5m response window, 60m hard cap, and 40 / 50 / 10 payout.</div>
        </div>
      </div>
    </section>
  )
}
