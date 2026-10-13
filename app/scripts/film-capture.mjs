// Captures the create and verdict states for the demo film from a real promise on Arc testnet, at 2x. Usage, from app/:
//   npm run build:testnet
//   VITE_NETWORK=testnet ./node_modules/.bin/vite preview --port 4174 --strictPort --host 127.0.0.1   (kept running)
//   SATSTAKE_ENV_FILE=<file holding TESTNET_PRIVATE_KEY> SATSTAKE_SITE=http://127.0.0.1:4174/ node scripts/film-capture.mjs
//
// It signs one 1,000-sat cirBTC promise as the testnet operator, has a throwaway referee mark it Kept and send
// the payout, so the stake comes back, then sweeps the referee's gas back. The wallet is the same injected
// EIP-1193 bridge as ui-dry-run.mjs and sends only to SatStake and its tokens. Every image is real page pixels;
// beside each one goes a JSON of element boxes in image pixels, so the film crops by element instead of by eye.
// Output goes to film/assets/testnet/. Screens are taken in UTC so no local time zone is recorded.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createPublicClient, createWalletClient, defineChain, erc20Abi, getAddress, http, parseEventLogs, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, allowedSendTarget, assertChainId, fundingFor, parseEnvKey, sweepValue, withRetry } from "../../e2e/lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = process.env.SATSTAKE_SITE ?? "http://127.0.0.1:4174/";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(SITE)) throw new Error(`refusing to run: ${SITE} is not a local preview server`);
const RPC = "https://rpc.testnet.arc.io";
const OUT = join(root, process.env.FILM_MODE === "referee" ? "film/assets/testnet-referee" : "film/assets/testnet");
const DPR = 2;
const PROMISE = "run three times this week.";
const SATS = BigInt(process.env.FILM_SATS ?? "200");
// FILM_MODE=referee signs a 0.10 USDC promise with no create shots, for the referee's views only.
const REFEREE_ONLY = process.env.FILM_MODE === "referee";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

const CONTRACT = getAddress(readJson(`deployments/${CHAIN_ID}.json`).address);
const tokens = readJson(`deployments/config/${CHAIN_ID}.json`).tokens;
const USDC = getAddress(tokens.find((t) => t.symbol === "USDC").address);
const CIRBTC = getAddress(tokens.find((t) => t.symbol === "cirBTC").address);
const abi = readJson("out/SatStake.sol/SatStake.json").abi;

if (!process.env.SATSTAKE_ENV_FILE) throw new Error("SATSTAKE_ENV_FILE is not set");
const operator = privateKeyToAccount(parseEnvKey(readFileSync(process.env.SATSTAKE_ENV_FILE, "utf8")));
const accounts = { staker: operator, referee: privateKeyToAccount(generatePrivateKey()), beneficiary: privateKeyToAccount(generatePrivateKey()) };

const chain = defineChain({ id: CHAIN_ID, name: "Arc testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC) });
const read = (fn) => withRetry(fn);

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
  const info = Object.freeze({ uuid: "0b6f1b1e-9a35-4d0e-8d1c-6c7a2f0e5a21", name: "Browser wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIvPg==",
    rdns: "test.satstake.film" });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;

const SIGNING = new Set(["personal_sign", "eth_sign", "eth_signTypedData", "eth_signTypedData_v3", "eth_signTypedData_v4", "eth_signTransaction"]);
const rpcError = (code, message) => Object.assign(new Error(message), { code });
const sent = [];

async function dispatch(s, method, params) {
  if (SIGNING.has(method)) throw rpcError(-32601, `${method} is refused`);
  switch (method) {
    case "eth_requestAccounts":
      s.authorized = true;
      return [accounts[s.role].address.toLowerCase()];
    case "eth_accounts":
      return s.authorized ? [accounts[s.role].address.toLowerCase()] : [];
    case "eth_chainId":
      return toHex(CHAIN_ID);
    case "net_version":
      return String(CHAIN_ID);
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
      return null;
    case "wallet_getPermissions":
    case "wallet_requestPermissions":
    case "wallet_revokePermissions":
      return [];
    case "eth_sendTransaction": {
      const tx = params[0];
      const account = accounts[s.role];
      if (!allowedSendTarget(tx.to, [CONTRACT, USDC, CIRBTC])) throw rpcError(-32602, `refusing to send to ${String(tx.to)}`);
      assertChainId(await read(() => pub.getChainId()));
      await sleep(1200);
      const hash = await read(() =>
        wallet(account).sendTransaction({ account, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined, gas: tx.gas ? BigInt(tx.gas) : undefined }),
      );
      sent.push({ role: s.role, hash });
      console.log(`tx ${s.role} ${hash}`);
      return hash;
    }
    default:
      return read(() => pub.request({ method, params }));
  }
}

let browser;
async function openSession(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR, colorScheme: "light", timezoneId: "UTC", locale: "en-US" });
  const page = await context.newPage();
  const s = { role, page, authorized: false };
  await page.exposeBinding("__walletRequest", async (_src, payload) => {
    try {
      return { result: await dispatch(s, payload.method, payload.params) };
    } catch (e) {
      return { error: { code: typeof e.code === "number" ? e.code : -32603, message: String(e.shortMessage ?? e.message).split("\n")[0] } };
    }
  });
  await page.addInitScript(WALLET_SCRIPT);
  return s;
}

