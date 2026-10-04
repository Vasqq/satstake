# Slither analysis

Analysis evidence for LLR-VV-008. Run 2026-10-04 by the agent with Slither 0.11.6 (`slither-analyzer` from PyPI,
Trail of Bits), 102 detectors, against `src/SatStake.sol` at the commit that carries this file:

```
slither src/SatStake.sol --compile-force-framework foundry --filter-paths "lib/|test/|script/"
```

CI runs the same command with `--fail-medium` in the `slither` job, so any medium or high finding fails the build.

## Result

No high or medium finding. Four low findings, all from one detector, all justified below.

| # | Detector | Impact | Location | Resolution |
|---|---|---|---|---|
| 1 | `timestamp` | Low | `createPledge`, `src/SatStake.sol:231-232`, deadline bounds | Justified |
| 2 | `timestamp` | Low | `_recordVerdict`, `src/SatStake.sol:299`, verdict window | Justified |
| 3 | `timestamp` | Low | `settle`, `src/SatStake.sol:326`, expiry | Justified |
| 4 | `timestamp` | Low | `stateOf`, `src/SatStake.sol:357`, derived Expired state | Justified |

## Justification

The detector flags any comparison with `block.timestamp`, because a block producer has some freedom over it. A deadline
is the product: the referee may rule only before it (LLR-SC-032), a pledge with no verdict becomes settleable to the
beneficiary at it (LLR-SC-042), and its bounds are 10 minutes to 365 days from creation (LLR-SC-025). Decision D-04 in
the North Star chose `block.timestamp` with a strict `<` / `>=` partition, so every instant falls on exactly one side.

What a producer could gain is bounded by how far Arc lets a block's timestamp drift. Arc makes about two blocks a second
with deterministic finality (01 V-10, V-11), and repeated or slightly shifted timestamps matter only for which side of a
deadline a transaction sent within about a second of it lands on. The shortest pledge lasts 10 minutes, and the
application shows a warning in the last 10 minutes and removes the verdict controls once chain time reaches the deadline
(LLR-FE-012, LLR-FE-042, LLR-FE-043), so a referee acting through it is not led to that edge. No comparison here uses a timestamp as randomness or as a price.
