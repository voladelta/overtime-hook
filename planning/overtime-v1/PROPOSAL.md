# Project proposal

> This starter is an accelerator, not an allowlist, approval, audit, deployment receipt or provider promise.

## Outcome

Describe what the user can do and what a complete successful lifecycle looks like.

## Selected foundation

- Starter: Custom Uniswap v4 hook (`custom-hook`)
- Capability pack: Custom hook behavior (`custom-hook-behavior`)
- Capability pack: Hook-owned project fee (`hook-owned-project-fee`)
- Capability pack: Launch distribution, vesting and LP custody (`launch-distribution-vesting-lp-custody`)
- Capability pack: Metadata, tags and disclosures (`metadata-disclosures`)
- Capability pack: Mandatory Programmable volume fee (`programmable-volume-fee`)
- Capability pack: Tests, evidence and threat model (`test-evidence-threat-model`)
- Owner-defined capability: Authenticated challenge router (`authenticated-challenge-router`), routed to architecture review
- Owner-defined capability: Recurring crown-time game (`recurring-crown-time-game`), routed to architecture review

## Architecture-changing facts

- [ ] Why each enabled callback is necessary
- [ ] The exact PoolKey, permission mask and hook address derivation
- [ ] All currency flows, settlement rules, authorities and exits
- [ ] How custom behavior composes with the mandatory Programmable fee
- [ ] Every enabled callback and why it is necessary
- [ ] Canonical PoolManager authentication and PoolKey admission
- [ ] Permission bits, HookMiner preimage and deployment address
- [ ] All returned deltas, settlement steps and callback failure effects
- [ ] Selected total fee and the exact non-additive platform and project split
- [ ] Project beneficiary, mutation rules, liability keys and claim behavior
- [ ] Executed gross quote-side basis, rounding and partial-fill behavior
- [ ] Public fee disclosure for every trading surface
- [ ] Total supply allocation across sale, liquidity, treasury, team, rewards and every other recipient
- [ ] Vesting start, cliff, duration, cadence, revocation, acceleration, transfer and unclaimed-token rules
- [ ] Initial-liquidity funding and exact LP position owner, fee beneficiary, lock, removal and migration rules
- [ ] Who can change recipients, schedules, custody or claims and which commitments are immutable
- [ ] Treatment of failed launches, unsold allocation, rounding dust, retirement and user exits
- [ ] Project and token names, symbol, description, URIs and exact logo bytes or hash
- [ ] Metadata owners, mutability, update authority and history
- [ ] All fees, restrictions, external dependencies and affiliations in public language
- [ ] Provider tags and support as separate time-bounded evidence states
- [ ] The effective total is the greater of the selected fee and 10 basis points
- [ ] Exactly 10 basis points belongs to 0x4957f49620AFf3Adbbe8195a4f633E49cc93376c and the remainder belongs to the project
- [ ] The executed gross quote-side basis for all four swap quadrants
- [ ] Rounding, dust, partial-fill and same-hook PoolManager-call behavior
- [ ] Pool-scoped liabilities and owner-only claims to a selected per-claim destination
- [ ] Assets, actors, authorities, trust boundaries and attacker goals
- [ ] Safety, solvency, conservation, liveness and user-exit properties
- [ ] Exact commands, tool versions, fixtures, seeds, results and skipped checks
- [ ] Which claims need maintainer, deployment, provider or onchain evidence

### Authenticated challenge router (owner-defined)

- [ ] Actors and assets
- [ ] Authority and trust boundary
- [ ] Value flow and conservation
- [ ] Failure, recovery and user exit
- [ ] Source, tests and attributable evidence

### Recurring crown-time game (owner-defined)

- [ ] Actors and assets
- [ ] Authority and trust boundary
- [ ] Value flow and conservation
- [ ] Failure, recovery and user exit
- [ ] Source, tests and attributable evidence

## Lifecycle

Describe creation, configuration, normal use, claims, exits, failures, recovery, upgrades if any, and retirement.

## Value and authority

List every asset movement and every actor that can change behavior, move value, pause a path, replace a dependency or affect a user exit.

## Open decisions

Keep unresolved facts explicit. A missing catalog label is not a rejection; preserve the capability and request architecture review.

