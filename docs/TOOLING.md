# Tooling

Every skill, MCP server, and non-trivial package or tool used to build SatStake, with its source and the reason it was chosen.

| Tool | Version | Source | Reason |
|---|---|---|---|
| Foundry (forge, cast, anvil) | 1.0.0 | https://github.com/foundry-rs/foundry | Contract build, test, coverage, scripted deployment (LLR-DP-003) |
| Node.js | 22 | https://nodejs.org | Trace checker, frontend toolchain, Claude Code Bash guard |
| gitleaks | 8.30.1 | Homebrew core, https://github.com/gitleaks/gitleaks | Secret scan in the pre-commit hook and CI (LLR-DP-010, 011) |
| GitHub CLI | installed | https://cli.github.com | Repository and Pages setup, CI status |
| forge-std | v1.16.2 (git submodule at tag) | https://github.com/foundry-rs/forge-std | Test framework |
| OpenZeppelin Contracts | v5.7.0 (git submodule at tag) | https://github.com/OpenZeppelin/openzeppelin-contracts | `SafeERC20` and `ReentrancyGuard` (LLR-SC-003). No open advisory affects either module |
| GitHub Actions: checkout, setup-node, foundry-toolchain | v7.0.1, v7.0.0, v1.9.1, pinned by commit SHA in `ci.yml` | GitHub, Foundry | CI. SHAs, not tags, so a moved tag cannot change what runs |
| gitleaks in CI | 8.30.1 release binary, SHA-256 checked | https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1 | Same version as the pre-commit hook, full-history scan. Replaced gitleaks-action, which pinned an older gitleaks, scanned only the pushed range, and skipped checksum verification |
| `@circle-fin/swap-kit`, `@circle-fin/adapter-viem-v2` | 1.7.0, 1.18.0 | npm, Circle maintainers | One-off testnet swap of USDC for cirBTC in Phase 0; run from a scratch directory, not a project dependency. `toml` overridden to 4.3.0 to clear high advisories |
| `viem` | 2.57.2, exact pin, `package-lock.json` committed | https://github.com/wevm/viem, npm | The live testnet end-to-end script in `e2e/` (LLR-VV-005) and its logic tests. `npm audit` reports 0 vulnerabilities. Also the planned client library of the frontend |
| `vite`, `@vitejs/plugin-react` | 8.3.2, 6.1.1, exact pins in `app/package-lock.json` | https://github.com/vitejs/vite, https://github.com/vitejs/vite-plugin-react | Build and dev server of the frontend (LLR-FE-080). The build fails for a target with no contract address (LLR-FE-002) |
| `react`, `react-dom` | 19.3.0 | https://github.com/facebook/react | The frontend UI library (LLR-FE-080) |
| `wagmi`, `@tanstack/react-query` | 3.7.7, 5.104.0 | https://github.com/wevm/wagmi, https://github.com/TanStack/query | The frontend's client configuration and the wallet layer that later groups build on (LLR-FE-080); `react-query` is wagmi's required peer and also runs the one-time load checks |
| `typescript`, `typescript-eslint`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals` | 6.0.3, 8.71.0, 10.11.0, 10.0.1, 7.1.1, 17.13.0 | https://github.com/microsoft/TypeScript, https://github.com/typescript-eslint/typescript-eslint, https://github.com/eslint/eslint | Strict type checking and lint with no `any` (LLR-FE-080). TypeScript stays on 6.0 because typescript-eslint 8.71.0 supports `<6.1.0` |
| `vitest`, `jsdom`, `@testing-library/react` | 5.0.3, 30.1.1, 16.3.3 | https://github.com/vitest-dev/vitest, https://github.com/jsdom/jsdom, https://github.com/testing-library/react-testing-library | Frontend unit and component tests (LLR-VV-006). `npm audit` on `app/` reports 0 vulnerabilities |
| `@types/react`, `@types/react-dom`, `@types/node` | 19.3.0, 19.3.0, 26.6.3 | https://github.com/DefinitelyTyped/DefinitelyTyped | Type declarations only |

## Agent safeguards

| File | Purpose |
|---|---|
| `.claude/settings.json` | Allows routine build commands; denies reads of credential and personal locations, environment dumps, force-push, and piping downloads into a shell. `blockReadsOutsideWorkingDirectories` is `false` since 2026-10-01, with Liam's approval: the blanket block prompted on every command Claude Code could not parse, even in auto mode. Reads outside the repository stay forbidden by CLAUDE.md section 5 and are guarded by the deny rules and `guard-bash.mjs` |
| `.claude/hooks/guard-bash.mjs` | Inspects each whole shell command, not only its prefix; allows the burner password files only as the value of `--password-file` and keeps `rm` inside the repository |
| `.claude/agents/implementer.md` | Implements one LLR group test-first; never reviews its own work |
| `.claude/agents/requirements-reviewer.md` | Reviews each group's diff against requirement text only (06 section 8 step 5) |
| `.claude/agents/frontend-reviewer.md` | Reviews frontend groups for clarity, copy rules, accessibility, and privacy |
| `.githooks/pre-commit` | Runs gitleaks on staged changes; enabled with `git config core.hooksPath .githooks` |
