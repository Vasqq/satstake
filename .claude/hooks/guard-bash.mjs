#!/usr/bin/env node
// PreToolUse guard for Bash. Permission rules match command prefixes only, so a
// secret read or env dump hidden inside a pipeline would slip past them. This
// hook inspects the whole command string and blocks with exit code 2.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const cmd = input.tool_input?.command ?? "";
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// The burner password files may appear only as the value of --password-file.
const withoutPasswordFlags = cmd.replace(
  /--password-file[= ]+~\/\.satstake\/(deployer|referee)\.pw\b/g,
  "",
);

const rules = [
  [/(^|[;&|(`]\s*)(env|printenv|set|export)\s*($|[;&|)`])/, "dumps environment variables"],
  [/(^|[;&|(`]\s*)(env|printenv)\s*\|/, "dumps environment variables"],
  [/\.satstake\//, "touches a burner password file outside --password-file"],
  [/\.foundry\/keystores/, "touches a keystore directly; use --account"],
  [/cast\s+wallet\s+(private-key|decrypt-keystore|change-password)/, "reveals or alters a keystore secret"],
  [/~\/\.(ssh|gnupg|aws|azure|kube|docker|npmrc|netrc|config)\b/, "reads credentials outside the repository"],
  [/~\/(Library|\.(zsh|bash)_history)\b/, "reads private host data"],
  [/\b(pbpaste|security\s+find-)/, "reads the clipboard or keychain"],
  [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/, "pipes a download into a shell"],
  [/git\s+push\b.*\s(--force(-with-lease)?|-f)\b/, "force-pushes"],
];

for (const [pattern, reason] of rules) {
  if (pattern.test(withoutPasswordFlags)) {
    console.error(`Blocked by .claude/hooks/guard-bash.mjs: command ${reason}.`);
    process.exit(2);
  }
}

// rm may only target paths inside the repository or the session scratchpad.
const rmTargets = [...cmd.matchAll(/(?:^|[;&|]\s*)rm\s+([^;&|]+)/g)].flatMap((m) =>
  m[1].split(/\s+/).filter((a) => a && !a.startsWith("-")),
);
for (const target of rmTargets) {
  if (target.startsWith("~") || target.includes("$HOME")) {
    console.error(`Blocked: rm outside the repository (${target}).`);
    process.exit(2);
  }
  const abs = resolve(projectDir, target);
  const allowed =
    abs === projectDir ? false :
    abs.startsWith(projectDir + "/") ||
    /^\/(private\/)?tmp\/claude-/.test(abs);
  if (!allowed) {
    console.error(`Blocked: rm outside the repository (${target}).`);
    process.exit(2);
  }
}
