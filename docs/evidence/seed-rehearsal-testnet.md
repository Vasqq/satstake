# Seed rehearsal on Arc testnet

Date: 2026-10-03. Chain: Arc testnet (5042002). This rehearses `script/seed.mjs`, which had only run against a fake `cast`,
against a real node and the real contract, before its mainnet run (LLR-DP-009, LLR-DP-012). Nothing here touched mainnet:
the rehearsal plan is selected with `--testnet`, refuses any chain but 5042002, and reads no mainnet file.

## Setup

- Contract: a fresh SatStake deployed for the rehearsal only, `0x1Acb90800E6F730c6dDEea2336F2d483F351B457`, from this
  commit's source with `forge script script/Deploy.s.sol --rpc-url arc_testnet`, signing with a throwaway encrypted
  keystore file, simulated first and then with `--broadcast`. Deploy transaction
  [0xa9561ce8...ad90c](https://explorer.testnet.arc.io/tx/0xa9561ce8a48a92065d9d21bf3aaead31465a0142512bc4579a681022ae6ad90c).
  It is not the testnet record in `deployments/5042002.json`, which was not touched.
- Signers: two throwaway keystores made with `cast wallet new` under the gitignored `cache/seed-rehearsal/signers/`, each with
  a random password in a `0600` file beside them. Staker `0x3b933Fdf99ef4A65d23bCfC9D053Df3aD3CCD835` (also the deployer and
  the settler), referee `0x8D16cDe860E8DbE5d3E7d1fb4A14dDBb4660BD09`, beneficiary `0xD9f8d97cCb2a66a7eecFc021292de4fDDD9Ff765`
  (an address whose key was discarded). `cache/seed-rehearsal/record.json` and `roles.json` hold the rehearsal's record and roles.
- Funding from the testnet operator, which signed through `parseEnvKey` and never printed its key: staker 3 USDC
  ([tx](https://explorer.testnet.arc.io/tx/0xc92f402e8aeff6e2c6b0c6b2faa6544c86ab59a670c841cc3b545d6f7cc437ad)) and 250 sats
  of testnet cirBTC ([tx](https://explorer.testnet.arc.io/tx/0x256fe05195a6d6b08c2814c214c63bdd03219a71263966e4f16ff21b933ff0f6)),
  referee 0.3 USDC ([tx](https://explorer.testnet.arc.io/tx/0x351ea6bb384ffc51f683dd4ab7caf36b941919cf680ea8005483cfb96c6f77d0)).
- Amounts: 100 sats per cirBTC pledge and 0.1 USDC per USDC pledge, a tenth of the mainnet seed.

## Commands

`<keystore>` is a throwaway keystore file and `<password-file>` its password file, both under `cache/seed-rehearsal/`.

```
node script/seed.mjs create   --testnet --keystore <staker-keystore>  --password-file <staker-password-file>
node script/seed.mjs create   --testnet --keystore <staker-keystore>  --password-file <staker-password-file> --send   (killed)
node script/seed.mjs create   --testnet --keystore <staker-keystore>  --password-file <staker-password-file>           (resume, simulated)
node script/seed.mjs create   --testnet --keystore <staker-keystore>  --password-file <staker-password-file> --send   (resume)
node script/seed.mjs verdicts --testnet --keystore <referee-keystore> --password-file <referee-password-file>          then with --send
node script/seed.mjs settle   --testnet --keystore <staker-keystore>  --password-file <staker-password-file>           then with --send
```

## Results

1. `create` without `--send`: both approvals simulated against the node, and the line "createPledge x4: not simulated, each
   needs its approval mined first". The node answered the new `cast code` and `allowedTokens()` checks and `cast wallet address
   --keystore` without change.
2. `create --send`, killed (SIGKILL) as soon as the first `createPledge` was reported sent. Transactions: approve cirBTC 200
   [0x74bb056b...](https://explorer.testnet.arc.io/tx/0x74bb056bf6ae22e4945b95f30c697a424c8892952e0d806ec611a3cde11a661c),
   approve USDC 200000
   [0x891fb1ea...](https://explorer.testnet.arc.io/tx/0x891fb1eac1d22a1f3506495b09a2bc3a0ae0b4dd9af3360568471f6309054752),
   createPledge 1
   [0x6d531397...](https://explorer.testnet.arc.io/tx/0x6d53139759d51192fc1c3e7ef731d2cd66d20f90b7210fe2f5b5f305adea090d).
   `pledgeCount()` on chain: 1.
3. `create` again without `--send`: "approve cirBTC 100: the allowance already is that amount, nothing to send", the same for
   USDC 200000, then `createPledge` 2, 3 and 4 each "simulated ok, not sent". The cirBTC allowance had fallen from 200 to 100
   with pledge 1, which the resume took into account.
4. `create --send` (resume): no approval, then createPledge 2
   [0x57ee97b7...](https://explorer.testnet.arc.io/tx/0x57ee97b771ad5530e28631576548d2a1ab72b2ec54a04073a7497577810b80d3),
   3 [0x4face629...](https://explorer.testnet.arc.io/tx/0x4face629dff88c24b3da16ecd453745568a1ac34fe94bf0ccf4041e59cb3f86a),
   4 [0x59a08e12...](https://explorer.testnet.arc.io/tx/0x59a08e121a8559d8c4ddf1ec363420b784d497cc19cc059b3ac63a3e2d96fc46).
   A further `create --send` printed `seed: pledgeCount is 4, the seed has nothing left to create` and sent nothing.
5. `verdicts` simulated, then sent as the referee: markKept 1
   [0xa4697cf8...](https://explorer.testnet.arc.io/tx/0xa4697cf8e87e250fb86bb8da672e15d291f2f0c1de2624860a3b8e7313563b22),
   markBroken 3
   [0x4c392e74...](https://explorer.testnet.arc.io/tx/0x4c392e74f0ea707adf71728b341cfc4ac806db7f93c8a8f7418486f41f60d9a1).
6. `settle` before pledge 2 had expired: `seed: pledge 2 is Active, this phase needs it Expired`, nothing sent. After the
   120 second pledge expired, simulated ok, then sent: settle 1
   [0xd82c0557...](https://explorer.testnet.arc.io/tx/0xd82c0557b69a69f186fc3e8c19b05c97bf7638b1caa337be0c2858f9a83800fd),
   2 [0xc2565327...](https://explorer.testnet.arc.io/tx/0xc2565327690b8c0d1c89a70a15280dd2585fba3f0268c43c8e2d33581da8358b),
   3 [0x56550a73...](https://explorer.testnet.arc.io/tx/0x56550a7391c80cb207ce735f129c1521890cdfe64d365659fab9ad48fc8b879a).
7. Repeating `verdicts` and `settle` after the run: `pledge 1 is SettledToStaker, this phase needs it Active` and `... needs it
   Kept`, nothing sent. `node script/seed.mjs create --keystore x --password-file y` (no `--testnet`) stopped at argument
   parsing: `--keystore is only for the --testnet rehearsal; mainnet signs with --account`.

## Final states, read from the chain

| Pledge | Token and amount | State | Expected |
|---|---|---|---|
| 1 | cirBTC 100 | SettledToStaker | kept, returned |
| 2 | USDC 100000 | SettledToBeneficiary | expired, to the beneficiary |
| 3 | USDC 100000 | SettledToBeneficiary | broken, to the beneficiary |
| 4 | cirBTC 100 | Active | left Active until 2026-11-01 |

`totalLocked` for cirBTC is 100, the fourth pledge. The beneficiary holds 0.2 USDC; the staker's 250 sats were 150 once pledge 4 locked 100
and pledge 1's 100 came back, before the sweep returned them.

## Funds

The operator went from 13.5849 USDC and 1405 sats to 13.2494 USDC and 1305 sats: 0.3356 USDC and 100 sats. Of that, 0.2 USDC
is in the beneficiary address, which has no key, and 100 sats are locked in pledge 4 until its deadline; settling it after
2026-11-01 would send them to that same address. The remaining 0.12 USDC is fees, mostly the deployment (about 2 million
gas), and about 0.0186 USDC is left in the two throwaway signers as the margin each sweep keeps. Sweep: 150 sats back from the
staker
([tx](https://explorer.testnet.arc.io/tx/0x440e574c48343d983c80e5b593794d3ea0e81b2a68e624676c5b2d73c0e765fa)), then the native
balance of each signer less 0.01 USDC: staker
([tx](https://explorer.testnet.arc.io/tx/0xd9d7dbb19bb61b2693f2e839ab06dcbd26507e20b8cbd43b01015a219b18cbec)), referee
([tx](https://explorer.testnet.arc.io/tx/0x71dbb3e234d6d58bcbb6b07e0d36b378b52931e5a55e5094da1397ebb4a50ebb)).

## What differed from the fake

Nothing broke on the real node: every command the tool issues (`chain-id`, `code`, `call` with and without `--from` and
`--block`, `send --json`, `block latest --field timestamp`, `wallet address --keystore`) behaved as the fake assumed, and the
allowance read at the receipt's block, the freshness of each deadline and the status check all worked on Arc's two-blocks-a-second
chain. What the fake could not show: the killed run left the chain in the state the resume logic expects (one pledge, allowance
reduced by exactly that pledge's amount), the resumed simulation of three `createPledge` calls ran without mining anything first
because no approval was needed, and Arc's ERC-20 USDC allowance read agreed with the amount approved. Two limits stand: a
`createPledge` still cannot be simulated while its approval is unmined (no state override in this `cast`), and the seed's roles,
amounts and files for mainnet were not exercised here, only the shared code path. The signer form differs too: the
rehearsal signed with `--keystore <path>`, while mainnet accepts only `--account <name>`, so `cast wallet address --account`
and `cast send --account` have not run against a real node. If either refuses the flags, the run stops before any send.

## Accepted risk

Anyone can create a pledge on the live contract. A stranger's pledge made before the seed takes identifier 1 to 4, so the seed's
pledges are no longer those identifiers and `create` refuses for good, in words that say a pledge that is not part of the seed
exists. It fails safe: nothing is approved or sent. What would recover it is a fresh deployment, or finding the seed pledges
and adjusting the plan under a requirement change. No code handles this case, since a mainnet contract with no listing yet is
unlikely to be found and used by a stranger before the seed runs.
