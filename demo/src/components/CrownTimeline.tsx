import type { CrownSegment } from "@/demo-store"
import { compactAddress, formatHeld } from "@/lib/format"

type CrownTimelineProps = {
  segments: CrownSegment[]
  roundStart: number
  hardEnd: number
  now: number
}

type HolderTime = {
  holder: string
  milliseconds: number
  color: string
}

function crownTimeByHolder(segments: CrownSegment[], now: number) {
  const totals = new Map<string, HolderTime>()
  for (const segment of segments) {
    const milliseconds = Math.max(0, (segment.endedAt ?? now) - segment.startedAt)
    const key = segment.holder.toLowerCase()
    const existing = totals.get(key)
    totals.set(key, {
      holder: segment.holder,
      milliseconds: (existing?.milliseconds ?? 0) + milliseconds,
      color: existing?.color ?? segment.color,
    })
  }
  return [...totals.values()].sort((left, right) => right.milliseconds - left.milliseconds)
}

export function CrownTimeline({ segments, roundStart, hardEnd, now }: CrownTimelineProps) {
  const holders = crownTimeByHolder(segments, now)
  const total = Math.max(1, holders.reduce((sum, holder) => sum + holder.milliseconds, 0))
  const roundDuration = Math.max(1, hardEnd - roundStart)
  const elapsed = Math.min(1, Math.max(0, (now - roundStart) / roundDuration))
  const chartLeft = 24
  const chartWidth = 852
  const currentX = chartLeft + chartWidth * elapsed

  return (
    <figure className="crown-chart">
      <div className="crown-chart__heading">
        <div>
          <span className="kicker">Crown-time ledger</span>
          <h3>Every second leaves a mark.</h3>
        </div>
        <span className="chart-key"><i /> Current holder</span>
      </div>

      <svg
        className="crown-chart__svg"
        viewBox="0 0 900 260"
        role="img"
        aria-labelledby="crown-chart-title crown-chart-desc"
      >
        <title id="crown-chart-title">Crown-time accumulated by each round participant</title>
        <desc id="crown-chart-desc">
          Horizontal bars compare crown holding time. A lower timeline shows each change of leader and the hard-cap horizon.
        </desc>

        <g className="chart-grid">
          {[0, 0.25, 0.5, 0.75, 1].map((position) => (
            <line
              key={position}
              x1={chartLeft + chartWidth * position}
              y1="28"
              x2={chartLeft + chartWidth * position}
              y2="196"
            />
          ))}
        </g>

        {holders.slice(0, 4).map((holder, index) => {
          const width = Math.max(8, (holder.milliseconds / total) * 520)
          const y = 40 + index * 38
          return (
            <g key={holder.holder} className="holder-bar">
              <rect x={chartLeft} y={y} width={width} height="18" rx="9" fill={holder.color} />
              <circle cx={chartLeft + width} cy={y + 9} r="4" fill="#11130f" />
              <text x={Math.min(chartLeft + width + 14, 740)} y={y + 13}>
                {formatHeld(holder.milliseconds)}
              </text>
            </g>
          )
        })}

        <g className="round-line">
          <line x1={chartLeft} y1="214" x2={chartLeft + chartWidth} y2="214" />
          {segments.map((segment) => {
            const from = Math.max(0, (segment.startedAt - roundStart) / roundDuration)
            const to = Math.min(1, ((segment.endedAt ?? now) - roundStart) / roundDuration)
            const x = chartLeft + chartWidth * from
            const width = Math.max(3, chartWidth * (to - from))
            return (
              <rect key={`${segment.holder}-${segment.startedAt}`} x={x} y="207" width={width} height="14" rx="7" fill={segment.color}>
                <title>{compactAddress(segment.holder)} held the crown for {formatHeld((segment.endedAt ?? now) - segment.startedAt)}</title>
              </rect>
            )
          })}
          <line className="now-marker" x1={currentX} y1="190" x2={currentX} y2="230" />
          <circle className="now-dot" cx={currentX} cy="214" r="5" />
          <text x={chartLeft} y="250">Round start</text>
          <text x={chartLeft + chartWidth} y="250" textAnchor="end">60m decision</text>
        </g>
      </svg>

      <div className="crown-chart__legend" aria-label="Crown-time leaders">
        {holders.slice(0, 3).map((holder, index) => (
          <div key={holder.holder}>
            <span className="legend-rank">0{index + 1}</span>
            <i style={{ background: holder.color }} />
            <span>{compactAddress(holder.holder)}</span>
            <strong>{Math.round((holder.milliseconds / total) * 100)}%</strong>
          </div>
        ))}
      </div>
    </figure>
  )
}
