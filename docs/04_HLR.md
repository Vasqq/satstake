# 04 High-Level Requirements

Version 1.2, 2026-09-24. Status: baselined. These requirements are the law of the project. Code that contradicts a requirement is a defect in the code. A requirement that proves wrong is changed here first, with a change-log entry, and only then in code.

## Conventions

- "Shall" states a mandatory, verifiable requirement. No other modal verbs are used.
- "The system" means the SatStake contract and the SatStake web application together. "The contract" and "the application" narrow the scope.
- Verification methods: **T** test, **A** analysis, **I** inspection, **D** demonstration.
- Sources: NS = 02_NORTH_STAR.md section or property; UJ = 03_USER_JOURNEYS.md; V = 01_VERIFICATION_PASS.md.
- Children are the low-level requirements in 05_LLR.md that implement each HLR. Every HLR has at least one child; every LLR has at least one parent.

## Contract behaviour

| ID | Requirement | Source | Method | Children |
|---|---|---|---|---|
| HLR-001 | The system shall allow any account to create a pledge consisting of a promise text, a stake amount in an allowlisted token, a referee, a beneficiary, and a deadline. | NS 3; UJ-10, UJ-11 | T | LLR-SC-010, 011, 012, 020, 022, 025, 026, 027, 028, 029; LLR-FE-033, 037 |
| HLR-002 | The contract shall hold each pledge's stake from creation until that pledge is settled. | NS P1; UJ-10 | T | LLR-SC-027, 028, 043 |
| HLR-003 | The contract shall allow only the pledge's referee to record a verdict, shall accept exactly one verdict per pledge, and shall accept it only while the deadline has not been reached. | NS P4; UJ-30 to UJ-33, UJ-60 | T | LLR-SC-030, 031, 032, 033, 072 |
| HLR-004 | The contract shall treat a pledge that has no verdict when its deadline is reached as broken. | NS P3; UJ-42 | T | LLR-SC-041, 051; LLR-FE-012 |
| HLR-005 | The contract shall transfer the full stake of a kept pledge to its staker, and the full stake of a broken or expired pledge to its beneficiary, exactly once. | NS P1; UJ-40 to UJ-45 | T | LLR-SC-040, 041, 042, 044, 072, 073 |
| HLR-006 | The contract shall allow any account to trigger settlement of a settleable pledge without changing its recipient. | NS D-02; UJ-43 | T | LLR-SC-040, 041 |
| HLR-007 | The contract shall provide no means to cancel, reduce, extend, or redirect a pledge after creation. | NS P1; UJ-50, UJ-51 | I, T | LLR-SC-060, 061, 074 |
| HLR-008 | The contract shall reject a pledge unless its staker, referee, and beneficiary are pairwise distinct, non-zero, and not the contract itself. | NS D-08; UJ-12, UJ-52 | T | LLR-SC-023, 024; LLR-FE-030 |
| HLR-009 | The contract shall accept stakes only in tokens from an allowlist fixed at deployment. | NS D-05; UJ-61, UJ-62 | T, I | LLR-SC-013, 014, 021, 054 |
| HLR-010 | The contract shall contain no privileged role and no function that lets any account other than the rules move, freeze, or alter a pledge. | NS P2; UJ-51, UJ-86 | I | LLR-SC-002, 014, 060, 061 |
| HLR-011 | A failure to settle one pledge shall not prevent the creation, verdict, or settlement of any other pledge. | NS P5; UJ-46 | T | LLR-SC-043, 075 |
| HLR-012 | If any token transfer within an operation fails, the contract shall revert the whole operation and leave all pledge state unchanged. | NS P5; UJ-14, UJ-15, UJ-46, UJ-47 | T | LLR-SC-027, 045 |
| HLR-013 | The contract shall expose every field and the current state of every pledge through view functions callable without a transaction. | NS P6; UJ-01, UJ-20 | T | LLR-SC-010, 011, 050, 051, 052, 055 |
| HLR-014 | The system shall allow any account to enumerate, in pages, the pledges in which a given address is staker, referee, or beneficiary. | NS D-06; UJ-23, UJ-64 | T | LLR-SC-053; LLR-FE-050 |
| HLR-015 | For each allowlisted token, the contract's balance shall at all times be at least the sum of the stakes of its unsettled pledges in that token. | NS P1; UJ-62, UJ-63 | T, A | LLR-SC-003, 027, 028, 070, 071 |
| HLR-016 | The contract shall emit an event for every pledge creation, verdict, and settlement. | NS P6 | T | LLR-SC-029, 033, 044 |
| HLR-017 | For any block timestamp, exactly one of "verdict permitted" and "deadline reached" shall hold for an active pledge. | V-10; UJ-32 | T, A | LLR-SC-032, 041, 051 |
| HLR-018 | The contract shall be built with pinned, reproducible compiler settings and shall document every external function. | V-13 | I | LLR-SC-001, 004, 005, 080 |

