# Submission text

LLR-SB-002. The DoraHacks "what it does / what it uses Arc for" text, at most 150 words, with no claim the North Star does not make.

---

**SatStake: lock Bitcoin against a promise. Keep it and you get your sats back. Miss it and they go to someone else.**

A staker locks cirBTC or USDC against a promise, names a referee who judges it, and names a beneficiary who receives the stake if the promise is broken. Before the deadline the referee marks it kept or broken; anyone can then settle. Silence by the deadline counts as broken. The contract has no owner, admin, fee, pause, or upgrade function.

SatStake uses cirBTC as the stake, USDC as gas so a $5 promise costs cents to make, and Arc's deterministic finality so a forfeit is final the moment it lands.

Live on Arc mainnet, verified on Sourcify and the explorer. Specified before it was built: every contract and app requirement traces to code and to a test written first or a recorded inspection.

Site: https://vasqq.github.io/satstake/
Code: https://github.com/Vasqq/satstake
