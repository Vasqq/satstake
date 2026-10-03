import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * The wording of 05 section 2.2, by the name of the error in the contract ABI. `InvalidAllowlist` has no entry:
 * only the constructor raises it, and the application never deploys.
 *
 * @trace LLR-FE-060
 */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  TokenNotAllowed: "This token is not accepted. Choose cirBTC or USDC.",
  ZeroAmount: "Enter an amount above zero.",
  ZeroAddress: "Enter a valid address for the referee and the beneficiary.",
  PartyIsContract: "The SatStake contract cannot be a party. Enter a person's address.",
  PartyIsStaker: "You cannot be your own referee or beneficiary.",
  RefereeIsBeneficiary: "The referee and the beneficiary must be different people.",
  DeadlineTooSoon: "The deadline must be at least one minute from now. Pick a later time.",
  DeadlineTooFar: "The deadline must be within one year. Pick an earlier time.",
  PromiseEmpty: "Write the promise you are making.",
  PromiseTooLong: "Shorten the promise to 280 bytes or fewer.",
  UnexpectedTransferAmount: "The token transferred a different amount than expected, so nothing was locked.",
  PledgeNotFound: "This pledge does not exist. Check the link.",
  NotReferee: "Only this pledge's referee can record a verdict.",
  NotActive: "A verdict has already been recorded for this pledge.",
  VerdictWindowClosed: "The deadline has passed, so a verdict can no longer be recorded. The stake now goes to the beneficiary.",
  NotSettleable: "This pledge cannot be settled until the referee rules or the deadline passes.",
  AlreadySettled: "This pledge has already been settled.",
  SafeERC20FailedOperation: "The token refused the transfer, so nothing was locked. You can try again later.",
  ReentrancyGuardReentrantCall: "This request called SatStake again before the first call finished. Nothing changed.",
};

/** The wording of 05 section 2.2 for a token that reverted the transfer. */
export const TOKEN_REVERT_MESSAGE = "The token issuer blocked this transfer. Nothing changed. You can try again later.";

/**
 * The message for a failed request whose cause is a revert: the contract's own error by name, or a token's
 * revert string. SatStake raises no revert string (LLR-SC-004), so `Error(string)` can only be the token's.
 * Anything else, including a panic or a revert with no data, has no message and falls to the general one.
 *
 * @trace LLR-FE-060
 */
export function userMessageFor(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  const name = reverted.data?.errorName;
  if (name === undefined) return null;
  if (name === "Error") return TOKEN_REVERT_MESSAGE; // LLR-FE-060
  return Object.hasOwn(ERROR_MESSAGES, name) ? (ERROR_MESSAGES[name] ?? null) : null; // LLR-FE-060
}
