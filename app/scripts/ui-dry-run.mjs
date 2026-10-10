// UI dry run of the Signed frontend against Arc testnet, driven like a person in a real browser. Usage, from app/:
//   npm run build:testnet
//   VITE_NETWORK=testnet ./node_modules/.bin/vite preview --port 4173 --strictPort --host 127.0.0.1   (kept running)
//   SATSTAKE_ENV_FILE=<file holding TESTNET_PRIVATE_KEY> PLAYWRIGHT_BROWSERS_PATH=0 node scripts/ui-dry-run.mjs
//
// The site is a local build served from this worktree. The script refuses any other host, so the published site
// (which serves mainnet) cannot be driven by it. The page gets an injected EIP-1193 wallet that announces itself
// over EIP-6963 and forwards every request to this process, which signs with a viem client for the role the
// session plays. The staker is the testnet operator, whose key is read by parseEnvKey and never printed or
// written. Referee, beneficiary and an unrelated settler are throwaway keys made in memory; each is funded with
// gas and swept back at the end, including after a failure. Screenshots go to the gitignored cache/dry-run-signed/
// and the record to docs/evidence/ui-dry-run-signed-testnet.md. PROBE=1 rejects every send, funds nothing, stops
// at the first rejected "Seal it", and writes its record under cache/ instead.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  defineChain,
  erc20Abi,
  formatUnits,
  getAddress,
  hexToBytes,
  http,
  parseEventLogs,
  parseUnits,
  toHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, EXPLORER, allowedSendTarget, assertChainId, explorerTx, fundingFor, parseEnvKey, sweepToOperator, withRetry } from "../../e2e/lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = process.env.SATSTAKE_SITE ?? "http://127.0.0.1:4173/";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(SITE)) throw new Error(`refusing to run: ${SITE} is not a local preview server`);
const PROBE = process.env.PROBE === "1";
const RPC = "https://rpc.testnet.arc.io";
const OUT = join(root, "cache/dry-run-signed");
const EVIDENCE = PROBE ? join(root, "cache/ui-dry-run-signed-probe.md") : join(root, "docs/evidence/ui-dry-run-signed-testnet.md");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

const deployment = readJson(`deployments/${CHAIN_ID}.json`);
const tokenConfig = readJson(`deployments/config/${CHAIN_ID}.json`);
const abi = readJson("out/SatStake.sol/SatStake.json").abi;
const CONTRACT = getAddress(deployment.address);
const tokenAddress = (symbol) => getAddress(tokenConfig.tokens.find((t) => t.symbol === symbol).address);
const USDC = tokenAddress("USDC");
const CIRBTC = tokenAddress("cirBTC");
const STATE = ["Active", "Expired", "Kept", "Broken", "SettledToStaker", "SettledToBeneficiary"];

const CIRBTC_SATS = 100n;
const CIRBTC_AMOUNT = CIRBTC_SATS; // 8 decimals, so one sat is one unit
const USDC_AMOUNT = parseUnits("0.1", 6);
const HUMAN_CONFIRM_MS = 1500; // a person takes a moment to confirm in a wallet; also lets the prompt state be seen
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

if (!process.env.SATSTAKE_ENV_FILE) throw new Error("SATSTAKE_ENV_FILE is not set");
const operator = privateKeyToAccount(parseEnvKey(readFileSync(process.env.SATSTAKE_ENV_FILE, "utf8")));
const accounts = {
  staker: operator,
  referee: privateKeyToAccount(generatePrivateKey()),
  beneficiary: privateKeyToAccount(generatePrivateKey()),
  settler: privateKeyToAccount(generatePrivateKey()),
};

