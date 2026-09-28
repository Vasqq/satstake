# Test-first log

LLR-VV-011. For each group: the new tests and their observed failure before the implementing code existed, then the same tests passing. Paths are shown relative to the repository.

## Group: VV trace checker (LLR-VV-002, LLR-VV-009)

### Red, 2026-09-24

Tests written from 06 section 3 and LLR-VV-009 in `test/tools/trace-check.test.mjs` before `tools/trace-check.mjs` existed.

Command: `node --test test/tools/*.test.mjs`

```
    not ok 1 - passes a fully traced repository and writes the matrix
    not ok 2 - passes the release gate when every entry is present
    not ok 3 - fails when an HLR lists no children (condition 1)
    not ok 4 - fails when an HLR lists a child that does not exist (condition 1)
    not ok 5 - fails when an LLR lists no parent (condition 2)
    not ok 6 - fails when a parent does not list the LLR back (condition 2)
    not ok 7 - fails when a referenced LLR with method T has no test (condition 3)
    not ok 8 - fails when a referenced SC, FE, or DP LLR has no source reference (condition 4)
    not ok 9 - does not require code or tests for an unreferenced LLR until release (conditions 3 and 4)
    not ok 10 - fails at release when an I or A LLR has no inspection entry (condition 5)
    not ok 11 - fails at release when a D LLR has no evidence entry (condition 5)
    not ok 12 - fails when code or tests name an ID that does not exist (condition 6)
    not ok 13 - counts a tag in foundry.toml as the source reference of a build setting
    not ok 14 - ignores IDs inside lib and node_modules
not ok 1 - LLR-VV-002 trace checker
    not ok 1 - fails when a journey is missing from ACCEPTANCE.md
    not ok 2 - fails at release when a journey has no passing result
not ok 2 - LLR-VV-009 journey acceptance
# tests 16
# pass 0
# fail 16
```

Failure reason, as predicted (the checker does not exist yet):

```
Error: Cannot find module '<repo>/tools/trace-check.mjs'
output lacks "HLR-002"
```

### Green, 2026-09-24

`tools/trace-check.mjs` written. Same command:

```
    ok 1 - passes a fully traced repository and writes the matrix
    ok 2 - passes the release gate when every entry is present
    ok 3 - fails when an HLR lists no children (condition 1)
    ok 4 - fails when an HLR lists a child that does not exist (condition 1)
    ok 5 - fails when an LLR lists no parent (condition 2)
    ok 6 - fails when a parent does not list the LLR back (condition 2)
    ok 7 - fails when a referenced LLR with method T has no test (condition 3)
    ok 8 - fails when a referenced SC, FE, or DP LLR has no source reference (condition 4)
    ok 9 - does not require code or tests for an unreferenced LLR until release (conditions 3 and 4)
    ok 10 - fails at release when an I or A LLR has no inspection entry (condition 5)
    ok 11 - fails at release when a D LLR has no evidence entry (condition 5)
    ok 12 - fails when code or tests name an ID that does not exist (condition 6)
    ok 13 - counts a tag in foundry.toml as the source reference of a build setting
    ok 14 - ignores IDs inside lib and node_modules
ok 1 - LLR-VV-002 trace checker
    ok 1 - fails when a journey is missing from ACCEPTANCE.md
    ok 2 - fails at release when a journey has no passing result
ok 2 - LLR-VV-009 journey acceptance
# tests 16
# pass 16
# fail 0
```

Against the real repository: `trace-check: OK. 3/112 LLRs referenced, 0/55 journeys passing.`

### Review follow-up, red, 2026-09-25

Independent review of the group found gaps (06 v1.4, LLR-VV-009 v1.4). New and tightened tests written first. Command: `node --test test/tools/trace-check.test.mjs`

```
    not ok 2 - passes the release gate when every entry is present
        not ok 3 - counts an INSPECTIONS.md mention as a reference that starts the check
    not ok 5 - condition 3: tests for method T
        not ok 3 - does not count a helper inside an app test directory as source
        not ok 4 - does not count a .spec file as source
        not ok 6 - counts tags in CI workflows, git hooks, and .gitignore as source
    not ok 6 - condition 4: source references
        not ok 1 - fails when an I LLR has no inspection entry
        not ok 2 - fails when an A LLR has no inspection entry
        not ok 3 - fails when the only inspection row did not pass
        not ok 5 - finds evidence in subdirectories and JSON records
    not ok 7 - condition 5: inspection and evidence at release
        not ok 2 - fails on malformed IDs with the wrong number of digits
    not ok 8 - condition 6: unknown IDs
    not ok 3 - accepts Awaiting walkthrough at release for a journey with a walkthrough step
# tests 32
# pass 21
# fail 11
```

Failure reasons: the checker lacked each new rule, and the new app fixture exposed a defect: `app/src/lib/` was skipped because every directory named `lib` was excluded, not only the top-level Foundry `lib/`.

```
FAIL LLR-FE-001: has method T but no test carries its ID
FAIL LLR-FE-001: has no source reference in code or build configuration
code: 'ERR_TEST_FAILURE'
```

### Review follow-up, green, 2026-09-25

Checker updated for 06 v1.4 and LLR-VV-009 v1.4; nested `lib` directories are now scanned. `node --test test/tools/trace-check.test.mjs`: 32 tests, 32 pass, 0 fail.

The tightened tests for conditions 1, 2, and 5 were written against code that already existed, so their red state was shown by mutation instead: each mutation below was applied to a copy of the checker and the suite was run against it.

| Mutation | Failing tests |
|---|---|
| Remove "lists no child LLR" check | 1 |
| Remove "lists no parent HLR" check | 1 |
| Remove nonexistent-parent check | 1 |
| Remove forward back-link check | 1 |
| Remove reverse back-link check | 1 |
| Ignore method A at release | 1 |
| Classify `e2e/` as source | 1 |
| Stop scanning `app/src` | 6 |
| Skip nested `lib` directories again | 5 |
| Count an inspection row with result Fail | 1 |

## Group: secret protections (LLR-DP-010, LLR-DP-011)

The protections themselves (`.gitignore`, `.githooks/pre-commit`, the CI gitleaks job) had to exist before the first commit at C0, so they predate these tests. Red was therefore shown two ways: one real failure, and mutations of copies of the protected files.

### Red, 2026-09-25

`node --test test/tools/secrets.test.mjs` against the repository as it stood:

```
    not ok 13 - does not ignore project files
      error: '.env.example is ignored'
# tests 16
# pass 15
# fail 1
```

The `.env.*` rule also hid the setup template `.env.example`.

Mutations, each applied to a copy of the protected file. Counts include the one real failure above, except for the empty `.gitignore`, where that test passes because nothing is ignored:

| Mutation | Failing tests |
|---|---|
| Empty `.gitignore` | 12 |
| Pre-commit hook that exits 0 without scanning | 2 |
| gitleaks action pinned by tag instead of commit | 2 |
| CI scan with shallow history (`fetch-depth: 1`) | 2 |

### Green, 2026-09-25

Added `!.env.example` to `.gitignore` and a template `.env.example` with no values. `node --test test/tools/*.test.mjs`: 48 tests, 48 pass, 0 fail.

## Second review follow-up (LLR-VV-002, LLR-DP-010, LLR-DP-011; 06 v1.5)

### Red, 2026-09-25

`node --test test/tools/*.test.mjs`, new failures only:

```
not ok 4 - ignores .env-mainnet
not ok 5 - ignores .env_backup
not ok 6 - ignores .envrc
not ok 12 - ignores satstake-deployer
not ok 13 - ignores deployments/satstake-referee
not ok 20 - ignores docs/._notes.md
not ok 21 - ignores Thumbs.db
not ok 22 - ignores desktop.ini
not ok 1 - has a job that runs gitleaks over git history
not ok 2 - scans the full history, not only the pushed range
not ok 3 - fails the build on a finding
not ok 4 - installs one gitleaks version everywhere, verified by checksum
not ok 3 - counts a .test. file anywhere as a test, whatever its extension
not ok 6 - scans tools/ and lists it in the matrix
# tests 69
# pass 55
# fail 14
```

Reasons: `.gitignore` lacked the wider `.env*` pattern, burner keystore names, and some OS files; CI used gitleaks-action (older gitleaks, pushed range only, unverified download) instead of `gitleaks git`; test files named `.test.sol` were classed as source; `tools/` was not scanned.

### Green, 2026-09-25

`.gitignore` widened (`.env*` with `!.env.example`, burner keystore names, `._*`, `Thumbs.db`, `desktop.ini`); CI secrets job now installs the checksum-verified gitleaks 8.30.1 and runs `gitleaks git --redact --no-banner .` over the full history; the hook adds `--verbose` so a blocked commit names the file and rule, with the secret redacted; the checker scans `tools/` and treats any `.test.` or `.spec.` name as a test. `node --test test/tools/*.test.mjs`: 69 tests, 69 pass, 0 fail.

Mutations that survived the second review, and new ones for the secret protections, each applied to a copy:

| Mutation | Failing tests |
|---|---|
| Stop scanning `e2e/` | 1 |
| Evidence mention no longer a reference | 1 |
| Drop `.jsx` | 1 |
| Drop `__tests__` | 1 |
| Drop `UJ` from the ID shape | 1 |
| Stop scanning `tools/` | 1 |
| Hook without `--redact` (with `--verbose`) | 1 |
| Scan job with `continue-on-error: true` | 1 |
| Scan limited to a commit range | 1 |

