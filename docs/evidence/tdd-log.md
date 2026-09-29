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

## Group: SC settle (LLR-SC-040 to 045, LLR-SC-003 for `settle`)

Tests written from the six settlement rows, the state machine in 05 section 1.2, the `LLR-SC-003`
sentence that names `settle`, and 06 section 4, before `settle` had a body. Every status the
`Status` enum can hold is reached by a real sequence of calls: no test in this group writes a
status with `vm.store`, which the verdict group still had to do for the two settled ones.

| Test | Verifies |
|---|---|
| `test_SC040_revertsWithPledgeNotFoundForAnIdentifierNeverAssigned` | LLR-SC-040 |
| `test_SC040_anyAccountMaySettleAndThePayoutIgnoresTheCaller` | LLR-SC-040, LLR-SC-041 |
| `test_SC040_anUnrelatedCallerMaySettleAndReceivesNothing` (fuzz) | LLR-SC-040, LLR-SC-041 |
| `test_SC041_aKeptPledgePaysTheStaker` | LLR-SC-041, LLR-SC-044 |
| `test_SC041_aBrokenPledgePaysTheBeneficiary` | LLR-SC-041, LLR-SC-044 |
| `test_SC041_anActivePledgeAtTheDeadlinePaysTheBeneficiary` | LLR-SC-041, LLR-SC-042 |
| `test_SC041_anActivePledgeAfterTheDeadlinePaysTheBeneficiary` | LLR-SC-041 |
| `test_SC041_everyStoredStatusSettlesAsTheTableSays` | LLR-SC-040, LLR-SC-041, LLR-SC-042 |
| `test_SC041_settlesOnlyTheNamedPledge` | LLR-SC-041 |
| `test_SC041_theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse` | LLR-SC-041, LLR-SC-043 |
| `test_SC042_revertsForAnActivePledgeOneSecondBeforeTheDeadline` | LLR-SC-042 |
| `test_SC042_revertsForAnActivePledgeLongBeforeTheDeadline` | LLR-SC-042 |
| `test_SC042_revertsWithAlreadySettledAfterEverySettlement` | LLR-SC-042 |
| `test_SC042_anActivePledgeBecomesSettleableAtTheDeadlineAndNotBefore` (fuzz) | LLR-SC-041, LLR-SC-042 |
| `test_SC041_aRecordedVerdictSettlesTheSameWayAfterTheDeadline` | LLR-SC-041 |
| `test_SC043_writesTheStatusAndReleasesTheStakeBeforeTheTransfer` | LLR-SC-043 |
| `test_SC044_transfersTheFullAmountToTheRecipient` | LLR-SC-044 |
| `test_SC044_emitsPledgeSettledOnceWithTheRecipientAndAmount` | LLR-SC-044 |
| `test_SC003_settleRevertsWhenTheTokenReportsFailure` | LLR-SC-003, LLR-SC-044 |
| `test_SC003_settleAcceptsATokenThatReturnsNoValue` | LLR-SC-003 |
| `test_SC003_revertsWhenTheTokenReentersSettle` | LLR-SC-003 |
| `test_SC045_aBlockedRecipientLeavesTheSettlementUndone` | LLR-SC-045 |
| `test_SC045_aPausedTokenLeavesTheSettlementUndone` | LLR-SC-045 |
| `test_SC045_aBlockedStakerLeavesTheCreationUndone` | LLR-SC-045 |
| `test_SC045_aPausedTokenLeavesTheCreationUndone` | LLR-SC-045 |

The two boundaries 06 section 4 names for this group, settling an Active pledge at `deadline - 1`
and at `deadline`, are `test_SC042_revertsForAnActivePledgeOneSecondBeforeTheDeadline` and
`test_SC041_anActivePledgeAtTheDeadlinePaysTheBeneficiary` by name; the fuzz test walks a minute
either side of the deadline, so the boundary second itself is reached repeatedly.

LLR-SC-043 asks for an order, not an end state, so the state is read while the payout is still
running. `MockHostileToken` is armed to call a small observer contract from inside its `transfer`,
and the observer reads SatStake's storage with `vm.load`: cheatcodes answer any contract in the
test EVM, not only the test contract. The slots come from the helpers in
`test/base/SatStakeTestBase.sol`, which now expose `_statusSlotOf` and `_totalLockedSlotOf` so that
knowledge of the layout of 05 section 1.1 stays in the one file that already held it.

LLR-SC-045 names `createPledge` as well as `settle`, so it has four tests: a blocklisted recipient
and a paused token on the settlement side, and a blocklisted staker and a paused token on the
creation side. Each compares the whole pledge record, the locked total, the contract's balance, and
the index of all three parties across the failed call, and then lifts the token's control and shows
the same call going through, so the refusal is the token's and not the contract's.

### Red, 2026-09-28

Observed in two steps, as in the previous two groups. Command: `forge test`

Step 1, tests only. The expected compile error names the missing function:

```
Compiler run failed:
Error (9582): Member "settle" not found or not visible after argument-dependent lookup in contract SatStake.
   --> test/SatStake.Settle.t.sol:101:9:
    |
101 |         satStake.settle(id);
    |         ^^^^^^^^^^^^^^^
```

Step 2, so that each test's own failure is visible: `settle(uint256)` declared with the section 1.1
signature and an empty body, no guard, no checks, no payout. Twenty-two of the twenty-four tests
failed for the reason their requirement predicts (fuzz counterexamples trimmed):

| Test | Observed failure |
|---|---|
| `test_SC040_revertsWithPledgeNotFoundForAnIdentifierNeverAssigned` | `next call did not revert as expected` |
| `test_SC040_anyAccountMaySettleAndThePayoutIgnoresTheCaller` | `assertion failed: 999999999999999999999000 != 1000000000000000000000000` |
| `test_SC040_anUnrelatedCallerMaySettleAndReceivesNothing` | `assertion failed: 999999999999999999999000 != 1000000000000000000000000; counterexample: ...` |
| `test_SC041_aKeptPledgePaysTheStaker` | `assertion failed: 999999999999999999999000 != 1000000000000000000000000` |
| `test_SC041_aBrokenPledgePaysTheBeneficiary` | `assertion failed: 0 != 1000` |
| `test_SC041_anActivePledgeAtTheDeadlinePaysTheBeneficiary` | `assertion failed: 0 != 1000` |
| `test_SC041_anActivePledgeAfterTheDeadlinePaysTheBeneficiary` | `assertion failed: 0 != 1000` |
| `test_SC041_everyStoredStatusSettlesAsTheTableSays` | `next call did not revert as expected` |
| `test_SC041_settlesOnlyTheNamedPledge` | `assertion failed: 2 != 4` |
| `test_SC041_theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse` | `assertion failed: 2 != 4` |
| `test_SC042_revertsForAnActivePledgeOneSecondBeforeTheDeadline` | `next call did not revert as expected` |
| `test_SC042_revertsForAnActivePledgeLongBeforeTheDeadline` | `next call did not revert as expected` |
| `test_SC042_revertsWithAlreadySettledAfterEverySettlement` | `next call did not revert as expected` |
| `test_SC042_anActivePledgeBecomesSettleableAtTheDeadlineAndNotBefore` | `assertion failed: 1 != 5; counterexample: ...` |
| `test_SC043_writesTheStatusAndReleasesTheStakeBeforeTheTransfer` | `assertion failed` |
| `test_SC044_transfersTheFullAmountToTheRecipient` | `assertion failed: 0 != 31337` |
| `test_SC044_emitsPledgeSettledOnceWithTheRecipientAndAmount` | `assertion failed: 0 != 1` |
| `test_SC003_settleRevertsWhenTheTokenReportsFailure` | `next call did not revert as expected` |
| `test_SC003_settleAcceptsATokenThatReturnsNoValue` | `assertion failed: 999999999999999999999000 != 1000000000000000000000000` |
| `test_SC003_revertsWhenTheTokenReentersSettle` | `next call did not revert as expected` |
| `test_SC045_aBlockedRecipientLeavesTheSettlementUndone` | `next call did not revert as expected` |
| `test_SC045_aPausedTokenLeavesTheSettlementUndone` | `next call did not revert as expected` |

```
Encountered a total of 22 failing tests, 104 tests succeeded
```

`999999999999999999999000 != 1000000000000000000000000` is a staker whose balance never rose by the
stake it had locked; `2 != 4` is a status left `Kept` (2) where the table asks for
`SettledToStaker` (4); `1 != 5` is the same for an expired pledge, left `Active` (1) where
`SettledToBeneficiary` (5) is required; the bare `assertion failed` of the LLR-SC-043 test is its
`assertTrue(observer.captured())`, because with no payout the token never ran at all.

The two remaining tests, `test_SC045_aBlockedStakerLeavesTheCreationUndone` and
`test_SC045_aPausedTokenLeavesTheCreationUndone`, passed at this point. They are the half of
LLR-SC-045 that names `createPledge`, which the create group had already implemented, so this group
could not make them fail by leaving something out; the create group's own red is their red for the
transfer, and the evidence that they are load-bearing is mutation 134 below, which is the only
mutant either of them exists to catch.

### Green, 2026-09-28

`settle`, `nonReentrant`, with the existence check, the already-settled check, the recipient table
of LLR-SC-041 with the deadline check on its `Active` branch, then the status write and the release
of the stake, and only then the `safeTransfer` and the event. `@custom:trace` added to `settle`, to
`PledgeSettled`, which had none, and to `createPledge` and its stake transfer for the half of
LLR-SC-045 they carry. Same command:

```
Ran 6 test suites: 126 tests passed, 0 failed, 0 skipped (126 total tests)
```

