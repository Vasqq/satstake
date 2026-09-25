# 06 Verification and Traceability Plan

Version 1.2, 2026-09-24. Defines how every requirement is shown to be met, how code and tests point back to requirements, and how that linkage is checked by machine. Modelled on DO-178C objectives (requirements-based testing, bidirectional traceability, structural coverage, independence through tooling) and scaled to a single-contract project.

## 1. Document chain

```
02_NORTH_STAR  ->  03_USER_JOURNEYS  ->  04_HLR  ->  05_LLR  ->  code (src/, app/, script/)
                                                         \->  tests (test/, app/**/*.test.ts, e2e/)
                                                         \->  evidence (docs/evidence/, docs/INSPECTIONS.md)
```

Every arrow is traceable in both directions. `docs/TRACE_MATRIX.md` is generated, never hand-edited.

## 2. Trace tag conventions (LLR-VV-001)

**Solidity source.** Every external function, event, error, and modifier carries a `@custom:trace` NatSpec tag. Every check that implements a specific LLR carries a trailing comment with that ID.

```solidity
/// @notice Records that the referee judged the promise kept.
/// @custom:trace LLR-SC-030 LLR-SC-031 LLR-SC-032 LLR-SC-033
function markKept(uint256 id) external nonReentrant {
    Pledge storage p = _pledges[id];
    if (p.status == Status.None) revert PledgeNotFound(id);          // LLR-SC-030
    if (msg.sender != p.referee) revert NotReferee();                 // LLR-SC-030
    if (p.status != Status.Active) revert NotActive(p.status);        // LLR-SC-031
    if (block.timestamp >= p.deadline) revert VerdictWindowClosed(p.deadline); // LLR-SC-032
    p.status = Status.Kept;                                           // LLR-SC-033
    emit VerdictRecorded(id, true);                                   // LLR-SC-033
}
```

**Solidity tests.** Test function names begin with the LLR scope and number, and each test carries a `@custom:verifies` tag. One test may verify several LLRs; each LLR with method T needs at least one test.

```solidity
/// @custom:verifies LLR-SC-032
function test_SC032_markKept_revertsAtExactDeadline() public { ... }

/// @custom:verifies LLR-SC-070 LLR-SC-071
function invariant_SC070_balanceCoversLocked() public { ... }
```

**TypeScript.** Exported functions and components carry `/** @trace LLR-FE-0xx */`. Test suites are named with the ID: `describe("LLR-FE-032 amount parsing", ...)`.

**Scripts.** Deployment and seed scripts carry `// @trace LLR-DP-0xx` at each step.

**Inspection and analysis.** LLRs verified by I or A are recorded in `docs/INSPECTIONS.md` as rows: LLR, date, what was examined (file and line range or artifact), result, and evidence link.

**Demonstration.** LLRs verified by D are recorded in `docs/evidence/` with transaction hashes, URLs, or screenshots.

## 3. Trace checker (LLR-VV-002)

`tools/trace-check.mjs`, Node with no dependencies, run locally and in CI. It parses the requirement tables in 04_HLR.md and 05_LLR.md and scans `src/`, `test/`, `app/src/`, `script/`, `e2e/`, and `docs/INSPECTIONS.md`. It fails when:

1. An HLR lists no children, or lists a child LLR that does not exist.
2. An LLR lists no parent, or a parent that does not list it back.
3. An LLR with method T has no test carrying its ID.
4. An LLR in scope SC, FE, or DP has no source reference. Absence requirements (LLR-SC-002, 014, 060, 061) are satisfied by the contract-level `@custom:trace` tag on `contract SatStake`. Build-setting requirements (LLR-SC-001, LLR-FE-080) are satisfied by a comment tag in `foundry.toml` or the ESLint config, plus an INSPECTIONS.md entry.
5. An LLR with method I or A has no INSPECTIONS.md entry, or with method D has no evidence entry, at the release gate (`--release` flag).
6. Any tag in code or tests names an ID that does not exist.
7. A journey in 03_USER_JOURNEYS.md is missing from docs/ACCEPTANCE.md, or, with `--release`, has no passing result.

On success it writes `docs/TRACE_MATRIX.md`: one row per LLR with parents, implementing files and lines, tests, and evidence.

## 4. Test levels

