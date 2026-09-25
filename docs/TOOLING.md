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

## Agent safeguards

| File | Purpose |
|---|---|
| `.claude/settings.json` | Allows routine build commands; denies file reads outside the repository, environment dumps, force-push, and piping downloads into a shell |
| `.claude/hooks/guard-bash.mjs` | Inspects each whole shell command, not only its prefix; allows the burner password files only as the value of `--password-file` and keeps `rm` inside the repository |
| `.claude/agents/implementer.md` | Implements one LLR group test-first; never reviews its own work |
| `.claude/agents/requirements-reviewer.md` | Reviews each group's diff against requirement text only (06 section 8 step 5) |
| `.claude/agents/frontend-reviewer.md` | Reviews frontend groups for clarity, copy rules, accessibility, and privacy |
| `.githooks/pre-commit` | Runs gitleaks on staged changes; enabled with `git config core.hooksPath .githooks` |