async function waitBody(page, pattern, timeout = 60_000) {
  const arg = pattern instanceof RegExp ? { src: pattern.source, flags: pattern.flags } : { text: pattern };
  await page.waitForFunction(
    ({ src, flags, text }) => {
      const t = document.body.innerText.replace(/\s+/g, " ");
      return src !== undefined ? new RegExp(src, flags).test(t) : t.includes(text);
    },
    arg,
    { timeout, polling: 250 },
  );
}

// Boxes of the elements a shot may frame, in the screenshot's own pixels (page coordinates times DPR).
const BOXES = {
  hero: "textarea",
  heroBlock: "h1",
  form: 'form[aria-label="New promise"]',
  token: "select",
  amount: 'input[aria-label="Amount"], label:has-text("Amount") + input',
  submit: 'form[aria-label="New promise"] button[type="submit"]',
  panel: 'section[aria-label="Signed promise"]',
  pad: ".pad-area",
  padCanvas: ".pad-area canvas",
  banner: ".pledge-banner",
  status: '[aria-label="Promise status"]',
  kept: 'button:text-is("Kept")',
  broken: 'button:text-is("Broken")',
  payout: 'button:text-is("Send payout")',
  header: "header",
};
async function boxes(page) {
  const out = {};
  for (const [name, sel] of Object.entries(BOXES)) {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) continue;
    const b = await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    });
    out[name] = { x: Math.round(b.x * DPR), y: Math.round(b.y * DPR), w: Math.round(b.w * DPR), h: Math.round(b.h * DPR), cssW: b.w, cssH: b.h };
  }
  for (const label of ["Referee address", "Beneficiary address", "Amount", "Token"]) {
    const loc = page.getByLabel(label, { exact: true }).first();
    if (!(await loc.count())) continue;
    const b = await loc.boundingBox();
    const y = await page.evaluate(() => scrollY);
    if (b) out[label] = { x: Math.round(b.x * DPR), y: Math.round((b.y + y) * DPR), w: Math.round(b.width * DPR), h: Math.round(b.height * DPR) };
  }
  return out;
}
async function shot(page, name) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ dpr: DPR, boxes: await boxes(page), text: (await page.locator("body").innerText()).replace(/\s+/g, " ") }, null, 1));
  console.log(`shot ${name}`);
}

