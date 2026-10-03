import { type Address, type Hex, type PublicClient, encodeEventTopics, erc20Abi, getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { pledgeCreatedLog } from "../test/fakeWorld";
import {
  CreationUnconfirmedError,
  DeadlineCheckError,
  type CreateInput,
  type FlowIO,
  type ReceiptLike,
  type Step,
  pledgeIdFromReceipt,
  receiptOf,
  runCreate,
} from "./flow";

const CONTRACT = getAddress("0x" + "c0".repeat(20));
const TOKEN = getAddress("0x" + "7a".repeat(20));
const STAKER = getAddress("0x" + "11".repeat(20));
const REFEREE = getAddress("0x" + "22".repeat(20));
const BENEFICIARY = getAddress("0x" + "33".repeat(20));
const AMOUNT = 5_000_000n;
const NOW = 1_789_500_000n;
const APPROVE_HASH = `0x${"0a".repeat(32)}` as Hex;
const CREATE_HASH = `0x${"0c".repeat(32)}` as Hex;

const created = (address: Address, id: bigint) =>
  pledgeCreatedLog({ address, id, staker: STAKER, token: TOKEN, amount: AMOUNT, referee: REFEREE, beneficiary: BENEFICIARY, deadline: 1n });

const success = (id = 42n): ReceiptLike => ({ status: "success", logs: [created(CONTRACT, id)] });
const preset: CreateInput = { amount: AMOUNT, deadline: { kind: "preset", seconds: 604_800n } };

interface Script {
  allowance?: bigint;
  approveError?: Error;
  createError?: Error;
  chainTimes?: bigint[];
  /** What the clock says at each check of a custom deadline, oldest first; the last value repeats. */
  clock?: (bigint | null)[];
  receipts?: Partial<Record<Hex, ReceiptLike>>;
  /** Hashes whose receipt cannot be obtained at all, as when the wait times out or the endpoint fails. */
  receiptErrors?: Partial<Record<Hex, Error>>;
  /** Held until called, so a test can look at the world while a receipt is pending. */
  holdApproveReceipt?: Promise<void>;
}

function world(script: Script = {}) {
  const log: string[] = [];
  const times = [...(script.chainTimes ?? [NOW])];
  const clock = [...(script.clock ?? [NOW])];
  const io: FlowIO = {
    contract: CONTRACT,
    async allowance() {
      log.push("allowance");
      return script.allowance ?? 0n;
    },
    async approve(amount) {
      log.push(`approve:${amount}`);
      if (script.approveError) throw script.approveError;
      return APPROVE_HASH;
    },
    async create(deadline) {
      log.push(`create:${deadline}`);
      if (script.createError) throw script.createError;
      return CREATE_HASH;
    },
    async receipt(hash) {
      log.push(`receipt:${hash === APPROVE_HASH ? "approve" : "create"}`);
      if (hash === APPROVE_HASH) await script.holdApproveReceipt;
      const failure = script.receiptErrors?.[hash];
      if (failure) throw failure;
      return script.receipts?.[hash] ?? (hash === APPROVE_HASH ? { status: "success", logs: [] } : success());
    },
    async chainTime() {
      log.push("chainTime");
      return times.shift() ?? NOW;
    },
    clockNow() {
      log.push("clock");
      return clock.length > 1 ? (clock.shift() as bigint | null) : (clock[0] as bigint | null);
    },
  };
  return { io, log };
}

describe("LLR-FE-033 the allowance is read first, and approval is requested only when it is short, for exactly the amount", () => {
  it("approves, waits for the approval receipt, and only then requests creation", async () => {
    const { io, log } = world({ allowance: 0n });
    await runCreate(io, preset, () => {});
    expect(log).toEqual([
      "allowance",
      `approve:${AMOUNT}`,
      "receipt:approve",
      "chainTime",
      `create:${NOW + 604_800n}`,
      "receipt:create",
    ]);
  });

  it("skips the approval when the allowance already covers the amount, and asks the wallet once", async () => {
    const { io, log } = world({ allowance: AMOUNT });
    await runCreate(io, preset, () => {});
    expect(log.filter((l) => l.startsWith("approve"))).toEqual([]);
    expect(log.filter((l) => l.startsWith("create"))).toHaveLength(1);
  });

  it("approves when the allowance is one unit short, and skips it when it is one unit over", async () => {
    const short = world({ allowance: AMOUNT - 1n });
    await runCreate(short.io, preset, () => {});
    expect(short.log).toContain(`approve:${AMOUNT}`);
    const over = world({ allowance: AMOUNT + 1n });
    await runCreate(over.io, preset, () => {});
    expect(over.log.some((l) => l.startsWith("approve"))).toBe(false);
  });

  it("approves exactly the amount and never more, whatever part of it is already allowed", async () => {
    for (const [allowance, amount] of [
      [0n, 1n],
      [3n, 10n],
      [9n, 10n],
      [0n, 2n ** 200n],
    ] as const) {
      const { io, log } = world({ allowance });
      await runCreate(io, { ...preset, amount }, () => {});
      const approvals = log.filter((l) => l.startsWith("approve:"));
      expect(approvals, `${allowance} of ${amount}`).toEqual([`approve:${amount}`]);
    }
  });

  it("does not request creation until the approval receipt has arrived", async () => {
    let release = () => {};
    const { io, log } = world({ holdApproveReceipt: new Promise<void>((resolve) => (release = resolve)) });
    const done = runCreate(io, preset, () => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(log).toEqual(["allowance", `approve:${AMOUNT}`, "receipt:approve"]);
    release();
    await done;
    expect(log.some((l) => l.startsWith("create:"))).toBe(true);
  });

  it("stops at a refused approval with the wallet's own error, and requests nothing more", async () => {
    const refusal = Object.assign(new Error("User rejected the request."), { code: 4001 });
    const { io, log } = world({ approveError: refusal });
    await expect(runCreate(io, preset, () => {})).rejects.toBe(refusal);
    expect(log).toEqual(["allowance", `approve:${AMOUNT}`]);
  });

  it("stops at an approval that was mined and reverted, and requests no creation", async () => {
    const { io, log } = world({ receipts: { [APPROVE_HASH]: { status: "reverted", logs: [] } } });
    await expect(runCreate(io, preset, () => {})).rejects.toThrow(/approval.*reverted/i);
    expect(log.some((l) => l.startsWith("create"))).toBe(false);
    expect(log).not.toContain("chainTime");
  });

  it("passes on the wallet's own error when creation is refused, after the approval", async () => {
    const refusal = Object.assign(new Error("User rejected the request."), { code: 4001 });
    const { io, log } = world({ createError: refusal });
    await expect(runCreate(io, preset, () => {})).rejects.toBe(refusal);
    expect(log.filter((l) => l.startsWith("approve"))).toHaveLength(1);
  });

  it("fails when the creation was mined and reverted", async () => {
    const { io } = world({ receipts: { [CREATE_HASH]: { status: "reverted", logs: [] } } });
    await expect(runCreate(io, preset, () => {})).rejects.toThrow(/creation.*reverted/i);
  });

  it("reads the allowance again on every run, so a retry after a failure skips an approval that stood", async () => {
    const first = world({ allowance: 0n, createError: new Error("x") });
    await expect(runCreate(first.io, preset, () => {})).rejects.toThrow("x");
    const retry = world({ allowance: AMOUNT });
    await runCreate(retry.io, preset, () => {});
    expect(retry.log.filter((l) => l.startsWith("approve"))).toEqual([]);
  });
});

describe("LLR-FE-033 progress is shown for both steps", () => {
  it("walks the approval and the creation through the wallet and the network, in order", async () => {
    const { io } = world({ allowance: 0n });
    const seen: Step[][] = [];
    await runCreate(io, preset, (steps) => seen.push(steps.map((s) => ({ ...s }))));
    expect(seen).toEqual([
      [
        { id: "approve", stage: "wallet" },
        { id: "create", stage: "waiting" },
      ],
      [
        { id: "approve", stage: "confirming" },
        { id: "create", stage: "waiting" },
      ],
      [
        { id: "approve", stage: "done" },
        { id: "create", stage: "wallet" },
      ],
      [
        { id: "approve", stage: "done" },
        { id: "create", stage: "confirming" },
      ],
      [
        { id: "approve", stage: "done" },
        { id: "create", stage: "done" },
      ],
    ]);
  });

  it("shows only the creation when the approval is not needed", async () => {
    const { io } = world({ allowance: AMOUNT });
    const seen: Step[][] = [];
    await runCreate(io, preset, (steps) => seen.push(steps.map((s) => ({ ...s }))));
    expect(seen).toEqual([[{ id: "create", stage: "wallet" }], [{ id: "create", stage: "confirming" }], [{ id: "create", stage: "done" }]]);
  });
});

describe("LLR-FE-031 a preset deadline is computed from chain time read just before the creation request, after any approval", () => {
  it("reads chain time after the approval receipt and adds the preset to it", async () => {
    // The first value is what chain time was when the form was opened; the approval took 300 seconds.
    const { io, log } = world({ allowance: 0n, chainTimes: [NOW + 300n, NOW + 9_999n] });
    await runCreate(io, { amount: AMOUNT, deadline: { kind: "preset", seconds: 120n } }, () => {});
    expect(log.indexOf("chainTime")).toBeGreaterThan(log.indexOf("receipt:approve"));
    expect(log.indexOf("chainTime")).toBeLessThan(log.findIndex((l) => l.startsWith("create:")));
    expect(log).toContain(`create:${NOW + 300n + 120n}`);
  });

  it("reads chain time once, and not before the approval, when no approval is needed", async () => {
    const { io, log } = world({ allowance: AMOUNT, chainTimes: [NOW + 5n] });
    await runCreate(io, preset, () => {});
    expect(log.filter((l) => l === "chainTime")).toHaveLength(1);
    expect(log).toContain(`create:${NOW + 5n + 604_800n}`);
  });

  it("sends a custom deadline as it was chosen", async () => {
    const { io, log } = world({ allowance: AMOUNT });
    await runCreate(io, { amount: AMOUNT, deadline: { kind: "custom", timestamp: NOW + 3_600n } }, () => {});
    expect(log).toContain(`create:${NOW + 3_600n}`);
  });
});

describe("LLR-FE-037 the pledge identifier is decoded from the PledgeCreated event of the creation receipt", () => {
  it("returns the identifier the receipt's event carries", async () => {
    const { io } = world({ allowance: AMOUNT, receipts: { [CREATE_HASH]: success(7n) } });
    expect(await runCreate(io, preset, () => {})).toBe(7n);
    const big = 2n ** 200n + 5n;
    expect(pledgeIdFromReceipt(success(big), CONTRACT)).toBe(big);
  });

  it("finds the event among the token's own logs", () => {
    const transfer = {
      address: TOKEN,
      topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: STAKER, to: CONTRACT } }) as Hex[],
      data: ("0x" + "00".repeat(32)) as Hex,
    };
    expect(pledgeIdFromReceipt({ status: "success", logs: [transfer, created(CONTRACT, 9n), transfer] }, CONTRACT)).toBe(9n);
  });

  it("ignores the same event from any other address, even when it comes first", () => {
    const decoy = created(getAddress("0x" + "de".repeat(20)), 999n);
    expect(pledgeIdFromReceipt({ status: "success", logs: [decoy, created(CONTRACT, 3n)] }, CONTRACT)).toBe(3n);
  });

  it("matches the contract's address without regard to letter case", () => {
    const lower = { ...created(CONTRACT, 4n), address: CONTRACT.toLowerCase() as Address };
    expect(pledgeIdFromReceipt({ status: "success", logs: [lower] }, CONTRACT)).toBe(4n);
  });

  it("fails when the receipt holds no PledgeCreated from the contract", () => {
    expect(() => pledgeIdFromReceipt({ status: "success", logs: [] }, CONTRACT)).toThrow(/PledgeCreated/);
    expect(() => pledgeIdFromReceipt({ status: "success", logs: [created(getAddress("0x" + "de".repeat(20)), 1n)] }, CONTRACT)).toThrow(/PledgeCreated/);
  });

  it("fails the creation when its receipt lacks the event, rather than guessing an identifier", async () => {
    const { io } = world({ allowance: AMOUNT, receipts: { [CREATE_HASH]: { status: "success", logs: [] } } });
    await expect(runCreate(io, preset, () => {})).rejects.toThrow(/PledgeCreated/);
  });
});

