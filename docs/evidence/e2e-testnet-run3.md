# Live testnet run

This is the evidence for LLR-VV-005: every journey it names, run on Arc testnet with real tokens, with the hash of every transaction.

Chain 5042002. Contract `0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4`.

Result: pass

## Accounts

| Role | Address |
|---|---|
| staker | `0x18648257045D8c323Cff1E4F80EeD22F157D8767` |
| referee | `0x8b2397f42B9358eA7F4d90F67070c495308A6C92` |
| beneficiary | `0xF00DfE7500730d2D1A8d8770AeecBEB7BfF6f320` |
| settler | `0xFD199E525510Dd14c0D13B2ac6fEb077693C01d6` |

## Steps

| Journey | Step | Transaction | Note |
|---|---|---|---|
| setup | fund referee with gas | [`0xaea7c18b507bb22fc8b120cfddd51ec6632dcd45bf3f2731387b1fe380948cd2`](https://explorer.testnet.arc.io/tx/0xaea7c18b507bb22fc8b120cfddd51ec6632dcd45bf3f2731387b1fe380948cd2) | 96963750000000000 native units |
| setup | fund beneficiary with gas | [`0x4e38c04e9a83b28b000cd7de6447ae373756f9fbc947a4ea936be8223d3555b6`](https://explorer.testnet.arc.io/tx/0x4e38c04e9a83b28b000cd7de6447ae373756f9fbc947a4ea936be8223d3555b6) | 77838750000000000 native units |
| setup | fund settler with gas | [`0xac825dc91c954aa825e9c5ca2483a1e0ec6d654ae6f53cde378b07ccd6bd4e7b`](https://explorer.testnet.arc.io/tx/0xac825dc91c954aa825e9c5ca2483a1e0ec6d654ae6f53cde378b07ccd6bd4e7b) | 39588750000000000 native units |
| UJ-42 | expiring cirBTC pledge: approve exactly 10 | [`0x1cd9c0ee666f952d4ea0d0ef34575fa29d3d3969cd6b88c27b38be2d0e40da2a`](https://explorer.testnet.arc.io/tx/0x1cd9c0ee666f952d4ea0d0ef34575fa29d3d3969cd6b88c27b38be2d0e40da2a) |  |
| UJ-42 | expiring cirBTC pledge: createPledge, pledge 9 Active; one Transfer of 10 from the staker to the contract in its receipt | [`0xe500aacf24a14a4e2ff4e805f41f8e4ec7645d8d592eb39947e2aae143968fdc`](https://explorer.testnet.arc.io/tx/0xe500aacf24a14a4e2ff4e805f41f8e4ec7645d8d592eb39947e2aae143968fdc) | deadline 1790861911 |
| UJ-10 | cirBTC pledge to be kept: approve exactly 10 | [`0x6336f6be388ff0df46382f7f2b33b4d95d726c80d571e0388f2bc9ea476ec84b`](https://explorer.testnet.arc.io/tx/0x6336f6be388ff0df46382f7f2b33b4d95d726c80d571e0388f2bc9ea476ec84b) |  |
| UJ-10 | cirBTC pledge to be kept: createPledge, pledge 10 Active; one Transfer of 10 from the staker to the contract in its receipt | [`0xa70f767d5c379aa47d6305f579fdadf167538283326f330184d1b726091a1e24`](https://explorer.testnet.arc.io/tx/0xa70f767d5c379aa47d6305f579fdadf167538283326f330184d1b726091a1e24) | deadline 1790865366 |
| UJ-11 | USDC pledge to be broken: approve exactly 10000 | [`0x880c5cf42446ac8facc9b929ecf0ca3b6184530c3f3744ba914068c037aef26d`](https://explorer.testnet.arc.io/tx/0x880c5cf42446ac8facc9b929ecf0ca3b6184530c3f3744ba914068c037aef26d) |  |
| UJ-11 | USDC pledge to be broken: createPledge, pledge 11 Active; one Transfer of 10000 from the staker to the contract in its receipt | [`0xcc86aa4a3119e0e86fe1f4bdd68a22c238a9085a6ce2a9e14f6c72d30ffe1842`](https://explorer.testnet.arc.io/tx/0xcc86aa4a3119e0e86fe1f4bdd68a22c238a9085a6ce2a9e14f6c72d30ffe1842) | deadline 1790865372 |
| UJ-10 | cirBTC pledge to be broken: approve exactly 10 | [`0x178e7af48043a57d917ea0649d7f5c050466a845d0490d3845895550f90e8e97`](https://explorer.testnet.arc.io/tx/0x178e7af48043a57d917ea0649d7f5c050466a845d0490d3845895550f90e8e97) |  |
| UJ-10 | cirBTC pledge to be broken: createPledge, pledge 12 Active; one Transfer of 10 from the staker to the contract in its receipt | [`0xbb81cd091c56db603736f1e25dbe5f27375c9d0541b0565b4cec35277685d836`](https://explorer.testnet.arc.io/tx/0xbb81cd091c56db603736f1e25dbe5f27375c9d0541b0565b4cec35277685d836) | deadline 1790865378 |
| UJ-44 | settle on active pledge 10 before its deadline refused | [`0x245cf5a9d2123a0801034df22ba34d6a94b321875751aae16aa2fe0b28435677`](https://explorer.testnet.arc.io/tx/0x245cf5a9d2123a0801034df22ba34d6a94b321875751aae16aa2fe0b28435677) | reverted in block 64954291 at timestamp 1790861788, deadline 1790865366; reverted with NotSettleable |
| UJ-30 | referee marks pledge 10 kept | [`0x539a6c8959979906809facc1d2e4850df79e2288ad946f433ef4e648eea82865`](https://explorer.testnet.arc.io/tx/0x539a6c8959979906809facc1d2e4850df79e2288ad946f433ef4e648eea82865) |  |
| UJ-31 | referee marks pledge 11 broken | [`0xe5681580cec5dcffd7471ffaf49cb16b33e714dfde924e66d4571e48387545cc`](https://explorer.testnet.arc.io/tx/0xe5681580cec5dcffd7471ffaf49cb16b33e714dfde924e66d4571e48387545cc) |  |
| UJ-31 | referee marks pledge 12 broken | [`0x8eac73f994e056c2cfbaacede95e229a5be7770d73f9ad47c2b815a2f9dcdb79`](https://explorer.testnet.arc.io/tx/0x8eac73f994e056c2cfbaacede95e229a5be7770d73f9ad47c2b815a2f9dcdb79) |  |
| UJ-40 | staker settles pledge 10, SettledToStaker | [`0xb98368b738a0badd551e2647653b06b7c509d04ee5b45dc86708ea953a99fe25`](https://explorer.testnet.arc.io/tx/0xb98368b738a0badd551e2647653b06b7c509d04ee5b45dc86708ea953a99fe25) | kept stake back to the staker |
| UJ-45 | second settle on pledge 10 refused, no balance moved | [`0x52bbf3a3304691a290860e3996c97ea651fd8c629ba251599f4a8925733db071`](https://explorer.testnet.arc.io/tx/0x52bbf3a3304691a290860e3996c97ea651fd8c629ba251599f4a8925733db071) | reverted in block 64954328 at timestamp 1790861807, deadline 1790865366; reverted with AlreadySettled |
| UJ-43 | settler settles pledge 11, SettledToBeneficiary | [`0x4991deb7b3bf6de9d65926901f5a9e6c286cd172f80d618140abb4d56798d5f9`](https://explorer.testnet.arc.io/tx/0x4991deb7b3bf6de9d65926901f5a9e6c286cd172f80d618140abb4d56798d5f9) | third party triggers; the beneficiary receives, the settler receives nothing |
| UJ-41 | beneficiary settles pledge 12, SettledToBeneficiary | [`0xb3d8adab92aa938242ba57e2983bf0a83b70ec29ac9607cdbf48999bcde7cee2`](https://explorer.testnet.arc.io/tx/0xb3d8adab92aa938242ba57e2983bf0a83b70ec29ac9607cdbf48999bcde7cee2) | beneficiary claims a broken stake |
| UJ-42 | pledge 9 reads Expired once chain time reaches the deadline | none (read only) | signed at chain time 1790861816, deadline 1790861911 |
| UJ-32 | markKept on pledge 9, signed before the deadline and broadcast after it, refused | [`0x23a9a32481c3e87bd95b647138f5893c0594bd2d49ad2cf6a1a07aa73a4ed3e1`](https://explorer.testnet.arc.io/tx/0x23a9a32481c3e87bd95b647138f5893c0594bd2d49ad2cf6a1a07aa73a4ed3e1) | reverted in block 64954538 at timestamp 1790861913, deadline 1790861911; reverted with VerdictWindowClosed |
| UJ-32 | markBroken on pledge 9, signed before the deadline and broadcast after it, refused | [`0x10b50f1d2aeb266d2f04f353c51e26bebeec4bb402949e92816778e4fe393088`](https://explorer.testnet.arc.io/tx/0x10b50f1d2aeb266d2f04f353c51e26bebeec4bb402949e92816778e4fe393088) | reverted in block 64954547 at timestamp 1790861918, deadline 1790861911; reverted with VerdictWindowClosed |
| UJ-42 | beneficiary settles pledge 9, SettledToBeneficiary | [`0x492b94823a85f2979e9db4a8b7b7d20e24a3a8d8ae3a1e9632a663bbf4e90375`](https://explorer.testnet.arc.io/tx/0x492b94823a85f2979e9db4a8b7b7d20e24a3a8d8ae3a1e9632a663bbf4e90375) | expired stake claimed by the beneficiary |
| sweep | beneficiary returns 20 units of cirBTC to the operator | [`0x2008dec1b72ef50d91802d03fffd402cf47897fa25e561963e63809403076588`](https://explorer.testnet.arc.io/tx/0x2008dec1b72ef50d91802d03fffd402cf47897fa25e561963e63809403076588) |  |
| sweep | referee returns its remaining USDC to the operator | [`0xffc7d71b6fad2d23865ab8a013f40dd9c339b3676763f84a19992c516a741335`](https://explorer.testnet.arc.io/tx/0xffc7d71b6fad2d23865ab8a013f40dd9c339b3676763f84a19992c516a741335) | 259928760000000 native units left, the unspent margin of the fee cap |
| sweep | beneficiary returns its remaining USDC to the operator | [`0x274ebd64f1304b073574aba123ed8a7459a645d166bdbbdc2742a96255b1215e`](https://explorer.testnet.arc.io/tx/0x274ebd64f1304b073574aba123ed8a7459a645d166bdbbdc2742a96255b1215e) | 259928760000000 native units left, the unspent margin of the fee cap |
| sweep | settler returns its remaining USDC to the operator | [`0x26a7e341c350950bd9f9801ed6abb59b74c9567ed2013d640c88703ddc2627ad`](https://explorer.testnet.arc.io/tx/0x26a7e341c350950bd9f9801ed6abb59b74c9567ed2013d640c88703ddc2627ad) | 259928760000000 native units left, the unspent margin of the fee cap |