## Group: SC build and data (LLR-SC-001, 004, 005, 010, 011)

Tests written from 05 section 1.1 and the requirement rows in `test/SatStake.Build.t.sol`:

| Test | Verifies |
|---|---|
| `test_SC004_errorSelectorsMatchInterface` | LLR-SC-004 |
| `test_SC005_constantsHaveExactValues` | LLR-SC-005 |
| `test_SC005_durationConstantsAreUint64` | LLR-SC-005 |
| `test_SC010_pledgeFieldsEncodeInInterfaceOrder` | LLR-SC-010 |
| `test_SC010_pledgeDecodesFullRangeOfEachField` | LLR-SC-010 |
| `test_SC010_pledgeFieldTypesRejectWiderValues` | LLR-SC-010 |
| `test_SC010_promiseTextIsString` | LLR-SC-010 |
| `test_SC011_statusMembersInInterfaceOrder` | LLR-SC-011 |
| `test_SC011_noneIsTheZeroValue` | LLR-SC-011 |
| `test_SC011_pledgeStateMembersInInterfaceOrder` | LLR-SC-011 |

LLR-SC-001 and LLR-SC-004 are method I; the build setting was already tagged in `foundry.toml`, and the SC-004 test is an extra check of the error signatures against section 1.1.

### Red, 2026-09-25

The first attempt did not reach the missing declarations: the test itself failed to parse, because `promise`, the field and parameter name in 05 section 1.1, is a reserved keyword in Solidity 0.8.28 (`Error (2314): Expected ',' but got reserved keyword 'promise'`). The requirement was fixed first (05 v1.5: `promiseText`), then the tests were updated and run again.

Every test in this group depends only on declarations, so the expected red is a compile error naming the missing SatStake declarations. Command: `forge test`

With no `src/SatStake.sol`:

```
Error (6275): Source "src/SatStake.sol" not found: File not found. Searched the following locations: "<repo>".
 --> test/SatStake.Build.t.sol:5:1:
  |
5 | import {SatStake} from "../src/SatStake.sol";
Error: Compilation failed
```

With an empty `contract SatStake {}`, the first missing declaration, `SatStake.Pledge`, is reported (solc stops at the first unresolved identifier):

```
Error (7920): Identifier not found or not unique.
  --> test/SatStake.Build.t.sol:18:71:
Error: Compilation failed
```

### Green, 2026-09-25

`src/SatStake.sol` declares the enums, struct, constants, events, errors, and an empty constructor from 05 section 1.1. Same command:

```
[PASS] test_SC004_errorSelectorsMatchInterface()
[PASS] test_SC005_constantsHaveExactValues()
[PASS] test_SC005_durationConstantsAreUint64()
[PASS] test_SC010_pledgeDecodesFullRangeOfEachField()
[PASS] test_SC010_pledgeFieldTypesRejectWiderValues()
[PASS] test_SC010_pledgeFieldsEncodeInInterfaceOrder()
[PASS] test_SC010_promiseTextIsString()
[PASS] test_SC011_noneIsTheZeroValue()
[PASS] test_SC011_pledgeStateMembersInInterfaceOrder()
[PASS] test_SC011_statusMembersInInterfaceOrder()
Suite result: ok. 10 passed; 0 failed; 0 skipped
```

Mutations of the implementation, each applied and then reverted:

| Mutation | Result |
|---|---|
| `deadline` declared `uint256` | `test_SC010_pledgeFieldTypesRejectWiderValues` fails |
| `deadline` and `createdAt` swapped | 2 tests fail (encoding order, full-range decode) |
| `referee` declared `uint256` | test does not compile |
| `PledgeState.Kept` and `Broken` swapped | `test_SC011_pledgeStateMembersInInterfaceOrder` fails |
| `MAX_PAGE = 101` | `test_SC005_constantsHaveExactValues` fails |

`node tools/trace-check.mjs`: `trace-check: OK. 9/112 LLRs referenced, 0/55 journeys passing.`

### Review follow-up, red, 2026-09-25

Independent review found that the LLR-SC-005 tests passed against three wrong implementations, because a getter looks the same whether its variable is a constant, an immutable, or in storage, and the standard ABI encoding of a uint64 equals that of a uint256. `test_SC005_durationConstantsAreUint64` was replaced by two tests:

- `test_SC005_gettersReturnInterfaceTypes`: packed encoding keeps each integer's own width (8 bytes for uint64, 32 for uint256).
- `test_SC005_declaredConstantNotStorageOrImmutable`: reads `mutability` and the type string of each declaration from the compiler AST in `out/SatStake.sol/SatStake.json`. `foundry.toml` gains `ast = true` and read access to `./out` for this.

The contract was already correct, so red was shown on a copy with the reviewer's mutations. Command: `forge test`

| Mutation | Observed failure |
|---|---|
| `uint64 public MIN_DURATION = 60;` | `[FAIL: MIN_DURATION: mutable != constant] test_SC005_declaredConstantNotStorageOrImmutable()` |
| `uint256 public immutable MAX_PROMISE_BYTES = 280;` | `[FAIL: MAX_PROMISE_BYTES: immutable != constant] test_SC005_declaredConstantNotStorageOrImmutable()` |
| `uint64 public constant MAX_PAGE = 100;` | `[FAIL: MAX_PAGE: uint64 != uint256] test_SC005_declaredConstantNotStorageOrImmutable()`<br>`[FAIL: assertion failed: 8 != 32] test_SC005_gettersReturnInterfaceTypes()` |

### Review follow-up, green, 2026-09-25

Same command against the unchanged contract: `11 tests passed, 0 failed, 0 skipped (11 total tests)`.

### Mutation evidence per test, 2026-09-25

This is mutation evidence gathered after the declarations existed. Every test in the group depends only on declarations, so the original red run was a single compile error that hid each test's own failure. Each mutation below was applied to a copy of `src/SatStake.sol` and run with the unchanged tests.

| Test | Mutation | Observed failure |
|---|---|---|
| `test_SC004_errorSelectorsMatchInterface` | `error DeadlineTooSoon(uint256 earliest)` | `assertion failed: 0x... != 0x...` |
| `test_SC005_constantsHaveExactValues` | `MAX_PAGE = 101` | `assertion failed: 101 != 100` |
| `test_SC005_gettersReturnInterfaceTypes` | `uint256 public constant MIN_DURATION = 60;` | `assertion failed: 32 != 8` |
| `test_SC005_declaredConstantNotStorageOrImmutable` | `MIN_DURATION` as storage; `MAX_PROMISE_BYTES` as immutable | `mutable != constant`; `immutable != constant` |
| `test_SC010_pledgeFieldsEncodeInInterfaceOrder` | `staker` and `token` swapped | `assertion failed: 0x... != 0x...` |
| `test_SC010_pledgeDecodesFullRangeOfEachField` | `deadline` and `createdAt` swapped | `assertion failed: 18446744073709551614 != 18446744073709551615` |
| `test_SC010_pledgeFieldTypesRejectWiderValues` | `uint256 deadline;` | `next call did not revert as expected` |
| `test_SC010_promiseTextIsString` | `promiseText` moved to the first field | `EvmError: Revert` (decoder rejects the misplaced string) |
| `test_SC011_statusMembersInInterfaceOrder` | `Status.Kept` and `Status.Broken` swapped | `assertion failed: 3 != 2` |
| `test_SC011_noneIsTheZeroValue` | `Status.None` moved last | `assertion failed: 0 != 5` |
| `test_SC011_pledgeStateMembersInInterfaceOrder` | `PledgeState.Kept` and `PledgeState.Broken` swapped | `assertion failed: 3 != 2` |

Mutations that fail at compile time instead: `bytes promiseText` (`Error (9553)`, no implicit conversion from string to bytes), and any field or constant narrower than section 1.1.

## Group: SC allowlist (LLR-SC-013, 014, 054, LLR-VV-007)

Tests written from the requirement rows and 06 sections 4 and 5, before any constructor logic, view body, or mock behaviour existed:

