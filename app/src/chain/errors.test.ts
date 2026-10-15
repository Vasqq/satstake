import { type Abi, BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { satStakeAbi } from "../abi";
import { ERROR_MESSAGES, TOKEN_REVERT_MESSAGE, userMessageFor } from "./errors";

const abiErrors = (satStakeAbi as Abi).flatMap((item) => (item.type === "error" ? [item] : []));
const abiErrorNames = abiErrors.map((e) => e.name);

// Only the constructor can raise this one, so no request the application sends can produce it.
const CONSTRUCTOR_ONLY = ["InvalidAllowlist"];
const reachable = (name: string) => !CONSTRUCTOR_ONLY.includes(name);

describe("LLR-FE-060 LLR-VV-006 every custom error in the contract ABI has a message", () => {
  it("reads the ABI, and not nothing", () => {
    expect(abiErrorNames.length).toBeGreaterThanOrEqual(20);
    expect(abiErrorNames).toContain("SafeERC20FailedOperation");
    expect(abiErrorNames).toContain("ReentrancyGuardReentrantCall");
  });

  it("gives each error a request can raise a message with words in it", () => {
    const missing = abiErrorNames.filter((name) => reachable(name) && !(ERROR_MESSAGES[name] ?? "").trim());
    expect(missing).toEqual([]);
  });

  it("leaves unmapped only the constructor-only errors", () => {
    for (const name of CONSTRUCTOR_ONLY) expect(ERROR_MESSAGES[name], name).toBeUndefined();
  });

  it("holds no message for a name that is not an error of the ABI", () => {
    for (const name of Object.keys(ERROR_MESSAGES)) expect(abiErrorNames, name).toContain(name);
  });

  it("gives the token revert a message with words in it", () => {
    expect(TOKEN_REVERT_MESSAGE.trim()).not.toBe("");
  });

  it("claims nothing NS P7 rules out in any message", () => {
    for (const message of [...Object.values(ERROR_MESSAGES), TOKEN_REVERT_MESSAGE]) {
      expect(message).not.toMatch(/trustless|guaranteed|unstoppable|100% secure/i);
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
  it.each(abiErrors.filter((e) => reachable(e.name)).map((e) => [e.name, e] as const))(
    "shows the message of %s when a send fails with it",
    (name, item) => {
      const error = revert(satStakeAbi as Abi, name, item.inputs.map((i) => sample(i.type)));
      expect(userMessageFor(error)).toBe(ERROR_MESSAGES[name]);
    },
  );

  it("finds the error however deep in the cause chain it sits", () => {
    const inner = revert(satStakeAbi as Abi, "DeadlineTooSoon", [1n]);
    const wrapped = new BaseError("outer", { cause: new BaseError("middle", { cause: inner }) });
    expect(userMessageFor(wrapped)).toBe(ERROR_MESSAGES.DeadlineTooSoon);
  });

  it("shows the token's message for a revert string, which SatStake never raises itself", () => {
    const error = revert(errorString, "Error", ["Blacklistable: account is blacklisted"], "approve");
    expect(userMessageFor(error)).toBe(TOKEN_REVERT_MESSAGE);
    expect(userMessageFor(new BaseError("wrapped", { cause: error }))).toBe(TOKEN_REVERT_MESSAGE);
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
