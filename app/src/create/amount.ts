import { parseUnits } from "viem";

export type AmountResult = { ok: true; value: bigint } | { ok: false; reason: "empty" | "syntax" | "precision" };

// Digits with at most one decimal point. \d is ASCII only here, so full-width and Arabic-Indic digits, which
// BigInt would refuse or misread, are syntax errors too.
const SHAPE = /^(\d*)(?:\.(\d*))?$/;

/**
 * Reads an amount the staker typed. The decimals are the token's own (LLR-FE-006 confirms them against the
 * chain), never 18, which is the native balance of Arc and not what the USDC token contract counts in (01 V-05).
 * A fraction longer than the token's decimals is refused instead of rounded, so the amount locked is the amount
 * typed.
 *
 * @trace LLR-FE-032
 */
export function parseAmount(text: string, decimals: number): AmountResult {
  if (text === "") return { ok: false, reason: "empty" };
  const match = SHAPE.exec(text); // LLR-FE-032
  const whole = match?.[1] ?? "";
  const fraction = match?.[2] ?? "";
  if (match === null || whole.length + fraction.length === 0) return { ok: false, reason: "syntax" };
  if (fraction.length > decimals) return { ok: false, reason: "precision" }; // LLR-FE-032
  const normalised = `${whole === "" ? "0" : whole}${fraction === "" ? "" : `.${fraction}`}`;
  return { ok: true, value: parseUnits(normalised, decimals) }; // LLR-FE-032
}
