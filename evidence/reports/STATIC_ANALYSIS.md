# Static analysis disposition

`forge lint src --severity high --severity med` completed without findings.

Slither completed across 76 project/dependency contracts. Its second pass reported:

- `reentrancy-benign` on `OvertimeLauncher.launch`: accepted false positive. `ReentrancyGuardTransient` protects both launch phases and `launched` is set before PoolManager/PositionManager interaction; any downstream revert rolls the flag back.
- timestamp comparisons in the router and hook: accepted by design. Deadlines, same-block refunds, soft expiry, and the hard cap are the product's explicit timestamp state machine and are bounded by immutable rules.
- `roundId` constable: rejected false positive. Slither failed to generate IR for `_takeCrown`, where `roundId` is incremented; unit and invariant tests exercise recurring rounds.
- Slither IR generation warning for `_takeCrown`: tool limitation recorded; compilation, fuzzing, and 49,152 stateful invariant calls succeeded.

The first pass also found ambiguous dynamic `abi.encodePacked` construction and ignored settlement/initialization returns. Those findings were fixed with `bytes.concat`, exact settlement validation, and initial-tick validation before the recorded second pass.
