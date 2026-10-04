// Live UI dry run of the published testnet site, driven like a person in a real browser. Usage, from app/:
//   SATSTAKE_ENV_FILE=<file holding TESTNET_PRIVATE_KEY> PLAYWRIGHT_BROWSERS_PATH=0 node scripts/ui-dry-run.mjs
//
// The page gets an injected EIP-1193 wallet that announces itself over EIP-6963 and forwards every request to
// this process, which signs with a viem client for the role the session plays. The staker is the testnet
// operator, whose key is read by parseEnvKey and never printed or written. Referee, beneficiary and an
// unrelated settler are throwaway keys made in memory; each is funded with gas and swept back at the end,
// including after a failure. Screenshots go to the gitignored cache/dry-run/ and the record to
// docs/evidence/ui-dry-run-testnet.md.
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
  http,
  parseEventLogs,
  parseUnits,
  toHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, EXPLORER, allowedSendTarget, assertChainId, explorerTx, fundingFor, parseEnvKey, sweepToOperator, withRetry } from "../../e2e/lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = "https://vasqq.github.io/satstake/";
const RPC = "https://rpc.testnet.arc.io";
const OUT = join(root, "cache/dry-run");
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

const CIRBTC_SATS = 10n;
const CIRBTC_AMOUNT = CIRBTC_SATS; // 8 decimals, so one sat is one unit
const USDC_AMOUNT = parseUnits("0.1", 6);
const HUMAN_CONFIRM_MS = 1500; // a person takes a moment to confirm in a wallet; also lets the prompt state be seen

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

const journeys = [];
const findings = [];
const txLog = [];
const signingRequests = [];
const methodCounts = new Map();
const consoleErrors = new Map();
const sessions = [];
let cur = null;
let lastPage = null;
let shotSeq = 0;

function journey(id, title) {
  let j = journeys.find((x) => x.id === id);
  if (!j) {
    j = { id, title, status: "Pass", notes: [], txs: [], shots: [] };
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
  const sel = '[role="status"][aria-label="Pledge progress"]';
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
  const request = { account, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined, gas: tx.gas ? BigInt(tx.gas) : undefined };
  const hash = await read(() => wallet(account).sendTransaction(request));
  const entry = { role: s.role, hash, fn: labelFor(tx.data, tx.to), to: getAddress(tx.to) };
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

async function switchRole(s, role) {
  s.role = role;
  await s.page.evaluate((a) => window.__walletEmit("accountsChanged", [a]), accounts[role].address.toLowerCase());
}

async function openSession(name, role, { noWallet = false, wrongChain = false } = {}) {
  const context = await browserRef.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", timezoneId: "UTC" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(SITE).origin });
  const page = await context.newPage();
  const s = { name, role, page, context, authorized: false, reportedChain: wrongChain ? 1 : CHAIN_ID, requests: [], noWallet };
  page.on("pageerror", (e) => consoleErrors.set(`${name}: ${firstLine(e)}`, true));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.set(`${name}: ${redact(m.text()).slice(0, 300)}`, true);
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
async function connect(s) {
  lastPage = s.page;
  await s.page.getByRole("button", { name: "Connect Dry run wallet", exact: true }).click();
  await waitBody(s.page, /Connected: 0x\w{4}…\w{4}/);
}
const buttonVisible = (page, name) => page.getByRole("button", { name, exact: true }).isVisible();
const submitDisabled = async (page) => (await page.getByRole("button", { name: "Create pledge", exact: true }).getAttribute("aria-disabled")) === "true";
const SETTLE_BUTTONS = ["Withdraw my stake", "Send stake to staker", "Send stake to beneficiary", "Claim stake"];
async function settleButtonsShown(page) {
  const shown = [];
  for (const name of SETTLE_BUTTONS) if (await buttonVisible(page, name)) shown.push(name);
  return shown;
}

// ---------------------------------------------------------------- chain helpers

const view = (functionName, args = []) => read(() => pub.readContract({ address: CONTRACT, abi, functionName, args }));
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

async function fundNative(to, value) {
  const hash = await wallet(operator).sendTransaction({ to, value });
  const receipt = await receiptOf(hash);
  check(receipt.status === "success", "funding transfer reverted");
  return hash;
}

// Used only when a UI creation fails, so the later journeys still have a pledge to act on.
async function fallbackCreate({ token, amount, deadlineIn, text }) {
  const w = wallet(operator);
  const approve = await w.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [CONTRACT, amount] });
  await receiptOf(approve);
  const deadline = (await read(() => pub.getBlock())).timestamp + deadlineIn;
  const hash = await w.writeContract({ address: CONTRACT, abi, functionName: "createPledge", args: [token, amount, accounts.referee.address, accounts.beneficiary.address, deadline, text] });
  const receipt = await receiptOf(hash);
  const [created] = parseEventLogs({ abi, logs: receipt.logs, eventName: "PledgeCreated" });
  txLog.push({ role: "staker", hash: approve, fn: "approve (script fallback)", to: token }, { role: "staker", hash, fn: "createPledge (script fallback)", to: CONTRACT });
  cur?.txs.push({ role: "staker", hash, fn: "createPledge (script fallback)" });
  return { id: Number(created.args.id), deadline };
}

// ---------------------------------------------------------------- the create form

const PROMISE_PREFIX = "UI dry run";

async function fillCreate(page, { promise, token, amount, referee, beneficiary, deadline }) {
  await page.getByLabel("Promise", { exact: true }).fill(promise);
  await page.getByLabel("Token", { exact: true }).selectOption({ label: token });
  await page.getByLabel("Amount", { exact: true }).fill(amount);
  // The balance and amount hints appear asynchronously and move the fields below them, so a click made before
  // they settle can miss its target.
  await waitBody(page, /Your balance: /);
  await waitBody(page, /This amount: /);
  await page.getByLabel("Referee address", { exact: true }).fill(referee);
  await page.getByLabel("Beneficiary address", { exact: true }).fill(beneficiary);
  await page.getByRole("radio", { name: deadline, exact: true }).check();
  await tickAcknowledgement(page);
}

// A plain click, so a click that does not register is seen and described and not retried silently.
async function tickAcknowledgement(page) {
  const box = page.getByRole("checkbox");
  const probe = () =>
    box.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { checked: el.checked, disabled: el.disabled, top: Math.round(r.y + window.scrollY), scrollY: Math.round(window.scrollY), hit: hit ? `${hit.tagName}${hit.id ? "#" : ""}` : null, hitIsBox: hit === el };
    });
  await box.scrollIntoViewIfNeeded();
  const before = await probe();
  await box.click({ force: true });
  await sleep(400);
  const after = await probe();
  if (after.checked) return;
  finding(`The first click on the acknowledgement checkbox did not tick it (before ${JSON.stringify(before)}, after ${JSON.stringify(after)}); a second click was made.`, await shotPage(page, "checkbox-click-missed").catch(() => undefined));
  await box.click({ force: true });
  await sleep(400);
  check((await probe()).checked, "the acknowledgement checkbox would not tick after two clicks");
}