| Test | Verifies |
|---|---|
| `test_SC013_revertsWithZeroTokens` | LLR-SC-013 |
| `test_SC013_acceptsOneToken` | LLR-SC-013 |
| `test_SC013_acceptsFourTokens` | LLR-SC-013 |
| `test_SC013_revertsWithFiveTokens` | LLR-SC-013 |
| `test_SC013_revertsOnZeroAddressAtEachPosition` | LLR-SC-013 |
| `test_SC013_revertsOnZeroAddressEvenWithCode` | LLR-SC-013 |
| `test_SC013_revertsOnAddressWithoutCodeAtEachPosition` | LLR-SC-013 |
| `test_SC013_revertsOnAdjacentDuplicate` | LLR-SC-013 |
| `test_SC013_revertsOnNonAdjacentDuplicate` | LLR-SC-013 |
| `test_SC013_emitsTokenAllowedOncePerTokenInOrder` | LLR-SC-013 |
| `test_SC013_recordsEachTokenAsAllowed` | LLR-SC-013, LLR-SC-054 |
| `test_SC013_revertsUnlessListIsValid` (fuzz, lengths 0 to 6) | LLR-SC-013 |
| `test_SC054_allowedTokensKeepsConstructorOrder` | LLR-SC-054 |
| `test_SC054_isAllowedTokenReportsMembership` | LLR-SC-054 |
| `test_SC054_isAllowedTokenMatchesList` (fuzz) | LLR-SC-054 |
| `test_SC014_everyFunctionLeavesAllowlistUnchanged` (fuzz) | LLR-SC-014 |
| `test_SC014_arbitraryCalldataLeavesAllowlistUnchanged` (fuzz) | LLR-SC-014 |
| `test_VV007_decimalsAreConfigurable` | LLR-VV-007 |
| `test_VV007_blocklistRevertsTransfersFromListedAddress` | LLR-VV-007 |
| `test_VV007_blocklistRevertsTransfersToListedAddress` | LLR-VV-007 |
| `test_VV007_pauseRevertsAllTransfers` | LLR-VV-007 |
| `test_VV007_onlyIssuerControlsBlocklistAndPause` | LLR-VV-007 |
| `test_VV007_feeTokenDeliversAmountLessFee` | LLR-VV-007 |

The SC-014 tests read every selector from the compiled ABI, so functions added by later groups are exercised without editing them. The full ABI-surface test is LLR-SC-061, a later group.

LLR-SC-014 is an absence requirement, so the red below is not its red. In step 2 the SC-014 tests failed because LLR-SC-013 had not recorded the tokens yet, not because a way to change the list existed. Their red for the absence itself is mutations 10 to 12 and 24, each of which adds a setter and is killed.

`test/SatStake.Build.t.sol` changed only in `setUp`: it deployed `SatStake` with an empty token list, which LLR-SC-013 now rejects, so it deploys with one `MockFiatToken`. None of its tests changed.

### Red, 2026-09-25

Observed in two steps. Command: `forge test`

Step 1, tests only, no mocks and no views. The expected compile error names the missing mocks first:

```
Error (6275): Source "test/mocks/MockFiatToken.sol" not found: File not found. Searched the following locations: "<repo>".
Error (6275): Source "test/mocks/MockFeeToken.sol" not found: File not found. Searched the following locations: "<repo>".
Error: Compilation failed
```

With mock stubs (signatures only, no behaviour) the next compile error is the missing view:

```
Error (9582): Member "allowedTokens" not found or not visible after argument-dependent lookup in contract SatStake.
Error: Compilation failed
```

Step 2, so that each test's own failure is visible: `isAllowedToken` and `allowedTokens` declared with the section 1.1 signatures and empty bodies, the constructor still empty, and mocks whose `blocklist`, `unBlocklist`, `pause`, and `unpause` do nothing, whose `decimals` is the ERC-20 default, and which charge no fee. Every new test failed for its predicted reason (counterexample calldata trimmed):

| Test | Observed failure |
|---|---|
| `test_SC013_revertsWithZeroTokens` | `next call did not revert as expected` |
| `test_SC013_acceptsOneToken` | `assertion failed: [] != [0x5615...b72f]` |
| `test_SC013_acceptsFourTokens` | `assertion failed: [] != [0x5615..., 0x2e23..., 0xF628..., 0x5991...]` |
| `test_SC013_revertsWithFiveTokens` | `next call did not revert as expected` |
| `test_SC013_revertsOnZeroAddressAtEachPosition` | `next call did not revert as expected` |
| `test_SC013_revertsOnZeroAddressEvenWithCode` | `next call did not revert as expected` |
| `test_SC013_revertsOnAddressWithoutCodeAtEachPosition` | `next call did not revert as expected` |
| `test_SC013_revertsOnAdjacentDuplicate` | `next call did not revert as expected` |
| `test_SC013_revertsOnNonAdjacentDuplicate` | `next call did not revert as expected` |
| `test_SC013_emitsTokenAllowedOncePerTokenInOrder` | `assertion failed: 0 != 4` |
| `test_SC013_recordsEachTokenAsAllowed` | `assertion failed` |
| `test_SC013_revertsUnlessListIsValid` | `next call did not revert as expected; counterexample: ...` |
| `test_SC054_allowedTokensKeepsConstructorOrder` | `assertion failed: [] != [0x5615..., ...]` |
| `test_SC054_isAllowedTokenReportsMembership` | `assertion failed` |
| `test_SC054_isAllowedTokenMatchesList` | `assertion failed: [] != [...]; counterexample: ...` |
| `test_SC014_everyFunctionLeavesAllowlistUnchanged` | `assertion failed: [] != [...]; counterexample: ...` |
| `test_SC014_arbitraryCalldataLeavesAllowlistUnchanged` | `assertion failed: [] != [...]; counterexample: ...` |
| `test_VV007_decimalsAreConfigurable` | `assertion failed: 18 != 6` |
| `test_VV007_blocklistRevertsTransfersFromListedAddress` | `assertion failed` (`isBlocklisted` still false) |
| `test_VV007_blocklistRevertsTransfersToListedAddress` | `next call did not revert as expected` |
| `test_VV007_pauseRevertsAllTransfers` | `assertion failed` (`paused` still false) |
| `test_VV007_onlyIssuerControlsBlocklistAndPause` | `next call did not revert as expected` |
| `test_VV007_feeTokenDeliversAmountLessFee` | `assertion failed: 1000 != 990` |

```
Encountered a total of 23 failing tests, 11 tests succeeded
```

The 11 passing tests are the unchanged "SC build and data" group.

### Green, 2026-09-25

Constructor validation and recording (LLR-SC-013), the two views (LLR-SC-054), `@custom:trace` on `TokenAllowed`, the constructor, and both views, and LLR-SC-014 on `contract SatStake`. Mocks: `MockFiatToken` checks pause and blocklist in `_update`, so `transfer`, `transferFrom`, and `mint` are all covered; `MockFeeToken` burns `feeBps` of every transfer. Same command:

```
Ran 3 test suites: 34 tests passed, 0 failed, 0 skipped (34 total tests)
```

### Refactor, 2026-09-26

`test_SC014_everyFunctionLeavesAllowlistUnchanged` was strengthened after green: fuzzed arguments alone rarely name a deployed token, so a setter taking an address could survive. Each selector is now also called with every deployed token, the zero address, an address without code, and the fuzzed probe, alone and after an index 0 to 3. Its red for that case is shown by mutations 10 to 12 below.

### Mutation evidence, 2026-09-26

Each mutation was applied to a scratch copy of the repository and run with the unchanged tests (`forge test --no-match-contract Build`). Every mutation is killed.

| # | Mutation | Failing tests |
|---|---|---|
| 0 | Accepts 5 tokens (`> 5`) | `revertsWithFiveTokens` |
| 1 | Accepts an empty list | `revertsWithZeroTokens`, `revertsUnlessListIsValid` |
| 2 | No zero-address check (code check left in place) | `revertsOnZeroAddressEvenWithCode` |
| 3 | No code check | `revertsOnAddressWithoutCodeAtEachPosition`, `revertsUnlessListIsValid` |
| 4 | Duplicate check against the previous entry only | `revertsOnNonAdjacentDuplicate`, `revertsUnlessListIsValid` |
| 5 | No `TokenAllowed` event | `emitsTokenAllowedOncePerTokenInOrder` |
| 6 | `TokenAllowed` emitted twice per token | `emitsTokenAllowedOncePerTokenInOrder` |
| 7 | Token not recorded as allowed | 8 tests across SC-013, 014, 054 |
| 8 | `allowedTokens` returns reversed order | 6 tests, including `allowedTokensKeepsConstructorOrder` |
| 9 | `isAllowedToken` true for any contract | 5 tests, including `isAllowedTokenReportsMembership` |
| 10 | Added `allowToken(address)` that sets membership | `everyFunctionLeavesAllowlistUnchanged` |
| 11 | Added `removeToken(address)` that clears membership | `everyFunctionLeavesAllowlistUnchanged` |
| 12 | Added `replaceToken(uint256,address)` that overwrites a list entry | `everyFunctionLeavesAllowlistUnchanged` |
| 13 | `MockFiatToken` without the sender blocklist check | `blocklistRevertsTransfersFromListedAddress` |
| 14 | `MockFiatToken` without the recipient blocklist check | `blocklistRevertsTransfersToListedAddress` |
| 15 | `MockFiatToken` without the pause check | `pauseRevertsAllTransfers` |
| 16 | `MockFiatToken` lets anyone blocklist or pause | `onlyIssuerControlsBlocklistAndPause` |
| 17 | `MockFiatToken` with fixed 18 decimals | `decimalsAreConfigurable` |
| 18 | `MockFeeToken` charges no fee | `feeTokenDeliversAmountLessFee` |
| 19 | `MockFeeToken` charges a fee on mint | `feeTokenDeliversAmountLessFee` |

### Review follow-up, 2026-09-26 and 2026-09-27

Three findings from the independent review, each fixed after green, so each red is a mutation rather than a failing test against absent code.