The three arms of the table set a local `recipient` and a local `settled` rather than paying from
inside each arm, so the payout, the status write, and the release each appear once and cannot drift
between the three outcomes. The `Active` arm is the `else`: the four statuses that reach it are
`None`, `SettledToStaker` and `SettledToBeneficiary`, all three refused above, and `Kept` and
`Broken`, both taken earlier, so `Active` is the only one left.

### Refactor, 2026-09-28

No structure changed after green. `forge fmt` applied. The one change outside the new files is in
`test/base/SatStakeTestBase.sol`: `_statusSlotOf`, `_statusInWord`, and `_totalLockedSlotOf` are
lifted out of `_storedPledge`, `_setStoredStatus`, and `_storedTotalLocked`, which now call them.
The suite stayed at 126 passed, 0 failed across the move.

### Strengthening before the independent review, 2026-09-28

Two gaps found by rereading the group against the verdict group's review, and closed with the
contract already correct, so their red is the mutation each was written for.

- `test_SC041_theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse` compared the index of
  the three parties but not of the caller, who is a party to nothing. A settlement that indexed its
  caller therefore survived, which is the mutant the verdict group found for verdicts (mutation
  107). The caller's index is now compared there and in the LLR-SC-045 snapshot. Mutation 135.
- Nothing settled a judged pledge after its deadline, so the table's selection on the stored status
  alone was not pinned: a deadline rule applied to `Kept` as well as to `Active` would have sent a
  kept promise's stake to the beneficiary and passed the group.
  `test_SC041_aRecordedVerdictSettlesTheSameWayAfterTheDeadline` settles a `Kept` and a `Broken`
  pledge thirty days past their deadline. Mutation 136.

The suite is 25 tests for this group after these two changes, 127 in all.

### Mutation evidence, 2026-09-28

Each mutation removes or weakens exactly one check, one stored value, one event field, or one
ordering. Each was applied to a copy of the repository outside it and run with the unchanged tests
(`forge test`, the whole suite). Every mutation is killed; the killing tests are named with the
`test_` prefix and the scope number trimmed. Failures were matched on lines beginning `[FAIL`,
taking the test name after the last `]` on the line, because Foundry prints timestamps and fuzz
counterexamples in brackets inside the reason.

| # | Mutation | Failing tests |
|---|---|---|
| 108 | `settle` without `nonReentrant` | `revertsWhenTheTokenReentersSettle` |
| 109 | no `PledgeNotFound` check | `revertsWithPledgeNotFoundForAnIdentifierNeverAssigned`, `everyStoredStatusSettlesAsTheTableSays` |
| 110 | `PledgeNotFound` reports a fixed identifier | `revertsWithPledgeNotFoundForAnIdentifierNeverAssigned`, `everyStoredStatusSettlesAsTheTableSays` |
| 111 | no `AlreadySettled` check | `everyStoredStatusSettlesAsTheTableSays`, `revertsWithAlreadySettledAfterEverySettlement` |
| 112 | `AlreadySettled` misses `SettledToBeneficiary` | `everyStoredStatusSettlesAsTheTableSays`, `revertsWithAlreadySettledAfterEverySettlement` |
| 113 | `Kept` pays the beneficiary | `settleAcceptsATokenThatReturnsNoValue`, `anUnrelatedCallerMaySettleAndReceivesNothing`, `anyAccountMaySettleAndThePayoutIgnoresTheCaller`, and 6 more |
| 114 | `Kept` stores `SettledToBeneficiary` | `revertsWhenTheTokenReentersSettle`, `settleAcceptsATokenThatReturnsNoValue`, `anUnrelatedCallerMaySettleAndReceivesNothing`, and 5 more |
| 115 | `Broken` pays the staker | `anyAccountMaySettleAndThePayoutIgnoresTheCaller`, `aBrokenPledgePaysTheBeneficiary`, `everyStoredStatusSettlesAsTheTableSays`, and 3 more |
| 116 | `Broken` stores `SettledToStaker` | `aBrokenPledgePaysTheBeneficiary`, `everyStoredStatusSettlesAsTheTableSays` |
| 117 | an expired `Active` pledge pays the staker | `anyAccountMaySettleAndThePayoutIgnoresTheCaller`, `anActivePledgeAfterTheDeadlinePaysTheBeneficiary`, `anActivePledgeAtTheDeadlinePaysTheBeneficiary`, and 3 more |
| 118 | an expired `Active` pledge stores `SettledToStaker` | `anActivePledgeAfterTheDeadlinePaysTheBeneficiary`, `anActivePledgeAtTheDeadlinePaysTheBeneficiary`, `everyStoredStatusSettlesAsTheTableSays`, and 1 more |
| 119 | no `NotSettleable` check | `everyStoredStatusSettlesAsTheTableSays`, `anActivePledgeBecomesSettleableAtTheDeadlineAndNotBefore`, `revertsForAnActivePledgeLongBeforeTheDeadline`, and 1 more |
| 120 | `NotSettleable` one second late (`<=`) | `anyAccountMaySettleAndThePayoutIgnoresTheCaller`, `anActivePledgeAtTheDeadlinePaysTheBeneficiary`, `everyStoredStatusSettlesAsTheTableSays`, and 3 more |
| 121 | `NotSettleable` reports zero instead of the deadline | `everyStoredStatusSettlesAsTheTableSays`, `anActivePledgeBecomesSettleableAtTheDeadlineAndNotBefore`, `revertsForAnActivePledgeLongBeforeTheDeadline`, and 1 more |
| 122 | the payout goes to the caller | `settleAcceptsATokenThatReturnsNoValue`, `anUnrelatedCallerMaySettleAndReceivesNothing`, `anyAccountMaySettleAndThePayoutIgnoresTheCaller`, and 10 more |
| 123 | the payout is half the stake | `settleAcceptsATokenThatReturnsNoValue`, `anUnrelatedCallerMaySettleAndReceivesNothing`, `anyAccountMaySettleAndThePayoutIgnoresTheCaller`, and 11 more |
| 124 | the status is not written | `revertsWhenTheTokenReentersSettle`, `settleAcceptsATokenThatReturnsNoValue`, `anUnrelatedCallerMaySettleAndReceivesNothing`, and 10 more |
| 125 | the status is written to pledge 1 whatever the identifier | `revertsWhenTheTokenReentersSettle`, `everyStoredStatusSettlesAsTheTableSays`, `settlesOnlyTheNamedPledge`, and 1 more |
| 126 | `totalLocked` is not decreased | `theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse`, `writesTheStatusAndReleasesTheStakeBeforeTheTransfer` |
| 127 | `totalLocked` is decreased by one unit | `theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse`, `writesTheStatusAndReleasesTheStakeBeforeTheTransfer` |
| 128 | the payout runs before the status write and the release | `writesTheStatusAndReleasesTheStakeBeforeTheTransfer` |
| 129 | no `PledgeSettled` event | `emitsPledgeSettledOnceWithTheRecipientAndAmount` |
| 130 | `PledgeSettled` names the caller as recipient | `emitsPledgeSettledOnceWithTheRecipientAndAmount` |
| 131 | `PledgeSettled` reports a zero amount | `emitsPledgeSettledOnceWithTheRecipientAndAmount` |
| 132 | `PledgeSettled` always reports identifier 1 | `emitsPledgeSettledOnceWithTheRecipientAndAmount` |
| 133 | `settle` ignores a failed payout | `revertsWhenTheTokenReentersSettle`, `settleAcceptsATokenThatReturnsNoValue`, `settleRevertsWhenTheTokenReportsFailure`, and 2 more |
| 134 | `createPledge` ignores a failed stake transfer | `aBlockedStakerLeavesTheCreationUndone`, `aPausedTokenLeavesTheCreationUndone`, and others |
| 135 | the settlement also indexes its caller | `theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse` |
| 136 | an expired `Kept` pledge pays the beneficiary | `aRecordedVerdictSettlesTheSameWayAfterTheDeadline` |

Mutations 108 to 134 were run against the group's first twenty-four tests and 135 and 136 against
all twenty-five, so two kill lists below are one test short of what the finished suite would
report. Strengthening a test can only add failures, never revive a mutant, so every row stands.

Mutation 128 is the one LLR-SC-043 exists for, and it is killed by that requirement's test alone:

```
[FAIL: assertion failed: 2 != 4] test_SC043_writesTheStatusAndReleasesTheStakeBeforeTheTransfer()
```

`2 != 4` is the status the observer read from SatStake's storage while the payout was running:
still `Kept` where `SettledToStaker` is required before the transfer. With the effects in the order
the requirement gives, the same read returns 4 and the locked total has already fallen. Every other
test in the suite passes against this mutant, because its end state is identical; only the order
differs.

Mutation 122, the other one this group was asked to kill, is the contract paying `msg.sender`
instead of the recipient the table names. It fails thirteen of the twenty-four tests it was run
against, and fourteen of the finished twenty-five, among them the fuzz test that settles a kept
pledge from an arbitrary account:

```
[FAIL: assertion failed: 999999999999999999999000 != 1000000000000000000000000; counterexample: ...] test_SC040_anUnrelatedCallerMaySettleAndReceivesNothing(address)
```

Mutation 134 is why the two LLR-SC-045 tests on the creation side exist. They are the only tests in
the suite that no other mutant in this group touches, and the run confirms it: of the twenty-nine
mutants, 134 is the only one either of them fails on. It removes both halves of what makes a failed
stake transfer safe, swallowing the token's revert and dropping the balance check, so a pledge is
created with nothing behind it.

The order of the two status checks in `settle` is not mutated, because it is not observable: a
pledge whose status is `None` is not settled, and a settled pledge exists, so neither check can
mask the other. The one order the function has is effects against payout, which is mutation 128.

Run after this group: `forge fmt --check` clean; `forge test` 127 passed, 0 failed; `forge coverage
--report summary`: `src/SatStake.sol | 100.00% (85/85) | 100.00% (114/114) | 100.00% (26/26) |
100.00% (9/9)`; `node tools/trace-check.mjs`: `trace-check: OK. 35/112 LLRs referenced, 0/55
journeys passing.`

