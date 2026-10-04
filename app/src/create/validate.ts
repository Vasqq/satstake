import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import type { SelectedNetwork, TokenConfig } from "../config/networks";
import { parseAmount } from "./amount";
import { type CustomCheck, type DeadlineChoice, checkCustomDeadline, localToTimestamp } from "./deadline";

export type Field = "promise" | "token" | "amount" | "referee" | "beneficiary" | "deadline" | "acknowledged";
export interface FormValues {
  promise: string;
  token: Address;
  amount: string;
  referee: string;
  beneficiary: string;
  deadline: DeadlineChoice;
  acknowledged: boolean;
}
export type BalanceState = { status: "none" } | { status: "loading" } | { status: "error" } | { status: "ok"; value: bigint };
export interface FormContext {
  network: SelectedNetwork;
  staker: Address | undefined;
  /** The staker's balance of the selected token. */
  balance: BalanceState;
  /** The staker's USDC balance, which pays the network fee. For a USDC stake it is `balance` and this is not read. */
  feeBalance: BalanceState;
  chainNow: bigint | null;
  /** True when the read of chain time failed and there is no time to go on, so the failure is said and not a wait. */
  clockFailed: boolean;
  tokenEnabled: boolean;
}
export interface FormCheck {
  errors: Partial<Record<Field, string>>;
  valid: boolean;
  /** The fields whose failure shows before the field is left, because typing cannot mend it. */
  atOnce: Field[];
}

/** MAX_PROMISE_BYTES of LLR-SC-005. */
export const MAX_PROMISE_BYTES = 280;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Arc takes network fees from the USDC ERC-20 balance, which is also the native gas balance, so a stake of the
 * whole USDC balance could not pay for its own transaction.
 */
const FEE_RESERVE_USDC = "0.05";

const MESSAGES = {
  promiseEmpty: "Write the promise you are making.",
  promiseTooLong: `Shorten the promise to ${MAX_PROMISE_BYTES} bytes or fewer.`,
  tokenNotAccepted: "This token is not accepted. Choose cirBTC or USDC.",
  zeroAmount: "Enter an amount above zero.",
  amountSyntax: "Use digits and at most one decimal point.",
  balanceError: "Could not read your balance. Trying again every 5 seconds.",
  feeReserveNeeded: `You need at least ${FEE_RESERVE_USDC} USDC in this wallet to pay network fees, which Arc charges in USDC.`,
  feeReserveLeft: `Leave at least ${FEE_RESERVE_USDC} USDC in this wallet for network fees, which Arc charges in USDC.`,
  zeroAddress: "Enter a valid address for the referee and the beneficiary.",
  addressSyntax: (who: "referee" | "beneficiary") => `Enter the ${who}'s address: 0x followed by 40 letters and digits.`,
  partyIsContract: "The SatStake contract cannot be a party. Enter a person's address.",
  partyIsStaker: "You cannot be your own referee or beneficiary.",
  samePeople: "The referee and the beneficiary must be different people.",
  noDeadline: "Choose a deadline.",
  noDate: "Pick a date and time.",
  tooSoon: "The deadline must be at least 90 seconds from now. Pick a later time.",
  tooFar: "The deadline must be within one year. Pick an earlier time.",
  noClock: "Waiting for the network's time. Try again in a moment.",
  clockFailed: "Could not read the network's time. Trying again every 5 seconds.",
  notAcknowledged: "Tick the box to confirm you understand.",
} as const;

/**
 * The length the contract measures (LLR-SC-026): bytes of UTF-8, not characters.
 *
 * @trace LLR-FE-030
 */
export function promiseBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function promiseError(text: string): string | undefined {
  const bytes = promiseBytes(text);
  if (bytes === 0) return MESSAGES.promiseEmpty; // LLR-FE-030
  if (bytes > MAX_PROMISE_BYTES) return MESSAGES.promiseTooLong; // LLR-FE-030
  return undefined;
}

interface AmountFault {
  message: string;
  /** True when typing cannot mend it, so it shows before the field is left. */
  atOnce: boolean;
}

/**
 * `reserve` is in the USDC token's own units. `balance` and `fee` are the same reading for a USDC stake, so the
 * reserve is taken from the one balance there is.
 */
function amountError(
  text: string,
  token: TokenConfig,
  isUsdc: boolean,
  balance: BalanceState,
  fee: BalanceState,
  reserve: bigint,
): AmountFault | undefined {
  // A wallet with none of the token cannot make any pledge, whatever is typed, and says so in those words.
  if (balance.status === "ok" && balance.value === 0n) {
    return { message: `You have no ${token.symbol} in this wallet. Add some, or choose another token.`, atOnce: true }; // LLR-FE-030
  }
  if (balance.status === "error" || fee.status === "error") return { message: MESSAGES.balanceError, atOnce: true }; // LLR-FE-030
  if (!isUsdc && fee.status === "ok" && fee.value < reserve) return { message: MESSAGES.feeReserveNeeded, atOnce: true }; // LLR-FE-030

  const parsed = parseAmount(text, token.decimals);
  if (!parsed.ok) {
    if (parsed.reason === "syntax") return { message: MESSAGES.amountSyntax, atOnce: false }; // LLR-FE-030
    if (parsed.reason === "precision") {
      return { message: `${token.symbol} has ${token.decimals} decimal places. Remove the extra digits.`, atOnce: false }; // LLR-FE-030
    }
    return { message: MESSAGES.zeroAmount, atOnce: false }; // LLR-FE-030
  }
  if (parsed.value === 0n) return { message: MESSAGES.zeroAmount, atOnce: false }; // LLR-FE-030
  // An amount is not compared with a balance that has not been read yet; the form stays invalid until it is.
  if (balance.status !== "ok") return undefined;
  if (parsed.value > balance.value) {
    return { message: `Your balance is ${formatUnits(balance.value, token.decimals)} ${token.symbol}, which is less than this amount.`, atOnce: false }; // LLR-FE-030
  }
  if (isUsdc && parsed.value + reserve > balance.value) return { message: MESSAGES.feeReserveLeft, atOnce: false }; // LLR-FE-030
  return undefined;
}