describe("LLR-FE-033 each receipt wait follows a transaction the wallet replaces and ends after 3 minutes", () => {
  it("asks the client to wait for the hash, with a timeout of 180000 ms, a 1 s poll, and replacement detection left on", async () => {
    const waitForTransactionReceipt = vi.fn(async () => success(5n));
    const client = { waitForTransactionReceipt } as unknown as PublicClient;
    expect(await receiptOf(client, CREATE_HASH)).toEqual(success(5n));
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    // An exact match: an added checkReplacement: false, or any other override, would fail it.
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: CREATE_HASH, timeout: 180_000, pollingInterval: 1_000 });
  });

  it("passes on the failure of the wait as it is", async () => {
    const timeout = new Error("timed out");
    const client = { waitForTransactionReceipt: async () => Promise.reject(timeout) } as unknown as PublicClient;
    await expect(receiptOf(client, CREATE_HASH)).rejects.toBe(timeout);
  });
});

describe("LLR-FE-062 once the wallet has returned the creation's hash, a failure to obtain its receipt is not a failure of the creation", () => {
  const unconfirmed = async (script: Script) => {
    const { io, log } = world({ allowance: AMOUNT, ...script });
    const error = await runCreate(io, preset, () => {}).then(
      () => null,
      (reason: unknown) => reason,
    );
    return { error, log };
  };

  it("reports an unreadable receipt as an unconfirmed creation that carries the hash and the cause", async () => {
    const down = new Error("rpc down");
    const { error } = await unconfirmed({ receiptErrors: { [CREATE_HASH]: down } });
    expect(error).toBeInstanceOf(CreationUnconfirmedError);
    expect((error as CreationUnconfirmedError).hash).toBe(CREATE_HASH);
    expect((error as CreationUnconfirmedError).cause).toBe(down);
    expect((error as Error).message).toContain("rpc down");
  });

  it("reports a receipt with no PledgeCreated event the same way, since the creation may stand", async () => {
    const { error } = await unconfirmed({ receipts: { [CREATE_HASH]: { status: "success", logs: [] } } });
    expect(error).toBeInstanceOf(CreationUnconfirmedError);
    expect((error as CreationUnconfirmedError).hash).toBe(CREATE_HASH);
    expect((error as Error).message).toMatch(/PledgeCreated/);
  });

  it("does not report a creation that was mined and reverted as unconfirmed, since nothing was created", async () => {
    const { error } = await unconfirmed({ receipts: { [CREATE_HASH]: { status: "reverted", logs: [] } } });
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CreationUnconfirmedError);
  });

  it("does not report a refused creation as unconfirmed, since the wallet returned no hash", async () => {
    const { error } = await unconfirmed({ createError: new Error("rejected") });
    expect(error).not.toBeInstanceOf(CreationUnconfirmedError);
  });

  it("does not report an unreadable approval receipt as an unconfirmed creation, and requests no creation", async () => {
    const down = new Error("rpc down");
    const { io, log } = world({ allowance: 0n, receiptErrors: { [APPROVE_HASH]: down } });
    await expect(runCreate(io, preset, () => {})).rejects.toBe(down);
    expect(log.some((l) => l.startsWith("create:"))).toBe(false);
  });
});