Carry-forward: LLR-SC-003 now covers all four functions it names, so its inspection row can be
closed at full scope, and LLR-SC-004 needs its recheck at this group. The "SC views" group still
owes the two re-verifications the create group recorded, and one more from this group: the
LLR-SC-043 release of the stake is read from storage here, and should be re-verified through
`totalLocked` once that view exists. The invariant group still owes LLR-SC-071 and LLR-SC-074 over
arbitrary call sequences.

No requirement changed in this group.

### Review follow-up, 2026-09-28

The independent review found that a settlement could corrupt a **neighbouring** pledge's
`promiseText` or `createdAt` with the whole suite still passing. The "changes nothing else" test
captured every field of the pledge being settled, but for any other pledge it compared the status
alone, so the two fields nothing else reads back were free to change. `_pledges[id + 1].deadline`
and `.amount` were already caught, which is what made the gap easy to miss.

`_assertSameRecord` in the shared test base now compares all nine fields of a record against an
earlier snapshot, and both the settle and the verdict "nothing else" tests use it on the
neighbouring pledge. The verdict test had the identical shape and the identical hole, so it is
fixed here too rather than left for the invariant group.

| # | Mutation | Failing test and message |
|---|---|---|
| 137 | `settle` corrupts a neighbour's `promiseText` | `theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse`, `x != Ship the demo` |
| 138 | `settle` corrupts a neighbour's `createdAt` | `theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse`, `0 != 1700000000` |
| 139 | a verdict corrupts a neighbour's `promiseText` | `theVerdictChangesTheStatusAndNothingElse`, `x != Ship the demo` |
| 140 | a verdict corrupts a neighbour's `createdAt` | `theVerdictChangesTheStatusAndNothingElse`, `0 != 1700000000` |

Two corrections to this log, both found by the same review: the group's test table had 24 of its 25
rows, missing `test_SC041_aRecordedVerdictSettlesTheSameWayAfterTheDeadline`, whose evidence was
recorded further down but not indexed; and mutation 134's "and 29 more" could not be reproduced,
the reviewer's reconstruction failing 8 tests rather than 31. The row now names the two tests the
claim actually rests on and drops the count. The two named tests fail on 134 and on no other
mutant, which is what the row is used for.

The reviewer also reported one survivor it did not count as a defect, and neither do I:
`_totalLocked[p.referee] += 1`, a write to the locked mapping at a key that is no token. No
requirement in scope constrains that mapping at a non-token key; LLR-SC-055 belongs to the views
group, which must catch it.

Run after this follow-up: `forge fmt --check` clean; `forge test` 127 passed, 0 failed; `forge
coverage --report summary`: `src/SatStake.sol | 100.00% (85/85) | 100.00% (114/114) | 100.00%
(26/26) | 100.00% (9/9)`; `node tools/trace-check.mjs`: `trace-check: OK. 35/112 LLRs referenced,
0/55 journeys passing.`

## Group: SC views (LLR-SC-050 to 053, 055; LLR-SC-010, 028, 043 re-verified through the views)

Tests written from the five view rows, from 05 section 1.2 for the `Expired` state, and from the
boundaries 06 section 4 names for this group, before any of the five functions had a body.
LLR-SC-054 (`isAllowedToken`, `allowedTokens`) was implemented in the allowlist group and is not
touched here.

The group also settles the three debts the earlier groups recorded, each of which had to read
SatStake's private storage with `vm.load` because no view existed: the stored record of LLR-SC-010,
the locked total and the three party indexes of LLR-SC-028, and the release of the stake in
LLR-SC-043. The storage-slot tests stay where they are. They pin the layout independently of the
views, which is what makes a view that returns the wrong slot detectable; the new tests pin the
views to that layout and to the requirement's own values.

| Test | Verifies |
|---|---|
| `test_SC050_getPledgeReturnsEveryFieldOfTheStoredRecord` | LLR-SC-010, LLR-SC-050 |
| `test_SC050_getPledgeKeepsEachPledgeApart` | LLR-SC-010, LLR-SC-050 |
| `test_SC050_getPledgeReturnsAPromiseOfEveryStoredLength` | LLR-SC-010, LLR-SC-050 |
| `test_SC050_getPledgeRevertsForIdentifierZero` | LLR-SC-050 |
| `test_SC050_getPledgeRevertsAboveThePledgeCountAndNotAtIt` | LLR-SC-050, LLR-SC-052 |
| `test_SC050_getPledgeFollowsTheStoredStatusThroughTheLifecycle` | LLR-SC-050 |
| `test_SC050_theViewsWriteNoStorage` | LLR-SC-050, LLR-SC-051, LLR-SC-052, LLR-SC-053, LLR-SC-055 |
| `test_SC051_reportsActiveOneSecondBeforeTheDeadline` | LLR-SC-051 |
| `test_SC051_reportsExpiredAtTheDeadlineAndAfterIt` | LLR-SC-051 |
| `test_SC051_expiredIsDerivedAndNeverStored` | LLR-SC-050, LLR-SC-051 |
| `test_SC051_reportsTheStateMatchingEveryOtherStoredStatus` | LLR-SC-051 |
| `test_SC051_aPassedDeadlineChangesNoOtherState` | LLR-SC-051 |
| `test_SC051_revertsOnTheSameIdentifiersAsGetPledge` | LLR-SC-050, LLR-SC-051 |
| `test_SC051_turnsExpiredExactlyAtTheDeadline` (fuzz) | LLR-SC-051 |
| `test_SC052_countsEveryPledgeEverCreated` | LLR-SC-052 |
| `test_SC052_isNotReducedByVerdictsOrSettlements` | LLR-SC-052 |
| `test_SC053_pledgeCountOfCountsTheAccountsOwnIndex` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfReturnsCreationOrder` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfPagesThroughTheIndex` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfWithOffsetEqualToTheCountReturnsAnEmptyPage` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfWithOffsetPastTheEndReturnsAnEmptyPage` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfWithLimitZeroReturnsAnEmptyPage` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfForAnAccountWithNoPledgesReturnsAnEmptyPage` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfReturnsTheRemainderWhenThePageRunsOffTheEnd` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfWithLimitAboveMaxPageReturnsAtMostMaxPage` | LLR-SC-053 |
| `test_SC053_pledgeIdsOfMatchesTheIndexForAnyOffsetAndLimit` (fuzz) | LLR-SC-053 |
| `test_SC055_sumsTheTokensActiveKeptAndBrokenPledges` | LLR-SC-055 |
| `test_SC055_countsAnExpiredPledgeUntilItIsSettled` | LLR-SC-055 |
| `test_SC055_matchesTheSumOverThePledgesAtEveryStep` | LLR-SC-055 |
| `test_SC055_keepsTokensApart` | LLR-SC-055 |
| `test_SC055_isZeroForAnAddressThatIsNotAToken` | LLR-SC-055 |
| `test_SC028_creationRaisesTheLockedTotalAndIndexesEveryParty` | LLR-SC-028, LLR-SC-053, LLR-SC-055 |
| `test_SC043_settlementReleasesExactlyTheStakeFromTheLockedTotal` | LLR-SC-043, LLR-SC-055 |

The three boundaries 06 section 4 names for this group appear by name: `offset` equal to
`pledgeCountOf(account)` is `test_SC053_pledgeIdsOfWithOffsetEqualToTheCountReturnsAnEmptyPage`,
`limit` 0 is `test_SC053_pledgeIdsOfWithLimitZeroReturnsAnEmptyPage`, and `limit` above `MAX_PAGE`
is `test_SC053_pledgeIdsOfWithLimitAboveMaxPageReturnsAtMostMaxPage`, which first creates
`MAX_PAGE + 1` pledges for one account, since the cap is not observable on a shorter index. Offset
past the end, an account with no pledges at all, and a page running off the end have a test each.

`totalLocked` is a running total the contract keeps, so a test that compares it against itself
proves nothing. `_lockedFromPledges` walks 1 to `pledgeCount()` with `getPledge` and sums the
amounts of that token's `Active`, `Kept`, and `Broken` pledges, which is the definition LLR-SC-055
gives, and `test_SC055_matchesTheSumOverThePledgesAtEveryStep` compares the two after every step of
a sequence of creations, verdicts, and settlements across two tokens.

`test_SC055_isZeroForAnAddressThatIsNotAToken` exists for the survivor the settle review reported
and left to this group: `_totalLocked[p.referee] += 1`, a write to the locked mapping at a key that
is no token. Nothing else reads that mapping at such a key, so nothing else can see it.

### Red, 2026-09-28

Observed in two steps, as in the previous three groups. Command: `forge test`

Step 1, tests only. The expected compile error names the first missing view:

```
Compiler run failed:
Error (9582): Member "getPledge" not found or not visible after argument-dependent lookup in contract SatStake.
  --> test/SatStake.Views.t.sol:96:41:
   |
96 |         SatStake.Pledge memory viewed = satStake.getPledge(id);
   |                                         ^^^^^^^^^^^^^^^^^^
```

Step 2, so that each test's own failure is visible: the six functions declared with their section
1.1 signatures and empty bodies, no bound checks, no derivation, no reads. Thirty-two of the
thirty-three tests failed for the reason their requirement predicts (fuzz counterexamples trimmed):