async function createViaUi(s, spec) {
  const page = s.page;
  await go(s, "#/create");
  await waitBody(page, "Create a pledge");
  await page.evaluate(() => {
    window.__progress = [];
  });
  await fillCreate(page, {
    promise: `${PROMISE_PREFIX}: ${spec.label}`,
    token: spec.token,
    amount: spec.amount,
    referee: accounts.referee.address,
    beneficiary: accounts.beneficiary.address,
    deadline: spec.deadline,
  });
  await waitBody(page, /Your balance: /);
  await waitBody(page, /This amount: /);
  await shot(s, `${spec.label}-form-filled`);
  await page.waitForFunction(() => document.querySelector('button[type="submit"]')?.getAttribute("aria-disabled") === "false", null, { timeout: 30_000 });
  await page.getByRole("button", { name: "Create pledge", exact: true }).click();
  await waitBody(page, /Confirm in your wallet\./, 10_000).catch(() => {});
  await shot(s, `${spec.label}-progress`);
  await page.waitForURL(/#\/p\/\d+$/, { timeout: 120_000 });
  const id = Number(page.url().match(/#\/p\/(\d+)$/)[1]);
  await waitBody(page, `Pledge #${id}`);
  await waitBody(page, "Your pledge is created.");
  const progress = await page.evaluate(() => window.__progress);
  return { id, progress };
}

async function verifyOnChain(id, { token, amount, deadlineIn }) {
  const p = await view("getPledge", [BigInt(id)]);
  check(getAddress(p.staker) === operator.address, "staker recorded");
  check(getAddress(p.token) === token && p.amount === amount, "token and amount recorded");
  check(getAddress(p.referee) === accounts.referee.address && getAddress(p.beneficiary) === accounts.beneficiary.address, "parties recorded");
  const lead = p.deadline - p.createdAt;
  check(lead >= deadlineIn - 20n && lead <= deadlineIn + 20n, `deadline lead ${lead} s, expected about ${deadlineIn}`);
  check(String(p.promiseText).startsWith(PROMISE_PREFIX), "promise text recorded");
  check((await stateOf(id)) === "Active", "state is Active");
  return p;
}

// ---------------------------------------------------------------- main

let browserRef;
const ctx = { p1: null, p2: null, p3: null };
const startBalances = {};
let fundingTxs = [];
let sweepSteps = [];
let sweepError = null;
let fundingStarted = false;

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // ---- preflight
  assertChainId(await read(() => pub.getChainId()));
  check(((await read(() => pub.getCode({ address: CONTRACT })))?.length ?? 0) > 2, "no contract code at the deployment address");
  const fees = await read(() => pub.estimateFeesPerGas());
  const feeCap = fees.maxFeePerGas * 2n;
  const callsFor = { referee: 4, beneficiary: 3, settler: 3 };
  const funding = Object.fromEntries(Object.entries(callsFor).map(([r, calls]) => [r, fundingFor({ calls, feeCap })]));
  const totalFunding = Object.values(funding).reduce((a, b) => a + b, 0n);
  startBalances.native = await read(() => pub.getBalance({ address: operator.address }));
  startBalances.sats = await balanceOf(CIRBTC, operator.address);
  startBalances.usdc = await balanceOf(USDC, operator.address);
  console.log(`operator ${operator.address}: ${formatUnits(startBalances.native, 18)} USDC native, ${startBalances.sats} sats`);
  const reserve = fundingFor({ calls: 12, feeCap });
  if (startBalances.sats < CIRBTC_SATS * 2n) throw new Error(`stopping: the operator holds ${startBalances.sats} sats, the run needs at least ${CIRBTC_SATS * 2n}`);
  if (startBalances.native < totalFunding + reserve + USDC_AMOUNT * 3n * 10n ** 12n)
    throw new Error(`stopping: the operator holds ${formatUnits(startBalances.native, 18)} USDC, the run needs about ${formatUnits(totalFunding + reserve + USDC_AMOUNT * 3n * 10n ** 12n, 18)}`);

  browserRef = await chromium.launch();
  fundingStarted = true;
  for (const role of ["referee", "beneficiary", "settler"]) {
    const hash = await fundNative(accounts[role].address, funding[role]);
    fundingTxs.push({ role, hash, value: funding[role] });
  }

  // ---- UJ-01 home and the example link (visitor, no wallet)
  const V = await openSession("visitor", null, { noWallet: true });
  await run("UJ-01", "Home page and the example pledge link", async () => {
    await go(V, "#/");
    await waitBody(V.page, "Lock Bitcoin against a promise.");
    await waitBody(V.page, "Keep it and you get your sats back. Miss it and they go to someone else.");
    await waitBody(V.page, "How it works");
    await waitBody(V.page, CONTRACT);
    await waitBody(V.page, /Pledges created \d+/);
    const sourcify = await V.page.getByRole("link", { name: "Verified on Sourcify" }).getAttribute("href");
    check(sourcify === `https://repo.sourcify.dev/${CHAIN_ID}/${CONTRACT}`, `Sourcify link ${sourcify}`);
    note("Heading, lead sentence, three steps, the full contract address, the Sourcify link and a pledge count are shown with no wallet.");
    await shot(V, "home");
    await V.page.getByRole("link", { name: "See an example pledge" }).click();
    await waitBody(V.page, /Pledge #\d+/);
    check(/#\/p\/1$/.test(V.page.url()), "example link goes to #/p/1");
    await waitBody(V.page, /Settled|Active|Kept|Broken|Expired/);
    note(`The example link opened pledge #1 (state badge: ${await V.page.locator(".state-badge").first().innerText()}), with no wallet.`);
    await shot(V, "example-pledge");
  });

  // ---- UJ-21 unknown pledge
  await run("UJ-21", "Unknown pledge", async () => {
    await go(V, "#/p/999999999");
    await waitBody(V.page, "This pledge does not exist. Check the link.");
    await shot(V, "unknown-pledge");
    note('The page says "This pledge does not exist. Check the link." with a link home.');
    await go(V, "#/nowhere");
    await waitBody(V.page, "This page does not exist.");
    note('An unknown route says "This page does not exist."');
  });

  // ---- UJ-02 connect
  await run("UJ-02", "Connect a wallet", async () => {
    const X = await openSession("connect", "staker");
    await go(X, "#/");
    await sleep(2500);
    check(!X.requests.includes("eth_requestAccounts"), "the page asked for accounts before any click");
    note(`Before any click the page sent only: ${[...new Set(X.requests)].join(", ") || "nothing"}. No account request.`);
    await waitBody(X.page, "Connect a wallet to create or settle a pledge.");
    await shot(X, "before-connect");
    await connect(X);
    await waitBody(X.page, "on Arc Testnet.");
    note("Connect Dry run wallet showed the connected address and the network name.");
    await shot(X, "connected");
    await X.context.close();
  });

  // ---- UJ-03 wrong network, then switch (this session carries on as the staker)
  const S = await openSession("staker", "staker", { wrongChain: true });
  await run("UJ-03", "Wrong network, then switch", async () => {
    await go(S, "#/create");
    await connect(S);
    await waitBody(S.page, "Your wallet is on another network. SatStake runs on Arc Testnet.");
    const help = await S.page.locator('[id$="-submit-help"]').innerText();
    note(`Create page reasons while on chain 1: ${help.replace(/\s+/g, " ").trim()}`);
    check(/another network/i.test(help), "no wrong-network reason beside submit");
    check(await submitDisabled(S.page), "submit is enabled on the wrong network");
    await shot(S, "wrong-network");
    await S.page.getByRole("button", { name: "Switch to Arc Testnet", exact: true }).click();
    await waitBody(S.page, /Connected: 0x\w{4}…\w{4} on Arc Testnet\./);
    check(!(await buttonVisible(S.page, "Switch to Arc Testnet")), "switch button still shown");
    note("The Switch to Arc Testnet button asked the wallet to switch; the status then read connected on Arc Testnet.");
    await shot(S, "switched");
  });

  // ---- UJ-12 invalid inputs
  await run("UJ-12", "Invalid inputs show inline errors and submit stays disabled", async () => {
    const page = S.page;
    await go(S, "#/create");
    await waitBody(page, "Create a pledge");
    await page.getByLabel("Token", { exact: true }).selectOption({ label: "cirBTC" });
    await waitBody(page, /Your balance: /);
    await page.getByRole("button", { name: "Create pledge", exact: true }).click({ force: true });
    for (const m of ["Write the promise you are making.", "Choose a deadline.", "Tick the box to confirm you understand.", /Still to complete: /]) await waitBody(page, m, 8000);
    check(await submitDisabled(page), "submit enabled on an empty form");
    note('Activating submit on an empty form listed the faults: "Write the promise you are making.", "Choose a deadline.", "Tick the box to confirm you understand." and a "Still to complete" line.');
    await shot(S, "empty-form");
    const cases = [
      ["Referee address", "abc", "Enter the referee's address: 0x followed by 40 letters and digits."],
      ["Referee address", "0x0000000000000000000000000000000000000000", "Enter a valid address for the referee and the beneficiary."],
      ["Referee address", operator.address, "You cannot be your own referee or beneficiary."],
      ["Amount", "0", "Enter an amount above zero."],
      ["Amount", "abc", "Use digits and at most one decimal point."],
      ["Amount", "0.123456789", "cirBTC has 8 decimal places. Remove the extra digits."],
      ["Amount", "1000000", /Your balance is .* cirBTC, which is less than this amount\./],
      ["Promise", "a".repeat(300), "Shorten the promise to 280 bytes or fewer."],
    ];
    for (const [label, value, expected] of cases) {
      const field = page.getByLabel(label, { exact: true });
      await field.fill(value);
      await field.press("Tab");
      await waitBody(page, expected, 8000);
      note(`${label} = ${value.length > 20 ? `${value.length} characters` : `"${value}"`}: ${expected instanceof RegExp ? "balance is less than this amount" : `"${expected}"`}`);
    }
    await page.getByLabel("Referee address", { exact: true }).fill(accounts.referee.address);
    await page.getByLabel("Beneficiary address", { exact: true }).fill(accounts.referee.address);
    await page.getByLabel("Beneficiary address", { exact: true }).press("Tab");
    await waitBody(page, "The referee and the beneficiary must be different people.", 8000);
    note('Same referee and beneficiary: "The referee and the beneficiary must be different people."');
    await page.getByRole("radio", { name: "Custom", exact: true }).check();
    const past = new Date(Date.now() - 86_400_000);
    const pad = (n) => String(n).padStart(2, "0");
    await page.getByLabel("Custom date and time", { exact: true }).fill(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`);
    await page.getByLabel("Promise", { exact: true }).focus();
    await waitBody(page, "The deadline must be at least 90 seconds from now. Pick a later time.", 8000);
    note('A custom deadline a day in the past: "The deadline must be at least 90 seconds from now. Pick a later time."');
    check(await submitDisabled(page), "submit enabled with invalid inputs");
    note("Submit stayed aria-disabled throughout.");
    await shot(S, "invalid-inputs");
  });

  // ---- UJ-10 cirBTC pledge
  await run("UJ-10", "Create a cirBTC pledge (approval then creation)", async () => {
    const spec = { label: "cirBTC kept", token: "cirBTC", amount: "0.0000001", deadline: "1 day" };
    let created;
    try {
      created = await createViaUi(S, spec);
    } catch (e) {
      finding(`UI creation of the cirBTC pledge failed: ${firstLine(e)}; a script fallback created it so later journeys could run.`, await shotPage(S.page, "UJ-10-create-failed").catch(() => undefined));
      created = { ...(await fallbackCreate({ token: CIRBTC, amount: CIRBTC_AMOUNT, deadlineIn: 86_400n, text: `${PROMISE_PREFIX}: cirBTC kept` })), progress: [], fallback: true };
      throw e;
    } finally {
      if (created) ctx.p1 = created;
    }
    note(`Progress texts seen: ${created.progress.join(" ;; ")}`);
    check(created.progress.some((t) => /Step 1 of 2/.test(t)) && created.progress.some((t) => /Step 2 of 2/.test(t)), "no numbered Step 1 of 2 and Step 2 of 2 in the progress");
    note(`Landed on #/p/${created.id}.`);
    await waitBody(S.page, "Copy the link to this pledge");
    await waitBody(S.page, "0.0000001 cirBTC (10 sats)");
    await shot(S, "cirBTC-created");
    await S.page.getByRole("button", { name: "Copy the link to this pledge" }).click();
    await waitBody(S.page, "Link copied.");
    const clip = await S.page.evaluate(() => navigator.clipboard.readText());
    check(clip === `${SITE}#/p/${created.id}`, `clipboard holds ${clip}`);
    note(`Copy link put ${clip} on the clipboard.`);
    await shot(S, "cirBTC-link-copied");
    await verifyOnChain(created.id, { token: CIRBTC, amount: CIRBTC_AMOUNT, deadlineIn: 86_400n });
    note("On chain: staker, token, amount, referee, beneficiary, a deadline of about one day and the promise text match; state Active.");
  });

  // ---- UJ-11 USDC pledge
  await run("UJ-11", "Create a USDC pledge", async () => {
    const spec = { label: "USDC broken", token: "USDC", amount: "0.1", deadline: "1 day" };
    let created;
    try {
      created = await createViaUi(S, spec);
    } catch (e) {
      finding(`UI creation of the USDC pledge failed: ${firstLine(e)}; a script fallback created it.`, await shotPage(S.page, "UJ-11-create-failed").catch(() => undefined));
      created = { ...(await fallbackCreate({ token: USDC, amount: USDC_AMOUNT, deadlineIn: 86_400n, text: `${PROMISE_PREFIX}: USDC broken` })), progress: [], fallback: true };
      throw e;
    } finally {
      if (created) ctx.p2 = created;
    }
    note(`Progress texts seen: ${created.progress.join(" ;; ")}`);
    check(created.progress.some((t) => /Step 1 of 2/.test(t)) && created.progress.some((t) => /Step 2 of 2/.test(t)), "no numbered progress for the USDC pledge");
    await waitBody(S.page, "0.1 USDC");
    await shot(S, "USDC-created");
    await verifyOnChain(created.id, { token: USDC, amount: USDC_AMOUNT, deadlineIn: 86_400n });
    note(`Landed on #/p/${created.id}; chain state matches.`);
  });

  // ---- sessions for the 2-minute window
  const R3 = await openSession("referee-watch", "referee");
  const B = await openSession("beneficiary", "beneficiary");
  const T = await openSession("settler", "settler");
  const R = await openSession("referee", "referee");
  for (const x of [R3, B, T, R]) {
    await go(x, "#/");
    await connect(x);
  }

  // ---- UJ-13 second USDC pledge, allowance already sufficient
  let allowanceTx;
  await run("UJ-13", "USDC pledge with the allowance already sufficient", async () => {
    // The flow approves exactly the amount and the contract spends it, so no allowance is ever left over after a
    // normal pledge. The one honest way to meet a sufficient allowance is to grant it before the page reads it.
    allowanceTx = await wallet(operator).writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [CONTRACT, USDC_AMOUNT] });
    await receiptOf(allowanceTx);
    txLog.push({ role: "staker", hash: allowanceTx, fn: "approve (script, before the form)", to: USDC });
    cur.txs.push({ role: "staker", hash: allowanceTx, fn: "approve (script, before the form)" });
    note("The script approved exactly 0.1 USDC from the staker before opening the form, since the app never leaves an allowance behind.");
    const spec = { label: "USDC two-minute", token: "USDC", amount: "0.1", deadline: "2 minutes" };
    let created;
    try {
      created = await createViaUi(S, spec);
    } catch (e) {
      finding(`UI creation of the 2-minute pledge failed: ${firstLine(e)}; a script fallback created it.`, await shotPage(S.page, "UJ-13-create-failed").catch(() => undefined));
      created = { ...(await fallbackCreate({ token: USDC, amount: USDC_AMOUNT, deadlineIn: 120n, text: `${PROMISE_PREFIX}: USDC two-minute` })), progress: [], fallback: true };
      throw e;
    } finally {
      if (created) ctx.p3 = created;
    }
    ctx.p3.deadline = (await view("getPledge", [BigInt(created.id)])).deadline;
    note(`Progress texts seen: ${created.progress.join(" ;; ")}`);
    check(!created.progress.some((t) => /Step 1 of 2/.test(t)), "the flow asked for a second approval");
    check(created.progress.some((t) => /Create the pledge/.test(t)), "no create step in the progress");
    note("With the allowance in place the flow showed a single unnumbered step, Create the pledge, and no approval.");
    await shot(S, "two-minute-created");
    await verifyOnChain(created.id, { token: USDC, amount: USDC_AMOUNT, deadlineIn: 120n });
    check((await read(() => pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [operator.address, CONTRACT] }))) === 0n, "allowance left over");
    note("The contract spent the whole allowance; none is left.");
  });

  // ---- the 2-minute window: UJ-34, UJ-20, UJ-22, UJ-44
  const id3 = ctx.p3?.id;
  await run("UJ-34", "Under-10-minutes warning for the staker and the referee", async () => {
    check(id3, "blocked: the 2-minute pledge was not created");
    await waitBody(S.page, /Less than 10 minutes left\. If your referee does not mark this promise kept before the deadline, your stake goes to the beneficiary\./);
    note("Staker page shows: Less than 10 minutes left. If your referee does not mark this promise kept before the deadline, your stake goes to the beneficiary.");
    await shot(S, "two-minute-warning");
    await go(R3, `#/p/${id3}`);
    await waitBody(R3.page, "Less than 10 minutes left. If you do not record a verdict before the deadline, the stake goes to the beneficiary.");
    note("Referee page shows: Less than 10 minutes left. If you do not record a verdict before the deadline, the stake goes to the beneficiary.");
    await shot(R3, "two-minute-warning");
  });
  await run("UJ-20", "Pledge page as each role: badge and action matrix", async () => {
    check(id3, "blocked: the 2-minute pledge was not created");
    check(await bodyHas(S.page, "You are the staker"), "staker badge");
    check(await bodyHas(S.page, "Your referee must mark this promise kept before the deadline."), "staker hint");
    check((await settleButtonsShown(S.page)).length === 0, "settle control shown to the staker while Active");
    note('Staker: badge "You are the staker", hint "Your referee must mark this promise kept before the deadline.", no verdict or settle control.');
    check(await bodyHas(R3.page, "You are the referee"), "referee badge");
    check(await buttonVisible(R3.page, "Kept"), "Kept missing for the referee");
    check(await buttonVisible(R3.page, "Broken"), "Broken missing for the referee");
    check((await settleButtonsShown(R3.page)).length === 0, "settle control shown to the referee while Active");
    check(await bodyHas(R3.page, "Your verdict is final. Record it before the deadline, or the stake goes to the beneficiary."), "referee hint");
    note('Referee: badge "You are the referee", the question "Did the staker keep this promise?" with Kept and Broken, and no settle control.');
    await shot(R3, "verdict-controls");
    await go(B, `#/p/${id3}`);
    await waitBody(B.page, "You are the beneficiary");
    check(!(await buttonVisible(B.page, "Kept")) && !(await buttonVisible(B.page, "Broken")), "verdict controls shown to the beneficiary");
    check((await settleButtonsShown(B.page)).length === 0, "settle control shown to the beneficiary while Active");
    check(!(await bodyHas(B.page, "Less than 10 minutes left")), "warning shown to the beneficiary");
    note("Beneficiary: badge \"You are the beneficiary\", no verdict or settle control, no deadline warning.");
    await shot(B, "active");
  });
  await run("UJ-22", "Pledge page for a visitor and an unrelated account", async () => {
    check(id3, "blocked: the 2-minute pledge was not created");
    await go(V, `#/p/${id3}`);
    await waitBody(V.page, `Pledge #${id3}`);
    await waitBody(V.page, /Connect a wallet to act\./);
    check(!(await bodyHas(V.page, "You are the")), "visitor has a role badge");
    check((await settleButtonsShown(V.page)).length === 0 && !(await buttonVisible(V.page, "Kept")), "visitor sees an action control");
    check(!(await bodyHas(V.page, "Less than 10 minutes left")), "warning shown to a visitor");
    note('Visitor with no wallet: full facts, no badge, no controls, "Connect a wallet to act."');
    await shot(V, "two-minute-pledge");
    await go(T, `#/p/${id3}`);
    await waitBody(T.page, `Pledge #${id3}`);
    check(!(await bodyHas(T.page, "You are the")), "unrelated account has a badge");
    check((await settleButtonsShown(T.page)).length === 0 && !(await buttonVisible(T.page, "Kept")), "unrelated account sees an action control");
    check(!(await bodyHas(T.page, "Less than 10 minutes left")), "warning shown to an unrelated account");
    note("Unrelated connected account: no badge, no controls, no warning while Active.");
    await shot(T, "two-minute-pledge");
  });
  await run("UJ-44", "No settle control before the deadline", async () => {
    check(id3, "blocked: the 2-minute pledge was not created");
    const remaining = ctx.p3.deadline - (await read(() => pub.getBlock())).timestamp;
    check(remaining > 0n, `the deadline passed ${-remaining} s ago, before the check`);
    for (const [name, page] of [["staker", S.page], ["referee", R3.page], ["beneficiary", B.page], ["visitor", V.page], ["unrelated account", T.page]]) {
      check((await settleButtonsShown(page)).length === 0, `${name} sees a settle control`);
    }
    note(`With ${remaining} s left on chain, none of the five pages (staker, referee, beneficiary, visitor, unrelated account) offered a settle control.`);
  });

  // ---- UJ-30 and UJ-24: the referee marks Kept on pledge 1, the staker's open page follows
  const id1 = ctx.p1?.id;
  const id2 = ctx.p2?.id;
  await run("UJ-30", "Referee marks Kept", async () => {
    check(id1, "blocked: the cirBTC pledge was not created");
    await go(S, `#/p/${id1}`);
    await waitBody(S.page, "Active.");
    await go(R, `#/p/${id1}`);
    await waitBody(R.page, "Did the staker keep this promise?");
    await shot(R, "kept-controls");
    const before = txLog.length;
    await R.page.getByRole("button", { name: "Kept", exact: true }).click();
    await waitBody(R.page, /Confirm in your wallet\./, 10_000).catch(() => {});
    await shot(R, "kept-confirming");
    await waitBody(R.page, "You marked this promise kept.", 90_000);
    const t0 = Date.now();
    const tx = lastTx("referee", "markKept", before);
    check(tx, "no markKept transaction from the referee");
    const shown = await R.page.locator(".pledge-progress .hash-value code").first().getAttribute("title");
    check(shown === tx.hash, `the page shows ${shown}, the wallet sent ${tx.hash}`);
    check(await R.page.locator(`.pledge-progress a[href="${EXPLORER}/tx/${tx.hash}"]`).count() === 1, "no explorer link for the transaction");
    check(!(await buttonVisible(R.page, "Kept")), "the verdict controls stayed after the verdict");
    note("The referee's page showed Confirm in your wallet, then the result \"You marked this promise kept.\" with the transaction hash, a copy control and an explorer link; the verdict controls went.");
    await shot(R, "kept-done");
    check((await stateOf(id1)) === "Kept", "chain state is not Kept");
    note("Chain state: Kept.");
    ctx.keptAt = t0;
  });
  await run("UJ-24", "Another session's change reaches an open page within a poll", async () => {
    check(id1 && ctx.keptAt, "blocked: no verdict was recorded");
    await waitBody(S.page, /Kept\. The referee confirmed the promise\./, 40_000);
    const seconds = (Date.now() - ctx.keptAt) / 1000;
    note(`The staker's page, already open on the pledge, showed Kept ${seconds.toFixed(1)} s after the referee's page confirmed (poll interval 4 s), with no reload.`);
    check(seconds < 15, `the update took ${seconds} s`);
    await shot(S, "followed-kept");
  });

  // ---- UJ-40 staker withdraws
  await run("UJ-40", "Staker withdraws after Kept", async () => {
    check(id1, "blocked: the cirBTC pledge was not created");
    await waitBody(S.page, "You are the staker");
    check(await buttonVisible(S.page, "Withdraw my stake"), "Withdraw my stake missing");
    check(!(await buttonVisible(S.page, "Kept")) && !(await buttonVisible(S.page, "Broken")), "verdict controls for the staker");
    const before = await balanceOf(CIRBTC, operator.address);
    const tx0 = txLog.length;
    await S.page.getByRole("button", { name: "Withdraw my stake", exact: true }).click();
    await waitBody(S.page, "Done. The stake was sent to the staker.", 90_000);
    await shot(S, "withdrawn");
    const tx = lastTx("staker", "settle", tx0);
    check(tx, "no settle transaction from the staker");
    const after = await balanceOf(CIRBTC, operator.address);
    check(after - before === CIRBTC_AMOUNT, `staker cirBTC moved by ${after - before}, expected ${CIRBTC_AMOUNT}`);
    check((await stateOf(id1)) === "SettledToStaker", "chain state is not SettledToStaker");
    await waitBody(S.page, "Settled to staker", 30_000);
    note("The staker pressed Withdraw my stake; the page said \"Done. The stake was sent to the staker.\" and then showed Settled to staker. On chain the staker's cirBTC rose by exactly 10 sats.");
    check(!(await bodyHas(S.page, "Withdraw my stake")) || !(await buttonVisible(S.page, "Withdraw my stake")), "the control stayed after settling");
  });

  // ---- UJ-42a: the deadline arrives with no verdict
  await run("UJ-42", "Two-minute pledge expires with no verdict", async () => {
    check(id3, "blocked: the 2-minute pledge was not created");
    const stillOpen = (await read(() => pub.getBlock())).timestamp < ctx.p3.deadline;
    note(stillOpen ? "The deadline had not arrived when this step began; waiting for chain time." : "The deadline had already passed when this step began, so the controls going away is checked after the fact.");
    await waitChain(ctx.p3.deadline);
    await waitBody(R3.page, /Expired\. The deadline passed with no verdict\./, 40_000);
    check(!(await buttonVisible(R3.page, "Kept")) && !(await buttonVisible(R3.page, "Broken")), "Kept or Broken still shown after the deadline");
    check(await bodyHas(R3.page, "Deadline passed"), "no Deadline passed row");
    note("The referee's open page read Expired, showed Deadline passed, and no longer offered Kept or Broken.");
    await shot(R3, "expired");
    check((await stateOf(id3)) === "Expired", "chain state is not Expired");
  });

  // ---- UJ-31 broken through the dialog, UJ-41 beneficiary claims
  await run("UJ-31", "Referee marks Broken through the confirmation dialog", async () => {
    check(id2, "blocked: the USDC pledge was not created");
    await go(R, `#/p/${id2}`);
    await waitBody(R.page, "Did the staker keep this promise?");
    await R.page.getByRole("button", { name: "Broken", exact: true }).click();
    await waitBody(R.page, "Mark this promise broken?");
    await waitBody(R.page, /The stake of 0\.1 USDC will go to the beneficiary, 0x\w{4}…\w{4}\. Your verdict cannot be changed\./);
    const focused = await R.page.evaluate(() => document.activeElement?.textContent?.trim());
    check(focused === "Cancel", `focus starts on ${focused}, expected Cancel`);
    await shot(R, "broken-dialog");
    note('The dialog said "Mark this promise broken?" with the amount and the beneficiary, and focus started on Cancel.');
    await R.page.getByRole("button", { name: "Cancel", exact: true }).click();
    check(!(await R.page.locator("dialog[open]").count()), "dialog still open after Cancel");
    check((await stateOf(id2)) === "Active", "Cancel changed the state");
    note("Cancel closed it and sent nothing.");
    await R.page.getByRole("button", { name: "Broken", exact: true }).click();
    await waitBody(R.page, "Mark this promise broken?");
    const before = txLog.length;
    await R.page.getByRole("button", { name: "Mark it broken", exact: true }).click();
    await waitBody(R.page, "You marked this promise broken.", 90_000);
    await shot(R, "broken-done");
    const tx = lastTx("referee", "markBroken", before);
    check(tx, "no markBroken transaction");
    check((await stateOf(id2)) === "Broken", "chain state is not Broken");
    note("Mark it broken sent one transaction; the page said \"You marked this promise broken.\"; chain state Broken.");
  });
  await run("UJ-41", "Beneficiary claims a broken stake", async () => {
    check(id2, "blocked: the USDC pledge was not created");
    await go(B, `#/p/${id2}`);
    await waitBody(B.page, /Broken\. The referee marked the promise broken\./, 40_000);
    await waitBody(B.page, "You are the beneficiary");
    check(await buttonVisible(B.page, "Claim stake"), "Claim stake missing");
    await shot(B, "claim-offered");
    const tx0 = txLog.length;
    await B.page.getByRole("button", { name: "Claim stake", exact: true }).click();
    await waitBody(B.page, "Done. The stake was sent to the beneficiary.", 90_000);
    await shot(B, "claimed");
    const tx = lastTx("beneficiary", "settle", tx0);
    check(tx, "no settle transaction from the beneficiary");
    const receipt = await receiptOf(tx.hash);
    const got = transfersTo(receipt, USDC, accounts.beneficiary.address);
    check(got.length === 1 && got[0] === USDC_AMOUNT, `USDC transfers to the beneficiary: ${got.join(",")}`);
    check((await stateOf(id2)) === "SettledToBeneficiary", "chain state is not SettledToBeneficiary");
    note("The beneficiary claimed; the receipt holds one Transfer of 0.1 USDC to the beneficiary; chain state SettledToBeneficiary.");
  });

  // ---- UJ-42b: an unrelated account sends the expired stake
  await run("UJ-42", "Two-minute pledge expires with no verdict", async () => {
    check(id3, "blocked: the 2-minute pledge was not created");
    await go(T, `#/p/${id3}`);
    await waitBody(T.page, /Expired\. The deadline passed with no verdict\./, 40_000);
    check(await buttonVisible(T.page, "Send stake to beneficiary"), "Send stake to beneficiary missing for an unrelated account");
    check(!(await buttonVisible(T.page, "Kept")) && !(await buttonVisible(T.page, "Broken")), "verdict controls after expiry");
    await shot(T, "expired-offer");
    const benBefore = await balanceOf(USDC, accounts.beneficiary.address);
    const tx0 = txLog.length;
    await T.page.getByRole("button", { name: "Send stake to beneficiary", exact: true }).click();
    await waitBody(T.page, "Done. The stake was sent to the beneficiary.", 90_000);
    await shot(T, "expired-settled");
    const tx = lastTx("settler", "settle", tx0);
    check(tx, "no settle transaction from the settler");
    const receipt = await receiptOf(tx.hash);
    check(transfersTo(receipt, USDC, accounts.settler.address).length === 0, "the settler received a transfer");
    const got = transfersTo(receipt, USDC, accounts.beneficiary.address);
    check(got.length === 1 && got[0] === USDC_AMOUNT, `transfers to the beneficiary: ${got.join(",")}`);
    check((await balanceOf(USDC, accounts.beneficiary.address)) - benBefore === USDC_AMOUNT, "beneficiary balance did not rise by exactly 0.1 USDC");
    check((await stateOf(id3)) === "SettledToBeneficiary", "chain state is not SettledToBeneficiary");
    note("An unrelated account sent the expired stake; the beneficiary received exactly 0.1 USDC and the sender received no transfer.");
    const t1 = Date.now();
    await waitBody(R3.page, "Settled to beneficiary", 40_000);
    note(`The referee's open page followed to Settled to beneficiary on its own, ${((Date.now() - t1) / 1000).toFixed(1)} s after the settler's page confirmed.`);
  });

  // ---- UJ-22 continued: account switch
  await run("UJ-22", "Pledge page for a visitor and an unrelated account", async () => {
    check(id2, "blocked: the USDC pledge was not created");
    const M = await openSession("multi", "staker");
    await go(M, `#/p/${id2}`);
    await connect(M);
    for (const [role, badge] of [["staker", "You are the staker"], ["referee", "You are the referee"], ["beneficiary", "You are the beneficiary"]]) {
      await switchRole(M, role);
      await waitBody(M.page, badge, 15_000);
      note(`After accountsChanged to the ${role}, the badge read "${badge}".`);
    }
    await switchRole(M, "settler");
    await M.page.waitForFunction(() => !document.body.innerText.includes("You are the"), null, { timeout: 15_000 });
    note("After accountsChanged to an unrelated account, the badge went.");
    await shot(M, "role-switch");
    await M.context.close();
  });

  // ---- UJ-23 My pledges
  await run("UJ-23", "My pledges lists the new pledges newest first with roles", async () => {
    check(id1 && id2 && id3, "blocked: not all three pledges were created");
    for (const [x, role] of [[S, "staker"], [B, "beneficiary"]]) {
      await go(x, "#/mine");
      await waitBody(x.page, /You take part in \d+ pledges?\. Newest first\./);
      await x.page.locator(".pledge-list li").first().waitFor({ timeout: 30_000 });
      await waitBody(x.page, new RegExp(`Pledge #${id3}`));
      const opened = Date.now();
      await shot(x, "mine-as-first-drawn");
      // Each card reads its pledge and its state separately, so the cards fill in one after another.
      await x.page
        .waitForFunction(() => [...document.querySelectorAll(".pledge-list li")].every((li) => /Deadline|Could not read/.test(li.innerText)), null, { timeout: 90_000 })
        .catch(() => {});
      const all = await x.page.locator(".pledge-list li").allInnerTexts();
      const empty = all.filter((c) => !/Deadline|Could not read/.test(c)).length;
      const unreadable = all.filter((c) => /Could not read this pledge/.test(c)).length;
      note(`${role}: ${all.length} cards on the first page; all filled in after ${((Date.now() - opened) / 1000).toFixed(1)} s; ${empty} still empty, ${unreadable} saying "Could not read this pledge."`);
      if (empty || unreadable) finding(`My pledges (${role}): ${empty} of ${all.length} cards never filled in and ${unreadable} said they could not be read, most likely RPC limits on the burst of two reads per card.`, await shot(x, "mine-unfilled-cards"));
      const cards = await x.page.locator(".pledge-list li").allInnerTexts();
      const ids = cards.map((c) => Number(c.match(/Pledge #(\d+)/)?.[1]));
      const order = [id3, id2, id1].map((i) => ids.indexOf(i));
      check(order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2], `order of ${[id3, id2, id1]} in ${ids.slice(0, 8)}`);
      const first = cards.find((c) => c.includes(`Pledge #${id3}`)).replace(/\s+/g, " ");
      check(first.includes(`You are the ${role}`), `card says: ${first}`);
      note(`${role}: the list puts #${id3}, #${id2}, #${id1} in that order, newest first. Card for #${id3}: ${first}`);
      await shot(x, "mine");
    }
  });

  // ---- UJ-92 copy and explorer controls
  await run("UJ-92", "Every hash and address shown has copy and explorer controls", async () => {
    check(id2, "blocked: the USDC pledge was not created");
    await go(S, `#/p/${id2}`);
    await waitBody(S.page, "Settled to beneficiary");
    const values = S.page.locator(".hash-value");
    const count = await values.count();
    check(count >= 3, `only ${count} address controls on the pledge page`);
    for (let i = 0; i < count; i++) {
      const item = values.nth(i);
      const title = await item.locator("code").getAttribute("title");
      const copy = await item.getByRole("button", { name: /^Copy / }).count();
      const href = await item.locator("a").getAttribute("href");
      check(copy === 1, `no copy button for ${title}`);
      check(href === `${EXPLORER}/address/${title}`, `explorer link ${href} for ${title}`);
    }
    note(`The pledge page shows ${count} addresses (staker, referee, beneficiary); each has a Copy button and a link to ${EXPLORER}/address/<address>.`);
    await values.nth(1).getByRole("button", { name: /^Copy / }).click();
    await waitBody(S.page, "Copied.");
    const copied = await S.page.evaluate(() => navigator.clipboard.readText());
    check(copied === accounts.referee.address, `clipboard holds ${copied}`);
    note("Copy on the referee's row put the full referee address on the clipboard and said Copied.");
    await shot(S, "hash-controls");
    await go(V, "#/");
    const home = V.page.locator(".hash-value").first();
    check((await home.locator("a").getAttribute("href")) === `${EXPLORER}/address/${CONTRACT}`, "home explorer link");
    check((await home.getByRole("button", { name: /^Copy / }).count()) === 1, "home copy button");
    note("The home page's contract address has the same two controls.");
    note("Transaction hashes: the referee's result in UJ-30 showed its hash with a copy control and an explorer link (checked there against the hash the wallet sent).");
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
  out.push("# UI dry run on Arc testnet", "");
  out.push(`Date: ${startedAt.toISOString().slice(0, 10)}. Site: ${SITE} (the testnet build). Chain ${CHAIN_ID}, contract \`${CONTRACT}\`.`, "");
  out.push(`Repository commit: \`${commit}\`, the HEAD of the working branch when this ran. The Pages run that published the site is not available from this branch, so this is the closest record of what was deployed, not a proof of it.`, "");
  out.push("The run drives the real site in a Chromium browser through an injected wallet (EIP-6963, name \"Dry run wallet\") whose requests are answered by a script holding the keys. Every action below was done by clicking and typing in the page. Screenshots are 1440 px wide, full page, in the gitignored `cache/dry-run/`; they are named per step below.", "");
  out.push(`Result: ${passed} of ${journeys.length} journeys passed.`, "");
  out.push("| Journey | Title | Result |", "|---|---|---|", ...journeys.map((j) => `| ${j.id} | ${j.title} | ${j.status} |`), "");
  out.push("## Journeys", "");
  for (const j of journeys) {
    out.push(`### ${j.id} ${j.title}: ${j.status}`, "");
    for (const n of j.notes) out.push(`- ${redact(n)}`);
    if (j.txs.length) {
      out.push("", "Transactions:", "");
      for (const t of j.txs) out.push(`- ${t.role} ${t.fn}: ${link(t.hash)}`);
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
  for (const r of ["referee", "beneficiary", "settler"]) out.push(`- ${r[0].toUpperCase()}${r.slice(1)} (throwaway, generated in memory): \`${accounts[r].address}\``);
  out.push("");
  out.push("## Pledges created", "");
  for (const [k, label] of [["p1", "cirBTC, 10 sats, 1 day"], ["p2", "USDC 0.1, 1 day"], ["p3", "USDC 0.1, 2 minutes"]]) {
    out.push(`- #${ctx[k]?.id ?? "not created"}: ${label}${ctx[k]?.fallback ? " (created by the script fallback, not the UI)" : ""}`);
  }
  out.push("");
  out.push("## Funds", "");
  out.push(`- Gas funding sent to the throwaway accounts: ${fundingTxs.map((f) => `${f.role} ${formatUnits(f.value, 18)} USDC ${link(f.hash)}`).join("; ") || "none"}.`);
  out.push(`- Operator before: ${formatUnits(startBalances.native ?? 0n, 18)} USDC, ${startBalances.sats ?? 0n} sats.`);
  out.push(`- Operator after the sweep: ${formatUnits(startBalances.nativeAfter ?? 0n, 18)} USDC, ${startBalances.satsAfter ?? 0n} sats.`);
  if (startBalances.native !== undefined && startBalances.nativeAfter !== undefined) {
    out.push(`- Net cost: ${formatUnits(startBalances.native - startBalances.nativeAfter, 18)} USDC (network fees; every stake returned to the operator, the beneficiary's receipts swept back), ${startBalances.sats - startBalances.satsAfter} sats.`);
  }
  out.push(`- Sweep: ${sweepError ? `INCOMPLETE, ${sweepError}` : "completed"}.`);
  for (const s of sweepSteps) out.push(`  - ${s.description}${s.tx ? ` ${link(s.tx)}` : ""}${s.note ? ` (${s.note})` : ""}`);
  out.push("");
  out.push("## Findings", "");
  if (findings.length === 0 && consoleErrors.size === 0) out.push("None.");
  for (const f of findings) out.push(`- ${f.journey ?? "run"}: ${redact(f.text)}${f.shot ? ` Screenshot: \`${f.shot}\`.` : ""}`);
  if (consoleErrors.size) {
    out.push("- Browser console errors and page errors seen (deduplicated):");
    for (const m of consoleErrors.keys()) out.push(`  - ${m}`);
  }
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
  journey("run", "Setup and run").status = "Fail";
  findings.push({ journey: "run", text: `The run stopped: ${firstLine(e)}` });
} finally {
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
  } catch {
    // reported as zero if the final read fails
  }
  if (startBalances.native !== undefined) {
    writeFileSync(join(root, "docs/evidence/ui-dry-run-testnet.md"), render(startedAt));
    console.log("evidence written to docs/evidence/ui-dry-run-testnet.md");
  }
  const failed = journeys.filter((j) => j.status !== "Pass").map((j) => j.id);
  console.log(`journeys: ${journeys.length - failed.length} passed, ${failed.length} failed ${failed.join(",")}; sweep ${sweepError ? `INCOMPLETE ${sweepError}` : "complete"}`);
  process.exitCode = failure ? 1 : 0;
}
