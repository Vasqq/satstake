# Tooling

Every skill, MCP server, and non-trivial package or tool used to build SatStake, with its source and the reason it was chosen.

| Tool | Version | Source | Reason |
|---|---|---|---|
| Foundry (forge, cast, anvil) | 1.0.0 | https://github.com/foundry-rs/foundry | Contract build, test, coverage, scripted deployment (LLR-DP-003) |
| Node.js | 22 | https://nodejs.org | Trace checker, frontend toolchain, Claude Code Bash guard |
| gitleaks | 8.30.1 | Homebrew core, https://github.com/gitleaks/gitleaks | Secret scan in the pre-commit hook and CI (LLR-DP-010, 011) |
| GitHub CLI | installed | https://cli.github.com | Repository and Pages setup, CI status |

## Agent safeguards

| File | Purpose |
|---|---|
| `.claude/settings.json` | Allows routine build commands; denies file reads outside the repository, environment dumps, force-push, and piping downloads into a shell |
| `.claude/hooks/guard-bash.mjs` | Inspects each whole shell command, not only its prefix; allows the burner password files only as the value of `--password-file` and keeps `rm` inside the repository |
| `.githooks/pre-commit` | Runs gitleaks on staged changes; enabled with `git config core.hooksPath .githooks` |
