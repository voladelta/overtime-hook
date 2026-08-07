# Overtime v1 state machine

## States

- `Idle`: no active round. Game fees accrue to `pendingPot`.
- `Active`: a round has a leader, `softEnd`, immutable `hardEnd`, `activePot`, and open crown-time accounting.
- `Expired`: a transient observation where `block.timestamp >= softEnd`; the next swap must finalize before any other processing.
- `Finalized`: immutable per-round pools and crown-time totals exist; claims are independent pull operations.

## Transitions

### Idle + ordinary swap

Charge the 110 bps fee. Accrue 10 bps to Programmable and 100 bps to `pendingPot`. Stay Idle.

### Idle + valid challenge

Charge the ordinary fee. Require exact-input WETH-to-token, authenticated router, no partial fill, and settled gross WETH >= 0.01 WETH. Collect the crown cost. Create round `r`:

```text
start = now
softEnd = now + 15 minutes
hardEnd = now + 60 minutes
leader = challenger
leaderSince = now
activePot = pendingPot + game fee + crown cost
pendingPot = 0
```

### Active + ordinary swap before softEnd

Charge the fee. Add the game share to `activePot`. Do not change leader, `leaderSince`, `softEnd`, or `hardEnd`.

### Active + challenge before softEnd

1. Close the old leader's interval at `now`.
2. If the old leader was crowned in the same block, credit their recorded crown contribution to `refunds[oldLeader]` and remove that contribution from `activePot`.
3. Collect the new crown cost and add it to `activePot`.
4. Set leader and `leaderSince = now`.
5. Set `softEnd = min(max(oldSoftEnd, now + 5 minutes), hardEnd)`.

The same address may challenge again and pays the normal cost. Its crown-time intervals accumulate under the same address.

### Expired + any swap

Finalize first, before fee or challenge handling:

1. Close the leader interval at `min(now, hardEnd)`.
2. Classify as Decision iff `softEnd == hardEnd` (equivalently the round reached the immutable cap); otherwise Knockout.
3. Freeze champion/crown-time pools and total crown-seconds.
4. Move 10% rollover to `pendingPot`.
5. Clear active state.

Then process the current swap. An ordinary swap funds `pendingPot`. A valid challenge starts the next round. The past round is never reopened.

## Invariants

- `start < softEnd <= hardEnd == start + 60 minutes` for every active round.
- `softEnd` is monotonic non-decreasing inside a round.
- Leader changes only after a valid challenge settles.
- Ordinary swaps never alter leader or deadlines.
- A finalized round's classification, pools, total crown-seconds, and participant crown-seconds never increase.
- Every open leader interval is closed at most once.
- A same-block refund removes exactly one recorded crown contribution from active-pot accounting and creates an equal refund liability.
- The same claim bit cannot be consumed twice.