| Finding | Fix | Test |
|---|---|---|
| The LLR-SC-014 test called only a fuzzed address, so a setter gated to the deployer would survive | `test_SC014_everyFunctionLeavesAllowlistUnchanged` now repeats every call as `address(this)`, the deployer, as well as the fuzzed caller | the same test |
| `MockFiatToken.approve` succeeded while paused or blocklisted; real FiatToken refuses both | `approve` checks the pause and both parties' blocklist entries | `test_VV007_approveRevertsWhilePaused`, `test_VV007_approveRevertsForBlocklistedOwnerOrSpender` |
| `MockFeeToken` rounded its fee down, so a small transfer paid no fee and arrived whole | the fee is rounded up, so every nonzero transfer pays at least one unit | `test_VV007_feeTokenChargesAtLeastOneUnit` |

The first finding's red is mutation 24 below, and it is load-bearing: with the test restricted to the fuzzed caller alone, that mutation survives (`forge test --no-match-contract Build`: 26 passed, 0 failed). With the deployer added, it is killed.

### Mutation evidence, review follow-up, 2026-09-27

Applied and run as before. Every mutation is killed.

| # | Mutation | Failing tests |
|---|---|---|
| 20 | `MockFiatToken.approve` without the pause check | `approveRevertsWhilePaused` |
| 21 | `MockFiatToken.approve` without the owner blocklist check | `approveRevertsForBlocklistedOwnerOrSpender` |
| 22 | `MockFiatToken.approve` without the spender blocklist check | `approveRevertsForBlocklistedOwnerOrSpender` |
| 23 | `MockFeeToken` fee rounded down instead of up | `feeTokenChargesAtLeastOneUnit` |
| 24 | Added a deployer-only `allowToken(address)` | `everyFunctionLeavesAllowlistUnchanged` |

Final run: `forge fmt --check` clean; `forge test` 37 passed, 0 failed; `forge coverage --report summary`: `src/SatStake.sol | 100.00% (14/14) | 100.00% (18/18) | 100.00% (4/4) | 100.00% (3/3)`; `node tools/trace-check.mjs`: `trace-check: OK. 13/112 LLRs referenced, 0/55 journeys passing.`

## Group: SC create (LLR-SC-003, 010 storage half, 012, 020 to 029, LLR-VV-007 third mock)

Tests written from the requirement rows, the "Creation" order note above LLR-SC-020, and 06
sections 4 and 5, before any `createPledge` body, bookkeeping storage, or hostile-mock behaviour
existed:

| Test | Verifies |
|---|---|
| `test_SC020_createsActivePledgeForTheCaller` | LLR-SC-020 |
| `test_SC020_createdAtIsTheBlockTimestampOfTheCall` | LLR-SC-020 |
| `test_SC010_storedRecordHoldsEveryFieldOfTheInterface` | LLR-SC-010, LLR-SC-020 |
| `test_SC010_storedRecordKeepsEachPledgeApart` | LLR-SC-010 |
| `test_SC010_storedPromiseTextSurvivesEveryLength` | LLR-SC-010 |
| `test_SC012_identifiersStartAtOneAndIncrementByOne` | LLR-SC-012 |
| `test_SC012_noIdentifierIsAssignedBeforeTheFirstPledge` | LLR-SC-012 |
| `test_SC012_aRevertedCreateConsumesNoIdentifier` | LLR-SC-012 |
| `test_SC021_revertsWhenTheTokenIsNotAllowed` | LLR-SC-021 |
| `test_SC022_revertsWhenTheAmountIsZero` | LLR-SC-022 |
| `test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsZero` | LLR-SC-023 |
| `test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsTheContract` | LLR-SC-023 |
| `test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsTheStaker` | LLR-SC-023 |
| `test_SC023_appliesZeroThenContractThenStakerToBothParties` | LLR-SC-023 |
| `test_SC024_revertsWhenTheRefereeIsTheBeneficiary` | LLR-SC-024 |
| `test_SC025_acceptsADeadlineExactlyAtTheMinimum` | LLR-SC-025 |
| `test_SC025_revertsOneSecondBeforeTheMinimum` | LLR-SC-025 |
| `test_SC025_acceptsADeadlineExactlyAtTheMaximum` | LLR-SC-025 |
| `test_SC025_revertsOneSecondAfterTheMaximum` | LLR-SC-025 |
| `test_SC025_boundsMoveWithTheBlockTimestamp` | LLR-SC-025 |
| `test_SC026_revertsWhenThePromiseIsEmpty` | LLR-SC-026 |
| `test_SC026_acceptsAPromiseOfExactly280Bytes` | LLR-SC-026 |
| `test_SC026_revertsForAPromiseOf281Bytes` | LLR-SC-026 |
| `test_SC026_measuresThePromiseInBytesNotCharacters` | LLR-SC-026 |
| `test_SC020_checksRunInTheOrderOfTheRequirements` | LLR-SC-021 to 026 (the order note) |
| `test_SC026_everyCheckRunsBeforeTheTransfer` | LLR-SC-026, LLR-SC-027 |
| `test_SC020_revertsUnlessEveryCheckPasses` (fuzz) | LLR-SC-020 to 026 |
| `test_SC027_movesTheStakeFromTheStakerToTheContract` | LLR-SC-027 |
| `test_SC027_revertsWhenLessThanTheAmountArrives` | LLR-SC-027 |
| `test_SC027_measuresTheContractsOwnBalanceChange` | LLR-SC-027 |
| `test_SC003_revertsWhenTheTokenReportsFailure` | LLR-SC-003 |
| `test_SC003_acceptsATokenThatReturnsNoValue` | LLR-SC-003 |
| `test_SC003_revertsWhenTheTokenReentersCreatePledge` | LLR-SC-003 |
| `test_SC003_allowsANonReentrantCallFromTheToken` | LLR-SC-003 |
| `test_SC028_increasesTotalLockedForThatTokenOnly` | LLR-SC-028 |
| `test_SC028_appendsTheIdentifierToEachPartysIndex` | LLR-SC-028 |
| `test_SC028_indexKeepsCreationOrderPerAccount` | LLR-SC-028 |
| `test_SC029_emitsPledgeCreatedWithTheNewPledgesFields` | LLR-SC-029 |
| `test_SC029_emitsOncePerPledgeWithItsOwnIdentifier` | LLR-SC-029 |
| `test_VV007_hostileTokenReturnsTrueByDefault` | LLR-VV-007 |
| `test_VV007_hostileTokenCanReturnFalseAndMoveNothing` | LLR-VV-007 |
| `test_VV007_hostileTokenCanReturnNoValueAtAll` | LLR-VV-007 |
| `test_VV007_hostileTokenReentersFromTransfer` | LLR-VV-007 |
| `test_VV007_hostileTokenReentersFromTransferFrom` | LLR-VV-007 |
| `test_VV007_hostileTokenBubblesTheReentrantCallsRevert` | LLR-VV-007 |
| `test_VV007_hostileTokenDoesNotReenterUnlessAsked` | LLR-VV-007 |

The views that report the bookkeeping of LLR-SC-028 (`totalLocked`, `pledgeCountOf`,
`pledgeIdsOf`) and the stored record of LLR-SC-010 (`getPledge`) belong to the later "SC views"
group, so these tests read the storage directly with `vm.load`. Each variable's own slot comes
from the compiler's storage layout by name (`extra_output = ["storageLayout"]` in `foundry.toml`),
and the offsets inside a record follow the standard layout of the declarations in 05 section 1.1.
Carry forward: the "SC views" group must verify LLR-SC-028 again through `totalLocked`,
`pledgeCountOf`, and `pledgeIdsOf`, and LLR-SC-010 again through `getPledge`, once those exist.

### Red, 2026-09-27

Observed in two steps. Command: `forge test`

Step 1, tests only. The expected compile error names the missing third mock:

```
Error (6275): Source "test/mocks/MockHostileToken.sol" not found: File not found. Searched the following locations: "<repo>".
 --> test/MockTokens.t.sol:8:1:
 --> test/SatStake.Create.t.sol:10:1:
Error: Compilation failed
```

With a mock stub (signatures only, no behaviour) the next compile error is the missing function:

```
Error (9582): Member "createPledge" not found or not visible after argument-dependent lookup in contract SatStake.
   --> test/SatStake.Create.t.sol:200:14:
Error: Compilation failed
```

Step 2, so that each test's own failure is visible: `createPledge` declared with the section 1.1
signature and an empty body, and the hostile mock still a stub. Every new test failed for the
reason its requirement predicts (fuzz counterexample trimmed):