const chain = defineChain({ id: CHAIN_ID, name: "Arc testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC) });
const read = (fn) => withRetry(fn);

// ---------------------------------------------------------------- record

const redact = (text) =>
  String(text)
    .replaceAll(root, "<repo>")
    .replace(/\/Users\/[^\s/'"]+/g, "<home>")
    .replace(/\/home\/[^\s/'"]+/g, "<home>");
const firstLine = (e) => redact(String(e?.shortMessage ?? e?.message ?? e).split("\n")[0]).slice(0, 300);
const utc = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, "Z");

const journeys = [];
const findings = [];
const txLog = [];
const signingRequests = [];
const methodCounts = new Map();
const consoleErrors = new Map();
const httpErrors = new Map();
const sessions = [];
let cur = null;
let lastPage = null;
let shotSeq = 0;

function journey(id, title) {
  let j = journeys.find((x) => x.id === id);
  if (!j) {
    j = { id, title, status: "Pass", notes: [], txs: [], shots: [], startedAt: utc(), endedAt: utc() };
    journeys.push(j);
  }
  return j;
}
async function run(id, title, fn) {
  const j = journey(id, title);
  cur = j;
  console.log(`== ${id} ${title}`);
  try {
    await fn();
  } catch (e) {
    j.status = "Fail";
    const msg = firstLine(e);
    j.notes.push(`FAILED: ${msg}`);
    let file;
    if (lastPage) file = await shotPage(lastPage, `${id}-failure`).catch(() => undefined);
    findings.push({ journey: id, text: `${id} failed: ${msg}`, shot: file });
    console.log(`   FAIL ${msg}`);
  }
  j.endedAt = utc();
}
const note = (text) => {
  cur.notes.push(text);
  console.log(`   ${text}`);
};
const finding = (text, shot) => {
  findings.push({ journey: cur?.id, text, shot });
  console.log(`   FINDING ${text}`);
};
function check(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

async function shotPage(page, name) {
  const file = `${String(++shotSeq).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  cur?.shots.push(file);
  return file;
}
const shot = (s, name) => shotPage(s.page, `${s.name}-${name}`);

// ---------------------------------------------------------------- wallet bridge

const WALLET_SCRIPT = `(() => {
  const listeners = {};
  const provider = {
    request: async ({ method, params }) => {
      const r = await window.__walletRequest({ method, params: params ?? [] });
      if (r && r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; }
      return r.result;
    },
    on(ev, fn) { (listeners[ev] ||= new Set()).add(fn); return provider; },
    removeListener(ev, fn) { listeners[ev]?.delete(fn); return provider; },
  };
  provider.off = provider.removeListener;
  provider.addListener = provider.on;
  window.__walletEmit = (ev, arg) => { for (const fn of [...(listeners[ev] || [])]) fn(arg); };
  const info = Object.freeze({
    uuid: "5d7c1c7e-3c1b-4c53-9a43-6a3c6f1d0a11",
    name: "Dry run wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIvPg==",
    rdns: "test.satstake.dryrun",
  });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  window.__progress = [];
  const sel = '[role="status"][aria-label="Promise progress"]';
  new MutationObserver(() => {
    const el = document.querySelector(sel);
    if (!el) return;
    const t = [...el.querySelectorAll("li,p")].map((x) => x.textContent.trim()).filter(Boolean).join(" | ");
    if (t && !window.__progress.includes(t)) window.__progress.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

const SIGNING_METHODS = new Set(["personal_sign", "eth_sign", "eth_signTypedData", "eth_signTypedData_v3", "eth_signTypedData_v4", "eth_signTransaction"]);

function rpcError(code, message) {
  return Object.assign(new Error(message), { code });
}

function labelFor(data, to) {
  if (!data) return "native transfer";
  for (const a of [abi, erc20Abi]) {
    try {
      const { functionName } = decodeFunctionData({ abi: a, data });
      return functionName;
    } catch {
      // not in this ABI
    }
  }
  return `call ${String(to)}`;
}

async function sendTx(s, tx) {
  const account = accounts[s.role];
  if (s.reportedChain !== CHAIN_ID) throw rpcError(4901, "the wallet is not on the requested chain");
  if (tx.from && getAddress(tx.from) !== account.address) throw rpcError(4100, "the requested account is not the connected one");
  if (!allowedSendTarget(tx.to, [CONTRACT, USDC, CIRBTC])) throw rpcError(-32602, `the dry run wallet only sends to SatStake and its two tokens, not to ${String(tx.to)}`);
  assertChainId(await read(() => pub.getChainId()));
  await sleep(HUMAN_CONFIRM_MS);
  if (PROBE) throw rpcError(4001, "User rejected the request (probe run)");
  const request = { account, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined, gas: tx.gas ? BigInt(tx.gas) : undefined };
  const hash = await read(() => wallet(account).sendTransaction(request));
  const entry = { role: s.role, hash, fn: labelFor(tx.data, tx.to), to: getAddress(tx.to), at: utc() };
  txLog.push(entry);
  cur?.txs.push(entry);
  console.log(`   tx ${entry.role} ${entry.fn} ${hash}`);
  return hash;
}

async function dispatch(s, method, params) {
  methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
  s.requests.push(method);
  if (SIGNING_METHODS.has(method)) {
    signingRequests.push({ session: s.name, method });
    throw rpcError(-32601, `${method} is refused by the dry run wallet`);
  }
  switch (method) {
    case "eth_requestAccounts":
      s.authorized = true;
      return [accounts[s.role].address.toLowerCase()];
    case "eth_accounts":
      return s.authorized ? [accounts[s.role].address.toLowerCase()] : [];
    case "eth_chainId":
      return toHex(s.reportedChain);
    case "net_version":
      return String(s.reportedChain);
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain": {
      const id = parseInt(params[0].chainId, 16);
      if (method === "wallet_switchEthereumChain" && id !== CHAIN_ID) throw rpcError(4902, "unknown chain");
      if (id !== CHAIN_ID) throw rpcError(-32602, "the dry run wallet only knows Arc testnet");
      s.reportedChain = id;
      setTimeout(() => void s.page.evaluate((h) => window.__walletEmit("chainChanged", h), toHex(id)).catch(() => {}), 50);
      return null;
    }
    case "wallet_getPermissions":
    case "wallet_requestPermissions":
    case "wallet_revokePermissions":
      return [];
    case "eth_sendTransaction":
      return sendTx(s, params[0]);
    default:
      return read(() => pub.request({ method, params }));
  }
}

async function openSession(name, role, { noWallet = false, wrongChain = false, viewport = DESKTOP, colorScheme = "light" } = {}) {
  const context = await browserRef.newContext({ viewport, colorScheme, timezoneId: "UTC", locale: "en-US" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(SITE).origin });
  const page = await context.newPage();
  const s = { name, role, page, context, authorized: false, reportedChain: wrongChain ? 1 : CHAIN_ID, requests: [], noWallet, viewport, colorScheme };
  page.on("pageerror", (e) => consoleErrors.set(`${name}: page error: ${firstLine(e)}`, true));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.set(`${name}: ${redact(m.text()).slice(0, 300)}`, true);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      const u = new URL(r.url());
      const key = `${r.status()} ${r.request().method()} ${u.origin}`;
      httpErrors.set(key, (httpErrors.get(key) ?? 0) + 1);
    }
  });
  if (!noWallet) {
    await page.exposeBinding("__walletRequest", async (_source, payload) => {
      try {
        return { result: await dispatch(s, payload.method, payload.params) };
      } catch (e) {
        return { error: { code: typeof e.code === "number" ? e.code : -32603, message: firstLine(e) } };
      }
    });
    await page.addInitScript(WALLET_SCRIPT);
  }
  sessions.push(s);
  lastPage = page;
  return s;
}

// ---------------------------------------------------------------- page helpers

async function waitBody(page, pattern, timeout = 45_000) {
  const arg = pattern instanceof RegExp ? { src: pattern.source, flags: pattern.flags } : { text: pattern };
  await page
    .waitForFunction(
      ({ src, flags, text }) => {
        const t = document.body.innerText.replace(/\s+/g, " ");
        return src !== undefined ? new RegExp(src, flags).test(t) : t.includes(text);
      },
      arg,
      { timeout, polling: 250 },
    )
    .catch(() => {
      throw new Error(`text not seen within ${timeout / 1000} s: ${String(pattern)}`);
    });
}
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const bodyHas = async (page, pattern) => {
  const t = await bodyText(page);
  return pattern instanceof RegExp ? pattern.test(t) : t.includes(pattern);
};
async function go(s, hash) {
  lastPage = s.page;
  await s.page.goto(SITE + hash);
  await waitBody(s.page, "SatStake", 30_000);
}
async function gotoUrl(s, url) {
  lastPage = s.page;
  await s.page.goto(url);
  await waitBody(s.page, "SatStake", 30_000);
}
async function connect(s) {
  lastPage = s.page;
  await s.page.getByRole("button", { name: "Connect Dry run wallet", exact: true }).click();
  await waitBody(s.page, /Connected: 0x\w{4}…\w{4}/);
}
const buttonVisible = (page, name) => page.getByRole("button", { name, exact: true }).isVisible();
const actionButtons = async (page) => {
  const shown = [];
  for (const name of ["Kept", "Broken", "Send payout"]) if (await buttonVisible(page, name)) shown.push(name);
  return shown;
};
const sealButton = (page) => page.locator('form[aria-label="New promise"] button[type="submit"]');
const sealDisabled = async (page) => (await sealButton(page).getAttribute("aria-disabled")) === "true";
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// ---------------------------------------------------------------- chain helpers

const view = (functionName, args = [], blockNumber) => read(() => pub.readContract({ address: CONTRACT, abi, functionName, args, blockNumber }));
const balanceOf = (token, who) => read(() => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] }));
const stateOf = async (id) => STATE[Number(await view("stateOf", [BigInt(id)]))];
async function waitChain(timestamp) {
  while ((await read(() => pub.getBlock())).timestamp < timestamp) await sleep(2000);
}
const lastTx = (role, fn, after = 0) => [...txLog].slice(after).reverse().find((t) => t.role === role && t.fn === fn);
async function receiptOf(hash) {
  return read(() => pub.waitForTransactionReceipt({ hash }));
}
function transfersTo(receipt, token, who) {
  return parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" })
    .filter((l) => getAddress(l.address) === token && getAddress(l.args.to) === getAddress(who))
    .map((l) => l.args.value);
}
// The app writes the deadline in the visitor's zone; the browser contexts are set to UTC.
const timeText = (seconds) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(Number(seconds) * 1000));

async function fundNative(to, value) {
  const hash = await wallet(operator).sendTransaction({ to, value });
  const receipt = await receiptOf(hash);
  check(receipt.status === "success", "funding transfer reverted");
  return hash;
}

// ---------------------------------------------------------------- the hero pad

async function tickAcknowledgement(page) {
  const box = page.getByRole("checkbox");
  const probe = () => box.evaluate((el) => ({ checked: el.checked, disabled: el.disabled }));
  await box.scrollIntoViewIfNeeded();
  await box.click({ force: true });
  await sleep(400);
  if ((await probe()).checked) return;
  finding("The first click on the acknowledgement checkbox did not tick it; a second click was made.", await shotPage(page, "checkbox-click-missed").catch(() => undefined));
  await box.click({ force: true });
  await sleep(400);
  check((await probe()).checked, "the acknowledgement checkbox would not tick after two clicks");
}

async function fillPad(page, spec) {
  const promise = page.getByLabel("Your promise", { exact: true });
  if ((await promise.count()) === 0) await page.getByRole("button", { name: "Write your own ↗", exact: true }).click();
  await promise.fill(spec.promise);
  await page.getByLabel("Token", { exact: true }).selectOption({ label: spec.token });
  await page.getByLabel("Amount", { exact: true }).fill(spec.amount);
  // The hints appear asynchronously and move what is below them, so a click made before they settle can miss.
  await waitBody(page, /Your balance: /);
  await waitBody(page, /This amount: /);
  const clip = await promise.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  if (clip.scroll > clip.client + 1) {
    finding(`The hero's promise field is wider than its box for the ${spec.promise.length}-character promise "${spec.promise}": the field scrolls (${clip.scroll} px of text in ${clip.client} px) and the end of the sentence is cut off at ${page.viewportSize().width} px wide.`, await shotPage(page, "hero-promise-clipped").catch(() => undefined));
  }
  await page.getByLabel("Referee address", { exact: true }).fill(accounts.referee.address);
  await page.getByLabel("Beneficiary address", { exact: true }).fill(accounts.beneficiary.address);
  await page.getByRole("radio", { name: spec.deadline, exact: true }).check();
  await tickAcknowledgement(page);
  await page.waitForFunction(() => document.querySelector('form[aria-label="New promise"] button[type="submit"]')?.getAttribute("aria-disabled") === "false", null, { timeout: 30_000 });
}

const PROMISE_PREFIX = "UI dry run";
const hashBits = (hash) => {
  const bytes = hexToBytes(hash);
  return Array.from({ length: 64 }, (_, i) => (bytes[i >> 3] >> (i & 7)) & 1);
};

// Makes one promise by clicking and typing, then checks the sealed panel against the chain and the wallet.
// `mode` is "landing" (the hero on the home page, writing mode started by Write your own), "create" (the hero page)
// or "another" (the Make another promise button of a sealed panel).
async function sealPromise(s, spec, mode) {
  const page = s.page;
  lastPage = page;
  if (mode === "landing") {
    await go(s, "#/");
    await waitBody(page, "I promise to");
    await page.getByRole("button", { name: "Write your own ↗", exact: true }).click();
  } else if (mode === "create") {
    await go(s, "#/create");
    await waitBody(page, "I promise to");
  } else {
    await page.getByRole("button", { name: "Make another promise", exact: true }).click();
    await page.getByRole("button", { name: "Write your own ↗", exact: true }).click();
  }
  const fullSpec = { ...spec, promise: `${PROMISE_PREFIX}: ${spec.label}` };
  await fillPad(page, fullSpec);
  const buttonLabel = (await sealButton(page).innerText()).trim();
  check(buttonLabel.startsWith("Seal it"), `submit reads "${buttonLabel}"`);
  await shot(s, `${spec.label}-pad-filled`);
  await page.evaluate(() => {
    window.__progress = [];
  });
  const before = txLog.length;
  await sealButton(page).click();
  await waitBody(page, /Confirm in your wallet\./, 10_000).catch(() => {});
  await shot(s, `${spec.label}-confirming`);
  if (PROBE) {
    await waitBody(page, /rejected|cancelled|denied/i, 20_000).catch(() => {});
    await shot(s, `${spec.label}-probe-rejected`);
    throw new Error("probe stop: the first Seal it was rejected as designed");
  }
  const panel = page.locator('section[aria-label="Sealed promise"]');
  await panel.waitFor({ timeout: 150_000 });
  await sleep(2500); // the seal draws itself in
  await shot(s, `${spec.label}-sealed`);
  const progress = await page.evaluate(() => window.__progress);

  const problems = [];
  const soft = (condition, message) => {
    if (!condition) problems.push(message);
  };
  const create = lastTx("staker", "createPledge", before);
  check(create, "the wallet sent no createPledge");
  const receipt = await receiptOf(create.hash);
  check(receipt.status === "success", "createPledge reverted");
  const [created] = parseEventLogs({ abi, logs: receipt.logs, eventName: "PledgeCreated" });
  const id = Number(created.args.id);
  const countAtBlock = Number(await view("pledgeCount", [], receipt.blockNumber));
  const p = await view("getPledge", [BigInt(id)]);
  soft(getAddress(p.staker) === operator.address && getAddress(p.token) === spec.tokenAddress && p.amount === spec.units, "pledge on chain does not match what was typed");
  soft(getAddress(p.referee) === accounts.referee.address && getAddress(p.beneficiary) === accounts.beneficiary.address, "parties on chain do not match");
  soft(String(p.promiseText) === fullSpec.promise, `promise text on chain is "${p.promiseText}"`);
  const lead = p.deadline - p.createdAt;
  soft(lead >= spec.leadSeconds - 20n && lead <= spec.leadSeconds + 20n, `deadline lead ${lead} s, expected about ${spec.leadSeconds}`);

  const panelText = (await panel.innerText()).replace(/\s+/g, " ");
  const shownHash = await panel.locator(".hash-value code").first().getAttribute("title");
  soft(shownHash === create.hash, `the panel shows ${shownHash}, the wallet sent ${create.hash}`);
  const link = panel.locator(`.hash-value a[href="${EXPLORER}/tx/${create.hash}"]`);
  soft((await link.count()) === 1, "no explorer link for the creation transaction");
  const shownNumber = Number(panelText.match(/Promise number #(\d+)/i)?.[1]);
  soft(shownNumber === id, `the panel shows promise number ${shownNumber}, the event says ${id}`);
  soft(shownNumber === countAtBlock, `the panel shows promise number ${shownNumber}, pledgeCount at the creation block is ${countAtBlock}`);
  const shareText = (await panel.locator(".sealed-share code").innerText()).trim();
  soft(shareText === `${SITE}#/p/${id}`, `share link is ${shareText}`);
  soft(panelText.includes(`Referee rules, or ${timeText(p.deadline)}`), `Locked until line is not "${timeText(p.deadline)}": ${panelText}`);

  const svg = page.locator("svg.seal-svg");
  await page.waitForFunction(() => document.querySelector("svg.seal-svg")?.classList.contains("on"), null, { timeout: 10_000 });
  const label = (await svg.locator("textPath").textContent()) ?? "";
  const hash8 = create.hash.slice(2, 10).toUpperCase();
  soft(label.startsWith(`PROMISE № ${id} · ${spec.sealStake} · SEALED ON ARC TESTNET · ${hash8}`), `seal label is "${label}"`);
  const ticks = await svg.locator("path.d").evaluateAll((ps) => ps.map((p) => p.getAttribute("d")).filter((d) => d.includes("L")));
  soft(ticks.length === 64, `${ticks.length} ticks drawn`);
  const bits = hashBits(create.hash);
  const mismatched = ticks.filter((d, i) => {
    const [, x, y] = d.match(/L(-?[\d.]+) (-?[\d.]+)/) ?? [];
    return (Math.hypot(Number(x), Number(y)) < 65.5 ? 1 : 0) !== bits[i];
  });
  soft(mismatched.length === 0, `${mismatched.length} of 64 ticks disagree with the creation hash`);
  const inks = await svg.evaluate((el) => ({ onClass: el.classList.contains("on"), box: el.getBoundingClientRect().width }));
  for (const m of problems) {
    cur.status = "Fail";
    cur.notes.push(`CHECK FAILED: ${m}`);
    findings.push({ journey: cur.id, text: `After sealing promise #${id}: ${m}` });
  }
  return { id, hash: create.hash, progress, buttonLabel, label, share: shareText, panelText, ticks: 64, seal: inks, deadline: p.deadline, shownHash, spec: fullSpec };
}

// ---------------------------------------------------------------- reading a promise page

async function readPledgePage(page, id, { amountText, stateText } = {}) {
  await waitBody(page, `Promise #${id}`);
  if (amountText) await waitBody(page, amountText);
  if (stateText) await waitBody(page, stateText, 60_000);
  return {
    heading: (await page.locator("h1").first().innerText()).replace(/\s+/g, " "),
    banner: (await page.locator(".pledge-banner").innerText().catch(() => "")).replace(/\s+/g, " "),
    status: (await page.locator('[aria-label="Promise status"]').innerText().catch(() => "")).replace(/\s+/g, " "),
    badge: (await page.locator(".role-badge").innerText().catch(() => "")).replace(/\s+/g, " "),
  };
}

// ---------------------------------------------------------------- main

let browserRef;
const P = { p1: null, p2: null, p3: null, p4: null };
const startBalances = {};
let fundingTxs = [];
let sweepSteps = [];
let sweepError = null;
let fundingStarted = false;
let buildInfo = {};

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  try {
    buildInfo.dirty = execFileSync("git", ["status", "--porcelain", "--", "app/src", "app/index.html", "app/vite.config.ts", "deployments"], { cwd: root }).toString().trim();
  } catch {
    buildInfo.dirty = "unknown";
  }

  // ---- preflight
  assertChainId(await read(() => pub.getChainId()));
  check(((await read(() => pub.getCode({ address: CONTRACT })))?.length ?? 0) > 2, "no contract code at the deployment address");
  const html = await fetch(SITE).then((r) => r.text());
  check(html.includes(RPC) && !html.includes("rpc.mainnet.arc.io"), "the served build is not the testnet build (its policy does not name the testnet RPC alone)");
  const fees = await read(() => pub.estimateFeesPerGas());
  const feeCap = fees.maxFeePerGas * 2n;
  const callsFor = { referee: 4, beneficiary: 3, settler: 4 };
  const funding = Object.fromEntries(Object.entries(callsFor).map(([r, calls]) => [r, fundingFor({ calls, feeCap })]));
  const totalFunding = Object.values(funding).reduce((a, b) => a + b, 0n);
  startBalances.native = await read(() => pub.getBalance({ address: operator.address }));
  startBalances.sats = await balanceOf(CIRBTC, operator.address);
  startBalances.lockedUsdc = await view("totalLocked", [USDC]);
  startBalances.lockedSats = await view("totalLocked", [CIRBTC]);
  startBalances.pledgeCount = await view("pledgeCount");
  console.log(`operator ${operator.address}: ${formatUnits(startBalances.native, 18)} USDC native, ${startBalances.sats} sats`);
  const reserve = fundingFor({ calls: 14, feeCap });
  if (startBalances.sats < CIRBTC_SATS * 2n) throw new Error(`stopping: the operator holds ${startBalances.sats} sats, the run needs at least ${CIRBTC_SATS * 2n}`);
  if (startBalances.native < totalFunding + reserve + USDC_AMOUNT * 3n * 10n ** 12n)
    throw new Error(`stopping: the operator holds ${formatUnits(startBalances.native, 18)} USDC, the run needs about ${formatUnits(totalFunding + reserve + USDC_AMOUNT * 3n * 10n ** 12n, 18)}`);

  browserRef = await chromium.launch();
  if (!PROBE) {
    fundingStarted = true;
    for (const role of ["referee", "beneficiary", "settler"]) {
      const hash = await fundNative(accounts[role].address, funding[role]);
      fundingTxs.push({ role, hash, value: funding[role] });
    }
  }

  const usdcSpec = { token: "USDC", tokenAddress: USDC, amount: "0.1", units: USDC_AMOUNT, sealStake: "$0.10 IN USDC" };

  // ---- (a) no wallet
  const V = await openSession("visitor", null, { noWallet: true });
  await run("SG-a", "No wallet: landing, a promise page read-only, unknown id", async () => {
    await go(V, "#/");
    await waitBody(V.page, "I promise to");
    await waitBody(V.page, "Or my stake goes to someone I chose.");
    await waitBody(V.page, "Seven lines.");
    await waitBody(V.page, CONTRACT);
    await waitBody(V.page, /\d+ Promises made/i);
    await waitBody(V.page, "You need a browser wallet on Arc with a little USDC for network fees. Reading needs none.");
    const sourcify = await V.page.getByRole("link", { name: "Verified on Sourcify" }).getAttribute("href");
    check(sourcify === `https://repo.sourcify.dev/${CHAIN_ID}/${CONTRACT}`, `Sourcify link ${sourcify}`);
    note("The landing reads with no wallet: the hero sentence \"I promise to\" with rotating examples, the lead sentence, the agreement, the full contract address, a Sourcify link and a promise count.");
    const hero = await V.page.locator(".hero").innerText();
    check(/Write your own/.test(hero), "no Write your own control in the hero");
    check(await sealDisabled(V.page), "Seal it is not disabled with no wallet");
    note("The pad is drawn with a demonstration signature; with no wallet and no promise written, the Seal it control is aria-disabled.");
    await shot(V, "landing");

    await V.page.getByRole("link", { name: "A live promise" }).click();
    await waitBody(V.page, /Promise #\d+/);
    check(/#\/p\/1$/.test(V.page.url()), "the live promise link goes to #/p/1");
    const pg = await readPledgePage(V.page, 1);
    await waitBody(V.page, /Paid out|Paid back|Open|Kept|Broken|No answer/);
    const actions = await actionButtons(V.page);
    check(actions.length === 0, `no-wallet visitor sees ${actions.join(", ")}`);
    check(pg.badge === "", `no-wallet visitor has the badge "${pg.badge}"`);
    await waitBody(V.page, "The agreement");
    check((await V.page.locator(".hash-value").count()) >= 3, "fewer than three addresses with copy and explorer controls");
    note(`The live promise (#1) opened with no wallet and shows its heading, "${pg.banner.slice(0, 120)}", the seven-line agreement with the three addresses, and the clock. Status line: "${pg.status}". No Kept, Broken or Send payout control, no role badge.`);
    await shot(V, "live-promise");

    await go(V, "#/p/999999999");
    await waitBody(V.page, "This promise does not exist. Check the link.");
    check((await V.page.locator("h1").first().innerText()).includes("Promise"), "unknown promise has no heading");
    await shot(V, "unknown-promise");
    note('An unknown id shows the heading "Promise not found" and "This promise does not exist. Check the link.", with links home and to My promises.');
    await go(V, "#/nowhere");
    await waitBody(V.page, "This page does not exist.");
    note('An unknown route shows "This page does not exist."');
    check(V.requests.length === 0, "a wallet-less session made wallet requests");
  });

  // ---- (b) connect, wrong network, switch
  const S = await openSession("staker", "staker", { wrongChain: true });
  await run("SG-b", "Connect, wrong network, then switch", async () => {
    await go(S, "#/");
    await sleep(2500);
    check(!S.requests.includes("eth_requestAccounts"), "the page asked for accounts before any click");
    note(`Before any click the page sent only: ${[...new Set(S.requests)].join(", ") || "nothing"}. No account request.`);
    await waitBody(S.page, "Connect a wallet to create or settle a promise.");
    await shot(S, "before-connect");
    await connect(S);
    await waitBody(S.page, "Your wallet is on another network. SatStake runs on Arc Testnet.");
    await S.page.getByRole("button", { name: "Write your own ↗", exact: true }).click();
    await S.page.getByLabel("Your promise", { exact: true }).fill(`${PROMISE_PREFIX}: wrong network`);
    const help = (await S.page.locator('[id$="-submit-help"]').innerText()).replace(/\s+/g, " ").trim();
    note(`Beside Seal it while the wallet is on chain 1: ${help}`);
    check(/another network/i.test(help), "no wrong-network reason beside Seal it");
    check(await sealDisabled(S.page), "Seal it is enabled on the wrong network");
    await shot(S, "wrong-network");
    await S.page.getByRole("button", { name: "Switch to Arc Testnet", exact: true }).click();
    await waitBody(S.page, /Connected: 0x\w{4}…\w{4} on Arc Testnet\./);
    check(!(await buttonVisible(S.page, "Switch to Arc Testnet")), "the switch button is still shown");
    check(!(await bodyHas(S.page, "Your wallet is on another network. Switch to Arc Testnet.")), "the wrong-network reason stayed after the switch");
    note("Switch to Arc Testnet asked the wallet to switch; the status then read connected on Arc Testnet and the wrong-network reason went.");
    await shot(S, "switched");
  });

  // ---- (c) create a USDC promise from the hero
  let p1;
  await run("SG-c", "Create a USDC promise from the hero; the sealed panel", async () => {
    // The page is still on the landing with the sentence half written; a fresh landing keeps the check plain.
    await S.page.reload();
    await waitBody(S.page, /Connected: 0x\w{4}…\w{4} on Arc Testnet\./);
    await go(S, "#/");
    p1 = await sealPromise(S, { ...usdcSpec, label: "USDC kept", deadline: "1 day", leadSeconds: 86_400n }, "landing");
    P.p1 = p1;
    note(`Seal it was labelled "${p1.buttonLabel}". Progress texts seen: ${p1.progress.join(" ;; ")}`);
    check(p1.progress.some((t) => /Step 1 of 2/.test(t)) && p1.progress.some((t) => /Step 2 of 2/.test(t)), "no numbered Step 1 of 2 and Step 2 of 2 in the progress");
    const approve = lastTx("staker", "approve");
    note(`The wallet sent approve ${approve.hash} and then createPledge ${p1.hash}.`);
    note(`The sealed panel shows the creation hash ${p1.shownHash}, the same as the hash the wallet sent; its explorer link is ${EXPLORER}/tx/${p1.hash}.`);
    note(`The panel's promise number is #${p1.id}; the creation event says #${p1.id}, and pledgeCount at the creation block is ${p1.id}.`);
    note(`The share link in the panel is ${p1.share}. The "Locked until" line reads "Referee rules, or ${timeText(p1.deadline)}", the chain deadline.`);
    note(`The seal is drawn (svg class "on"); its ring label reads "${p1.label}"; all 64 ticks agree with the bits of the creation hash.`);
    await S.page.getByRole("button", { name: "Copy the link to this promise", exact: true }).click();
    await waitBody(S.page, "Link copied.");
    const clip = await S.page.evaluate(() => navigator.clipboard.readText());
    check(clip === p1.share, `clipboard holds ${clip}`);
    note("Copy the link to this promise put the share link on the clipboard.");
    // The pad is read-only once the promise exists: the fields are not editable and the submit is gone.
    check((await S.page.getByRole("button", { name: /^Seal it/ }).count()) === 0, "a Seal it control remains after sealing");
    note("After sealing, the Seal it control is gone and the sealed panel holds focus.");
    await shot(S, "sealed-after-copy");
  });

  // ---- (d) the referee follows the share link
  const R = await openSession("referee", "referee");
  await run("SG-d", "Referee opens the share link: Kept, and Broken with the inline confirm", async () => {
    check(p1, "blocked: the first promise was not created");
    await go(R, "#/");
    await connect(R);
    await gotoUrl(R, p1.share);
    const pg = await readPledgePage(R.page, p1.id);
    await waitBody(R.page, "Was this promise kept?");
    check(await buttonVisible(R.page, "Kept"), "Kept missing for the referee");
    check(await buttonVisible(R.page, "Broken"), "Broken missing for the referee");
    check(pg.badge === "You judge this promise", `referee badge is "${pg.badge}"`);
    note(`The referee, opening the share link from the sealed panel, sees the badge "${pg.badge}", the question "Was this promise kept?" and the Kept and Broken buttons. Banner: "${pg.banner.slice(0, 160)}"`);
    await shot(R, "p1-verdict-controls");
    const t0 = txLog.length;
    await R.page.getByRole("button", { name: "Kept", exact: true }).click();
    await waitBody(R.page, /Confirm in your wallet\./, 10_000).catch(() => {});
    await shot(R, "p1-kept-confirming");
    await waitBody(R.page, "You marked this promise kept.", 90_000);
    const tx = lastTx("referee", "markKept", t0);
    check(tx, "no markKept transaction");
    const shown = await R.page.locator(".pledge-progress .hash-value code").first().getAttribute("title");
    check(shown === tx.hash, `the page shows ${shown}, the wallet sent ${tx.hash}`);
    check((await R.page.locator(`.pledge-progress a[href="${EXPLORER}/tx/${tx.hash}"]`).count()) === 1, "no explorer link for the verdict");
    check(!(await buttonVisible(R.page, "Kept")), "the verdict controls stayed after the verdict");
    check((await stateOf(p1.id)) === "Kept", "chain state is not Kept");
    await waitBody(R.page, /Kept\. The stake goes back to/, 40_000);
    note("Kept sent one transaction (markKept); the page said \"You marked this promise kept.\" with the same hash the wallet sent and an explorer link; chain state is Kept and the banner reads Kept.");
    await shot(R, "p1-kept-done");

    // second promise, Broken through the inline confirm
    await S.page.bringToFront();
    const p2 = await sealPromise(S, { ...usdcSpec, label: "USDC broken", deadline: "1 day", leadSeconds: 86_400n }, "another");
    P.p2 = p2;
    note(`A second promise, #${p2.id}, was made with Make another promise from the sealed panel (creation ${p2.hash}). Its panel number matches the event and pledgeCount.`);
    await gotoUrl(R, p2.share);
    await waitBody(R.page, `Promise #${p2.id}`);
    await waitBody(R.page, "Was this promise kept?");
    await R.page.getByRole("button", { name: "Broken", exact: true }).click();
    await waitBody(R.page, "Mark this promise broken?");
    await waitBody(R.page, /The stake of \$0\.10 in USDC will go to the beneficiary, 0x\w{4}…\w{4}\. Your verdict cannot be changed\./);
    const focused = await R.page.evaluate(() => document.activeElement?.textContent?.trim());
    check(focused === "Cancel", `focus starts on ${focused}, expected Cancel`);
    check((await R.page.locator("dialog").count()) === 0, "the confirm is a dialog element, not inline");
    await shot(R, "p2-broken-confirm");
    note('Broken opened the inline confirm "Mark this promise broken?" under the ruling line with the amount and the beneficiary; focus started on Cancel; it is not a modal dialog.');
    const sends = methodCounts.get("eth_sendTransaction") ?? 0;
    const txCount = txLog.length;
    await R.page.getByRole("button", { name: "Cancel", exact: true }).click();
    await sleep(2500);
    check((await R.page.getByText("Mark this promise broken?").count()) === 0, "the confirm stayed after Cancel");
    check((methodCounts.get("eth_sendTransaction") ?? 0) === sends && txLog.length === txCount, "Cancel sent a transaction request");
    check((await stateOf(p2.id)) === "Active", "Cancel changed the state");
    check(await buttonVisible(R.page, "Broken"), "Broken missing after Cancel");
    note("Cancel closed the confirm and sent no request to the wallet (eth_sendTransaction count unchanged); the promise stayed Active with Kept and Broken still offered.");
    await R.page.getByRole("button", { name: "Broken", exact: true }).click();
    await waitBody(R.page, "Mark this promise broken?");
    const t1 = txLog.length;
    await R.page.getByRole("button", { name: "Mark it broken", exact: true }).click();
    await waitBody(R.page, "You marked this promise broken.", 90_000);
    const tx2 = lastTx("referee", "markBroken", t1);
    check(tx2, "no markBroken transaction");
    check((await R.page.locator(".pledge-progress .hash-value code").first().getAttribute("title")) === tx2.hash, "the page's verdict hash differs from the wallet's");
    check((await stateOf(p2.id)) === "Broken", "chain state is not Broken");
    note(`Mark it broken sent markBroken ${tx2.hash}; the page said "You marked this promise broken." with that hash; chain state is Broken.`);
    await shot(R, "p2-broken-done");
  });

  // ---- (f, first half) the two-minute promise is made now so its deadline passes while the payouts run
  const W = await openSession("referee-watch", "referee");
  const T = await openSession("settler", "settler");
  const B = await openSession("beneficiary", "beneficiary");
  for (const x of [W, T, B]) {
    await go(x, "#/");
    await connect(x);
  }
  await run("SG-f", "Two-minute promise with no verdict reads No answer and pays the beneficiary", async () => {
    P.p3 = await sealPromise(S, { ...usdcSpec, label: "USDC two-minute", deadline: "2 minutes", leadSeconds: 120n }, "create");
    note(`The two-minute promise #${P.p3.id} was made from the hero page (#/create); creation ${P.p3.hash}; the panel number matches the event and pledgeCount.`);
    await gotoUrl(W, P.p3.share);
    await waitBody(W.page, `Promise #${P.p3.id}`);
    await waitBody(W.page, "Was this promise kept?");
    note("The referee's page for it, opened from its share link, offers Kept and Broken while the deadline is ahead.");
    await shot(W, "p3-active");
  });

  // ---- (e) Send payout
  await run("SG-e", "Send payout: an unrelated account on Kept, the beneficiary on Broken", async () => {
    check(P.p1 && P.p2, "blocked: the first two promises were not created");
    await gotoUrl(T, P.p1.share);
    await readPledgePage(T.page, P.p1.id);
    await waitBody(T.page, /Kept\. The stake goes back to/, 40_000);
    check(!(await bodyHas(T.page, "You made this promise")), "the unrelated account has a role badge");
    await waitBody(T.page, "Anyone can send this. The full stake goes only to the staker.");
    check(await buttonVisible(T.page, "Send payout"), "Send payout missing for the unrelated account");
    check(!(await buttonVisible(T.page, "Kept")) && !(await buttonVisible(T.page, "Broken")), "verdict controls for an unrelated account");
    await shot(T, "p1-payout-offered");
    let t0 = txLog.length;
    await T.page.getByRole("button", { name: "Send payout", exact: true }).click();
    await waitBody(T.page, "Done. The stake was sent to the staker.", 90_000);
    let tx = lastTx("settler", "settle", t0);
    check(tx, "no settle transaction from the unrelated account");
    let receipt = await receiptOf(tx.hash);
    let got = transfersTo(receipt, USDC, accounts.staker.address);
    check(got.length === 1 && got[0] === USDC_AMOUNT, `USDC transfers to the staker: ${got.join(",")}`);
    check(transfersTo(receipt, USDC, accounts.settler.address).length === 0, "the unrelated sender received a transfer");
    check((await stateOf(P.p1.id)) === "SettledToStaker", "chain state is not SettledToStaker");
    await waitBody(T.page, /Paid back/, 30_000);
    check((await T.page.locator(".pledge-progress .hash-value code").first().getAttribute("title")) === tx.hash, "page hash differs from the wallet's");
    note(`On the Kept promise #${P.p1.id} an unrelated account pressed Send payout (${tx.hash}); the page said "Done. The stake was sent to the staker." and then read Paid back. The receipt holds one Transfer of 0.1 USDC to the staker and none to the sender.`);
    await shot(T, "p1-payout-done");

    await gotoUrl(B, P.p2.share);
    await readPledgePage(B.page, P.p2.id);
    await waitBody(B.page, /Marked broken\. The stake goes to/, 40_000);
    check((await B.page.locator(".role-badge").innerText()) === "You get the stake if it is broken or missed", "beneficiary badge");
    await waitBody(B.page, "Anyone can send this. The full stake goes only to the beneficiary.");
    await shot(B, "p2-payout-offered");
    t0 = txLog.length;
    await B.page.getByRole("button", { name: "Send payout", exact: true }).click();
    await waitBody(B.page, "Done. The stake was sent to the beneficiary.", 90_000);
    tx = lastTx("beneficiary", "settle", t0);
    check(tx, "no settle transaction from the beneficiary");
    receipt = await receiptOf(tx.hash);
    got = transfersTo(receipt, USDC, accounts.beneficiary.address);
    check(got.length === 1 && got[0] === USDC_AMOUNT, `USDC transfers to the beneficiary: ${got.join(",")}`);
    check(transfersTo(receipt, USDC, accounts.staker.address).length === 0, "the staker received a transfer on a Broken payout");
    check((await stateOf(P.p2.id)) === "SettledToBeneficiary", "chain state is not SettledToBeneficiary");
    await waitBody(B.page, /Paid out/, 30_000);
    note(`On the Broken promise #${P.p2.id} the beneficiary pressed Send payout (${tx.hash}); the page said "Done. The stake was sent to the beneficiary." and then read Paid out. The receipt holds one Transfer of 0.1 USDC to the beneficiary and none to the staker.`);
    await shot(B, "p2-payout-done");
  });

  // ---- (g) and (h): cirBTC from the hero on a phone in dark mode
  const M = await openSession("phone-dark", "staker", { viewport: PHONE, colorScheme: "dark" });
  await run("SG-h", "390 px wide and dark mode", async () => {
    // The landing three ways, with no wallet, so the colour scheme and width are each seen alone and together.
    const light = await openSession("phone-light-visitor", null, { noWallet: true, viewport: PHONE, colorScheme: "light" });
    await go(light, "#/");
    await waitBody(light.page, "I promise to");
    const lightBg = await background(light.page);
    note(`390 px, light, no wallet: horizontal overflow ${await overflow(light.page)} px, page background ${lightBg}.`);
    await shot(light, "landing");
    await light.context.close();
    const desk = await openSession("desktop-dark-visitor", null, { noWallet: true, colorScheme: "dark" });
    await go(desk, "#/");
    await waitBody(desk.page, "I promise to");
    const deskBg = await background(desk.page);
    note(`1440 px, dark, no wallet: page background ${deskBg}, prefers-color-scheme dark matches: ${await desk.page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)}.`);
    await shot(desk, "landing");
    await desk.context.close();
    await go(M, "#/");
    await waitBody(M.page, "I promise to");
    const darkBg = await background(M.page);
    check(darkBg !== lightBg, "dark and light backgrounds are the same");
    const over = await overflow(M.page);
    note(`390 px, dark: page background ${darkBg} (light was ${lightBg}); horizontal overflow ${over} px.`);
    if (over > 0) finding(`At 390 px the landing page scrolls sideways by ${over} px.`);
    await shot(M, "landing");
    await connect(M);
  });

  await run("SG-g", "cirBTC promise of 100 sats from the hero", async () => {
    const cirSpec = { token: "cirBTC", tokenAddress: CIRBTC, amount: "0.000001", units: CIRBTC_AMOUNT, sealStake: "100 SATS", label: "cirBTC 100 sats", deadline: "1 day", leadSeconds: 86_400n };
    const p4 = await sealPromise(M, cirSpec, "landing");
    P.p4 = p4;
    note(`Seal it was labelled "${p4.buttonLabel}"; the seal label reads "${p4.label}"; the panel number #${p4.id} matches the event and pledgeCount. Progress: ${p4.progress.join(" ;; ")}`);
    cur = journey("SG-h", "390 px wide and dark mode");
    note(`390 px, dark, sealed panel for #${p4.id}: horizontal overflow ${await overflow(M.page)} px.`);
    cur = journey("SG-g", "cirBTC promise of 100 sats from the hero");
    await M.page.getByRole("link", { name: "Open the promise", exact: true }).click();
    const pg = await readPledgePage(M.page, p4.id, { amountText: "100 sats, 0.000001 cirBTC" });
    await waitBody(M.page, "A sat is the smallest unit of Bitcoin.");
    await waitBody(M.page, "100 sats");
    note(`The promise page for #${p4.id} reads "${pg.heading}" and "100 sats, 0.000001 cirBTC" in the agreement, with the note "A sat is the smallest unit of Bitcoin." Banner: "${pg.banner.slice(0, 140)}"`);
    cur = journey("SG-h", "390 px wide and dark mode");
    note(`390 px, dark, promise page #${p4.id}: horizontal overflow ${await overflow(M.page)} px.`);
    await shotPage(M.page, "phone-dark-p4-promise-page");
    cur = journey("SG-g", "cirBTC promise of 100 sats from the hero");
    // Kept by the referee, paid out by the unrelated account, so the sats return to the staker.
    await gotoUrl(R, P.p4.share);
    await waitBody(R.page, "Was this promise kept?");
    await waitBody(R.page, "100 sats");
    let t0 = txLog.length;
    await R.page.getByRole("button", { name: "Kept", exact: true }).click();
    await waitBody(R.page, "You marked this promise kept.", 90_000);
    check(lastTx("referee", "markKept", t0), "no markKept for the cirBTC promise");
    await gotoUrl(T, P.p4.share);
    await waitBody(T.page, /Kept\. The stake goes back to/, 40_000);
    await waitBody(T.page, "100 sats");
    t0 = txLog.length;
    await T.page.getByRole("button", { name: "Send payout", exact: true }).click();
    await waitBody(T.page, "Done. The stake was sent to the staker.", 90_000);
    const tx = lastTx("settler", "settle", t0);
    const receipt = await receiptOf(tx.hash);
    const got = transfersTo(receipt, CIRBTC, accounts.staker.address);
    check(got.length === 1 && got[0] === CIRBTC_AMOUNT, `cirBTC transfers to the staker: ${got.join(",")}`);
    check((await balanceOf(CIRBTC, operator.address)) === startBalances.sats, "the staker's sats are not back to the start");
    await waitBody(T.page, /Paid back/, 30_000);
    note(`The referee marked it Kept and an unrelated account sent the payout (${tx.hash}); the receipt moves exactly 100 sats to the staker and the staker's balance is back to ${startBalances.sats} sats.`);
    await shot(T, "p4-payout-done");
  });

  // ---- (f, second half) the deadline arrives with no verdict
  await run("SG-f", "Two-minute promise with no verdict reads No answer and pays the beneficiary", async () => {
    check(P.p3, "blocked: the two-minute promise was not created");
    const stillOpen = (await read(() => pub.getBlock())).timestamp < P.p3.deadline;
    note(stillOpen ? "The deadline had not arrived when this step began; waiting for chain time." : "The deadline had already passed when this step began.");
    await waitChain(P.p3.deadline);
    await waitBody(W.page, /No answer by the deadline/, 60_000);
    check(!(await buttonVisible(W.page, "Kept")) && !(await buttonVisible(W.page, "Broken")), "Kept or Broken still offered after the deadline");
    const pg = await readPledgePage(W.page, P.p3.id);
    check((await stateOf(P.p3.id)) === "Expired", "chain state is not Expired");
    note(`The referee's open page, with no reload, read "${pg.status}" after the deadline; Kept and Broken were gone. Banner: "${pg.banner.slice(0, 150)}"`);
    await shot(W, "p3-no-answer");
    await gotoUrl(T, P.p3.share);
    await waitBody(T.page, /No answer by the deadline/, 40_000);
    await waitBody(T.page, "Anyone can send this. The full stake goes only to the beneficiary.");
    await shot(T, "p3-payout-offered");
    const t0 = txLog.length;
    await T.page.getByRole("button", { name: "Send payout", exact: true }).click();
    await waitBody(T.page, "Done. The stake was sent to the beneficiary.", 90_000);
    const tx = lastTx("settler", "settle", t0);
    check(tx, "no settle transaction");
    const receipt = await receiptOf(tx.hash);
    const got = transfersTo(receipt, USDC, accounts.beneficiary.address);
    check(got.length === 1 && got[0] === USDC_AMOUNT, `USDC transfers to the beneficiary: ${got.join(",")}`);
    check(transfersTo(receipt, USDC, accounts.settler.address).length === 0 && transfersTo(receipt, USDC, accounts.staker.address).length === 0, "the sender or the staker received a transfer");
    check((await stateOf(P.p3.id)) === "SettledToBeneficiary", "chain state is not SettledToBeneficiary");
    await waitBody(T.page, /Paid out/, 30_000);
    note(`An unrelated account sent the payout (${tx.hash}); the receipt holds one Transfer of 0.1 USDC to the beneficiary, none to the sender or the staker; the page read Paid out.`);
    await shot(T, "p3-payout-done");
    await waitBody(W.page, /Paid out/, 40_000);
    note("The referee's open page followed to Paid out on its own.");
    cur = journey("SG-h", "390 px wide and dark mode");
    await gotoUrl(M, P.p3.share);
    await waitBody(M.page, /Paid out/, 40_000);
    note(`390 px, dark, promise page #${P.p3.id} (No answer, paid out): horizontal overflow ${await overflow(M.page)} px.`);
    await shotPage(M.page, "phone-dark-p3-promise-page");
  });
}

// ---------------------------------------------------------------- evidence

function render(startedAt) {
  const commit = (() => {
    try {
      return execFileSync("git", ["log", "-1", "--format=%h"], { cwd: root }).toString().trim();
    } catch {
      return "unknown";
    }
  })();
  const link = (hash) => `[\`${hash}\`](${explorerTx(hash)})`;
  const passed = journeys.filter((j) => j.status === "Pass").length;
  const out = [];
  out.push("# UI dry run of the Signed frontend on Arc testnet", "");
  out.push(`Date: ${utc(startedAt)} to ${utc()} (UTC). Site: a local testnet build of this worktree served by \`vite preview\` at ${SITE}; the published Pages site (mainnet) was not touched. Chain ${CHAIN_ID}, contract \`${CONTRACT}\`.`, "");
  out.push(`Build commit: \`${commit}\` (branch \`signed-frontend\`). Uncommitted changes under app/src, app/index.html, app/vite.config.ts or deployments when the run started: ${buildInfo.dirty ? `yes (${buildInfo.dirty.split("\n").length} paths)` : "none"}. The build was made with \`npm run build:testnet\` from that tree just before the run.`, "");
  out.push("The run drives the real app in Chromium (Playwright) through an injected wallet (EIP-6963, name \"Dry run wallet\") whose requests are answered by a script holding the keys. Every action below was done by clicking and typing in the page; the script reads the chain only to check what the page showed. Screenshots are full page, in the gitignored `cache/dry-run-signed/`, named per step below; the 390 px and dark ones carry `phone` and `dark` in their names.", "");
  out.push(`Result: ${passed} of ${journeys.length} journeys passed.`, "");
  out.push("| Journey | Title | Result |", "|---|---|---|", ...journeys.map((j) => `| ${j.id} | ${j.title} | ${j.status} |`), "");
  out.push("## Journeys", "");
  for (const j of journeys) {
    out.push(`### ${j.id} ${j.title}: ${j.status}`, "", `Time (UTC): ${j.startedAt} to ${j.endedAt}`, "");
    for (const n of j.notes) out.push(`- ${redact(n)}`);
    if (j.txs.length) {
      out.push("", "Transactions:", "");
      for (const t of j.txs) out.push(`- ${t.at} ${t.role} ${t.fn}: ${link(t.hash)}`);
    }
    if (j.shots.length) out.push("", `Screenshots: ${j.shots.map((s) => `\`${s}\``).join(", ")}`);
    out.push("");
  }
  out.push("## Wallet requests and signing (LLR-FE-074)", "");
  out.push(`The injected wallet refuses \`personal_sign\`, \`eth_sign\` and \`eth_signTypedData*\` and counts any such request. Count: ${signingRequests.length}${signingRequests.length ? ` (${signingRequests.map((s) => `${s.session}: ${s.method}`).join("; ")})` : ""}.`, "");
  out.push("Methods the site asked the wallet for, over all sessions:", "");
  for (const [m, n] of [...methodCounts].sort()) out.push(`- \`${m}\`: ${n}`);
  out.push("");
  out.push("## Accounts", "");
  out.push(`- Staker (the testnet operator): \`${operator.address}\``);
  for (const r of ["referee", "beneficiary", "settler"]) out.push(`- ${r[0].toUpperCase()}${r.slice(1)} (throwaway, generated in memory; the settler is the unrelated account): \`${accounts[r].address}\``);
  out.push("");
  out.push("## Promises created", "");
  for (const [k, label] of [["p1", "USDC 0.1, 1 day, Kept, payout by an unrelated account"], ["p2", "USDC 0.1, 1 day, Broken, payout by the beneficiary"], ["p3", "USDC 0.1, 2 minutes, no verdict, payout by an unrelated account"], ["p4", "cirBTC 100 sats, 1 day, Kept, payout by an unrelated account"]]) {
    out.push(`- #${P[k]?.id ?? "not created"}: ${label}${P[k] ? `, created ${link(P[k].hash)}` : ""}`);
  }
  out.push("");
  out.push("## Funds", "");
  out.push(`- Gas funding sent to the throwaway accounts: ${fundingTxs.map((f) => `${f.role} ${formatUnits(f.value, 18)} USDC ${link(f.hash)}`).join("; ") || "none"}.`);
  out.push(`- Operator before: ${formatUnits(startBalances.native ?? 0n, 18)} USDC, ${startBalances.sats ?? 0n} sats. Locked in SatStake before: ${startBalances.lockedUsdc ?? "?"} USDC units, ${startBalances.lockedSats ?? "?"} cirBTC units; pledge count ${startBalances.pledgeCount ?? "?"}.`);
  out.push(`- Operator after the sweep: ${formatUnits(startBalances.nativeAfter ?? 0n, 18)} USDC, ${startBalances.satsAfter ?? 0n} sats. Locked in SatStake after: ${startBalances.lockedUsdcAfter ?? "?"} USDC units, ${startBalances.lockedSatsAfter ?? "?"} cirBTC units; pledge count ${startBalances.pledgeCountAfter ?? "?"}.`);
  if (startBalances.native !== undefined && startBalances.nativeAfter !== undefined) {
    out.push(`- Net cost: ${formatUnits(startBalances.native - startBalances.nativeAfter, 18)} USDC (network fees; every stake returned to the operator or swept back from the beneficiary), ${startBalances.sats - startBalances.satsAfter} sats.`);
  }
  out.push(`- Sweep: ${sweepError ? `INCOMPLETE, ${sweepError}` : "completed"}.`);
  for (const s of sweepSteps) out.push(`  - ${s.description}${s.tx ? ` ${link(s.tx)}` : ""}${s.note ? ` (${s.note})` : ""}`);
  out.push("");
  out.push("## Console and network errors (SG-i)", "");
  if (consoleErrors.size === 0) out.push("No console errors and no page errors in any session.");
  else for (const m of consoleErrors.keys()) out.push(`- ${m}`);
  out.push("");
  if (httpErrors.size) {
    out.push("HTTP responses with status 400 or above seen by the browser (counts):", "");
    for (const [k, n] of httpErrors) out.push(`- ${k}: ${n}`);
    out.push("");
  }
  out.push("## Findings", "");
  if (findings.length === 0) out.push("None recorded by the script.");
  for (const f of findings) out.push(`- ${f.journey ?? "run"}: ${redact(f.text)}${f.shot ? ` Screenshot: \`${f.shot}\`.` : ""}`);
  out.push("");
  return out.join("\n");
}

const startedAt = new Date();
let failure = null;
try {
  await main();
} catch (e) {
  failure = e;
  console.error(`RUN STOPPED: ${firstLine(e)}`);
  if (!/^probe stop/.test(firstLine(e))) {
    journey("run", "Setup and run").status = "Fail";
    findings.push({ journey: "run", text: `The run stopped: ${firstLine(e)}` });
  }
} finally {
  // SG-i is decided last: every console and page error of the run, in every session.
  if (!PROBE) {
    const j = journey("SG-i", "Console errors and page errors across the run");
    j.startedAt = utc(startedAt);
    j.endedAt = utc();
    if (consoleErrors.size) {
      j.status = "Fail";
      j.notes.push(`${consoleErrors.size} distinct console or page errors; listed under Console and network errors.`);
    } else j.notes.push("No console error and no page error in any session.");
  }
  if (browserRef) await browserRef.close().catch(() => {});
  if (fundingStarted) {
    const steps = [];
    try {
      await sweepToOperator({ pub, wallet, accounts, cirbtc: CIRBTC, evidence: { step: (_j, description, extra = {}) => steps.push({ description, ...extra }) } });
    } catch (e) {
      sweepError = firstLine(e);
    }
    sweepSteps = steps;
  }
  try {
    startBalances.nativeAfter = await read(() => pub.getBalance({ address: operator.address }));
    startBalances.satsAfter = await balanceOf(CIRBTC, operator.address);
    startBalances.lockedUsdcAfter = await view("totalLocked", [USDC]);
    startBalances.lockedSatsAfter = await view("totalLocked", [CIRBTC]);
    startBalances.pledgeCountAfter = await view("pledgeCount");
  } catch {
    // reported as unknown if the final read fails
  }
  if (startBalances.native !== undefined) {
    writeFileSync(EVIDENCE, render(startedAt));
    console.log(`evidence written to ${redact(EVIDENCE)}`);
  }
  const failed = journeys.filter((j) => j.status !== "Pass").map((j) => j.id);
  console.log(`journeys: ${journeys.length - failed.length} passed, ${failed.length} failed ${failed.join(",")}; sweep ${sweepError ? `INCOMPLETE ${sweepError}` : fundingStarted ? "complete" : "not needed"}`);
  process.exitCode = failure ? 1 : 0;
}