| Level | Tool | Target | Covers |
|---|---|---|---|
| Unit | forge test | SatStake with mock tokens | Every LLR-SC check and transition, every revert path, every event |
| Fuzz | forge test (fuzz) | Input domains of `createPledge`, deadlines around boundaries | LLR-SC-021 to 026, 032, 041, 042, 053 |
| Invariant | forge invariant with a handler | Arbitrary sequences of create, verdict, settle, time warps, token blocklist and pause toggles | LLR-SC-070 to 075 |
| ABI surface | forge test reading the artifact | Selector set of non-view functions | LLR-SC-002, 061 |
| Static analysis | Slither | Contract | LLR-VV-008 |
| Frontend unit | Vitest | Pure logic: amount parsing, chain time, action matrix, error map, copy scan | LLR-VV-006 |
| Live network | viem script against Arc testnet | Real USDC ERC-20 interface and real cirBTC | LLR-VV-005 |
| Demonstration | Browser, mainnet | Hosted app, seeded pledges, explorer | HLR-020, 031, 033 |

Boundary cases that must appear by name in unit tests: deadline exactly `now + 60` and `now + 59`; deadline exactly `now + 365 days` and one second more; verdict at `deadline - 1` and at `deadline`; settle of an Active pledge at `deadline - 1` and at `deadline`; promise of 280 and 281 bytes, including multi-byte UTF-8; `pledgeIdsOf` with offset equal to count, limit 0, and limit above `MAX_PAGE`.

## 5. Mock token (LLR-VV-007)

`test/mocks/MockFiatToken.sol` implements ERC-20 with configurable decimals, an issuer-controlled blocklist that reverts transfers to or from listed addresses, and a pause that reverts all transfers. A second mock charges a transfer fee to exercise LLR-SC-027. Mocks live only in `test/`.

## 6. Structural coverage (LLR-VV-003)

`forge coverage --report summary --report lcov` must show 100% lines, statements, branches, and functions for `src/SatStake.sol`. Any uncovered branch means either a missing test or code with no requirement behind it; the second case is resolved by deleting the code or adding a requirement, never by an exclusion.

## 7. Continuous integration

GitHub Actions on every push: `forge fmt --check`, `forge build`, `forge test`, `forge coverage` gate, Slither, `tools/trace-check.mjs`, frontend lint, type check, Vitest, build for both targets, secret scan. The testnet end-to-end script runs manually and commits its evidence file.

## 8. Order of work (test first)

For each LLR group:

1. **Red.** Write the tests from the requirement text alone, without looking at or writing implementation. Run them. Every new test must fail, and fail for the reason the requirement predicts (a missing function, a missing revert, a wrong value), not from a compile error in unrelated code. Record the test names and their failure output in `docs/evidence/tdd-log.md` (LLR-VV-011).
2. **Green.** Write the minimum code that makes the tests pass, tagged as in section 2. Record the passing run in the TDD log.
3. **Refactor.** Improve structure with all tests green.
4. **Trace.** Run the trace checker and coverage; resolve every failure.
5. **Independent review.** A reviewer that did not write the code (a separate subagent) checks the diff against the requirement text, looking for untested behaviour, behaviour no requirement asks for, and tests that would pass against a wrong implementation. Findings are fixed before the next group.
6. **Commit** when the group is complete, following the commit rules in CLAUDE.md.

A group is done when steps 1 to 5 are complete.

Groups in order: SC build and data; SC allowlist; SC create; SC verdict; SC settle; SC views; SC invariants and ABI surface; DP testnet; VV-005 live run; FE configuration and reading; FE wallet; FE create; FE pledge page; FE other views; DP mainnet and seed; SB.

## 9. Journey acceptance (LLR-VV-009, 010)

`docs/ACCEPTANCE.md` holds one row per journey: ID, actor, expected outcome, verification (automated test names, e2e evidence file, or WALKTHROUGH step), result, and date. Journeys that depend on a human using a wallet in a browser (for example UJ-02, UJ-03, UJ-10 through the UI) are verified twice: by automated tests of the logic, and by a step in `docs/WALKTHROUGH.md` that Liam performs on the mainnet site at the end. Journeys that cannot be triggered on real tokens (UJ-46, UJ-47) are verified by mock-token tests and recorded as such.

## 10. Change control

A requirement changes only through this sequence: edit the requirement text, add a change-log row in its document with the reason, update affected tests, then update code. The trace checker must pass after each step that touches code. Requirements are never weakened to make a failing test pass without recording why in the change log.

## 11. Release gate

The submission is ready when all of the following hold: CI green; `trace-check --release` clean; coverage 100%; Slither with no unresolved high or medium; testnet evidence file present; mainnet deployment file complete with both verifications; seeded pledges visible; every journey in ACCEPTANCE.md passing except those awaiting the walkthrough; then Liam's walkthrough passed.