| Test | Observed failure |
|---|---|
| `test_SC020_createsActivePledgeForTheCaller` | `assertion failed: 0 != 1` |
| `test_SC020_createdAtIsTheBlockTimestampOfTheCall` | `revert: storage variable not found: _pledges` |
| `test_SC010_storedRecordHoldsEveryFieldOfTheInterface` | `revert: storage variable not found: _pledges` |
| `test_SC010_storedRecordKeepsEachPledgeApart` | `revert: storage variable not found: _pledges` |
| `test_SC010_storedPromiseTextSurvivesEveryLength` | `revert: storage variable not found: _pledges` |
| `test_SC012_identifiersStartAtOneAndIncrementByOne` | `assertion failed: 0 != 1` |
| `test_SC012_noIdentifierIsAssignedBeforeTheFirstPledge` | `revert: storage variable not found: _pledges` |
| `test_SC012_aRevertedCreateConsumesNoIdentifier` | `assertion failed: 0 != 1` |
| `test_SC021_revertsWhenTheTokenIsNotAllowed` | `next call did not revert as expected` |
| `test_SC022_revertsWhenTheAmountIsZero` | `next call did not revert as expected` |
| `test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsZero` | `next call did not revert as expected` |
| `test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsTheContract` | `next call did not revert as expected` |
| `test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsTheStaker` | `next call did not revert as expected` |
| `test_SC023_appliesZeroThenContractThenStakerToBothParties` | `next call did not revert as expected` |
| `test_SC024_revertsWhenTheRefereeIsTheBeneficiary` | `next call did not revert as expected` |
| `test_SC025_acceptsADeadlineExactlyAtTheMinimum` | `revert: storage variable not found: _pledges` |
| `test_SC025_revertsOneSecondBeforeTheMinimum` | `next call did not revert as expected` |
| `test_SC025_acceptsADeadlineExactlyAtTheMaximum` | `revert: storage variable not found: _pledges` |
| `test_SC025_revertsOneSecondAfterTheMaximum` | `next call did not revert as expected` |
| `test_SC025_boundsMoveWithTheBlockTimestamp` | `next call did not revert as expected` |
| `test_SC026_revertsWhenThePromiseIsEmpty` | `next call did not revert as expected` |
| `test_SC026_acceptsAPromiseOfExactly280Bytes` | `revert: storage variable not found: _pledges` |
| `test_SC026_revertsForAPromiseOf281Bytes` | `next call did not revert as expected` |
| `test_SC026_measuresThePromiseInBytesNotCharacters` | `next call did not revert as expected` |
| `test_SC020_checksRunInTheOrderOfTheRequirements` | `next call did not revert as expected` |
| `test_SC026_everyCheckRunsBeforeTheTransfer` | `next call did not revert as expected` |
| `test_SC020_revertsUnlessEveryCheckPasses` | `next call did not revert as expected; counterexample: ...` |
| `test_SC027_movesTheStakeFromTheStakerToTheContract` | `assertion failed: 1000000000000000000000000 != 999999999999999999999000` |
| `test_SC027_revertsWhenLessThanTheAmountArrives` | `next call did not revert as expected` |
| `test_SC027_measuresTheContractsOwnBalanceChange` | `revert: storage variable not found: _pledges` |
| `test_SC003_revertsWhenTheTokenReportsFailure` | `next call did not revert as expected` |
| `test_SC003_acceptsATokenThatReturnsNoValue` | `assertion failed: 0 != 1` |
| `test_SC003_revertsWhenTheTokenReentersCreatePledge` | `next call did not revert as expected` |
| `test_SC003_allowsANonReentrantCallFromTheToken` | `assertion failed: 0 != 1` |
| `test_SC028_increasesTotalLockedForThatTokenOnly` | `revert: storage variable not found: _pledges` |
| `test_SC028_appendsTheIdentifierToEachPartysIndex` | `revert: storage variable not found: _pledges` |
| `test_SC028_indexKeepsCreationOrderPerAccount` | `revert: storage variable not found: _pledges` |
| `test_SC029_emitsPledgeCreatedWithTheNewPledgesFields` | `assertion failed: 0 != 1` |
| `test_SC029_emitsOncePerPledgeWithItsOwnIdentifier` | `log != expected log` |
| `test_VV007_hostileTokenReturnsTrueByDefault` | `assertion failed` |
| `test_VV007_hostileTokenCanReturnFalseAndMoveNothing` | `assertion failed: 0 != 1000` |
| `test_VV007_hostileTokenCanReturnNoValueAtAll` | `assertion failed: 32 != 0` |
| `test_VV007_hostileTokenReentersFromTransfer` | `assertion failed: 0 != 1` |
| `test_VV007_hostileTokenReentersFromTransferFrom` | `assertion failed: 0 != 1` |
| `test_VV007_hostileTokenBubblesTheReentrantCallsRevert` | `next call did not revert as expected` |
| `test_VV007_hostileTokenDoesNotReenterUnlessAsked` | `assertion failed: 0 != 200` |

```
Ran 4 test suites: 37 tests passed, 46 failed, 0 skipped (83 total tests)
```

The 37 passing tests are the unchanged earlier groups. A test that reads any bookkeeping slot
fails on `_pledges`, the first name it resolves, because the helper resolves all three at once.

### Green, 2026-09-27

`createPledge` with the six checks in the requirement order, the safe transfer and its
received-amount check, the pledge record, the identifier counter, the per-token locked total, the
three index appends, and the event; `@custom:trace` on the function and on `PledgeCreated`;
`ReentrancyGuard` and `SafeERC20` from the pinned OpenZeppelin submodule. `MockHostileToken`
gained its three return modes, its one-shot callback, and the bubbling of the callback's revert.
Same command:

```
Ran 4 test suites: 83 tests passed, 0 failed, 0 skipped (83 total tests)
```

Two changes belong to this step rather than to the requirements. `foundry.toml` gained
`extra_output = ["storageLayout"]`, so the tests can find a private variable's slot by name; it
adds compiler output only and changes no bytecode. And six tests failed at first against a correct
contract because the test helper assumed each `Pledge` field had its own slot: the declaration in
05 section 1.1 packs `beneficiary` with `deadline` and `createdAt` with `status`. The helper, not
the contract, was wrong, and the corrected offsets are what pins the layout.

### Refactor, 2026-09-27

The transfer and its received-amount check moved into a private `_receiveStake`, because
`createPledge` ran out of stack with them inline. `forge fmt` applied.

Coverage of the new mock was 94.59% of statements, the two paths that refuse a transfer beyond the
sender's balance or the caller's approval, so `test_VV007_hostileTokenRefusesATransferItCannotCover`
was added after green and the suite became 84 tests. Its red is mutations 73 and 74.

A later group owes two checks. The views that report the bookkeeping of LLR-SC-028 and the record
of LLR-SC-010 do not exist yet, so "SC views" must verify LLR-SC-028 again through `totalLocked`,
`pledgeCountOf`, and `pledgeIdsOf`, and LLR-SC-010 again through `getPledge`.

### Mutation evidence, 2026-09-27

Each mutation removes or weakens exactly one check, one stored field, one bookkeeping write, or
one piece of mock behaviour. Each was applied to a scratch copy of the repository and run with the
unchanged tests (`forge test --no-match-contract Allowlist`, the allowlist group being untouched
by this work). Every mutation is killed; the first three killing tests are named, with the `test_`
prefix and the scope number trimmed.