| Test | Observed failure |
|---|---|
| `test_SC050_getPledgeReturnsEveryFieldOfTheStoredRecord` | `assertion failed: 0x0000...0000 != 0x8eDc...6BEb` |
| `test_SC050_getPledgeKeepsEachPledgeApart` | `assertion failed: 0x0000...0000 != 0x8eDc...6BEb` |
| `test_SC050_getPledgeReturnsAPromiseOfEveryStoredLength` | `assertion failed:  != x` |
| `test_SC050_getPledgeRevertsForIdentifierZero` | `next call did not revert as expected` |
| `test_SC050_getPledgeRevertsAboveThePledgeCountAndNotAtIt` | `next call did not revert as expected` |
| `test_SC050_getPledgeFollowsTheStoredStatusThroughTheLifecycle` | `assertion failed: 0 != 1` |
| `test_SC051_reportsActiveOneSecondBeforeTheDeadline` | `panic: arithmetic underflow or overflow (0x11)` |
| `test_SC051_reportsExpiredAtTheDeadlineAndAfterIt` | `assertion failed: 0 != 1` |
| `test_SC051_expiredIsDerivedAndNeverStored` | `assertion failed: 0 != 1` |
| `test_SC051_reportsTheStateMatchingEveryOtherStoredStatus` | `assertion failed: 0 != 2` |
| `test_SC051_aPassedDeadlineChangesNoOtherState` | `assertion failed: 0 != 2` |
| `test_SC051_revertsOnTheSameIdentifiersAsGetPledge` | `next call did not revert as expected` |
| `test_SC051_turnsExpiredExactlyAtTheDeadline` | `panic: arithmetic underflow or overflow (0x11); counterexample: ...` |
| `test_SC052_countsEveryPledgeEverCreated` | `assertion failed: 0 != 1` |
| `test_SC052_isNotReducedByVerdictsOrSettlements` | `assertion failed: 0 != 4` |
| `test_SC053_pledgeCountOfCountsTheAccountsOwnIndex` | `assertion failed: 0 != 2` |
| `test_SC053_pledgeIdsOfReturnsCreationOrder` | `assertion failed: [] != [1, 2, 3]` |
| `test_SC053_pledgeIdsOfPagesThroughTheIndex` | `assertion failed: [] != [1, 2]` |
| `test_SC053_pledgeIdsOfWithOffsetEqualToTheCountReturnsAnEmptyPage` | `assertion failed: 0 != 2` |
| `test_SC053_pledgeIdsOfWithOffsetPastTheEndReturnsAnEmptyPage` | `assertion failed: [] != [2]` |
| `test_SC053_pledgeIdsOfWithLimitZeroReturnsAnEmptyPage` | `assertion failed: [] != [1]` |
| `test_SC053_pledgeIdsOfForAnAccountWithNoPledgesReturnsAnEmptyPage` | `assertion failed: [] != [1]` |
| `test_SC053_pledgeIdsOfReturnsTheRemainderWhenThePageRunsOffTheEnd` | `assertion failed: [] != [2, 3]` |
| `test_SC053_pledgeIdsOfWithLimitAboveMaxPageReturnsAtMostMaxPage` | `assertion failed: 0 != 101` |
| `test_SC053_pledgeIdsOfMatchesTheIndexForAnyOffsetAndLimit` | `assertion failed: [] != [2, 3, 4, 5]; counterexample: ...` |
| `test_SC055_sumsTheTokensActiveKeptAndBrokenPledges` | `assertion failed: 0 != 1500` |
| `test_SC055_countsAnExpiredPledgeUntilItIsSettled` | `assertion failed: 0 != 1` |
| `test_SC055_matchesTheSumOverThePledgesAtEveryStep` | `NotSettleable(1700086400 [1.7e9])` |
| `test_SC055_keepsTokensApart` | `assertion failed: 0 != 100` |
| `test_SC055_isZeroForAnAddressThatIsNotAToken` | `assertion failed: 0 != 1000` |
| `test_SC028_creationRaisesTheLockedTotalAndIndexesEveryParty` | `assertion failed: 0 != 1000` |
| `test_SC043_settlementReleasesExactlyTheStakeFromTheLockedTotal` | `panic: arithmetic underflow or overflow (0x11)` |

```
Suite result: FAILED. 1 passed; 32 failed; 0 skipped
```

The two panics and the `NotSettleable` are the same cause as the assertion failures: the stub
returns a zero record, so `getPledge(id).deadline` is 0, and warping to one second before it, or
settling at it, fails before the assertion is reached.

Four tests would have passed against a stub that returns nothing, because what they require is an
empty page or a zero: the two boundaries with `limit` 0 and `offset` past the end, the account with
no pledges, and the non-token key. Each therefore also asserts a neighbouring case that is not
empty, taken from the same state: `limit` 1 returns one identifier, the last offset inside the index
returns its entry, a party to the same pledge has a page, and the token itself holds the stake. All
four fail above, so the empty result each requires is the bound doing its work rather than the view
returning nothing.

`test_SC050_theViewsWriteNoStorage` is the one test that passes at this point, and cannot fail: a
function with no body writes nothing. It is an absence requirement in the same sense as LLR-SC-014,
and its red is the mutation below that makes a view write.

### Green, 2026-09-28

The five views implemented, each tagged per 06 section 2. `stateOf` derives `Expired` from a stored
`Active` pledge at or past its deadline and returns the state matching the stored status otherwise;
`pledgeIdsOf` returns an empty page when `offset` reaches the count, caps `limit` at `MAX_PAGE`, and
clamps to the remainder when the page runs off the end. Command: `forge test`

```
Ran 7 test suites: 160 tests passed, 0 failed, 0 skipped (160 total tests)
```

The three debts the earlier groups carried forward are cleared here, each through the view rather
than through a storage slot:

- **LLR-SC-028** by `test_SC028_creationRaisesTheLockedTotalAndIndexesEveryParty`, through
  `totalLocked`, `pledgeCountOf`, and `pledgeIdsOf`.
- **LLR-SC-010** by `test_SC050_getPledgeReturnsEveryFieldOfTheStoredRecord` and its two
  companions, through `getPledge`.
- **LLR-SC-043**'s release of the stake by
  `test_SC043_settlementReleasesExactlyTheStakeFromTheLockedTotal`, through `totalLocked`.

The storage-slot tests that carried those requirements before are kept. They pin the layout
independently of the views, so a view that read the wrong slot would disagree with them rather than
agree with itself.

`test_SC055_matchesTheSumOverThePledgesAtEveryStep` is the one that makes `totalLocked` more than a
tautology: it walks every pledge from 1 to `pledgeCount()` with `getPledge`, sums those whose status
is `Active`, `Kept`, or `Broken` per token, and compares that against the running total after each
creation, verdict, and settlement.

### Mutation evidence, 2026-09-28

Applied to a copy, full `forge test` each time, restored afterwards. Failures matched on lines
beginning `[FAIL`.

| # | Mutation | Failing tests |
|---|---|---|
| 141 | `getPledge` drops the `id == 0` check | `getPledgeRevertsForIdentifierZero`, `revertsOnTheSameIdentifiersAsGetPledge` |
| 142 | `getPledge` rejects the last valid identifier | 14 tests |
| 143 | `getPledge` returns the next pledge | 13 tests |
| 144 | `stateOf` never derives `Expired` | `expiredIsDerivedAndNeverStored`, `reportsExpiredAtTheDeadlineAndAfterIt`, `turnsExpiredExactlyAtTheDeadline`, and 1 more |
| 145 | `stateOf` expires one second late | the same 4 |
| 146 | `stateOf` drops the nonexistent check | `revertsOnTheSameIdentifiersAsGetPledge` |
| 147 | `pledgeCount` returns one too many | 8 tests |
| 148 | `pledgeCountOf` always returns zero | 3 tests |
| 150 | `pledgeIdsOf` ignores the `MAX_PAGE` cap | `pledgeIdsOfWithLimitAboveMaxPageReturnsAtMostMaxPage` |
| 151 | `pledgeIdsOf` ignores the offset when reading | 6 tests |
| 152 | `totalLocked` always returns zero | 7 tests |
| 153 | `settle` also writes the locked mapping at a non-token key | `isZeroForAnAddressThatIsNotAToken` |
| 154 | `pledgeIdsOf` drops the offset guard entirely | `pledgeIdsOfForAnAccountWithNoPledgesReturnsAnEmptyPage`, `pledgeIdsOfMatchesTheIndexForAnyOffsetAndLimit`, `pledgeIdsOfWithOffsetPastTheEndReturnsAnEmptyPage` |
| 155 | `pledgeIdsOf` drops the clamp to the remainder | 9 tests |

Mutation 153 is the one the settle group's review reported as a survivor and left to this group: a
write to the locked mapping at a key that is no token. It now dies.

**Mutation 149, `pledgeIdsOf` widening `offset >= count` to `offset > count`, survives, and no test
can kill it.** It is an equivalent mutant, not a gap. At `offset == count` the mutant falls through
instead of returning early, computes `remaining = 0`, and the clamp at the next line drives `size`
to 0, so it returns the same empty page by a longer route. The guard is still needed for
`offset > count`, where `count - offset` would underflow, and mutation 154 shows exactly that: with
the guard gone, three tests fail. The `>=` is therefore correct and the `==` half of it is
redundant, which is a fact about the code rather than a hole in the tests.

Run after this group: `forge fmt --check` clean; `forge test` 160 passed, 0 failed; `forge coverage
--report summary`: `src/SatStake.sol | 100.00% (115/115) | 100.00% (147/147) | 100.00% (30/30) |
100.00% (15/15)`; `node tools/trace-check.mjs`: `trace-check: OK. 40/112 LLRs referenced, 0/55
journeys passing.`

Carry-forward: the invariant group still owes LLR-SC-071 and LLR-SC-074 over arbitrary call
sequences. LLR-SC-004 needs its recheck at this group, and LLR-SC-060 and LLR-SC-061, the remaining
absence requirements, belong to the ABI surface group.

No requirement changed in this group.

### Review follow-up, 2026-09-28

The independent review found three tests weaker than they read, and supplied the mutants to prove
it. All three survived the whole suite when it ran them; all three now die.

