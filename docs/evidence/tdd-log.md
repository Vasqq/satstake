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