| # | Mutation | Failing tests |
|---|---|---|
| 25 | `createPledge` without `nonReentrant` | `revertsWhenTheTokenReentersCreatePledge` |
| 26 | raw `transferFrom` instead of `safeTransferFrom` | `acceptsATokenThatReturnsNoValue`, `revertsWhenTheTokenReportsFailure` |
| 27 | no allowlist check | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, `revertsWhenTheTokenIsNotAllowed` |
| 28 | no zero-amount check | `aRevertedCreateConsumesNoIdentifier`, `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, and 1 more |
| 29 | zero-address check on the referee only | `revertsUnlessEveryCheckPasses`, `appliesZeroThenContractThenStakerToBothParties`, `revertsWhenTheRefereeOrTheBeneficiaryIsZero` |
| 30 | zero-address check on the beneficiary only | `revertsUnlessEveryCheckPasses`, `appliesZeroThenContractThenStakerToBothParties`, `revertsWhenTheRefereeOrTheBeneficiaryIsZero` |
| 31 | no `PartyIsContract` check | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, `appliesZeroThenContractThenStakerToBothParties`, and 1 more |
| 32 | `PartyIsContract` check on the referee only | `revertsUnlessEveryCheckPasses`, `appliesZeroThenContractThenStakerToBothParties`, `revertsWhenTheRefereeOrTheBeneficiaryIsTheContract` |
| 33 | no `PartyIsStaker` check | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, `revertsWhenTheRefereeOrTheBeneficiaryIsTheStaker` |
| 34 | `PartyIsStaker` check on the beneficiary only | `revertsUnlessEveryCheckPasses`, `revertsWhenTheRefereeOrTheBeneficiaryIsTheStaker` |
| 35 | no `RefereeIsBeneficiary` check | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, `revertsWhenTheRefereeIsTheBeneficiary` |
| 36 | no `DeadlineTooSoon` check | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, `boundsMoveWithTheBlockTimestamp`, and 1 more |
| 37 | `DeadlineTooSoon` at the minimum itself (`<=`) | `revertsUnlessEveryCheckPasses`, `acceptsADeadlineExactlyAtTheMinimum`, `boundsMoveWithTheBlockTimestamp` |
| 38 | no `DeadlineTooFar` check | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, `boundsMoveWithTheBlockTimestamp`, and 1 more |
| 39 | `DeadlineTooFar` at the maximum itself (`>=`) | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses`, `acceptsADeadlineExactlyAtTheMaximum`, and 1 more |
| 40 | `MAX_DURATION` bound measured from zero, not from now | `acceptsATokenThatReturnsNoValue`, `allowsANonReentrantCallFromTheToken`, `revertsWhenTheTokenReentersCreatePledge`, and 30 more |
| 41 | no `PromiseEmpty` check | `checksRunInTheOrderOfTheRequirements`, `everyCheckRunsBeforeTheTransfer`, `revertsWhenThePromiseIsEmpty` |
| 42 | no `PromiseTooLong` check | `checksRunInTheOrderOfTheRequirements`, `measuresThePromiseInBytesNotCharacters`, `revertsForAPromiseOf281Bytes` |
| 43 | `PromiseTooLong` at 280 bytes itself (`>=`) | `storedPromiseTextSurvivesEveryLength`, `acceptsAPromiseOfExactly280Bytes`, `measuresThePromiseInBytesNotCharacters` |
| 44 | no received-amount check | `revertsWhenLessThanTheAmountArrives` |
| 45 | received amount taken from the argument, not the balance change | `revertsWhenLessThanTheAmountArrives` |
| 46 | checks run after the transfer | `acceptsATokenThatReturnsNoValue`, `revertsWhenTheTokenIsNotAllowed`, `everyCheckRunsBeforeTheTransfer`, and 2 more |
| 47 | zero-amount check before the allowlist check | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses` |
| 48 | `PartyIsStaker` checked before `ZeroAddress` | `revertsUnlessEveryCheckPasses`, `appliesZeroThenContractThenStakerToBothParties` |
| 49 | `PartyIsStaker` checked before `PartyIsContract` | `revertsUnlessEveryCheckPasses`, `appliesZeroThenContractThenStakerToBothParties` |
| 50 | `RefereeIsBeneficiary` checked before `ZeroAddress` | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses` |
| 51 | promise checks before the deadline checks | `checksRunInTheOrderOfTheRequirements`, `revertsUnlessEveryCheckPasses` |
| 52 | identifiers start at 0 | `acceptsATokenThatReturnsNoValue`, `allowsANonReentrantCallFromTheToken`, `aRevertedCreateConsumesNoIdentifier`, and 5 more |
| 53 | every pledge takes identifier 1 | `storedRecordKeepsEachPledgeApart`, `aRevertedCreateConsumesNoIdentifier`, `identifiersStartAtOneAndIncrementByOne`, and 1 more |
| 54 | `staker` stored as the referee | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart`, `identifiersStartAtOneAndIncrementByOne`, and 1 more |
| 55 | `token` not stored | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart` |
| 56 | `amount` not stored | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart`, `measuresTheContractsOwnBalanceChange` |
| 57 | `referee` and `beneficiary` stored the other way round | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart` |
| 58 | `deadline` stored as `createdAt` | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart`, `acceptsADeadlineExactlyAtTheMaximum`, and 1 more |
| 59 | `createdAt` stored as the deadline | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart`, `createdAtIsTheBlockTimestampOfTheCall`, and 1 more |
| 60 | status left at `None` | `storedRecordHoldsEveryFieldOfTheInterface`, `createsActivePledgeForTheCaller` |
| 61 | `promiseText` not stored | `storedPromiseTextSurvivesEveryLength`, `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart`, and 1 more |
| 62 | `totalLocked` not increased | `increasesTotalLockedForThatTokenOnly` |
| 63 | `totalLocked` set to the amount instead of increased | `increasesTotalLockedForThatTokenOnly` |
| 64 | identifier not appended to the staker's index | `appendsTheIdentifierToEachPartysIndex`, `indexKeepsCreationOrderPerAccount` |
| 65 | identifier not appended to the referee's index | `appendsTheIdentifierToEachPartysIndex`, `indexKeepsCreationOrderPerAccount` |
| 66 | identifier not appended to the beneficiary's index | `appendsTheIdentifierToEachPartysIndex` |
| 67 | no `PledgeCreated` event | `emitsOncePerPledgeWithItsOwnIdentifier`, `emitsPledgeCreatedWithTheNewPledgesFields` |
| 68 | `PledgeCreated` with referee and beneficiary swapped | `emitsOncePerPledgeWithItsOwnIdentifier`, `emitsPledgeCreatedWithTheNewPledgesFields` |
| 69 | `MockHostileToken` always returns true | `revertsWhenTheTokenReportsFailure`, `hostileTokenCanReturnFalseAndMoveNothing` |
| 70 | `MockHostileToken` never calls back | `allowsANonReentrantCallFromTheToken`, `revertsWhenTheTokenReentersCreatePledge`, `hostileTokenBubblesTheReentrantCallsRevert`, and 2 more |
| 71 | `MockHostileToken` swallows the reentrant call's revert | `revertsWhenTheTokenReentersCreatePledge`, `hostileTokenBubblesTheReentrantCallsRevert` |
| 72 | `MockHostileToken` moves balances even when it returns false | `hostileTokenCanReturnFalseAndMoveNothing` |
| 73 | `MockHostileToken` without its balance check | `hostileTokenRefusesATransferItCannotCover` |
| 74 | `MockHostileToken` without its allowance check | `hostileTokenRefusesATransferItCannotCover` |

Mutation 40 shows why the `MAX_DURATION` bound is measured from `block.timestamp`: a bound that
ignores the current time rejects every realistic deadline, and 33 tests say so.

Final run: `forge fmt --check` clean; `forge test` 84 passed, 0 failed; `forge coverage --report
summary`: `src/SatStake.sol | 100.00% (50/50) | 100.00% (74/74) | 100.00% (15/15) | 100.00% (5/5)`;
`node tools/trace-check.mjs`: `trace-check: OK. 25/112 LLRs referenced, 0/55 journeys passing.`

### Requirement follow-up, 2026-09-27

Two of the three defects reported at the end of the group were resolved in the requirements after
the mutation run above, so their work follows it here rather than in the earlier steps.

**LLR-SC-020 (05 v1.8) now names the six fields taken from the arguments**, which were until then
an inference from LLR-SC-010. Each of the six assignments gained its `// LLR-SC-020` comment, and
`test_SC010_storedRecordKeepsEachPledgeApart` and `test_SC010_storedPromiseTextSurvivesEveryLength`
now carry `LLR-SC-020` beside `LLR-SC-010`. No behaviour changed, so the red for the six fields is
mutations 75 to 78, each one a value a weak test would not notice.

**LLR-SC-027 was violated when the contract's balance fell.** The requirement calls for
`UnexpectedTransferAmount(amount, received)` whenever the balance "did not increase by exactly
`amount`", and a decrease is such a case, but the plain subtraction panicked instead. `received` is
now a saturating difference, zero when the balance did not rise. `MockHostileToken` gained
`setDrain(account)`, which takes an account's whole balance for the token during the next transfer,
so the case can be reached at all.

Red, with the mock able to drain but the contract unchanged. Command:
`forge test --no-match-contract Allowlist`

```
[FAIL: Error != expected error: panic: arithmetic underflow or overflow (0x11) != UnexpectedTransferAmount(500, 0)] test_SC027_revertsWhenTheContractsBalanceFalls()
Ran 3 test suites: 68 tests passed, 1 failed, 0 skipped (69 total tests)
```

The setup is a real earlier pledge of 1000, so the balance the token takes is a stake the contract
already held, not a mint. `test_VV007_hostileTokenCanTakeAnAccountsBalanceDuringATransfer` covers
the mock's own new behaviour.

Green: `forge test` 86 passed, 0 failed, 0 skipped.

| # | Mutation | Failing tests |
|---|---|---|
| 75 | `amount` stored as a fixed number | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart` |
| 76 | `referee` and `beneficiary` swapped on the way into the record | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart` |
| 77 | `deadline` stored as `createdAt` | `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart`, `acceptsADeadlineExactlyAtTheMaximum`, and 1 more |
| 78 | `promiseText` not stored | `storedPromiseTextSurvivesEveryLength`, `storedRecordHoldsEveryFieldOfTheInterface`, `storedRecordKeepsEachPledgeApart`, and 1 more |
| 79 | plain subtraction instead of the saturating one | `revertsWhenTheContractsBalanceFalls` |
| 80 | `received` saturates to the amount instead of to zero | `revertsWhenLessThanTheAmountArrives`, `revertsWhenTheContractsBalanceFalls` |
| 81 | `MockHostileToken` never takes a balance | `revertsWhenTheContractsBalanceFalls`, `hostileTokenCanTakeAnAccountsBalanceDuringATransfer` |

Mutations 76 to 78 repeat 57, 58, and 61, which were run when those fields answered to LLR-SC-010
alone; they are rerun here because LLR-SC-020 now requires the same values directly. Every
mutation is killed.

Run after the follow-up: `forge fmt --check` clean; `forge test` 86 passed, 0 failed; `forge
coverage --report summary`: `src/SatStake.sol | 100.00% (51/51) | 100.00% (75/75) | 100.00%
(15/15) | 100.00% (5/5)`; `node tools/trace-check.mjs`: `trace-check: OK. 25/112 LLRs referenced,
0/55 journeys passing.`

### Review follow-up, 2026-09-27

The independent review of the group found two tests that did not prove what they claimed. The
contract was already correct in both cases; the evidence was not.

**A surviving mutant: the transfer could be placed between the two LLR-SC-026 checks.**
`test_SC026_everyCheckRunsBeforeTheTransfer` used only the empty-promise case, and the 281-byte
test used a funded staker, so nothing covered the gap between the two. With `_receiveStake` moved
to sit between them the whole suite passed. The observably wrong behaviour is that a staker who
cannot pay, submitting a 281-byte promise, receives the token's error rather than
`PromiseTooLong(281)`. The test now repeats its unfunded caller with a 281-byte promise, which is
the last check of all, so a transfer placed anywhere before it is caught. Mutation 82.

