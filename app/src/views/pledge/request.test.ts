import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import type { ReceiptLike } from "../../create/flow";
import { type RequestIO, runRequest } from "./request";

const HASH = `0x${"ab".repeat(32)}` as Hex;
const receipt = (status: ReceiptLike["status"]): ReceiptLike => ({ status, logs: [] });

function io(over: Partial<RequestIO> = {}): RequestIO & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    send: async () => {
      calls.push("send");
      return HASH;
    },
    receipt: async (hash) => {
      calls.push(`receipt ${hash}`);
      return receipt("success");
    },
    explain: async () => {
      calls.push("explain");
      return null;
    },
    ...over,
  };
}

describe("LLR-FE-046 a verdict or settle request from send to receipt", () => {
  it("reports the hash as soon as the wallet returns it, before the receipt is awaited", async () => {
    const seen: string[] = [];
    const parts = io({
      receipt: async () => {
        seen.push("receipt");
        return receipt("success");
      },
    });
    await runRequest(parts, (hash) => seen.push(`hash ${hash}`));
    expect(seen).toEqual([`hash ${HASH}`, "receipt"]);
  });

  it("waits for the receipt of the hash the wallet returned and reports a confirmed outcome", async () => {
    const parts = io();
    expect(await runRequest(parts, () => {})).toEqual({ kind: "confirmed", hash: HASH });
    expect(parts.calls).toEqual(["send", `receipt ${HASH}`]);
  });

  it("lets a failure to send, such as a refusal, reach the caller with no hash reported", async () => {
    const refusal = new Error("refused");
    const hashes: Hex[] = [];
    const parts = io({
      send: async () => {
        throw refusal;
      },
    });
    await expect(runRequest(parts, (h) => hashes.push(h))).rejects.toBe(refusal);
    expect(hashes).toEqual([]);
  });

  it("reports a reverted receipt with the error found by replaying the call", async () => {
    const cause = new Error("NotActive");
    const parts = io({
      receipt: async () => receipt("reverted"),
      explain: async () => cause,
    });
    expect(await runRequest(parts, () => {})).toEqual({ kind: "reverted", hash: HASH, error: cause });
  });

  it("reports a reverted receipt with a plain error when the replay finds nothing", async () => {
    const parts = io({ receipt: async () => receipt("reverted") });
    const outcome = await runRequest(parts, () => {});
    expect(outcome.kind).toBe("reverted");
    expect(outcome.kind === "reverted" && outcome.error).toBeInstanceOf(Error);
    expect(outcome.kind === "reverted" && outcome.hash).toBe(HASH);
  });

  it("does not replay the call for a confirmed receipt", async () => {
    const parts = io();
    await runRequest(parts, () => {});
    expect(parts.calls).not.toContain("explain");
  });

  it("reports the transaction as unconfirmed, with its hash, when the receipt cannot be read", async () => {
    const cause = new Error("timed out");
    const parts = io({
      receipt: async () => {
        throw cause;
      },
    });
    expect(await runRequest(parts, () => {})).toEqual({ kind: "unconfirmed", hash: HASH, cause });
    expect(parts.calls).not.toContain("explain");
  });

  it("does not take a failed replay for a failed request", async () => {
    const parts = io({
      receipt: async () => receipt("reverted"),
      explain: async () => {
        throw new Error("replay failed");
      },
    });
    const outcome = await runRequest(parts, () => {});
    expect(outcome.kind).toBe("reverted");
  });
});
