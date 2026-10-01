# Live testnet run

This is the evidence for LLR-VV-005: every journey it names, run on Arc testnet with real tokens, with the hash of every transaction.

Chain 5042002. Contract `0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4`.

Result: pass

## Accounts

| Role | Address |
|---|---|
| staker | `0x18648257045D8c323Cff1E4F80EeD22F157D8767` |
| referee | `0xa4bCc01230c748D1e4DEddc1BE5D45375256583E` |
| beneficiary | `0x1A20D4Fba1c69eC7BF52A9a97082b239157675B1` |
| settler | `0x9A72d33c632C25437e47fEe696e39A04Fbd0b37c` |

## Steps

| Journey | Step | Transaction | Note |
|---|---|---|---|
| setup | fund referee with gas | [`0x75b7903a57264f1a72bbf51ed8e6da8058c0686bb972d40e586aad5da5939591`](https://explorer.testnet.arc.io/tx/0x75b7903a57264f1a72bbf51ed8e6da8058c0686bb972d40e586aad5da5939591) | 110272500000000000 native units |
| setup | fund beneficiary with gas | [`0xbf9936cd0524f961d6a17f2f284f1681367ab221c01475fc8cdacf4fe310f2df`](https://explorer.testnet.arc.io/tx/0xbf9936cd0524f961d6a17f2f284f1681367ab221c01475fc8cdacf4fe310f2df) | 88522500000000000 native units |
| setup | fund settler with gas | [`0x29a95dbfb3ab0deaef94221d113580a9672bce1c93e664203b5b557bed6a745e`](https://explorer.testnet.arc.io/tx/0x29a95dbfb3ab0deaef94221d113580a9672bce1c93e664203b5b557bed6a745e) | 45022500000000000 native units |
| UJ-42 | expiring cirBTC pledge: approve exactly 10 | [`0x7fa5dd9bd935630bcbbc124b7bf296f75938e632e0a6f484a2d046fae1240356`](https://explorer.testnet.arc.io/tx/0x7fa5dd9bd935630bcbbc124b7bf296f75938e632e0a6f484a2d046fae1240356) |  |
| UJ-42 | expiring cirBTC pledge: createPledge, pledge 13 Active; one Transfer of 10 from the staker to the contract in its receipt | [`0xe11a9c23c1dda4f4ba95c5ec87304b39c7366141da439ec076c8f17599a7bb71`](https://explorer.testnet.arc.io/tx/0xe11a9c23c1dda4f4ba95c5ec87304b39c7366141da439ec076c8f17599a7bb71) | deadline 1790866307 |
| UJ-10 | cirBTC pledge to be kept: approve exactly 10 | [`0xb1fc95967c1dfdec011b4d8ebb179ff7d44099b2343e6438f8e18c56efb6e37f`](https://explorer.testnet.arc.io/tx/0xb1fc95967c1dfdec011b4d8ebb179ff7d44099b2343e6438f8e18c56efb6e37f) |  |
| UJ-10 | cirBTC pledge to be kept: createPledge, pledge 14 Active; one Transfer of 10 from the staker to the contract in its receipt | [`0xde2556922b50228f9d41206dc4c80e69d570a1f6e420b4803ae281656ffb0a72`](https://explorer.testnet.arc.io/tx/0xde2556922b50228f9d41206dc4c80e69d570a1f6e420b4803ae281656ffb0a72) | deadline 1790869766 |
| UJ-11 | USDC pledge to be broken: approve exactly 10000 | [`0x21658195e6b96988808c8175001f446519682c87802a7048e209502578dd8517`](https://explorer.testnet.arc.io/tx/0x21658195e6b96988808c8175001f446519682c87802a7048e209502578dd8517) |  |
| UJ-11 | USDC pledge to be broken: createPledge, pledge 15 Active; one Transfer of 10000 from the staker to the contract in its receipt | [`0xb19796bca74a7aa8df031a5eb2c1c0568fd6999aab4f43f231b0a6bddaa06d28`](https://explorer.testnet.arc.io/tx/0xb19796bca74a7aa8df031a5eb2c1c0568fd6999aab4f43f231b0a6bddaa06d28) | deadline 1790869775 |
| UJ-10 | cirBTC pledge to be broken: approve exactly 10 | [`0x82f325696a43661cad82249972806d27498eba2fefd184015210816f7cf9d9fe`](https://explorer.testnet.arc.io/tx/0x82f325696a43661cad82249972806d27498eba2fefd184015210816f7cf9d9fe) |  |
| UJ-10 | cirBTC pledge to be broken: createPledge, pledge 16 Active; one Transfer of 10 from the staker to the contract in its receipt | [`0x2033f6faa7d3ffe87dc14273b98738789b819eba76f73e3bf98c1510a5055fff`](https://explorer.testnet.arc.io/tx/0x2033f6faa7d3ffe87dc14273b98738789b819eba76f73e3bf98c1510a5055fff) | deadline 1790869784 |
| UJ-44 | settle on active pledge 14 before its deadline refused | [`0xaf328a701d1f30de9ea08b501b493bd7cfd2402f49f79d2138f349b069fa5838`](https://explorer.testnet.arc.io/tx/0xaf328a701d1f30de9ea08b501b493bd7cfd2402f49f79d2138f349b069fa5838) | reverted in block 64962942 at timestamp 1790866190, deadline 1790869766, gas used 31496 of 300000; reverted with NotSettleable |
| UJ-30 | referee marks pledge 14 kept | [`0x97fd97c3f3681b024a82e1b41467d5be4a7e0de2581b5e48149fe6039cbac1ef`](https://explorer.testnet.arc.io/tx/0x97fd97c3f3681b024a82e1b41467d5be4a7e0de2581b5e48149fe6039cbac1ef) |  |
| UJ-31 | referee marks pledge 15 broken | [`0xc102ad09d371e9cf9672afa21f2116a3959dbe5ba473fa38d53b1963d1249e67`](https://explorer.testnet.arc.io/tx/0xc102ad09d371e9cf9672afa21f2116a3959dbe5ba473fa38d53b1963d1249e67) |  |
| UJ-31 | referee marks pledge 16 broken | [`0xa5d79fb399b70091ba5b1f8b9ce3976d22c468bb3eac3f5748b7883473b4b363`](https://explorer.testnet.arc.io/tx/0xa5d79fb399b70091ba5b1f8b9ce3976d22c468bb3eac3f5748b7883473b4b363) |  |
| UJ-40 | staker settles pledge 14, SettledToStaker | [`0x89643485420a6ae0a42b3a10a34195b13559f3b4e4cadfd05be2bc38f99f37fe`](https://explorer.testnet.arc.io/tx/0x89643485420a6ae0a42b3a10a34195b13559f3b4e4cadfd05be2bc38f99f37fe) | kept stake back to the staker |
| UJ-45 | second settle on pledge 14 refused, no balance moved | [`0x97ea042dd541bcc76c42980f0cd3ce1fce28e52a36101906de6396a37dd8ec0d`](https://explorer.testnet.arc.io/tx/0x97ea042dd541bcc76c42980f0cd3ce1fce28e52a36101906de6396a37dd8ec0d) | reverted in block 64962971 at timestamp 1790866204, deadline 1790869766, gas used 29004 of 300000; reverted with AlreadySettled |
| UJ-43 | settler settles pledge 15, SettledToBeneficiary | [`0x09b51d572b789be83fbb79f0827872f3ce229a6e002762fce08c5119f323886b`](https://explorer.testnet.arc.io/tx/0x09b51d572b789be83fbb79f0827872f3ce229a6e002762fce08c5119f323886b) | third party triggers; the beneficiary receives, the settler receives nothing |
| UJ-41 | beneficiary settles pledge 16, SettledToBeneficiary | [`0x19eac26333f140caed6eed1ad5a0936b7e4fcb4760f27f34ec676d7e11b51e66`](https://explorer.testnet.arc.io/tx/0x19eac26333f140caed6eed1ad5a0936b7e4fcb4760f27f34ec676d7e11b51e66) | beneficiary claims a broken stake |
| UJ-42 | pledge 13 reads Expired once chain time reaches the deadline | none (read only) | signed at chain time 1790866218, deadline 1790866307 |
| UJ-32 | markKept on pledge 13, signed before the deadline and broadcast after it, refused | [`0x0976f978fabdf242fa688a7b3141ce2fda1875df24049bc823155cd8c328ffcd`](https://explorer.testnet.arc.io/tx/0x0976f978fabdf242fa688a7b3141ce2fda1875df24049bc823155cd8c328ffcd) | reverted in block 64963178 at timestamp 1790866310, deadline 1790866307, gas used 33612 of 300000; signed at chain time 1790866218 with nonce 3, the script's own observation; reverted with VerdictWindowClosed |
| UJ-32 | markBroken on pledge 13, signed before the deadline and broadcast after it, refused | [`0xf7d3882704da66852341be11b6fd242f2f724ce3ba20330bc883569224968018`](https://explorer.testnet.arc.io/tx/0xf7d3882704da66852341be11b6fd242f2f724ce3ba20330bc883569224968018) | reverted in block 64963188 at timestamp 1790866315, deadline 1790866307, gas used 33589 of 300000; signed at chain time 1790866218 with nonce 4, the script's own observation; reverted with VerdictWindowClosed |
| UJ-42 | beneficiary settles pledge 13, SettledToBeneficiary | [`0x407b12e11bf7c6c02e0cb7bf4c12ff73b6dd9285725147991d49ffdffc7b8239`](https://explorer.testnet.arc.io/tx/0x407b12e11bf7c6c02e0cb7bf4c12ff73b6dd9285725147991d49ffdffc7b8239) | expired stake claimed by the beneficiary |
| sweep | beneficiary returns 20 units of cirBTC to the operator | [`0x648d2b3305ddc2d8afeb9350f4561a6acc64934aa52445147c591f1e6406d140`](https://explorer.testnet.arc.io/tx/0x648d2b3305ddc2d8afeb9350f4561a6acc64934aa52445147c591f1e6406d140) |  |
| sweep | referee returns its remaining USDC to the operator | [`0x95a751622ac03fc4928df460568efe325fd6a000b0f539cf47f977486b800358`](https://explorer.testnet.arc.io/tx/0x95a751622ac03fc4928df460568efe325fd6a000b0f539cf47f977486b800358) | 266700000000000 native units left, the unspent margin of the fee cap |
| sweep | beneficiary returns its remaining USDC to the operator | [`0x3555c29aa4a4614db709af6275491f734a56984b723f00cd11ee0f416fe0aad9`](https://explorer.testnet.arc.io/tx/0x3555c29aa4a4614db709af6275491f734a56984b723f00cd11ee0f416fe0aad9) | 266700000000000 native units left, the unspent margin of the fee cap |
| sweep | settler returns its remaining USDC to the operator | [`0x1088ce9966ef1e21771c5210cca3db31a0186c4b653e065fc2b9e8bf112b7883`](https://explorer.testnet.arc.io/tx/0x1088ce9966ef1e21771c5210cca3db31a0186c4b653e065fc2b9e8bf112b7883) | 266700000000000 native units left, the unspent margin of the fee cap |

## Earlier runs on this contract

`pledgeIdsOf(staker)` lists pledges 1 to 16. This run is pledges 13 to 16. Pledges 9 to 12 are the previous passing run, kept beside this one in `docs/evidence/e2e-testnet-run3.md` and `.json`; it has mined refusals but not the per-row signing observation or the gas check. Pledges 1 to 4 are round one, whose UJ-32, UJ-44 and UJ-45 were `eth_call` simulations with no transaction; its evidence was dropped. Pledges 5 to 8 are a run that failed in its sweep and wrote no evidence. The three throwaway accounts of each run existed only in process memory, so the keys no longer exist and what they hold is unrecoverable testnet funds. Read with `cast` on 2026-10-01:

| Run | Account | Address | Holds |
|---|---|---|---|
| Round one (pledges 1 to 4) | referee | `0x875a78A9481ecc33bb2E80eCcaC4bb0c24252a4A` | 0.2473 USDC |
| Round one | beneficiary | `0xd65De6cc2B3ac9004adFe53a4C50188bF0073fB0` | 0.2563 USDC and 20 sats of cirBTC |
| Round one | settler | not recorded | funded 0.25 USDC; remainder unknown |
| Failed run (pledges 5 to 8) | referee | `0x7f949C929f55429076d2f98293aa37De04D76B70` | 0.0932 USDC |
| Failed run | beneficiary | `0xD4C637196b3b4Af0D1b93Aa09Ac418830D116ebC` | 0.0831 USDC |
| Failed run | settler | `0x9C6db108B68Ff93C3a46874950BdAB2fEAFeBC21` | 0.0374 USDC |

The readable total is 0.7175 USDC and 20 sats, plus the unrecorded round-one settler. The failed run alone is 0.2138 USDC.
