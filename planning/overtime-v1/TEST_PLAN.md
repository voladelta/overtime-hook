# Test plan

> Record exact commands, tool versions, fixture identities, seeds, passes, failures and skips. A skipped test is not passing evidence.

## Required scenarios

### Custom Uniswap v4 hook

- [ ] PoolManager authentication and PoolKey admission
- [ ] Permission-mask and hook-address checks
- [ ] Value-conservation fuzzing and stateful invariants
- [ ] Complete lifecycle and failure recovery

### Custom hook behavior

- [ ] Direct non-PoolManager callback rejection
- [ ] Permission mask and deployed address bits
- [ ] Value conservation and settlement ordering
- [ ] Unexpected PoolKey, malformed hookData and reentrancy paths

### Hook-owned project fee

- [ ] Project share is zero at the 10-basis-point floor
- [ ] Higher selected totals split without adding another 10 basis points
- [ ] Beneficiary mutation cannot redirect the platform share
- [ ] Solvency, claims and pool isolation

### Launch distribution, vesting and LP custody

- [ ] All allocations, claims, liquidity funding and residual balances conserve total supply
- [ ] Cliff, linear or stepped vesting boundaries before, at and after every transition
- [ ] Duplicate claim, recipient mutation, revocation, acceleration and abandoned-beneficiary cases
- [ ] LP creation, fee collection, lock expiry, removal, migration and emergency-exit authority
- [ ] Failed launch, unsold allocation, zero beneficiary, rounding dust and retirement behavior

### Metadata, tags and disclosures

- [ ] NFC, confusable, bidirectional, invisible and control-character checks
- [ ] URI, media-byte, content-type and hash binding
- [ ] Fee and restriction parity across public surfaces
- [ ] Unknown, stale, unsupported and confirmed provider states

### Mandatory Programmable volume fee

- [ ] Ten-basis-point floor and non-additive split
- [ ] All four swap quadrants and both swap directions
- [ ] Rounding, dust, partial fills and self-call policy
- [ ] Immutable owner-only claims and arbitrary safe per-claim destination
- [ ] No bypass, cross-pool netting or liability leakage

### Tests, evidence and threat model

- [ ] Unit, integration, fuzz and invariant checks appropriate to the project
- [ ] Every authority, boundary, failure and recovery path
- [ ] Adversarial dependencies and malformed inputs
- [ ] Reproducible clean-environment build and test

### Authenticated challenge router (owner-defined)

- [ ] Add capability-specific unit, integration, adversarial and property tests after architecture review.

### Recurring crown-time game (owner-defined)

- [ ] Add capability-specific unit, integration, adversarial and property tests after architecture review.

## Reproducibility

- [ ] Build and test from a clean pinned environment without secrets.
- [ ] Bind every executed check to the exact source revision and dependency closure.
- [ ] Keep local, independent-review, deployment, provider and live evidence separate.