**`test_SC050_theViewsWriteNoStorage` recorded only one path through each view.** A write placed in
a branch the recording never entered was invisible: the reviewer's mutant wrote to storage inside
the Expired arm of `stateOf`, which the test never reached, and passed with zero failures. The
log's claim that the test's red was "the mutation below that makes a view write" was also wrong,
since no such mutation was in the table. The test now walks every branch of every view under
`vm.record()`: all six states `stateOf` can report, including both arms of the Active branch, both
of `pledgeIdsOf`'s returns, an account no pledge names, and the two reverting paths.

**The `totalLocked` walk was independent but its fixtures were not diverse.** Every walk-asserted
pledge used the same 13-byte promise and a stake under 1500, so two running totals that drifted
only outside that shape survived: one narrowing the amount through `uint64`, one padding when the
promise passes the single-slot boundary. Both are inside what LLR-SC-022 and LLR-SC-026 permit.
`test_SC055_matchesTheSumForStakesAndPromisesOfAnySize` adds a stake above `type(uint64).max` and a
40-byte promise, carries both through to settlement, and kills both.

**`matchesTheSumOverThePledgesAtEveryStep` did not assert at every step.** Two settlements and a
warp ran with no comparison between them, so a drift on the Broken path exactly cancelled on the
expired-Active path would have passed. The missing assertions are in place, including one after the
warp, since reaching a deadline settles nothing by itself and the totals must already agree.

| # | Mutation | Failing test |
|---|---|---|
| 156 | a view writes storage inside the Expired arm of `stateOf` | `theViewsWriteNoStorage` |
| 157 | `createPledge` narrows the amount into the locked total | `matchesTheSumForStakesAndPromisesOfAnySize` |
| 158 | the locked total is padded for a promise past one slot | `matchesTheSumForStakesAndPromisesOfAnySize` |

Three smaller findings, all accepted:

- `totalLocked`'s NatSpec said the contract "holds" that much of the token. LLR-SC-070 requires
  only that the balance is at least the locked total, since anyone may send the contract tokens
  outside a pledge, so the wording now says what is locked rather than what is held.
- `getPledge` no longer carries `LLR-SC-010` in its `@custom:trace`. That requirement is about
  storing the record, which `createPledge` does and still carries; the tests that read it back
  through the view keep the ID in `@custom:verifies`, which is where it belongs.
- `test_SC051_expiredIsDerivedAndNeverStored` now also carries `LLR-SC-011`. That requirement names
  the derived state reported by `stateOf`, so `stateOf` implementing it was right, but no test in
  this group claimed it.

The reviewer confirmed mutation 149 is equivalent, for the reason given above, and reports that
widening `limit > MAX_PAGE` to `>=` is equivalent in the same way, both yielding the minimum. It
also confirmed from the compiled artifact, not the source, that the ABI's only non-view external
functions are the four LLR-SC-061 names.

Run after this follow-up: `forge fmt --check` clean; `forge test` 161 passed, 0 failed; `forge
coverage --report summary`: `src/SatStake.sol` 100% on all four measures; `node
tools/trace-check.mjs`: `trace-check: OK. 40/112 LLRs referenced, 0/55 journeys passing.`

## Group: SC invariants and ABI surface (LLR-SC-002, 060, 061, 070 to 075; LLR-VV-003, 004)

Tests written from the two absence rows, the six invariant rows, and the two verification rows,
before the contract carried a trace tag for any of them, before `tools/coverage-gate.mjs` existed,
and before CI ran a coverage gate.

This is the first group whose requirements are about code the earlier groups already wrote. 06
section 8 puts it last on purpose: LLR-SC-002, 060, and 061 say what the contract must not have, and
LLR-SC-070 to 075 are properties of sequences of the four functions rather than of any one of them.
So most of these tests pass the moment they are written, exactly as LLR-SC-014 did in the allowlist
group, and their red is the mutation evidence below: each one is shown to fail against a contract
that breaks the requirement it names. The parts of the group that are genuinely new code, the
coverage gate and the contract's own trace tags, have an ordinary red.

| Test | Verifies |
|---|---|
| `test_SC002_theCompiledAbiDeclaresNothingPayableAndNoReceiveOrFallback` | LLR-SC-002 |
| `test_SC002_aCallCarryingValueRevertsAndMovesNoFunds` | LLR-SC-002 |
| `test_SC002_aCallWithNoMatchingFunctionRevertsWithNoValueToo` | LLR-SC-002 |
| `test_SC060_theInstructionWalkSkipsPushDataAndTheMetadataTrailer` | LLR-SC-060 |
| `test_SC060_theDeployedBytecodeHasNoDelegatecallSelfdestructOrCallcode` | LLR-SC-060 |
| `test_SC060_theCreationBytecodeHasNoDelegatecallSelfdestructOrCallcode` | LLR-SC-060 |
| `test_SC060_aVerdictTransfersNoTokens` | LLR-SC-060 |
| `test_SC061_theCompiledAbiHasExactlyTheFourNonViewFunctions` | LLR-SC-061 |
| `test_SC061_everyReadFunctionAndConstantIsView` | LLR-SC-061 |
| `invariant_SC070_theBalanceCoversTheLockedStakeOfEveryToken` | LLR-SC-070 |
| `invariant_SC071_theLockedStakeIsTheSumOfEveryUnsettledPledge` | LLR-SC-071 |
| `invariant_SC072_everyStatusChangeFollowsAnEdgeOfTheStateMachine` | LLR-SC-072 |
| `invariant_SC073_eachPledgeSettlesAtMostOnceToOneOfItsOwnParties` | LLR-SC-073 |
| `invariant_SC074_noFieldOfAPledgeChangesAfterCreation` | LLR-SC-074 |
| `invariant_SC075_aRefusedTransferChangesNothing` | LLR-SC-075 |
| `test_SC072_theLegalEdgeTableIsExactlyTheDiagram` | LLR-SC-072 |
| `test_SC070_everyInvariantHoldsOverALongSequenceThatReachesEveryAction` | LLR-SC-070 to LLR-SC-075 |
| `test_SC075_aBlockedBeneficiaryStopsOnlyItsOwnSettlement` | LLR-SC-075 |
| `test_SC075_aPausedTokenStopsOnlyItsOwnToken` | LLR-SC-075 |
| `describe("LLR-VV-003 coverage gate")`, 16 cases | LLR-VV-003 |
| `describe("LLR-VV-004 invariant runs and depth")`, 7 cases | LLR-VV-004 |

Every one of these reads the compiled artifact, the deployed bytecode, the contract, or the build
configuration. None reads the source of `src/SatStake.sol`, because a requirement about what the
contract does not declare is met or broken by what the compiler emitted, not by what the source
appears to say.

**The opcode walk.** LLR-SC-060 forbids `delegatecall`, `selfdestruct`, and `callcode`, so the test
has to find out whether those opcodes are reachable in the compiled code. A byte search answers a
different question: the immediate data of a PUSH is never decoded as an instruction, and the CBOR
metadata solc appends after the code is never reached at all, so a byte search reports opcodes that
cannot run. `test/base/OpcodeScan.sol` walks instruction by instruction, advancing past each PUSH
immediate, over the code with its metadata trailer removed, and `test_SC060_theInstructionWalkSkips
PushDataAndTheMetadataTrailer` checks the walk itself against byte strings built so that the two
answers differ: the opcode inside a PUSH32 immediate, the same byte as a real instruction, the
opcode only inside the metadata trailer, and a trailer length too large to be one. Both steps turn
out to be load-bearing on this very contract, which mutations 167 and 168 below show.

**The action space.** `test/invariant/SatStakeHandler.sol` offers eight actions: create, mark kept,
mark broken, settle, settle with the recipient blocked, jump forward in time, set a blocklist, set a
pause. Two `MockFiatToken` instances at 6 and 8 decimals, four actors, every input bounded so that
creations mostly succeed. The handler owns the tokens, so it is their issuer; it never blocklists
SatStake itself, which would stop every transfer in the sequence rather than the one transfer
LLR-SC-075 is about. After every action it sweeps the status of every pledge and appends any change
to a transition history, and around every settle it records the logs, so the events LLR-SC-073 is
about are captured as they are emitted.

### Red, 2026-09-28

**LLR-SC-002, 060, 061 and the invariants: the trace checker.** 06 section 3 condition 4 requires a
source reference for every referenced LLR in scope SC, which for an absence requirement is the
`@custom:trace` tag on `contract SatStake`. With the tests written and the contract untouched:

```
$ node tools/trace-check.mjs
FAIL LLR-SC-002: has no source reference in code or build configuration
FAIL LLR-SC-060: has no source reference in code or build configuration
FAIL LLR-SC-061: has no source reference in code or build configuration
FAIL LLR-SC-070: has no source reference in code or build configuration
FAIL LLR-SC-071: has no source reference in code or build configuration
FAIL LLR-SC-072: has no source reference in code or build configuration
FAIL LLR-SC-073: has no source reference in code or build configuration
FAIL LLR-SC-074: has no source reference in code or build configuration
FAIL LLR-SC-075: has no source reference in code or build configuration

trace-check: 9 failure(s)
```

The nine include the six invariants, which was not expected: condition 4 names LLR-SC-002, 014, 060,
and 061 as the absence requirements the contract-level tag satisfies, and says nothing about
LLR-SC-070 to 075. They are emergent properties of code that exists, so the green step tags the
lines and functions that maintain each one rather than writing anything new.

**LLR-VV-003: the coverage gate.** Ten of the sixteen cases fail with the gate absent, and the CI
case fails for its own reason:

```
$ node --test test/tools/coverage-gate.test.mjs
not ok 1 - passes when the contract is at 100% on all four measures
not ok 2 - passes although the test files are below 100%
not ok 3 - fails when lines is 99%
not ok 5 - fails when statements is 99%
not ok 7 - fails when branches is 99%
not ok 9 - fails when functions is 99%
not ok 11 - fails when the contract has no row at all
not ok 12 - fails when the output is not a coverage summary
not ok 13 - fails when a measure is missing from the table
    not ok 2 - runs forge coverage and feeds it to the gate in that job
      error: 'the job does not run forge coverage'
# tests 16
# pass 6
# fail 10
```

The six that pass with no gate at all are the four "one hundredth short" cases, which assert only
the exit code and are satisfied by a missing script exiting non-zero, and two of the three CI cases,
which assert that a `forge test` job exists and that nothing in it discards a failure. Each is paired
with a case that does not pass vacuously: every "is 99%" case asserts the message names the measure,
and the third CI case asserts the gate is invoked at all.

**LLR-VV-004.** All seven cases pass at once. `foundry.toml` already set `runs = 512` and
`depth = 128` in the scaffold, before any invariant test existed to use them, so this requirement was
met before the group started and the test records that rather than driving it. Its red is the
argument, not a run: a value below either minimum, another profile carrying a smaller one, or a
`FOUNDRY_PROFILE` or `FOUNDRY_INVARIANT_*` setting in CI each fails one named case, and the four
assertions are written so that a missing key fails rather than reading as zero.

**The Solidity tests.** All nineteen pass on the first run, for the reason given above. Recorded
here as observed, not glossed: the red for each is its row in the mutation table.

### Green, 2026-09-28

`src/SatStake.sol` gains trace tags and nothing else. `git diff src/SatStake.sol` is 13 insertions
and 12 deletions, and every changed line contains an LLR identifier:

- `contract SatStake` carries `LLR-SC-002 LLR-SC-060 LLR-SC-061` beside the LLR-SC-014 it already had.
- `createPledge` carries `LLR-SC-070 LLR-SC-071 LLR-SC-072 LLR-SC-074`; `settle` carries `LLR-SC-070
  LLR-SC-071 LLR-SC-072 LLR-SC-073 LLR-SC-075`; `markKept` and `markBroken` carry `LLR-SC-072`.
- The lines that maintain each invariant carry it: both writes to `_totalLocked` (070, 071), all
  three writes to a status (072), the record write (074), the `safeTransfer` (075), and the
  `PledgeSettled` emit (073).

New files: `tools/coverage-gate.mjs`, `test/base/OpcodeScan.sol`, `test/SatStake.AbiSurface.t.sol`,
`test/SatStake.Isolation.t.sol`, `test/invariant/SatStakeHandler.sol`,
`test/invariant/SatStake.Invariants.t.sol`, `test/tools/coverage-gate.test.mjs`,
`test/tools/invariant-config.test.mjs`. `.github/workflows/ci.yml` runs the gate in the contracts
job, with Node added to that job. `foundry.toml` gains a `@trace LLR-VV-004` comment over the
`[invariant]` section it configures, and `.gitignore` the summary file the gate step writes.

```
$ forge test
Ran 10 test suites in 42.55s: 180 tests passed, 0 failed, 0 skipped (180 total tests)

$ node --test test/tools/*.test.mjs
# tests 92
# pass 92
# fail 0

$ node tools/trace-check.mjs
trace-check: OK. 51/112 LLRs referenced, 0/55 journeys passing.

$ forge coverage --report summary
| src/SatStake.sol | 100.00% (115/115) | 100.00% (147/147) | 100.00% (30/30) | 100.00% (15/15) |

$ node tools/coverage-gate.mjs coverage-summary.txt
coverage-gate: OK. src/SatStake.sol is at 100% on lines, statements, branches, and functions.
```

One call summary from a fuzz run of 512 sequences of 128 calls, printed by `afterInvariant`:

```
  actions                       128
  creates                       9
  verdicts kept                 3
  verdicts broken               4
  settlements to the staker     3
  settlements of a broken       4
  settlements of an expired     2
  transfers refused by a token  9
  time jumps                    18
  issuer control changes        34
  successes while blocked       14
  calls the contract refused    51
  status transitions recorded   25
  settlement events captured    9
```

And the deterministic 300-call sequence, which checks all six invariants after every call:

```
  actions                       300
  creates                       30
  verdicts kept                 8
  verdicts broken               8
  settlements to the staker     8
  settlements of a broken       5
  settlements of an expired     7
  transfers refused by a token  28
  time jumps                    42
  issuer control changes        77
  successes while blocked       32
  calls the contract refused    115
  status transitions recorded   66
  settlement events captured    20
```

### Decision: where the non-vacuity assertions live, 2026-09-28

`fail_on_revert` is false, so a handler whose every call reverted would satisfy every invariant while
proving nothing. The guard against that is a counter per action and per settlement path, and the
question is where they are asserted to be non-zero.

Asserting each counter in `afterInvariant`, which runs once per sequence, is not sound at the
configured size, and the run above shows why: that sequence reached two settlements of an expired
pledge and three of a kept one, and other sequences printed zero for one of them. The arithmetic is
forced. A sequence is 128 calls over 8 actions, so each action is chosen about 16 times; a full
lifecycle is three calls, so a sequence can complete about 14 of them at best, and the counters for
the three settlement paths compete for the same pledges. The blocklist and pause states persist
between the calls that change them, so an unfavourable stretch fails many creations together rather
than independently, which fattens the tail well past a Poisson estimate. Measured: one campaign of
512 sequences failed such an assertion. With six campaigns in the file that is a test that fails for
no reason roughly once a run.

So `afterInvariant` prints the summary and asserts the one thing it can assert soundly, that the
sequence executed at least one action, and
`test_SC070_everyInvariantHoldsOverALongSequenceThatReachesEveryAction` carries the full set. That
test walks a fixed pseudo-random stream of 300 calls over the same eight actions, checks all six
invariants after every call, and then asserts every counter: 30 creations, both verdicts, all three
settlement paths, 28 refused transfers, time jumps, issuer control changes, successes while an
account was blocked, and calls the contract refused. Being deterministic it cannot flake, and
mutation 179 shows the assertion is live. This is a deliberate departure from the instruction to
assert each counter in `afterInvariant`, on the ground that the instruction is not satisfiable at 128
calls of depth; it is recorded here rather than left implicit.

Two consequences worth naming. The deterministic test is one transaction, and 300 steps of reading
records exhausted memory in a single frame (`EvmError: MemoryOOG`), so each step's action and
invariant check go through an external call to the test contract, which releases that step's memory
when it returns. And the verdict actions are called about twice as often as the creation action, so
without a reservation every pledge would be judged before its deadline and the expired row of the
LLR-SC-041 table would never be reached; one pledge in three is therefore left for its deadline,
while the arbitrary branch of the verdict actions can still name a reserved pledge.

### Decision: the coverage run is not narrowed, 2026-09-28

`forge coverage --report summary` takes 78 seconds with the invariant tests present, against 74
seconds without them, on this machine. Well inside the ten minutes at which narrowing the run would
have been the alternative, so the coverage run stays whole and the gate reads the summary of the
entire suite. The invariant campaigns cost almost nothing under coverage because the same
instrumented build is reused across them.

One incidental finding from that run: `forge coverage` leaves the artifact in `out/` from the
ordinary build in place while running its own rebuild, so the compiled artifact and the deployed
instance are two different compilations of the same source. A first version of
`test_SC060_theCreationBytecodeHasNoDelegatecallSelfdestructOrCallcode` compared the artifact's
deployed bytecode with the chain's and failed under coverage for that reason. It now walks both, and
each has to be clean in its own right.

### Mutation evidence, 2026-09-28

Applied to a copy, restored from that copy afterwards rather than with git, because most of these
files are new in this group and untracked. Invariant mutations ran with `FOUNDRY_INVARIANT_RUNS=64`
at the configured depth of 128, for speed; the deterministic 300-call test is unaffected by that
setting. `cache/invariant` is removed before each run, because Foundry replays a cached failure from
an earlier run and reports it as a replay failure, which reads like a fresh failure and is not one.