**The reentrancy test killed its mutant through error data rather than through the attack.**
With `nonReentrant` removed, `test_SC003_revertsWhenTheTokenReentersCreatePledge` failed with
`ERC20InsufficientAllowance`, because the hostile token held no USDC and had approved nothing, so
the reentrant call would have failed with or without the guard. The token is now funded and
approved, and the test asserts both before acting, so without the guard the reentrant call really
does create a second pledge. Mutation 83, with the failure that shows the difference:

```
[FAIL: next call did not revert as expected] test_SC003_revertsWhenTheTokenReentersCreatePledge()
```

| # | Mutation | Failing tests |
|---|---|---|
| 82 | `_receiveStake` moved between the two LLR-SC-026 checks | `everyCheckRunsBeforeTheTransfer` |
| 83 | `nonReentrant` removed from `createPledge` | `revertsWhenTheTokenReentersCreatePledge` |

Two labels corrected in this log and one test renamed:

- `test_VV007_hostileTokenCanTakeAnAccountsBalanceDuringATransfer` had no observed red of its own:
  the follow-up red run above shows 68 passed and 1 failed, so the drain behaviour already existed
  when that test first ran. Its red is mutation 81.
- `test_SC012_aRevertedCreateConsumesNoIdentifier` asserts a property of the EVM rather than of
  this contract: no implementation here could consume an identifier on revert, since there is no
  `try`/`catch` and reentrancy is blocked. It is kept because it kills mutations 28, 52, and 53,
  which is what it actually pins; it is not evidence for the sentence of LLR-SC-012 it cites.
- `test_SC020_checksRunInTheOrderOfTheRequirements` is renamed `test_SC021_...`, so its name and
  its `@custom:verifies` tag, which lists LLR-SC-021 to LLR-SC-026, agree.

Carry-forward for later groups, beyond LLR-SC-028 and LLR-SC-010 above: **LLR-SC-003 is now
referenced, so the trace checker is satisfied for it from here on**, although it also requires
`nonReentrant` on `markKept`, `markBroken`, and `settle`, and `safeTransfer` in `settle`, none of
which exist yet. The verdict and settle groups must add those and their tests without any tooling
prompt, and the LLR-SC-003 inspection row is scoped to `createPledge` until they do.

Run after this follow-up: `forge fmt --check` clean; `forge test` 86 passed, 0 failed; `forge
coverage --report summary`: `src/SatStake.sol | 100.00% (51/51) | 100.00% (75/75) | 100.00%
(15/15) | 100.00% (5/5)`; `node tools/trace-check.mjs`: `trace-check: OK. 25/112 LLRs referenced,
0/55 journeys passing.`

## Group: SC verdict (LLR-SC-030 to 033, LLR-SC-003 for `markKept` and `markBroken`)

Tests written from the four requirement rows, the "Verdict" order note above LLR-SC-030, the state
machine in 05 section 1.2, the `LLR-SC-003` sentence that names `markKept` and `markBroken`, and 06
section 4, before either function had a body. Every rule is exercised against both functions: the
helper `_verdict(caller, id, kept)` calls `markKept` when `kept` and `markBroken` otherwise, and
`_expectOnBoth` repeats a revert expectation for each of them.

| Test | Verifies |
|---|---|
| `test_SC033_markKeptSetsTheStatusToKeptAndEmitsTheVerdict` | LLR-SC-033 |
| `test_SC033_markBrokenSetsTheStatusToBrokenAndEmitsTheVerdict` | LLR-SC-033 |
| `test_SC033_theVerdictReachesOnlyTheNamedPledge` | LLR-SC-033 |
| `test_SC033_emitsVerdictRecordedOnceWithTheIdentifierIndexed` | LLR-SC-033 |
| `test_SC030_revertsWithPledgeNotFoundForAnIdentifierNeverAssigned` | LLR-SC-030 |
| `test_SC030_revertsWithNotRefereeForEveryOtherCaller` | LLR-SC-030 |
| `test_SC030_theRefereeOfOnePledgeMayNotJudgeAnother` | LLR-SC-030 |
| `test_SC031_revertsWithNotActiveForEveryOtherStatus` | LLR-SC-031 |
| `test_SC032_acceptsAVerdictOneSecondBeforeTheDeadline` | LLR-SC-032 |
| `test_SC032_revertsAtTheDeadline` | LLR-SC-032 |
| `test_SC032_revertsAfterTheDeadline` | LLR-SC-032 |
| `test_SC032_theWindowClosesAtTheDeadlineAndNotBeforeIt` (fuzz) | LLR-SC-032 |
| `test_SC030_checksRunInTheOrderOfTheRequirements` | LLR-SC-030, LLR-SC-031, LLR-SC-032 |
| `test_SC003_revertsWhenTheTokenReentersMarkKept` | LLR-SC-003 |
| `test_SC003_revertsWhenTheTokenReentersMarkBroken` | LLR-SC-003 |

The two boundaries 06 section 4 names for this group, a verdict at `deadline - 1` and at
`deadline`, are the first two LLR-SC-032 tests by name; the fuzz test walks a minute either side of
the deadline, so the boundary second itself is reached repeatedly.

`test_SC031_revertsWithNotActiveForEveryOtherStatus` covers all four non-`Active` statuses of 05
section 1.1. `Kept` and `Broken` are reached by recording a real verdict. `SettledToStaker` and
`SettledToBeneficiary` cannot be reached at all until `settle` exists, so the test writes them into
the stored record with `vm.store` through `_setStoredStatus`, rather than adding a path to the
contract that no requirement asks for. The "SC settle" group can reach them through `settle`.

### Refactor before the red run, 2026-09-27

The storage reader the create tests use (`_loadSlots`, `_slotOf`, `_word`, `_mappingSlot`,
`_storedPledge`, `_storedString`, `_storedTotalLocked`, `_storedPledgeIds`), the funding helper,
the four party addresses, and the `IMintableToken` interface moved unchanged from
`test/SatStake.Create.t.sol` into `test/base/SatStakeTestBase.sol`, which both test contracts now
extend. Knowledge of the storage layout of 05 section 1.1 now sits in one file instead of two.
`_setStoredStatus` is the one addition, for the paragraph above. `forge test` stayed at 86 passed,
0 failed across the move.

### Red, 2026-09-27

Observed in two steps, as in the previous group. Command: `forge test`

Step 1, tests only. The expected compile error names the missing function:

```
Compiler run failed:
Error (9582): Member "markKept" not found or not visible after argument-dependent lookup in contract SatStake.
  --> test/SatStake.Verdict.t.sol:56:13:
   |
56 |             satStake.markKept(id);
   |             ^^^^^^^^^^^^^^^^^

Error: Compilation failed
```

Step 2, so that each test's own failure is visible: `markKept(uint256)` and `markBroken(uint256)`
declared with the section 1.1 signatures and empty bodies, no guard and no checks. Every new test
failed for the reason its requirement predicts (fuzz counterexample trimmed):

| Test | Observed failure |
|---|---|
| `test_SC033_markKeptSetsTheStatusToKeptAndEmitsTheVerdict` | `log != expected log` |
| `test_SC033_markBrokenSetsTheStatusToBrokenAndEmitsTheVerdict` | `log != expected log` |
| `test_SC033_theVerdictReachesOnlyTheNamedPledge` | `assertion failed: 1 != 2` |
| `test_SC033_emitsVerdictRecordedOnceWithTheIdentifierIndexed` | `assertion failed: 0 != 1` |
| `test_SC030_revertsWithPledgeNotFoundForAnIdentifierNeverAssigned` | `next call did not revert as expected` |
| `test_SC030_revertsWithNotRefereeForEveryOtherCaller` | `next call did not revert as expected` |
| `test_SC030_theRefereeOfOnePledgeMayNotJudgeAnother` | `next call did not revert as expected` |
| `test_SC031_revertsWithNotActiveForEveryOtherStatus` | `assertion failed: 1 != 2` |
| `test_SC032_acceptsAVerdictOneSecondBeforeTheDeadline` | `assertion failed: 1 != 2` |
| `test_SC032_revertsAtTheDeadline` | `next call did not revert as expected` |
| `test_SC032_revertsAfterTheDeadline` | `next call did not revert as expected` |
| `test_SC032_theWindowClosesAtTheDeadlineAndNotBeforeIt` | `next call did not revert as expected; counterexample: ...` |
| `test_SC030_checksRunInTheOrderOfTheRequirements` | `next call did not revert as expected` |
| `test_SC003_revertsWhenTheTokenReentersMarkKept` | `next call did not revert as expected` |
| `test_SC003_revertsWhenTheTokenReentersMarkBroken` | `next call did not revert as expected` |

```
Encountered a total of 15 failing tests, 86 tests succeeded
```

`1 != 2` is a status left `Active` (1) where the requirement asks for `Kept` (2), and the two
LLR-SC-003 tests fail with `next call did not revert as expected` because an unguarded verdict
recorded from inside `createPledge` goes through, which is the behaviour the guard exists to stop.

### Green, 2026-09-27

