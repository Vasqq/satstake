import type { ReactNode } from "react";
import type { Pledge, PledgeState } from "../../chain/reads";
import type { SelectedNetwork } from "../../config/networks";
import { formatAmount, formatLocalTime, shorten } from "../../format";
import type { Role } from "../roles";
import { type BannerVariant, bannerVariant } from "./banner";

const Addr = ({ value }: { value: string }) => <code title={value}>{shorten(value)}</code>;

export interface PledgeBannerProps {
  pledge: Pledge;
  state: PledgeState;
  role: Role | null;
  deadlineReached: boolean | null;
  network: SelectedNetwork;
  /** The copy-link control, offered inside the staker's text and nowhere else. */
  copyLink: ReactNode;
}

/**
 * What this page means for whoever is looking, chosen by role and state. It is a note and not a live region:
 * the status line below keeps that job, so a change is not announced twice. The settled text links no
 * transaction because the application reads no event logs.
 *
 * @trace LLR-FE-040 LLR-FE-041
 */
export function PledgeBanner({ pledge, state, role, deadlineReached, network, copyLink }: PledgeBannerProps) {
  const variant: BannerVariant = bannerVariant({ state, role, deadlineReached });
  const deadline = <em>{formatLocalTime(pledge.deadline)}</em>;
  const staker = <Addr value={pledge.staker} />;
  const referee = <Addr value={pledge.referee} />;
  const beneficiary = <Addr value={pledge.beneficiary} />;
  return (
    <div className="banner pledge-banner" role="note" aria-label="About this promise" data-variant={variant}>
      <div>
        {variant === "open-visitor" && (
          <p>
            This is a promise made with SatStake. {staker} locked {formatAmount(network, pledge.token, pledge.amount)}. {referee} judges
            it by {deadline}. Kept, the money goes back to {staker}; otherwise it goes to {beneficiary}.{" "}
            <a className="textlink" href="#/">
              What is SatStake?
            </a>
          </p>
        )}
        {variant === "open-referee" && (
          <p>
            {staker} named you to judge this promise. Before {deadline}, decide: was it kept? Your answer is final. The stake never passes
            through you. Silence counts as broken. Answering needs a wallet on Arc with a few cents of USDC for the network fee.
          </p>
        )}
        {variant === "open-staker" && (
          <>
            <p>
              You made this promise. Send this link to {referee}, who judges it: they answer here, and SatStake does not notify them.
              Silence counts as broken, so make sure they answer before {deadline}.
            </p>
            {copyLink}
          </>
        )}
        {variant === "open-beneficiary" && (
          <p>
            You were named to receive this stake if the promise is broken or there is no answer by {deadline}. If it is kept, it goes back
            to {staker}. You do not need to do anything now.
          </p>
        )}
        {variant === "kept" && (
          <p>
            Kept. The stake goes back to {staker}; anyone can send it now.
            {role === "staker" && " Withdraw it when you like."}
          </p>
        )}
        {variant === "broken" && (
          <p>
            Marked broken. The stake goes to {beneficiary}; anyone can send it now.
            {role === "beneficiary" && " You can send it to yourself now."}
          </p>
        )}
        {variant === "deadline-checking" && <p>The deadline has passed. Checking the network for the outcome.</p>}
        {variant === "expired" && (
          <p>
            The deadline passed with no answer, so this promise counts as broken. The stake goes to {beneficiary}; anyone can send it
            now.
            {role === "referee" && " You can no longer give a verdict."}
            {role === "beneficiary" && " You can send it to yourself now."}
          </p>
        )}
        {variant === "settled" && (
          <p>Done. The stake went to {state === "SettledToStaker" ? staker : beneficiary}.</p>
        )}
      </div>
    </div>
  );
}
