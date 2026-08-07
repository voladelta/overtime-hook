# Static analysis disposition

`forge lint src --severity high med` completed without findings.

Slither 0.11.6 completed across 76 project/dependency contracts. Its final pass reported:

- `reentrancy-benign` on `OvertimeLauncher._launch`: accepted false positive. Every external entry path has `ReentrancyGuardTransient`, and `launched` is set before PoolManager/PositionManager interaction; any downstream revert rolls the flag and atomic child deployments back.
- timestamp comparisons in the router and hook: accepted by design. Deadlines, same-block refunds, soft expiry, and the hard cap are the product's explicit timestamp state machine and are bounded by immutable rules.
- `roundId` constable: rejected false positive. Slither failed to generate IR for `_takeCrown`, where `roundId` is incremented; unit and invariant tests exercise recurring rounds.
- Slither IR generation warning for `_takeCrown`: tool limitation recorded; compilation, fuzzing, and 49,152 stateful invariant calls succeeded.

An earlier pass found ambiguous dynamic `abi.encodePacked` construction and ignored settlement/initialization returns. Those findings were fixed with `bytes.concat`, exact settlement validation, and initial-tick validation before the recorded final pass.
