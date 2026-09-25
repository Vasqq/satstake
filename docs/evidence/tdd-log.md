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