| # | Mutation | Failing tests |
|---|---|---|
| 159 | a `receive` function is added | `theCompiledAbiDeclaresNothingPayableAndNoReceiveOrFallback`, `aCallCarryingValueRevertsAndMovesNoFunds` ("empty calldata with value was accepted"), `aCallWithNoMatchingFunctionRevertsWithNoValueToo` |
| 160 | `createPledge` is `payable` | `theCompiledAbiDeclaresNothingPayableAndNoReceiveOrFallback` ("createPledge"), `aCallCarryingValueRevertsAndMovesNoFunds` ("createPledge with value was accepted") |
| 161 | a `payable fallback` is added | the same three as 159 |
| 162 | a fifth non-view external function is added | `theCompiledAbiHasExactlyTheFourNonViewFunctions` ("unexpected non-view function: touch") |
| 163 | `pledgeCount` loses `view` | rejected by the compiler, not run: the invariant functions are `view` and call `pledgeCount`, so `Error (8961)` stops the build. The same holds for `isAllowedToken`, `totalLocked`, `getPledge`, and `allowedTokens`, whose view-ness is pinned at compile time by the suite's own view functions |
| 164 | test mutation: the expected set names a fifth function | `theCompiledAbiHasExactlyTheFourNonViewFunctions` ("missing non-view function: withdrawAll"), so the removed-a-function direction of the assertion is live |
| 165 | a `delegatecall` forwarder is added | `theCreationBytecodeHasNoDelegatecallSelfdestructOrCallcode` (offset 1863), `theDeployedBytecode...` (offset 1114), `theCompiledAbiHasExactlyTheFourNonViewFunctions` |
| 166 | a `selfdestruct` is added | the same three, at offsets 1104 and 355 |
| 167 | the walk does not skip PUSH immediates | `theInstructionWalkSkipsPushDataAndTheMetadataTrailer` ("reported an opcode inside PUSH data"), and both bytecode tests, which now report a delegatecall at offset 1135 of the unmutated contract. A byte search would therefore fail this requirement on a contract that meets it |
| 168 | the walk does not strip the metadata trailer | `theInstructionWalkSkipsPushDataAndTheMetadataTrailer` ("reported an opcode inside the metadata"), and both bytecode tests, which report a selfdestruct at offset 6182 of a 6202-byte deployed code, inside the CBOR trailer |
| 169 | `markKept` moves one token unit to the referee | `aVerdictTransfersNoTokens` ("2998 != 3000") |
| 170 | creation raises the locked total by one too many | `invariant_SC070` ("1889 < 1890"), `invariant_SC071` ("913451128152 != 913451128151"), the 300-call sequence |
| 171 | settlement does not release the stake | 3 of the 8 tests in the invariant file, including the 300-call sequence ("477485338237 < 682947827310") |
| 172 | `settle` drops the `AlreadySettled` check | 4 of the 8, including the sequence, which reports both a second settlement event and the illegal edge `4 to 5` |
| 173 | a verdict may be recorded over an earlier verdict | 4 of the 8; the sequence reports the illegal edge `pledge 5 moved from status 2 to 3`, Kept to Broken |
| 174 | a verdict moves the deadline | 2 of the 8; the sequence reports `pledge 1: deadline: 1700040973 != 1700040972` |
| 175 | settlement zeroes the pledge amount | 3 of the 8; the sequence reports `pledge 2: amount` and the locked total |
| 176 | `PledgeSettled` names the caller as recipient | 2 of the 8; the sequence reports "settled to a stranger" |
| 177 | `PledgeSettled` reports one unit less than the stake | 2 of the 8; the sequence reports `205462489072 != 205462489073` |
| 178 | `settle` swallows a refused transfer | both isolation tests, with "next call did not revert as expected", and the 300-call sequence with `no token ever refused a transfer: 0 <= 0`. The invariant that inspects refused settlements sees nothing, because a swallowed failure is not a refusal, and the locked total falls in step with the status so LLR-SC-070 and LLR-SC-071 still hold. What kills it inside the invariant file is the non-vacuity counter, and what says plainly that the settlement did not happen is the directed pair |
| 179 | test mutation: the handler never creates a pledge | the 300-call sequence ("no pledge was created: 0 <= 0"), so the non-vacuity guard is live |
| 180 | test mutation: every status change is treated as legal | `theLegalEdgeTableIsExactlyTheDiagram` ("edge 0 to 2: true != false"), so the edge table is asserted rather than assumed |
| 181 | `stateOf` loses `view` | `everyReadFunctionAndConstantIsView` ("stateOf: nonpayable != view") and `theCompiledAbiHasExactlyTheFourNonViewFunctions` ("unexpected non-view function: stateOf") |

`src/SatStake.sol` was checked with `git diff` after the runs: only the trace-tag lines differ from
the committed version.

No requirement changed in this group.

Outstanding for the independent review: LLR-SC-060 has method I as well as T, and its inspection row
in `docs/INSPECTIONS.md` belongs to the reviewer, as does the LLR-SC-004 recheck the earlier groups
recorded for every contract group.

### Review follow-up, 2026-09-29

The independent review found ten issues, two of them serious. All ten are fixed below, each with the
mutant or escape case that now fails and the message it fails with. Mutation numbering continues from
181. Invariant mutations again ran with `FOUNDRY_INVARIANT_RUNS=64` at the configured depth of 128,
and `cache/invariant` was removed before each run.

**1. A campaign could be made vacuous, and the guard here did not catch it.** The reviewer replaced
the creation action in the selector list with a duplicate of `markKept`, so the fuzzer was never given
creation, and all eight tests passed in 4.6 seconds instead of 30: with no pledge ever created the
walks in 071, 073 and 074 had no iterations, 072 had no transitions, 075 had no failures, and
`pledgeCount() == createCount()` read `0 == 0`. The `actionCount > 0` assertion held, because the other
seven actions still ran.

Two fixes, a guard and a backstop. `test_SC070_theFuzzerIsGivenEveryHandlerActionExactlyOnce` checks
the registered list itself: eight entries, pairwise distinct, and exactly the eight handler action
selectors, asserted in both directions. It depends on no random draw. And `afterInvariant` now also
asserts `createCount > 0`.

That splits the earlier decision rather than reversing it. The creation action is not in the same class
as the three settlement paths: it succeeds whenever the fuzzer picks it unless a blocklist or a pause
happens to stand in its way for a whole sequence, and the lowest figure seen across many campaigns was
9 creations in 128 calls. The settlement-path counters do compete for the same pledges, and
correct-contract sequences printing zero settlements of a kept pledge were observed here and
reproduced independently by the reviewer, so those stay in the deterministic sequence test. The earlier
entry's reasoning was right about them and too broad in its conclusion.

**2. The artifact-reading tests had no tie to the source.** This is the serious one. `forge coverage`
compiles for itself and leaves the artifact of the last `forge build` in `out/`. The reviewer added a
fifth non-view function, left the artifact stale, and ran the ABI surface tests under coverage: 9
passed, `test_SC061_theCompiledAbiHasExactlyTheFourNonViewFunctions` among them, against a contract
with five non-view functions. CI was safe only by the order of its steps.

Every artifact read now goes through `Artifact.json()` in `test/base/Artifact.sol`, which first
compares the source hash the artifact records at `.metadata.sources["src/SatStake.sol"].keccak256`
with `keccak256` of the source on disk and fails naming the staleness. `foundry.toml` gains read
permission on `./src`. All four artifact readers use it: the ABI surface tests, the AST test of
LLR-SC-005, the `methodIdentifiers` sweep of LLR-SC-014, and the storage layout the shared test base
loads, so a future artifact test inherits the check rather than having to remember it.

Reproduced both ways. With the check removed and the fifth function added, under `forge coverage`:

```
Suite result: ok. 9 passed; 0 failed; 0 skipped
```

With the check in place, the same build:

```
[FAIL: stale artifact: out/SatStake.sol/SatStake.json was built from different source than
src/SatStake.sol: 0x78d177a8... != 0x84634a0d...] test_SC061_theCompiledAbiHasExactlyTheFourNonViewFunctions()
Suite result: FAILED. 5 passed; 4 failed; 0 skipped
```

The four that fail are the four that read the artifact. `theDeployedBytecodeHasNoDelegatecall...`
passes because it reads `address(satStake).code` from the chain and never the artifact, which is why
it was written that way.

**3. An external `pure` function escaped LLR-SC-061.** The count skipped both `view` and `pure`, and
the requirement says four functions that are not `view`. The exemption is gone, so the check is now
literal. Confirmed first from the artifact that this is safe: all twelve entries of the read surface,
the four constant getters included, carry `stateMutability` `view`, which
`test_SC061_everyReadFunctionAndConstantIsView` asserts one by one, so dropping the exemption leaves
the count at four. The file's headline comment claimed to say what the contract does not offer; it now
says what the three tests check and states plainly that the size of the read surface is not among
them, since no requirement forbids a thirteenth view function.

**4. LLR-SC-074 was blind to the one thing it owns.** The handler wrote its creation snapshot
unconditionally, so a creation that wrote over an earlier record refreshed the snapshot in the same
call and the comparison passed. `_rememberCreation` now writes on first sight only and counts a second
sighting as `reusedIdentifierCount`, which `invariant_SC074` asserts is zero.

**5. The LLR-SC-075 invariant asserted LLR-SC-045's sentence.** Checking the refused pledge's own
status, locked total and balance either side of the failed call is the settle group's requirement, and
`pledgeCount() == createCount()` cannot tell "creation kept working after the refusal" from "no
creation was attempted after it".

Those assertions are kept and relabelled `invariant_SC045_aRefusedTransferChangesNothing`, which is a
genuine strengthening: the sentence the settle group proved for single calls now holds over arbitrary
sequences. The requirement's own sentence is asserted by a probe. Whenever a token refuses a pledge's
payout, the handler takes another pledge through creation, a verdict, and settlement in that same call,
while the refusal still stands, and counts it; `invariant_SC075_aRefusedTransferStopsNoOtherPledge`
asserts no probe step was refused, and the deterministic test asserts probes happened at all. The probe
picks a token that is not paused and a staker the token has not blocklisted, because a paused token
refuses every transfer in that token and that is the token's doing, not the contract's; with no such
combination it skips without counting. Its own work is counted only in `probeCount`, never in the
counters that show the fuzzer's actions reached each state, so a run whose verdicts and settlements
were all probes cannot read as a run that judged and settled pledges of its own.

Worth recording plainly: no mutation of the contract can make a probe step fail while the refused
settle still reverts, because a reverting call leaves no state behind, so for this contract the
requirement follows from atomicity. A contract that instead swallowed the refusal stops producing
refusals at all, and is caught by the refusal counter and by the directed tests (mutations 178 and
190). The probe's value is that it asserts the sentence where it applies instead of inferring it, and
mutations 186 and 190 show the assertion is live.

**6. The LLR-SC-072 edge table dropped the diagram's guards.** 05 section 1.2 labels its edges with
conditions, and the table permitted Active to SettledToBeneficiary unconditionally, so a contract that
settled an Active pledge at any time passed all eight tests. A transition now records the caller of the
call that named the pledge and whether that pledge's deadline had been reached, both of which the
handler knows at the point of the call, and the table enforces the labels: Active to Kept or Broken
only for the referee with the deadline not reached, Active to SettledToBeneficiary only with the
deadline reached. A transition the handler did not attribute to a caller, which is what a status
changing as a side effect of another pledge's call looks like, cannot satisfy a condition that names
the referee. `test_SC072_theLegalEdgeTableIsExactlyTheDiagram` now enumerates all 36 pairs against all
four combinations of the two conditions, one line per edge of the diagram.

