import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Abi, BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { satStakeAbi } from "../abi";
import { ERROR_MESSAGES, TOKEN_REVERT_MESSAGE, userMessageFor } from "./errors";

// The normative table, read from the requirements document itself, so a message that drifts from 05
// section 2.2 fails here and nobody has to remember to update a copy.
const llr = readFileSync(resolve(import.meta.dirname, "../../../docs/05_LLR.md"), "utf8");
const section = llr.slice(llr.indexOf("### 2.2 Error messages"), llr.indexOf("### 2.3 Requirements"));
const table = new Map(
  [...section.matchAll(/^\| ([^|]+?) \| ([^|]+?) \|$/gm)]
    .map((m) => [m[1] as string, m[2] as string] as const)
    .filter(([name]) => name !== "Error" && !/^-+$/.test(name)),
);

const abiErrors = (satStakeAbi as Abi).flatMap((item) => (item.type === "error" ? [item] : []));
const abiErrorNames = abiErrors.map((e) => e.name);

// LLR-FE-060 excludes an error that only the constructor can raise: no request the application sends can
// produce it, and 2.2 gives it no row.
const CONSTRUCTOR_ONLY = ["InvalidAllowlist"];

describe("LLR-FE-060 LLR-VV-006 every custom error in the contract ABI has the message of section 2.2", () => {
  it("reads the table and the ABI, and not nothing", () => {
    expect(table.size).toBeGreaterThanOrEqual(20);
    expect(table.get("ZeroAmount")).toBe("Enter an amount above zero.");
    expect(abiErrorNames.length).toBeGreaterThanOrEqual(20);
    expect(abiErrorNames).toContain("SafeERC20FailedOperation");
    expect(abiErrorNames).toContain("ReentrancyGuardReentrantCall");
  });

  it("maps each ABI error that section 2.2 lists to the words of its row", () => {
    const missing: string[] = [];
    for (const name of abiErrorNames) {
      const row = table.get(name);
      if (row === undefined) continue;
      if (ERROR_MESSAGES[name] !== row) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  it("says nothing changed for a token that refused the transfer, since settle raises it too and nothing is locked there", () => {
    expect(ERROR_MESSAGES.SafeERC20FailedOperation).toBe(
      "The token refused the transfer. Nothing changed. You can try again later.",
    );
  });

  it("leaves unmapped only the constructor-only errors that LLR-FE-060 excludes, which are the ones section 2.2 does not list", () => {
    const unlisted = abiErrorNames.filter((name) => !table.has(name));
    expect(unlisted).toEqual(CONSTRUCTOR_ONLY);
    for (const name of CONSTRUCTOR_ONLY) expect(ERROR_MESSAGES[name], name).toBeUndefined();
  });

  it("holds no message for a name that is not an error of the ABI or has no row in section 2.2", () => {
    for (const name of Object.keys(ERROR_MESSAGES)) {
      expect(abiErrorNames, name).toContain(name);
      expect(table.has(name), name).toBe(true);
    }
  });

  it("lists in section 2.2 only errors the ABI has, besides the token revert and the wallet rejection", () => {
    const other = [...table.keys()].filter((name) => !abiErrorNames.includes(name));
    expect(other.sort()).toEqual(["Token revert on transfer", "Wallet rejection (4001)"]);
  });

  it("gives the token revert the words of its row", () => {
    expect(TOKEN_REVERT_MESSAGE).toBe(table.get("Token revert on transfer"));
    expect(TOKEN_REVERT_MESSAGE).not.toBe("");
  });

  it("uses no em dash, no hype word, and no first person plural in any message", () => {
    for (const message of [...Object.values(ERROR_MESSAGES), TOKEN_REVERT_MESSAGE]) {
      expect(message).not.toMatch(/—|trustless|guaranteed|seamless|\bwe\b/i);
    }
  });
});

const sample = (type: string): unknown => (type === "address" ? "0x0000000000000000000000000000000000000001" : 1n);

function revert(abi: Abi, errorName: string, args: unknown[], functionName = "createPledge") {
  const cause = new ContractFunctionRevertedError({
    abi,
    data: encodeErrorResult({ abi, errorName, args } as Parameters<typeof encodeErrorResult>[0]),
    functionName,
  });
  return new BaseError("send failed", { cause });
}

const errorString: Abi = [{ type: "error", name: "Error", inputs: [{ type: "string", name: "message" }] }];
const panic: Abi = [{ type: "error", name: "Panic", inputs: [{ type: "uint256", name: "code" }] }];

describe("LLR-FE-060 a failed request shows the message of the error the contract raised", () => {
  it.each(abiErrors.filter((e) => table.has(e.name)).map((e) => [e.name, e] as const))(
    "shows the message of %s when a send fails with it",
    (name, item) => {
      const error = revert(satStakeAbi as Abi, name, item.inputs.map((i) => sample(i.type)));
      expect(userMessageFor(error)).toBe(table.get(name));
    },
  );

  it("finds the error however deep in the cause chain it sits", () => {
    const inner = revert(satStakeAbi as Abi, "DeadlineTooSoon", [1n]);
    const wrapped = new BaseError("outer", { cause: new BaseError("middle", { cause: inner }) });
    expect(userMessageFor(wrapped)).toBe(table.get("DeadlineTooSoon"));
  });

  it("shows the token's message for a revert string, which SatStake never raises itself", () => {
    const error = revert(errorString, "Error", ["Blacklistable: account is blacklisted"], "approve");
    expect(userMessageFor(error)).toBe(table.get("Token revert on transfer"));
    expect(userMessageFor(new BaseError("wrapped", { cause: error }))).toBe(table.get("Token revert on transfer"));
  });

  it("shows nothing for a panic, an unknown error, an empty revert, or a failure that is not a revert", () => {
    expect(userMessageFor(revert(panic, "Panic", [17n]))).toBeNull();
    const unknown = new ContractFunctionRevertedError({ abi: satStakeAbi as Abi, data: "0xdeadbeef", functionName: "createPledge" });
    expect(userMessageFor(new BaseError("x", { cause: unknown }))).toBeNull();
    const empty = new ContractFunctionRevertedError({ abi: satStakeAbi as Abi, data: "0x", functionName: "createPledge" });
    expect(userMessageFor(new BaseError("x", { cause: empty }))).toBeNull();
    expect(userMessageFor(new BaseError("network down"))).toBeNull();
    expect(userMessageFor(new Error("ZeroAmount"))).toBeNull();
    expect(userMessageFor({ errorName: "ZeroAmount" })).toBeNull();
    expect(userMessageFor(null)).toBeNull();
    expect(userMessageFor(undefined)).toBeNull();
    expect(userMessageFor("ZeroAmount")).toBeNull();
  });

  it("shows nothing for an error of the ABI that has no row, so no invented wording reaches a user", () => {
    const error = revert(satStakeAbi as Abi, "InvalidAllowlist", []);
    expect(userMessageFor(error)).toBeNull();
  });

  it("does not take the name of a property every object has for the name of an error", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty"]) {
      const foreign: Abi = [{ type: "error", name, inputs: [] }];
      expect(userMessageFor(revert(foreign, name, [])), name).toBeNull();
    }
  });
});