function partyError(text: string, who: "referee" | "beneficiary", context: FormContext): string | undefined {
  // Section 2.2 binds contract errors only, so a malformed address is told which field it is; a well-formed zero
  // address keeps the words of the contract's ZeroAddress.
  if (!isAddress(text)) return MESSAGES.addressSyntax(who); // LLR-FE-030
  if (text.toLowerCase() === ZERO_ADDRESS) return MESSAGES.zeroAddress; // LLR-FE-030
  if (text.toLowerCase() === context.network.contract.toLowerCase()) return MESSAGES.partyIsContract; // LLR-FE-030
  if (context.staker !== undefined && text.toLowerCase() === context.staker.toLowerCase()) return MESSAGES.partyIsStaker; // LLR-FE-030
  return undefined;
}

/** The words for a failed check of a custom deadline, which the check at submit shows beside the deadline too. */
export function customDeadlineMessage(check: CustomCheck, clockFailed = false): string | undefined {
  switch (check) {
    case "invalid":
      return MESSAGES.noDate; // LLR-FE-030
    case "noClock":
      return clockFailed ? MESSAGES.clockFailed : MESSAGES.noClock; // LLR-FE-031
    case "tooSoon":
      return MESSAGES.tooSoon; // LLR-FE-030
    case "tooFar":
      return MESSAGES.tooFar; // LLR-FE-030
    case "ok":
      return undefined;
  }
}

function deadlineError(choice: DeadlineChoice, chainNow: bigint | null, clockFailed: boolean): string | undefined {
  if (choice.kind === "none") return MESSAGES.noDeadline; // LLR-FE-030
  if (choice.kind === "preset") return undefined;
  // Without chain time no date can be judged, so a failed read is what the person needs to hear, date or not.
  if (clockFailed && chainNow === null) return MESSAGES.clockFailed; // LLR-FE-031
  return customDeadlineMessage(checkCustomDeadline(localToTimestamp(choice.local), chainNow), clockFailed);
}

/**
 * Every check of LLR-SC-021 to 026 that can be made without the chain, plus address syntax and the balance,
 * so a transaction the contract would refuse is never offered to the wallet. A field with no entry is correct.
 * The form is valid only when nothing is wrong and the account and balance it is checked against are known.
 *
 * @trace LLR-FE-030
 */
export function checkForm(values: FormValues, context: FormContext): FormCheck {
  const errors: FormCheck["errors"] = {};
  const set = (field: Field, message: string | undefined) => {
    if (message !== undefined) errors[field] = message;
  };

  const token = context.network.tokens.find((t) => t.address.toLowerCase() === values.token.toLowerCase());
  const atOnce: Field[] = [];
  if (token === undefined) set("token", MESSAGES.tokenNotAccepted);
  else if (!context.tokenEnabled) set("token", `${token.symbol} cannot be used for new pledges right now.`); // LLR-FE-030
  if (errors.token !== undefined) atOnce.push("token");

  // The reserve is in USDC's own decimals, which LLR-FE-006 has confirmed against the chain, and never in the
  // native balance's 18 (LLR-FE-032).
  const usdc = context.network.tokens.find((t) => t.symbol === "USDC") as TokenConfig;
  const isUsdc = token !== undefined && token.address.toLowerCase() === usdc.address.toLowerCase();
  const fee = isUsdc ? context.balance : context.feeBalance;
  if (token !== undefined) {
    const fault = amountError(values.amount, token, isUsdc, context.balance, fee, parseUnits(FEE_RESERVE_USDC, usdc.decimals));
    set("amount", fault?.message);
    if (fault?.atOnce) atOnce.push("amount");
  }

  const referee = partyError(values.referee, "referee", context);
  const beneficiary = partyError(values.beneficiary, "beneficiary", context);
  set("referee", referee);
  set("beneficiary", beneficiary);
  // The pair is judged only when each address is sound on its own, so one fault is reported once.
  if (referee === undefined && beneficiary === undefined && values.referee.toLowerCase() === values.beneficiary.toLowerCase()) {
    set("beneficiary", MESSAGES.samePeople); // LLR-FE-030
  }

  set("deadline", deadlineError(values.deadline, context.chainNow, context.clockFailed));
  // A clock that failed to read does not mend itself while the person types, so say so without waiting for a blur.
  if (errors.deadline === MESSAGES.clockFailed) atOnce.push("deadline"); // LLR-FE-031
  set("promise", promiseError(values.promise));
  if (!values.acknowledged) set("acknowledged", MESSAGES.notAcknowledged); // LLR-FE-030

  // Neither balance is compared with the amount until it has been read, so the form is not valid before then.
  const balancesRead = context.balance.status === "ok" && fee.status === "ok";
  const valid = Object.keys(errors).length === 0 && context.staker !== undefined && balancesRead; // LLR-FE-030
  return { errors, valid, atOnce };
}