**7. Two things in `OpcodeScan`.** The walk could advance past the end of the body, which ended it
quietly and reported the truncated tail clean; compiled code never ends inside a PUSH immediate, so it
now reverts with `TruncatedPushImmediate(offset)` and the self-test covers that shape. And the comment
about an ill-fitting trailer length claimed more than the helper gives: it now says that the two length
bytes are trusted, so input that is not compiler output has that many bytes removed from the end
whether they are metadata or not.

**8. Row 178 understated its own evidence**, and is corrected above: the swallowed-refusal mutant also
fails the 300-call sequence with `no token ever refused a transfer: 0 <= 0`.

**9. Bare requirement identifiers in the handler became false rows in the trace matrix.** The checker
counts any identifier in a test file as a test reference, so explanatory comments in the handler had
the matrix listing it as a test for LLR-SC-023, 024, 030, 041, 045, 070, 071 and 075, which it asserts
none of. Those comments now name the requirement in words. Checked first that none of the eight loses
its last reference: five are tested in their own groups, and 070, 071, 074 and 075 are carried by the
`@custom:verifies` tags in the invariant file. The matrix is regenerated.

**10. The coverage gate step could be skipped by its own condition.** `if: hashFiles('test/**/*.t.sol')
!= ''` meant a repository with no tests, which is exactly the state where coverage is zero, would skip
the gate and pass. The condition is gone, and a case asserts the step carries none. The Test step's
own condition is left as it was, since it predates this group.

| # | Mutation | Failing tests |
|---|---|---|
| 182 | test mutation: the selector list loses the creation action | all seven campaigns through `afterInvariant` ("no pledge was created: 0 <= 0") and `theFuzzerIsGivenEveryHandlerActionExactlyOnce` ("action 0 and action 1 are the same selector"). 8 of the 10 tests in the file. The deterministic sequence still passes, because it dispatches by seed rather than through the registered list, which is why the list needs a test of its own |
| 183 | a fifth non-view function, with the artifact left stale under `forge coverage` | the four artifact-reading tests, each with "stale artifact: out/SatStake.sol/SatStake.json was built from different source than src/SatStake.sol". With the freshness check removed the same build passes all nine, which is the reviewer's finding reproduced |
| 184 | an external `pure` function is added | `theCompiledAbiHasExactlyTheFourNonViewFunctions` ("unexpected non-view function: doubleIt") |
| 185 | every seventh creation writes over the previous record | 5 of the 10, including `invariant_SC074` ("one identifier was created twice: 1 != 0"), `invariant_SC072` ("pledge 13 moved from status 1 to 3 by another account, deadline ahead") and `invariant_SC071` |
| 186 | test mutation: the probe does not avoid a blocklisted staker | `invariant_SC075` and the sequence test, both with "a pledge could not be created, judged, or settled while another pledge's payout was refused: 1 != 0" |
| 187 | `settle` drops the deadline guard on an Active pledge | `invariant_SC072` ("pledge 1 moved from status 1 to 5 by its referee, deadline ahead"). Before the guards were recorded, this mutant passed all eight tests in the file |
| 188 | the walk ends quietly on a truncated PUSH immediate | `theInstructionWalkSkipsPushDataAndTheMetadataTrailer` ("next call did not revert as expected") |
| 189 | the coverage gate step regains a condition | `LLR-VV-003 coverage gate > CI runs the gate > runs the gate unconditionally` ("the coverage gate step can be skipped by its own condition") |
| 190 | test mutation: the probe never runs after a refusal | the sequence test ("no other pledge was taken through its lifecycle after a refusal: 0 <= 0") |

Runs after the follow-up: `forge fmt --check` clean; `forge build` no warnings; `forge test` 182
passed, 0 failed, 85s; `node --test test/tools/*.test.mjs` 93 passed; `node tools/trace-check.mjs`
`OK. 51/112 LLRs referenced`; `forge coverage --report summary` 172s with `src/SatStake.sol` at 100%
on all four measures and the gate passing. The coverage run grew from 76s to 172s with the seventh
campaign and the probe, still far inside the ten minutes at which narrowing it would have been
considered, so it stays whole.

One figure to watch: the deterministic 300-call sequence now costs 648 million gas of the 1073 million
a test may use, because the probe adds a pledge per refusal and every walk is over every pledge. It
already had to be split across external calls to keep its memory down; if it grows again, the step
count is the dial.

One fuzz sequence of 128 calls, printed by `afterInvariant`:

```
  actions                       128
  creates                       37
  verdicts kept                 6
  verdicts broken               1
  settlements to the staker     4
  settlements of a broken       1
  settlements of an expired     3
  transfers refused by a token  21
  probes after a refusal        21
  time jumps                    17
  issuer control changes        23
  successes while blocked       3
  calls the contract refused    57
  status transitions recorded   94
  settlement events captured    29
```

The deterministic 300-call sequence, which checks all seven invariants after every call:

```
  actions                       300
  creates                       57
  verdicts kept                 7
  verdicts broken               9
  settlements to the staker     7
  settlements of a broken       6
  settlements of an expired     9
  transfers refused by a token  27
  probes after a refusal        27
  time jumps                    42
  issuer control changes        77
  successes while blocked       30
  calls the contract refused    113
  status transitions recorded   149
  settlement events captured    49
```

The fuzz sequence is why the split in finding 1 was needed: creation reached 37 in it, while the
three settlement paths sat at 4, 1 and 3, one unlucky draw from zero. The deterministic sequence
reaches 7, 6 and 9 on the same paths and cannot draw differently.

### Review confirmation and one regression, 2026-09-29

The reviewer confirmed the ten fixes on a second pass and found that one of them was a regression,
introduced by the fix to its own finding 1. `assertGt(handler.createCount(), 0)` in `afterInvariant`
fails on the correct contract about one run in three.

Reproduced by the lead before changing anything, over the whole invariant file with no test filter:

```
FOUNDRY_FUZZ_SEED=2 forge test --match-path 'test/invariant/*'
  Suite result: FAILED. 9 passed; 1 failed   [FAIL: no pledge was created: 0 <= 0]
FOUNDRY_FUZZ_SEED=7 forge test --match-path 'test/invariant/*'
  Suite result: FAILED. 9 passed; 1 failed   [FAIL: no pledge was created: 0 <= 0]
```

The reviewer's own reproduction command added `--match-test invariant_SC073`, which passes: filtering
to one test shifts the seed stream, so the sequence that creates nothing is no longer drawn. The
finding is right and the command was not, which is why it was rerun unfiltered rather than taken on
report.

The mechanism is the one the implementer gave when it declined the assertion, and the reviewer has
withdrawn its recommendation: `afterInvariant` runs per sequence, and the pause and blocklist states
persist between the calls that set them, so a sequence that pauses both tokens or blocklists every
actor early fails every creation after it. The shrunk counterexample is five calls, all `setPause`
and `setBlocklist`, creating nothing, which says nothing about the contract. The figure recorded
earlier as a measurement, "the lowest observed was 9 creations in 128 calls", was not one: it came
from the per-run summaries forge prints, which are one run per invariant function rather than the
minimum over 512 x 7 sequences.

The line is deleted. `assertGt(handler.actionCount(), 0)` stays, since every action increments it
whether its call succeeded or reverted. The fault the deleted line was added for is caught by
`test_SC070_theFuzzerIsGivenEveryHandlerActionExactlyOnce`, which the lead verified alone: with
`selectors[0]` replaced by a duplicate of `markKept.selector`, that test fails with `action 0 and
action 1 are the same selector` in 10974 gas, while all seven campaigns pass. The test file was
restored from a copy afterwards and compared byte for byte.

| # | Mutation | Failing test |
|---|---|---|
| 191 | the creation action is replaced by a duplicate of `markKept` | `theFuzzerIsGivenEveryHandlerActionExactlyOnce`, naming the duplicate |

Seeds 2 and 7 now pass the whole file, 10 of 10 each.

LLR-SC-075's evidence is recorded as four parts rather than one, at the reviewer's judgement and
confirmed sound. A reverted frame undoes every storage write it and the frames it called made,
including the mock token's and, under EIP-1153, transient storage; the guard in use is the storage
variant. So at probe time the contract's storage is what it was before the refused settle, and any
probe step that failed would have failed without the refusal. **No mutation of `src/SatStake.sol`
can make a probe step fail while the refusal still surfaces as a revert**, so on the class of
contracts that satisfy LLR-SC-045, LLR-SC-075 follows by atomicity. The four parts are: the two
directed tests in `test/SatStake.Isolation.t.sol`, which are the discriminating evidence across
distinct pledges, tokens, recipients and settlement paths; the refusal and probe counters, which
close the case of a contract that swallows a refusal instead of reverting, since both fall to zero;
the argument above; and the probe as a live demonstration at real refusals over arbitrary sequences
rather than two hand-built fixtures. What the probe is sensitive to is the harness, not the
contract: mutants 186 and 190 both break the probe's own setup. A reader who took
`probeFailureCount == 0` for a discriminating check on SatStake would be mistaken, which is why it
is written down here.

Final run: `forge fmt --check` clean; `forge test` 182 passed, 0 failed; `node --test
test/tools/*.test.mjs` 93 passed; `node tools/trace-check.mjs`: `OK. 51/112 LLRs referenced, 0/55
journeys passing.`; `forge coverage --report summary`: `src/SatStake.sol | 100.00% (115/115) |
100.00% (147/147) | 100.00% (30/30) | 100.00% (15/15)`, and `tools/coverage-gate.mjs` accepts it.

Carry-forward: none for the contract, which is complete. The DP group inherits nothing from here
beyond the coverage gate already wired into CI.