async function main() {
  mkdirSync(join(OUT, "typing"), { recursive: true });
  assertChainId(await read(() => pub.getChainId()));
  const html = await fetch(SITE).then((r) => r.text());
  if (!html.includes(RPC) || html.includes("rpc.mainnet.arc.io")) throw new Error("the served build is not the testnet build");
  const sats = await read(() => pub.readContract({ address: CIRBTC, abi: erc20Abi, functionName: "balanceOf", args: [operator.address] }));
  if (!REFEREE_ONLY && sats < SATS) throw new Error(`the operator holds ${sats} sats, the film needs ${SATS}`);

  browser = await chromium.launch();
  const S = await openSession("staker");
  const page = S.page;
  await page.goto(SITE + "#/create");
  await waitBody(page, "I promise to");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Connect Browser wallet", exact: true }).click();
  await waitBody(page, /Connected: 0x\w{4}…\w{4}/);
  await sleep(800);
  const shotC = (name) => (REFEREE_ONLY ? Promise.resolve() : shot(page, name));
  await shotC("c01-empty");

  // One frame per character, clipped to the hero, so the film's typing is the page's own type.
  const field = page.getByLabel("Your promise", { exact: true });
  await field.fill(PROMISE);
  await sleep(300);
  const full = await page.locator("h1").first().boundingBox();
  await field.fill("");
  const clip = { x: 0, y: 0, width: 1440, height: Math.ceil(full.y + full.height + 140) };
  writeFileSync(join(OUT, "typing/clip.json"), JSON.stringify({ dpr: DPR, clip, chars: PROMISE.length }));
  await field.focus();
  for (let i = 0; i <= (REFEREE_ONLY ? -1 : PROMISE.length); i++) {
    if (i > 0) await page.keyboard.type(PROMISE[i - 1]);
    await sleep(60);
    await page.screenshot({ path: join(OUT, `typing/${String(i).padStart(2, "0")}.png`), clip });
  }
  if (REFEREE_ONLY) await field.fill(PROMISE);
  await field.blur();

  await page.getByLabel("Token", { exact: true }).selectOption({ label: REFEREE_ONLY ? "USDC" : "cirBTC" });
  await page.getByLabel("Amount", { exact: true }).fill(REFEREE_ONLY ? "0.1" : (Number(SATS) / 1e8).toFixed(8).replace(/0+$/, ""));
  await waitBody(page, /This amount: /);
  await shotC("c02-stake");
  await page.getByLabel("Referee address", { exact: true }).fill(accounts.referee.address);
  await page.getByLabel("Beneficiary address", { exact: true }).fill(accounts.beneficiary.address);
  await page.getByRole("radio", { name: "1 day", exact: true }).check();
  await shotC("c03-people");
  const box = page.getByRole("checkbox");
  await box.click({ force: true });
  if (!(await box.isChecked())) await box.click({ force: true });
  await page.waitForFunction(() => document.querySelector('form[aria-label="New promise"] button[type="submit"]')?.getAttribute("aria-disabled") === "false", null, { timeout: 30_000 });
  await shotC("c04-ready");

  // Fund the referee before signing, so the creation is the last thing the staker waits on.
  const feeCap = (await read(() => pub.estimateFeesPerGas())).maxFeePerGas * 2n;
  const fund = await wallet(operator).sendTransaction({ to: accounts.referee.address, value: fundingFor({ calls: 3, feeCap }) });
  await read(() => pub.waitForTransactionReceipt({ hash: fund }));

  await page.locator('form[aria-label="New promise"] button[type="submit"]').click();
  await waitBody(page, /Confirm in your wallet\./, 10_000).catch(() => {});
  await shotC("c05-confirming");
  const panel = page.locator('section[aria-label="Signed promise"]');
  await panel.waitFor({ timeout: 150_000 });
  // The page's policy refuses injected style sheets, so the ink layer is hidden through the element itself.
  const inkVisible = (on) => page.evaluate((v) => document.querySelector(".pad-area canvas")?.style.setProperty("visibility", v ? "visible" : "hidden", "important"), on);
  await inkVisible(false);
  await shotC("c06-signed-noink");
  await inkVisible(true);
  await sleep(2500);
  await shotC("c07-signed");

  const create = sent.filter((t) => t.role === "staker").at(-1);
  const receipt = await read(() => pub.waitForTransactionReceipt({ hash: create.hash }));
  const [created] = parseEventLogs({ abi, logs: receipt.logs, eventName: "PledgeCreated" });
  const id = Number(created.args.id);
  console.log(`promise #${id}`);

  const R = await openSession("referee");
  await R.page.goto(`${SITE}#/p/${id}`);
  await waitBody(R.page, `Promise #${id}`);
  await R.page.getByRole("button", { name: "Connect", exact: true }).click();
  await R.page.getByRole("button", { name: "Connect Browser wallet", exact: true }).click();
  await waitBody(R.page, "Was this promise kept?");
  await sleep(800);
  await shot(R.page, "r01-verdict");
  await R.page.getByRole("button", { name: "Kept", exact: true }).click();
  await waitBody(R.page, "You marked this promise kept.", 120_000);
  await sleep(1500);
  await shot(R.page, "r02-kept");
  await R.page.getByRole("button", { name: "Send payout", exact: true }).click();
  await waitBody(R.page, /Paid back/, 120_000);
  await sleep(1500);
  await shot(R.page, "r03-paid");
  await browser.close();

  const left = await read(() => pub.getBalance({ address: accounts.referee.address }));
  const value = sweepValue(left, feeCap);
  if (value > 0n) {
    const hash = await wallet(accounts.referee).sendTransaction({ to: operator.address, value, maxFeePerGas: feeCap, maxPriorityFeePerGas: feeCap });
    await read(() => pub.waitForTransactionReceipt({ hash }));
  }
  writeFileSync(join(OUT, "run.json"), JSON.stringify({ chainId: CHAIN_ID, contract: CONTRACT, promise: id, txs: sent, funding: fund }, null, 1));
  console.log("done");
}

main().catch(async (e) => {
  console.error(e);
  await browser?.close().catch(() => {});
  try {
    const feeCap = (await read(() => pub.estimateFeesPerGas())).maxFeePerGas * 2n;
    const value = sweepValue(await read(() => pub.getBalance({ address: accounts.referee.address })), feeCap);
    if (value > 0n) await wallet(accounts.referee).sendTransaction({ to: operator.address, value, maxFeePerGas: feeCap, maxPriorityFeePerGas: feeCap });
  } catch (sweepError) {
    console.error("sweep failed", sweepError.shortMessage ?? sweepError.message);
  }
  process.exit(1);
});
