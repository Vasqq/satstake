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
| GitHub Actions: configure-pages, upload-pages-artifact, deploy-pages | v6.0.0, v5.0.0, v5.0.1, pinned by commit SHA in `pages.yml` | GitHub, https://github.com/actions | Publishing the site to GitHub Pages (UJ-84). The `github-pages` environment allows `main` and, since 2026-10-03, `worktree-fe-config-reading`, where the work lands first |
| gitleaks in CI | 8.30.1 release binary, SHA-256 checked | https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1 | Same version as the pre-commit hook, full-history scan. Replaced gitleaks-action, which pinned an older gitleaks, scanned only the pushed range, and skipped checksum verification |
| `@circle-fin/swap-kit`, `@circle-fin/adapter-viem-v2` | 1.7.0, 1.18.0 | npm, Circle maintainers | One-off testnet swap of USDC for cirBTC in Phase 0; run from a scratch directory, not a project dependency. `toml` overridden to 4.3.0 to clear high advisories |
| `viem` | 2.57.2, exact pin, `package-lock.json` committed | https://github.com/wevm/viem, npm | The live testnet end-to-end script in `e2e/` (LLR-VV-005) and its logic tests. `npm audit` reports 0 vulnerabilities. Also the planned client library of the frontend |
| `vite`, `@vitejs/plugin-react` | 8.3.2, 6.1.1, exact pins in `app/package-lock.json` | https://github.com/vitejs/vite, https://github.com/vitejs/vite-plugin-react | Build and dev server of the frontend (LLR-FE-080). The build fails for a target with no contract address (LLR-FE-002) |
| `react`, `react-dom` | 19.3.0 | https://github.com/facebook/react | The frontend UI library (LLR-FE-080) |
| `wagmi`, `@tanstack/react-query` | 3.7.7, 5.104.0 | https://github.com/wevm/wagmi, https://github.com/TanStack/query | The frontend's client configuration and the wallet layer that later groups build on (LLR-FE-080); `react-query` is wagmi's required peer and also runs the one-time load checks |
| `typescript`, `typescript-eslint`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals` | 6.0.3, 8.71.0, 10.11.0, 10.0.1, 7.1.1, 17.13.0 | https://github.com/microsoft/TypeScript, https://github.com/typescript-eslint/typescript-eslint, https://github.com/eslint/eslint | Strict type checking and lint with no `any` (LLR-FE-080). TypeScript stays on 6.0 because typescript-eslint 8.71.0 supports `<6.1.0` |
| `vitest`, `jsdom`, `@testing-library/react` | 5.0.3, 30.1.1, 16.3.3 | https://github.com/vitest-dev/vitest, https://github.com/jsdom/jsdom, https://github.com/testing-library/react-testing-library | Frontend unit and component tests (LLR-VV-006). `npm audit` on `app/` reports 0 vulnerabilities |
| `@types/react`, `@types/react-dom`, `@types/node` | 19.3.0, 19.3.0, 26.6.3 | https://github.com/DefinitelyTyped/DefinitelyTyped | Type declarations only |
| `playwright` | 1.63.0, exact pin in `app/package-lock.json`; Chromium headless shell kept in `app/node_modules` via `PLAYWRIGHT_BROWSERS_PATH=0` | https://github.com/microsoft/playwright, npm, Microsoft maintainers | `app/scripts/screenshots.mjs` captures every view at 360 and 1440 px, light and dark, into the gitignored `cache/screenshots/`, so the frontend reviewer reads the rendered app. A review aid, not a test. `npm audit` reports 0 vulnerabilities |
| Fonts: Inter Tight 800 and 900, Inter 400 to 700, IBM Plex Mono 400 and 500 | `@fontsource/inter-tight`, `@fontsource/inter`, `@fontsource/ibm-plex-mono` 5.3.0, Latin subset woff2 only, copied into `app/public/fonts/` with each OFL licence; tarball SHA-256 `827a0047…07ef`, `02034af8…8fd6`, `60d3c0cf…d029` | https://github.com/fontsource/font-files, npm; faces by the Inter Project (rsms) and IBM | The approved design's display, body, and chain-data faces, self-hosted because LLR-FE-073 forbids runtime third-party fonts. Not a package dependency: the files are committed and served from the site's own origin |
| Slither (`slither-analyzer`) | 0.11.6, exact pin | https://github.com/crytic/slither, PyPI, Trail of Bits | Static analysis of the contract (LLR-VV-008) in the CI `slither` job, and locally from a gitignored venv in `cache/`. It runs `forge clean` before compiling, so run `forge build` after a local run: the app imports its ABI from `out/` |

## Agent safeguards

| File | Purpose |
|---|---|
| `.claude/settings.json` | Allows routine build commands; denies reads of credential and personal locations, environment dumps, force-push, and piping downloads into a shell. `blockReadsOutsideWorkingDirectories` is `false` since 2026-10-01, with Liam's approval: the blanket block prompted on every command Claude Code could not parse, even in auto mode. Reads outside the repository stay forbidden by CLAUDE.md section 5 and are guarded by the deny rules and `guard-bash.mjs` |
| `.claude/hooks/guard-bash.mjs` | Inspects each whole shell command, not only its prefix; allows the burner password files only as the value of `--password-file` and keeps `rm` inside the repository |
| `.claude/agents/implementer.md` | Implements one LLR group test-first; never reviews its own work |
| `.claude/agents/requirements-reviewer.md` | Reviews each group's diff against requirement text only (06 section 8 step 5) |
| `.claude/agents/frontend-reviewer.md` | Reviews frontend groups for clarity, copy rules, accessibility, and privacy |
| `.githooks/pre-commit` | Runs gitleaks on staged changes; enabled with `git config core.hooksPath .githooks` |

## Agent skills

Installed at project scope in `.claude/skills/` with `npx -y skills@1.7.0 add ... -a claude-code --copy`; the directory is gitignored, since it is third-party content, and `skills-lock.json` (committed) records each source and hash so the install can be repeated. Read before use: instructions and data only, plus offline Python search scripts in `ui-ux-pro-max`; no network calls, no credential or environment reads. Used for the frontend restyle (2026-10-08).

| Skill | Source | Reason |
|---|---|---|
| `ui-ux-pro-max` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | Accessibility and UX pass on every view (contrast, touch targets, forms, focus) and its pre-delivery checklist before review (LLR-FE-072) |
| `emil-design-eng` | https://github.com/emilkowalski/skills | Polish rules: press feedback, easing, no `transition: all`, hover gating |
| `animate` | https://github.com/emilkowalski/skills | Building the rotating promise card and the press feedback (LLR-FE-070) |
| `review-animations` | https://github.com/emilkowalski/skills | Review of all motion before commit |
| `break-ui` | https://github.com/emilkowalski/skills | Stress-testing the promise card, the pledge page, and My promises with worst-case data |