describe("LLR-FE-031 a custom deadline is checked again when submit is activated and immediately before the creation is sent", () => {
  const custom = (timestamp: bigint): CreateInput => ({ amount: AMOUNT, deadline: { kind: "custom", timestamp } });
  const refusal = async (script: Script, input: CreateInput) => {
    const { io, log } = world(script);
    const error = await runCreate(io, input, () => {}).then(
      () => null,
      (reason: unknown) => reason,
    );
    return { error: error as DeadlineCheckError, log };
  };

  it("checks first of all, before the allowance is read or any request is made", async () => {
    const { error, log } = await refusal({ allowance: 0n, clock: [NOW + 61n] }, custom(NOW + 150n));
    expect(error).toBeInstanceOf(DeadlineCheckError);
    expect(error.check).toBe("tooSoon");
    expect(log).toEqual(["clock"]);
  });

  it("accepts a deadline exactly 90 seconds ahead and refuses one a second less, at that first check", async () => {
    const ok = world({ allowance: AMOUNT });
    await runCreate(ok.io, custom(NOW + 90n), () => {});
    expect(ok.log).toContain(`create:${NOW + 90n}`);
    const { error, log } = await refusal({ allowance: AMOUNT }, custom(NOW + 89n));
    expect(error.check).toBe("tooSoon");
    expect(log.some((l) => l.startsWith("create:"))).toBe(false);
  });

  it("checks again after the approval has confirmed and before the creation, and sends no creation when it then fails", async () => {
    // At the first check the deadline is 100 seconds ahead; the approval takes 60 seconds, leaving 40.
    const { error, log } = await refusal({ allowance: 0n, clock: [NOW, NOW + 60n] }, custom(NOW + 100n));
    expect(error).toBeInstanceOf(DeadlineCheckError);
    expect(error.check).toBe("tooSoon");
    expect(log).toEqual(["clock", "allowance", `approve:${AMOUNT}`, "receipt:approve", "clock"]);
  });

  it("checks twice with an approval and sends the creation when both pass", async () => {
    const { io, log } = world({ allowance: 0n, clock: [NOW, NOW + 5n] });
    await runCreate(io, custom(NOW + 600n), () => {});
    expect(log).toEqual(["clock", "allowance", `approve:${AMOUNT}`, "receipt:approve", "clock", `create:${NOW + 600n}`, "receipt:create"]);
  });

  it("checks twice without an approval, the second immediately before the creation", async () => {
    const { io, log } = world({ allowance: AMOUNT, clock: [NOW, NOW + 5n] });
    await runCreate(io, custom(NOW + 600n), () => {});
    expect(log).toEqual(["clock", "allowance", "clock", `create:${NOW + 600n}`, "receipt:create"]);
  });

  it("refuses a deadline more than a year ahead, and one with no clock to judge it against", async () => {
    const far = await refusal({ allowance: AMOUNT }, custom(NOW + 365n * 86_400n + 1n));
    expect(far.error.check).toBe("tooFar");
    const none = await refusal({ allowance: AMOUNT, clock: [null] }, custom(NOW + 600n));
    expect(none.error.check).toBe("noClock");
    expect(none.log).toEqual(["clock"]);
  });

  it("does not consult the clock for a preset, which is computed from a fresh reading of chain time", async () => {
    const { io, log } = world({ allowance: AMOUNT, clock: [null] });
    await runCreate(io, preset, () => {});
    expect(log).not.toContain("clock");
  });

  it("is not a failure of the wallet: nothing was asked of it, and the error says which check failed", async () => {
    const { error } = await refusal({ allowance: AMOUNT, clock: [NOW + 61n] }, custom(NOW + 150n));
    expect(error.message).toMatch(/deadline/i);
  });
});