`markKept` and `markBroken`, each `nonReentrant` and each a single call into a private
`_recordVerdict(id, kept)` that holds the four checks in the order of LLR-SC-030 to LLR-SC-032 and
then writes the status and emits the event; `@custom:trace` on both functions and on
`VerdictRecorded`, which had none. Same command:

```
Ran 5 test suites: 101 tests passed, 0 failed, 0 skipped (101 total tests)
```

The two verdicts share one body because they differ only in the status stored and the flag
reported, so no check can drift between them. 06 section 2 shows the checks inline in `markKept`;
the shared private function keeps that order in one place, and the `@custom:trace` tags stay on the
external functions where LLR-SC-080 puts them.

### Refactor, 2026-09-27

No structure changed after green. `forge fmt` applied.

### Mutation evidence, 2026-09-27

Each mutation removes or weakens exactly one check, one stored value, one event, or one ordering.
Each was applied to a copy of the repository outside it and run with the unchanged tests
(`forge test`, the whole suite). Every mutation is killed; the killing tests are named with the
`test_` prefix and the scope number trimmed.

| # | Mutation | Failing tests |
|---|---|---|
| 84 | `markKept` without `nonReentrant` | `revertsWhenTheTokenReentersMarkKept` |
| 85 | `markBroken` without `nonReentrant` | `revertsWhenTheTokenReentersMarkBroken` |
| 86 | no `PledgeNotFound` check | `checksRunInTheOrderOfTheRequirements`, `revertsWithPledgeNotFoundForAnIdentifierNeverAssigned` |
| 87 | `PledgeNotFound` reports a fixed identifier | `checksRunInTheOrderOfTheRequirements`, `revertsWithPledgeNotFoundForAnIdentifierNeverAssigned` |
| 88 | no `NotReferee` check | `checksRunInTheOrderOfTheRequirements`, `revertsWithNotRefereeForEveryOtherCaller`, `theRefereeOfOnePledgeMayNotJudgeAnother` |
| 89 | `NotReferee` lets the staker judge as well | `revertsWithNotRefereeForEveryOtherCaller` |
| 90 | no `NotActive` check | `checksRunInTheOrderOfTheRequirements`, `revertsWithNotActiveForEveryOtherStatus` |
| 91 | `NotActive` reports a fixed status | `revertsWithNotActiveForEveryOtherStatus` |
| 92 | `NotActive` refuses a judged pledge but not a settled one | `revertsWithNotActiveForEveryOtherStatus` |
| 93 | no `VerdictWindowClosed` check | `checksRunInTheOrderOfTheRequirements`, `revertsAfterTheDeadline`, `revertsAtTheDeadline`, and 1 more |
| 94 | `VerdictWindowClosed` one second late (`>`) | `revertsAtTheDeadline`, `theWindowClosesAtTheDeadlineAndNotBeforeIt` |
| 95 | `VerdictWindowClosed` reports zero instead of the deadline | `checksRunInTheOrderOfTheRequirements`, `revertsAfterTheDeadline`, `revertsAtTheDeadline`, and 1 more |
| 96 | `NotReferee` checked before `PledgeNotFound` | `checksRunInTheOrderOfTheRequirements`, `revertsWithPledgeNotFoundForAnIdentifierNeverAssigned` |
| 97 | `NotActive` checked before `NotReferee` | `checksRunInTheOrderOfTheRequirements` |
| 98 | `VerdictWindowClosed` checked before `NotActive` | `checksRunInTheOrderOfTheRequirements` |
| 99 | the status is not written | `revertsWhenTheTokenReentersMarkBroken`, `revertsWhenTheTokenReentersMarkKept`, `checksRunInTheOrderOfTheRequirements`, and 8 more |
| 100 | the verdict is stored the other way round | `revertsWhenTheTokenReentersMarkBroken`, `revertsWhenTheTokenReentersMarkKept`, `checksRunInTheOrderOfTheRequirements`, and 8 more |
| 101 | the verdict is written to pledge 1 whatever the identifier | `checksRunInTheOrderOfTheRequirements`, `theRefereeOfOnePledgeMayNotJudgeAnother`, `revertsWithNotActiveForEveryOtherStatus`, and 2 more |
| 102 | no `VerdictRecorded` event | `emitsVerdictRecordedOnceWithTheIdentifierIndexed`, `markBrokenSetsTheStatusToBrokenAndEmitsTheVerdict`, `markKeptSetsTheStatusToKeptAndEmitsTheVerdict` |
| 103 | `VerdictRecorded` always reports a kept promise | `emitsVerdictRecordedOnceWithTheIdentifierIndexed`, `markBrokenSetsTheStatusToBrokenAndEmitsTheVerdict` |

Mutation 92 is why the two settled statuses are written with `vm.store`: a `NotActive` check that
looks only for `Kept` and `Broken` passes every other test in the suite.

Mutations 84 and 85 are the ones the guard exists for, so their failure is the one that matters:

```
[FAIL: next call did not revert as expected] test_SC003_revertsWhenTheTokenReentersMarkBroken()
[FAIL: next call did not revert as expected] test_SC003_revertsWhenTheTokenReentersMarkKept()
```

The reentrant call is a valid verdict but for the guard: the hostile token is the referee of an
Active pledge whose deadline is still ahead, and the test asserts all three before acting. With the
guard gone, the call does not merely fail differently, it succeeds. A probe on the mutant, with the
expectation removed and an assertion put in its place, confirmed it:

```
[FAIL: revert: probe: the unguarded reentrant verdict was recorded] test_SC003_revertsWhenTheTokenReentersMarkKept()
```

The probe reached its own `revert` only after asserting that the pledge stood at `Kept` and that
the token had called back exactly once, in the middle of another account's `createPledge`. Each
guarded test then finishes by making the same call from the same account outside any SatStake call
and seeing it recorded, so the refusal above is the guard's doing and not a malformed call.

Run after this group: `forge fmt --check` clean; `forge test` 101 passed, 0 failed; `forge coverage
--report summary`: `src/SatStake.sol | 100.00% (63/63) | 100.00% (88/88) | 100.00% (19/19) |
100.00% (8/8)`; `node tools/trace-check.mjs`: `trace-check: OK. 29/112 LLRs referenced, 0/55
journeys passing.`

Carry-forward: LLR-SC-003 still owes `settle`, both its `nonReentrant` and its `safeTransfer`, and
the inspection row for LLR-SC-003 now covers `createPledge`, `markKept`, and `markBroken` but not
`settle`. The "SC views" group still owes the two re-verifications the create group recorded.

### Review follow-up, 2026-09-28

The independent review found that nothing in the group asserted what a verdict leaves alone. Four
statements added after `p.status = kept ? Status.Kept : Status.Broken;` survived the whole suite:
releasing the stake from `_totalLocked`, moving the deadline to now, consuming an identifier, and
pushing the pledge onto the caller's index. None breaches LLR-SC-030 to 033 as written, but the
first would let a later settlement pay from another pledge's money, and the second and third
contradict requirements that only the not-yet-written invariant group is scheduled to check.

`test_SC033_theVerdictChangesTheStatusAndNothingElse` now captures the whole record, the locked
total, and all three indexes before the verdict and compares them after, then creates one more
pledge to show the next identifier was not consumed. All four mutants die on it, each with its own
assertion:

| # | Mutation | Failing test and message |
|---|---|---|
| 104 | verdict also releases the stake from `_totalLocked` | `theVerdictChangesTheStatusAndNothingElse`, `1000 != 2000` |
| 105 | verdict also moves the deadline to now | `theVerdictChangesTheStatusAndNothingElse`, `1700000001 != 1700086400` |
| 106 | verdict also consumes an identifier | `theVerdictChangesTheStatusAndNothingElse`, `4 != 3` |
| 107 | verdict also pushes the pledge onto the caller's index | `theVerdictChangesTheStatusAndNothingElse`, `[1, 2, 1] != [1, 2]` |

The test carries only `LLR-SC-033`. The properties it also guards belong to LLR-SC-071 and
LLR-SC-074, which are not yet implemented, and naming an unimplemented ID in a scanned file fails
the trace checker. The invariant group therefore still owes both, over arbitrary call sequences
rather than this one ordering.

Two further review findings, neither a defect in this group's work:

- `PledgeSettled` is the one event with no `@custom:trace`, which LLR-SC-080 requires of every
  event and which the release gate checks. Its tag is LLR-SC-044, so it cannot be added until
  `settle` exists: tagging it now would mark LLR-SC-044 referenced and the checker would then
  demand an implementation and a test for it. The settle group adds the tag with the function.
- The error declarations that now serve LLR-SC-030 to 032 carry only `LLR-SC-004` in their tags.
  This is the convention the project already follows, set by `TokenNotAllowed` and accepted at the
  create group: an error declaration traces to LLR-SC-004, and the behavioural ID sits on the
  check that raises it, where the trace matrix resolves it. Recorded here so it is settled once
  rather than raised again at each group.

Run after this follow-up: `forge fmt --check` clean; `forge test` 102 passed, 0 failed; `forge
coverage --report summary`: `src/SatStake.sol | 100.00% (63/63) | 100.00% (88/88) | 100.00%
(19/19) | 100.00% (8/8)`; `node tools/trace-check.mjs`: `trace-check: OK. 29/112 LLRs referenced,
0/55 journeys passing.`
