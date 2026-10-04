import { type Address, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { selectNetwork } from "../config/networks";
import { MAX_LEAD_SECONDS } from "./deadline";
import { type FormCheck, type FormContext, type FormValues, checkForm, promiseBytes } from "./validate";

const network = selectNetwork("testnet");
const usdc = network.tokens.find((t) => t.symbol === "USDC");
const cirbtc = network.tokens.find((t) => t.symbol === "cirBTC");
if (!usdc || !cirbtc) throw new Error("the testnet configuration has no USDC or cirBTC");

const STAKER = getAddress("0x" + "11".repeat(20));
const REFEREE = getAddress("0x" + "22".repeat(20));
const BENEFICIARY = getAddress("0x" + "33".repeat(20));
const NOW = 1_789_500_000n;

const pad = (n: number) => String(n).padStart(2, "0");
/** A datetime-local value for a Unix time, in the local time zone and to the minute. */
function local(timestamp: bigint): string {
  const d = new Date(Number(timestamp) * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const valid: FormValues = {
  promise: "Run 5 km before Friday",
  token: usdc.address,
  amount: "1.5",
  referee: REFEREE,
  beneficiary: BENEFICIARY,
  deadline: { kind: "preset", id: "7d" },
  acknowledged: true,
};
const context: FormContext = {
  network,
  staker: STAKER,
  balance: { status: "ok", value: 2_000_000n },
  feeBalance: { status: "ok", value: 2_000_000n },
  chainNow: NOW,
  clockFailed: false,
  tokenEnabled: true,
};
const check = (over: Partial<FormValues> = {}, ctx: Partial<FormContext> = {}) => checkForm({ ...valid, ...over }, { ...context, ...ctx });
const summary = ({ errors, valid }: FormCheck) => ({ errors, valid });

describe("LLR-FE-030 LLR-VV-006 the create form passes a complete, correct entry", () => {
  it("has no error and is valid", () => {
    expect(summary(check())).toEqual({ errors: {}, valid: true });
  });

  it("is not valid without a connected staker or a read balance, though no field is at fault", () => {
    expect(summary(check({}, { staker: undefined, balance: { status: "none" } }))).toEqual({ errors: {}, valid: false });
  });

  it("is not valid for want of either one alone, though no field is at fault", () => {
    expect(summary(check({}, { staker: undefined }))).toEqual({ errors: {}, valid: false });
    expect(summary(check({}, { balance: { status: "none" } }))).toEqual({ errors: {}, valid: false });
  });
});

// The addresses of the other tests are all digits, which have no letter case, so they cannot tell a comparison
// that ignores case from one that does not.
describe("LLR-FE-030 addresses are compared without regard to letter case", () => {
  const LETTERED = getAddress("0x" + "ab12".repeat(10));
  const OTHER = getAddress("0x" + "cd34".repeat(10));

  it("refuses the connected account in any letter case, as either party", () => {
    const own = "You cannot be your own referee or beneficiary.";
    const asStaker = { staker: LETTERED };
    expect(check({ referee: LETTERED.toLowerCase() }, asStaker).errors.referee).toBe(own);
    expect(check({ beneficiary: LETTERED.toLowerCase() }, asStaker).errors.beneficiary).toBe(own);
    expect(check({ referee: LETTERED.toLowerCase() }, { staker: LETTERED.toLowerCase() as Address }).errors.referee).toBe(own);
  });

  it("refuses the same address twice, however each is cased", () => {
    const same = "The referee and the beneficiary must be different people.";
    expect(check({ referee: OTHER, beneficiary: OTHER.toLowerCase() }).errors).toEqual({ beneficiary: same });
    expect(check({ referee: OTHER.toLowerCase(), beneficiary: OTHER }).errors).toEqual({ beneficiary: same });
  });

  it("finds the configured token by its address in any letter case", () => {
    expect(summary(check({ token: cirbtc.address.toLowerCase() as Address, amount: "0.00000001" }, { balance: { status: "ok", value: 1n } }))).toEqual({
      errors: {},
      valid: true,
    });
  });
});

describe("LLR-FE-030 the promise is measured in UTF-8 bytes (LLR-SC-026)", () => {
  it("counts bytes, not characters", () => {
    expect(promiseBytes("")).toBe(0);
    expect(promiseBytes("a")).toBe(1);
    expect(promiseBytes("é")).toBe(2);
    expect(promiseBytes("€")).toBe(3);
    expect(promiseBytes("\u{1F600}")).toBe(4);
  });

  it("asks for a promise when there is none", () => {
    expect(check({ promise: "" }).errors.promise).toBe("Write the promise you are making.");
  });

  it("accepts 280 bytes and refuses 281", () => {
    expect(check({ promise: "a".repeat(280) }).errors.promise).toBeUndefined();
    expect(check({ promise: "a".repeat(281) }).errors.promise).toBe("Shorten the promise to 280 bytes or fewer.");
  });

  it("refuses text that is short in characters and long in bytes", () => {
    const twoBytes = "é".repeat(140);
    expect(twoBytes.length).toBe(140);
    expect(check({ promise: twoBytes }).errors.promise).toBeUndefined();
    expect(check({ promise: twoBytes + "é" }).errors.promise).toBe("Shorten the promise to 280 bytes or fewer.");
    expect(check({ promise: "\u{1F600}".repeat(70) }).errors.promise).toBeUndefined();
    expect(check({ promise: "\u{1F600}".repeat(71) }).errors.promise).toBe("Shorten the promise to 280 bytes or fewer.");
  });

  it("accepts a promise that is only spaces, as the contract does", () => {
    expect(check({ promise: "   " }).errors.promise).toBeUndefined();
  });
});

describe("LLR-FE-030 the token must be one the contract accepts (LLR-SC-021) and one the application has confirmed", () => {
  it("refuses a token that is not on the configured list", () => {
    expect(check({ token: getAddress("0x" + "99".repeat(20)) }).errors.token).toBe("This token is not accepted. Choose cirBTC or USDC.");
  });

  it("refuses a configured token whose reading does not match, and names it", () => {
    expect(check({}, { tokenEnabled: false }).errors.token).toBe("USDC cannot be used for new pledges right now.");
    expect(check({ token: cirbtc.address }, { tokenEnabled: false }).errors.token).toBe("cirBTC cannot be used for new pledges right now.");
  });

  it("accepts either configured token, with its own decimals", () => {
    expect(summary(check({ token: cirbtc.address, amount: "0.00000001" }, { balance: { status: "ok", value: 1n } }))).toEqual({ errors: {}, valid: true });
  });

  it("matches the token without regard to the case of its address", () => {
    expect(check({ token: usdc.address.toLowerCase() as Address }).errors.token).toBeUndefined();
  });
});

describe("LLR-FE-030 the amount is above zero (LLR-SC-022), well formed, and not above the balance", () => {
  it.each(["", "0", "0.0", "0.000000", "00", ".0"])("says to enter an amount above zero for %j", (amount) => {
    expect(check({ amount }).errors.amount).toBe("Enter an amount above zero.");
  });

  it.each(["1,5", "-1", "1e6", " 1", "1.2.3", "abc", "."])("says what an amount is made of for %j", (amount) => {
    expect(check({ amount }).errors.amount).toBe("Use digits and at most one decimal point.");
  });

  it("says how many places the token has when there are more", () => {
    expect(check({ amount: "1.0000001" }).errors.amount).toBe("USDC has 6 decimal places. Remove the extra digits.");
    expect(check({ token: cirbtc.address, amount: "0.000000001" }, { balance: { status: "ok", value: 10n ** 9n } }).errors.amount).toBe(
      "cirBTC has 8 decimal places. Remove the extra digits.",
    );
  });

  it("accepts an amount equal to the balance of a token that does not pay fees, and refuses one smallest unit above it", () => {
    // USDC is left out: a stake of the whole USDC balance is refused for the fee reserve, which is tested below.
    const ctx = { balance: { status: "ok", value: 200_000_000n } } as const;
    const cir = { token: cirbtc.address } as const;
    expect(check({ ...cir, amount: "2" }, ctx).errors.amount).toBeUndefined();
    expect(check({ ...cir, amount: "2.00000001" }, ctx).errors.amount).toBe("Your balance is 2 cirBTC, which is less than this amount.");
    expect(check({ ...cir, amount: "1.99999999" }, ctx).errors.amount).toBeUndefined();
    expect(check({ amount: "2.000001" }).errors.amount).toBe("Your balance is 2 USDC, which is less than this amount.");
  });

  it("states the balance in the token's own units, with its symbol", () => {
    expect(check({ amount: "3" }, { balance: { status: "ok", value: 1_500_000n } }).errors.amount).toBe(
      "Your balance is 1.5 USDC, which is less than this amount.",
    );
    expect(
      check({ token: cirbtc.address, amount: "1" }, { balance: { status: "ok", value: 25_000_000n } }).errors.amount,
    ).toBe("Your balance is 0.25 cirBTC, which is less than this amount.");
  });

  it("explains a balance of zero in plain words, whatever has been typed (UJ-04)", () => {
    const none = { balance: { status: "ok", value: 0n } } as const;
    expect(check({ amount: "1" }, none).errors.amount).toBe("You have no USDC in this wallet. Add some, or choose another token.");
    expect(check({ amount: "" }, none).errors.amount).toBe("You have no USDC in this wallet. Add some, or choose another token.");
    expect(check({ amount: "1" }, none).valid).toBe(false);
    expect(check({ token: cirbtc.address, amount: "1" }, none).errors.amount).toBe("You have no cirBTC in this wallet. Add some, or choose another token.");
  });

  it("does not compare with a balance it has not read: a balance still loading is not a failure, and keeps the form invalid", () => {
    expect(summary(check({}, { balance: { status: "loading" } }))).toEqual({ errors: {}, valid: false });
    expect(check({}, { balance: { status: "loading" } }).atOnce).toEqual([]);
  });

  it("says a balance that could not be read could not be read, whatever was typed, and shows it at once", () => {
    const unread = "Could not read your balance. Trying again every 5 seconds.";
    expect(summary(check({}, { balance: { status: "error" } }))).toEqual({ errors: { amount: unread }, valid: false });
    expect(check({ amount: "" }, { balance: { status: "error" } }).errors.amount).toBe(unread);
    expect(check({ amount: "1,5" }, { balance: { status: "error" } }).errors.amount).toBe(unread);
    expect(check({}, { balance: { status: "error" } }).atOnce).toEqual(["amount"]);
  });

  it("still reports a malformed amount while the balance is loading, since that needs no balance", () => {
    expect(check({ amount: "1,5" }, { balance: { status: "loading" } }).errors.amount).toBe("Use digits and at most one decimal point.");
  });
});

describe("LLR-FE-030 Arc pays fees from the USDC balance, so a USDC stake leaves 0.05 USDC and any other stake needs it", () => {
  const LEAVE = "Leave at least 0.05 USDC in this wallet for network fees, which Arc charges in USDC.";
  const NEED = "You need at least 0.05 USDC in this wallet to pay network fees, which Arc charges in USDC.";
  const usdcBalance = (value: bigint) => ({ balance: { status: "ok", value }, feeBalance: { status: "ok", value } }) as const;

  it("accepts a USDC amount that leaves exactly 0.05 USDC, and refuses one smallest unit more", () => {
    const ctx = usdcBalance(1_000_000n);
    expect(check({ amount: "0.95" }, ctx).errors.amount).toBeUndefined();
    expect(check({ amount: "0.950001" }, ctx).errors.amount).toBe(LEAVE);
    expect(check({ amount: "0.950001" }, ctx).valid).toBe(false);
  });

  it("refuses the whole USDC balance, and says to leave the reserve and not that the balance is too small", () => {
    const ctx = usdcBalance(1_000_000n);
    expect(check({ amount: "1" }, ctx).errors.amount).toBe(LEAVE);
  });

  it("says the balance is too small for an amount above it, which is a different fault from the reserve", () => {
    const ctx = usdcBalance(1_000_000n);
    expect(check({ amount: "1.000001" }, ctx).errors.amount).toBe("Your balance is 1 USDC, which is less than this amount.");
  });

  it("asks for the reserve to be left from a balance that is already below it, whatever the amount", () => {
    expect(check({ amount: "0.01" }, usdcBalance(40_000n)).errors.amount).toBe(LEAVE);
    expect(check({ amount: "0.01" }, usdcBalance(50_000n)).errors.amount).toBe(LEAVE);
    expect(check({ amount: "0.000001" }, usdcBalance(50_001n)).errors.amount).toBeUndefined();
  });

  it("does not show the reserve fault at once, since it depends on what is typed", () => {
    expect(check({ amount: "1" }, usdcBalance(1_000_000n)).atOnce).toEqual([]);
  });

  it("reads the USDC balance for a USDC stake from the balance it already has, and not from the fee balance", () => {
    const ctx = { balance: { status: "ok", value: 1_000_000n }, feeBalance: { status: "error" } } as const;
    expect(summary(check({ amount: "0.5" }, ctx))).toEqual({ errors: {}, valid: true });
  });

  it("needs a USDC balance of at least 0.05 for a stake in any other token, and accepts exactly that", () => {
    const cir = { token: cirbtc.address, amount: "0.5" } as const;
    const ok = { balance: { status: "ok", value: 100_000_000n }, feeBalance: { status: "ok", value: 50_000n } } as const;
    expect(summary(check(cir, ok))).toEqual({ errors: {}, valid: true });
    const short = { balance: ok.balance, feeBalance: { status: "ok", value: 49_999n } } as const;
    expect(summary(check(cir, short))).toEqual({ errors: { amount: NEED }, valid: false });
  });

  it("shows the missing fee balance at once, before an amount is typed, beside the amount", () => {
    const short = { balance: { status: "ok", value: 100_000_000n }, feeBalance: { status: "ok", value: 0n } } as const;
    const result = check({ token: cirbtc.address, amount: "" }, short);
    expect(result.errors.amount).toBe(NEED);
    expect(result.atOnce).toEqual(["amount"]);
  });

  it("does not ask for the fee balance of a USDC stake as a separate thing", () => {
    const ctx = { balance: { status: "ok", value: 2_000_000n }, feeBalance: { status: "ok", value: 0n } } as const;
    expect(check({}, ctx).errors.amount).toBeUndefined();
  });

  it("names the selected token first when its own balance is zero, ahead of the fee balance", () => {
    const none = { balance: { status: "ok", value: 0n }, feeBalance: { status: "ok", value: 0n } } as const;
    const result = check({ token: cirbtc.address }, none);
    expect(result.errors.amount).toBe("You have no cirBTC in this wallet. Add some, or choose another token.");
    expect(result.atOnce).toEqual(["amount"]);
  });

  it("does not judge a stake in another token while the USDC balance is loading, and does not call that a failure", () => {
    const ctx = { balance: { status: "ok", value: 100_000_000n }, feeBalance: { status: "loading" } } as const;
    expect(summary(check({ token: cirbtc.address, amount: "0.5" }, ctx))).toEqual({ errors: {}, valid: false });
  });

  it("says a USDC balance that could not be read could not be read, and the form stays invalid", () => {
    const ctx = { balance: { status: "ok", value: 100_000_000n }, feeBalance: { status: "error" } } as const;
    const result = check({ token: cirbtc.address, amount: "0.5" }, ctx);
    expect(result.errors.amount).toBe("Could not read your balance. Trying again every 5 seconds.");
    expect(result.valid).toBe(false);
    expect(result.atOnce).toEqual(["amount"]);
  });

  it("is not valid for another token without a read USDC balance, though no field is at fault", () => {
    const ctx = { balance: { status: "ok", value: 100_000_000n }, feeBalance: { status: "none" } } as const;
    expect(summary(check({ token: cirbtc.address, amount: "0.5" }, ctx))).toEqual({ errors: {}, valid: false });
  });

  it("takes the reserve from the USDC token's own decimals, and not from a fixed count of units", () => {
    // The same 0.05 USDC is 5,000,000 units when the token has 8 decimals.
    const eight = { ...network, tokens: network.tokens.map((t) => (t.symbol === "USDC" ? { ...t, decimals: 8 } : t)) };
    const ctx = { network: eight, balance: { status: "ok", value: 100_000_000n }, feeBalance: { status: "ok", value: 100_000_000n } } as const;
    expect(check({ amount: "0.95" }, ctx).errors.amount).toBeUndefined();
    expect(check({ amount: "0.95000001" }, ctx).errors.amount).toBe(LEAVE);
    const fee = { token: cirbtc.address, amount: "0.5" } as const;
    expect(check(fee, { ...ctx, feeBalance: { status: "ok", value: 4_999_999n } }).errors.amount).toBe(NEED);
    expect(check(fee, { ...ctx, feeBalance: { status: "ok", value: 5_000_000n } }).errors.amount).toBeUndefined();
  });
});

describe("LLR-FE-030 which failures show at once, because typing cannot fix them", () => {
  it("lists the token failure, and nothing else, when only the token is wrong", () => {
    expect(check({}, { tokenEnabled: false }).atOnce).toEqual(["token"]);
  });

  it("lists an empty balance of the selected token", () => {
    expect(check({}, { balance: { status: "ok", value: 0n } }).atOnce).toEqual(["amount"]);
  });

  it("lists nothing for faults that the person can mend by typing", () => {
    expect(check({ promise: "", amount: "0", referee: "x", deadline: { kind: "none" }, acknowledged: false }).atOnce).toEqual([]);
  });
});

describe("LLR-FE-030 the referee and the beneficiary are addresses, not zero, not the contract, not the staker (LLR-SC-023)", () => {
  // The zero address is well formed, so it keeps the contract's own words (section 2.2, ZeroAddress).
  const ZERO = "Enter a valid address for the referee and the beneficiary.";
  const BAD_REFEREE = "Enter the referee's address: 0x followed by 40 letters and digits.";
  const BAD_BENEFICIARY = "Enter the beneficiary's address: 0x followed by 40 letters and digits.";

  it.each(["", "0x123", "not an address", REFEREE.slice(0, -1), REFEREE + "0", REFEREE.slice(2), " " + REFEREE])(
    "refuses %j as an address, beside the field it was typed in",
    (text) => {
      expect(check({ referee: text }).errors.referee).toBe(BAD_REFEREE);
      expect(check({ beneficiary: text }).errors.beneficiary).toBe(BAD_BENEFICIARY);
      expect(check({ referee: text }).errors.beneficiary).toBeUndefined();
      expect(check({ beneficiary: text }).errors.referee).toBeUndefined();
    },
  );

  it("refuses a mixed-case address whose checksum is wrong, and accepts the same address in one case", () => {
    const mixed = getAddress("0x" + "ab12".repeat(10));
    // Any single flip of a letter's case changes the checksum pattern, so the result cannot be a valid one.
    const flipped = mixed.replace(/[a-f]/i, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
    expect(flipped).not.toBe(mixed);
    expect(check({ referee: flipped }).errors.referee).toBe(BAD_REFEREE);
    expect(check({ referee: mixed }).errors.referee).toBeUndefined();
    expect(check({ referee: mixed.toLowerCase() }).errors.referee).toBeUndefined();
  });

  it("refuses the zero address for either party, with the contract's words", () => {
    const zero = "0x" + "0".repeat(40);
    expect(check({ referee: zero }).errors.referee).toBe(ZERO);
    expect(check({ beneficiary: zero }).errors.beneficiary).toBe(ZERO);
  });

  it("refuses the SatStake contract as either party, in any letter case", () => {
    const expected = "The SatStake contract cannot be a party. Enter a person's address.";
    expect(check({ referee: network.contract }).errors.referee).toBe(expected);
    expect(check({ beneficiary: network.contract.toLowerCase() }).errors.beneficiary).toBe(expected);
  });

  it("refuses the connected account as either party, in any letter case", () => {
    const expected = "You cannot be your own referee or beneficiary.";
    expect(check({ referee: STAKER }).errors.referee).toBe(expected);
    expect(check({ beneficiary: STAKER.toLowerCase() }).errors.beneficiary).toBe(expected);
  });

  it("does not know the staker until a wallet is connected, and says nothing about it then", () => {
    expect(check({ referee: STAKER }, { staker: undefined }).errors.referee).toBeUndefined();
  });

  it("checks the zero address, then the contract, then the staker, as the contract does", () => {
    // The zero address is none of the others, so only the first check can be what caught it.
    expect(check({ referee: "0x" + "0".repeat(40), beneficiary: network.contract }).errors).toEqual({
      referee: ZERO,
      beneficiary: "The SatStake contract cannot be a party. Enter a person's address.",
    });
  });
});

describe("LLR-FE-030 the referee and the beneficiary differ (LLR-SC-024)", () => {
  const SAME = "The referee and the beneficiary must be different people.";

  it("says so beside the beneficiary when both are the same address, in any letter case", () => {
    expect(check({ beneficiary: REFEREE }).errors).toEqual({ beneficiary: SAME });
    expect(check({ beneficiary: REFEREE.toLowerCase() }).errors).toEqual({ beneficiary: SAME });
    expect(check({ referee: BENEFICIARY.toLowerCase() }).errors).toEqual({ beneficiary: SAME });
  });

  it("says nothing about the pair while either address has a fault of its own", () => {
    expect(check({ referee: STAKER, beneficiary: STAKER }).errors).toEqual({
      referee: "You cannot be your own referee or beneficiary.",
      beneficiary: "You cannot be your own referee or beneficiary.",
    });
    expect(check({ referee: "", beneficiary: "" }).errors.beneficiary).toBe("Enter the beneficiary's address: 0x followed by 40 letters and digits.");
  });
});

describe("LLR-FE-030 the deadline is chosen, and a custom one is judged against chain time (LLR-SC-025)", () => {
  it("asks for a deadline when none is chosen", () => {
    expect(check({ deadline: { kind: "none" } }).errors.deadline).toBe("Choose a deadline.");
  });

  it.each(["2m", "1d", "7d", "30d"] as const)("accepts the %s preset with no further check", (id) => {
    expect(check({ deadline: { kind: "preset", id } }).errors.deadline).toBeUndefined();
  });

  it("asks for a date and time when the custom entry is empty or unreadable", () => {
    expect(check({ deadline: { kind: "custom", local: "" } }).errors.deadline).toBe("Pick a date and time.");
    expect(check({ deadline: { kind: "custom", local: "tomorrow" } }).errors.deadline).toBe("Pick a date and time.");
  });

  it("refuses a custom time less than 90 seconds from chain time, and accepts one at 120 seconds", () => {
    const soon = "The deadline must be at least 90 seconds from now. Pick a later time.";
    expect(check({ deadline: { kind: "custom", local: local(NOW + 60n) } }).errors.deadline).toBe(soon);
    expect(check({ deadline: { kind: "custom", local: local(NOW - 3_600n) } }).errors.deadline).toBe(soon);
    expect(check({ deadline: { kind: "custom", local: local(NOW + 120n) } }).errors.deadline).toBeUndefined();
  });

  it("refuses a custom time more than a year from chain time", () => {
    const far = "The deadline must be within one year. Pick an earlier time.";
    expect(check({ deadline: { kind: "custom", local: local(NOW + MAX_LEAD_SECONDS + 60n) } }).errors.deadline).toBe(far);
    expect(check({ deadline: { kind: "custom", local: local(NOW + MAX_LEAD_SECONDS) } }).errors.deadline).toBeUndefined();
  });

  it("judges against the chain time it is given, whatever the device's clock says", () => {
    const later = NOW + 10_000_000n;
    expect(check({ deadline: { kind: "custom", local: local(NOW + 120n) } }, { chainNow: later }).errors.deadline).toBe(
      "The deadline must be at least 90 seconds from now. Pick a later time.",
    );
  });

  it("says it is waiting for chain time rather than judging a custom time without it", () => {
    expect(summary(check({ deadline: { kind: "custom", local: local(NOW + 3_600n) } }, { chainNow: null }))).toEqual({
      errors: { deadline: "Waiting for the network's time. Try again in a moment." },
      valid: false,
    });
  });

  it("says the time of the network could not be read, at once, when the read failed and a custom time is chosen", () => {
    const custom = { deadline: { kind: "custom", local: local(NOW + 3_600n) } } as const;
    const result = check(custom, { chainNow: null, clockFailed: true });
    expect(summary(result)).toEqual({
      errors: { deadline: "Could not read the network's time. Trying again every 5 seconds." },
      valid: false,
    });
    expect(result.atOnce).toEqual(["deadline"]);
  });

  it("says it before asking for a date, since a date cannot be judged without the time", () => {
    const result = check({ deadline: { kind: "custom", local: "" } }, { chainNow: null, clockFailed: true });
    expect(result.errors.deadline).toBe("Could not read the network's time. Trying again every 5 seconds.");
    expect(result.atOnce).toEqual(["deadline"]);
  });

  it("does not show the wait for the first reading at once, since it ends by itself", () => {
    const custom = { deadline: { kind: "custom", local: local(NOW + 3_600n) } } as const;
    expect(check(custom, { chainNow: null, clockFailed: false }).atOnce).toEqual([]);
  });

  it("says nothing of a failed read of the time for a preset, which does not need it", () => {
    expect(summary(check({}, { chainNow: null, clockFailed: true }))).toEqual({ errors: {}, valid: true });
  });

  it("does not need chain time for a preset", () => {
    expect(summary(check({}, { chainNow: null }))).toEqual({ errors: {}, valid: true });
  });
});

describe("LLR-FE-030 submission stays unavailable until every check passes", () => {
  it("reports every failing field at once, each beside its own field", () => {
    const result = check({
      promise: "",
      amount: "0",
      referee: "x",
      beneficiary: "y",
      deadline: { kind: "none" },
      acknowledged: false,
    });
    expect(Object.keys(result.errors).sort()).toEqual(["acknowledged", "amount", "beneficiary", "deadline", "promise", "referee"]);
    expect(result.valid).toBe(false);
  });

  it("becomes valid only when the last fault is fixed, whichever it is", () => {
    const faults: Partial<FormValues>[] = [
      { promise: "" },
      { amount: "0" },
      { referee: "x" },
      { beneficiary: "y" },
      { deadline: { kind: "none" } },
      { acknowledged: false },
      { token: getAddress("0x" + "99".repeat(20)) },
    ];
    for (const fault of faults) {
      expect(check(fault).valid, JSON.stringify(fault)).toBe(false);
    }
    expect(check().valid).toBe(true);
  });

  it("is not valid while the token is off, though every field is filled in", () => {
    expect(check({}, { tokenEnabled: false }).valid).toBe(false);
  });

  it("requires the acknowledgement of the trust statement (LLR-FE-034)", () => {
    expect(summary(check({ acknowledged: false }))).toEqual({ errors: { acknowledged: "Tick the box to confirm you understand." }, valid: false });
  });
});