## Application behaviour

| ID | Requirement | Source | Method | Children |
|---|---|---|---|---|
| HLR-020 | The application shall communicate what SatStake does, how it works, and evidence that it is live on Arc mainnet, to a visitor without a wallet. | NS 9; UJ-01, UJ-70 | D, I | LLR-FE-070 |
| HLR-021 | The application shall guide a staker from an empty form to a created pledge using the fewest wallet prompts the token requires, and shall raise no wallet prompt for an input the contract would reject. | UJ-10 to UJ-16 | T, D | LLR-FE-030, 031, 033, 036, 037 |
| HLR-022 | The application shall present each pledge on its own shareable page, readable without a wallet, and shall offer each connected party only the actions valid for its role and the pledge's state. | UJ-20 to UJ-22, UJ-31, UJ-34 | T, D | LLR-FE-013, 040, 041, 042, 043, 044 |
| HLR-023 | The application shall derive all displayed pledge state and all time-dependent behaviour from chain data, not from the device clock or local storage. | UJ-24, UJ-25 | T | LLR-FE-010, 011, 012 |
| HLR-024 | The application shall explain every failure in plain language with a next step. | UJ-12, UJ-14, UJ-15, UJ-21, UJ-32, UJ-44, UJ-46, UJ-47 | T | LLR-FE-060, 061, 062 |
| HLR-025 | The application shall detect browser wallets, connect on user request, and ensure the wallet is on the configured Arc network before any write. | UJ-02, UJ-03, UJ-93 | T, D | LLR-FE-005, 020, 021, 022, 023, 074 |
| HLR-026 | The application shall enter and display amounts in token units using decimals read from the token contract, and shall never mix native and ERC-20 USDC units. | V-05; UJ-10, UJ-11 | T | LLR-FE-006, 032, 045 |
| HLR-027 | The application shall disclose the trust model and known limitations, and shall warn the staker about referee trust and beneficiary irrecoverability before creation. | NS P7, NS 7; UJ-17, UJ-18, UJ-63, UJ-65 | I, D | LLR-FE-034, 035, 071 |
| HLR-028 | The application shall be usable on screens from 360 to 1440 pixels wide and by keyboard, and shall meet WCAG 2.1 AA contrast. | NS 9 | I, D | LLR-FE-072 |
| HLR-029 | The application shall tolerate lagging, failing, or gated RPC endpoints and explorers without losing function. | V-02, V-03, V-11; UJ-90 to UJ-92 | T | LLR-FE-003, 004, 005, 040 |
| HLR-035 | The application shall send no user data to any party other than the configured RPC endpoints and the user's wallet. | NS 8 | I | LLR-FE-073 |

## Deployment, submission, and verification

| ID | Requirement | Source | Method | Children |
|---|---|---|---|---|
| HLR-030 | The system shall be deployable to Arc testnet and mainnet from the repository by scripts, with keys held only in encrypted keystores and no secrets in the repository. | UJ-80, UJ-82, UJ-84 | I, D | LLR-DP-001, 003, 004, 008, 010, 011, 012; LLR-FE-001, 002, 080, 081 |
| HLR-031 | The deployed contract source shall be publicly verified on Sourcify and on the Arc explorer. | V-04, V-16; UJ-83 | D | LLR-DP-006, 007 |
| HLR-032 | Every deployment shall be recorded in the repository with the provenance of every external address it depends on. | V-06; UJ-86 | I | LLR-DP-002, 005 |
| HLR-033 | Arc mainnet shall hold demonstration pledges covering settlement to a staker, expiry settlement to a beneficiary, broken settlement to a beneficiary, and one active pledge that remains active through November 1, 2026. | NS 9; UJ-85, UJ-70 | D | LLR-DP-009 |
| HLR-034 | The submission shall meet every DoraHacks Arc Microgrants requirement and shall contain no claim the system does not support. | NS P7; UJ-66, UJ-70 | I | LLR-SB-001, 002, 003, 004, 005 |
| HLR-040 | Every low-level requirement shall trace to implementing code and to verification evidence, and the traceability shall be checked automatically. | Liam directive | T | LLR-VV-001, 002 |
| HLR-041 | The contract shall be verified by unit, fuzz, invariant, and live-network tests with full statement and branch coverage. | NS 9 | T, A | LLR-VV-003, 004, 005, 006, 007, 008 |
| HLR-042 | Every user journey shall have a recorded verification result, and the product shall be released only when every journey has its expected outcome. | NS 11 | T, D | LLR-VV-009, 010 |
| HLR-043 | Every requirement implemented with a test shall have that test written and observed failing before the implementing code exists. | NS 11 | I | LLR-VV-011 |

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-24 | Baseline |
| 1.1 | 2026-09-24 | Added HLR-042 (journey acceptance) and HLR-043 (test-first evidence) after review of the definition of done |
| 1.2 | 2026-09-24 | Security children added to HLR-025 and HLR-030 |
