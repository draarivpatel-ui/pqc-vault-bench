# PQC Vault Bench

A zero-dependency, interactive Post-Quantum Cryptography, UTXO Quantum-Migration, and QDay / Aevum Testnet (`tUSD8`) Workbench. Everything runs in the browser with plain JavaScript: no build step, no npm packages, and zero automatic background network calls (live Aevum testnet RPC queries run only when triggered explicitly).

Live demo: https://aariv.me/pqc-vault-bench/

## What is inside

- **Number Theoretic Transform (NTT)** over the Kyber / ML-KEM ring `Z_3329[x]/(x^256+1)`. Seven Cooley-Tukey stages with base-case multiplication produce exact negacyclic convolution. Verified against an O(n^2) schoolbook reference. The precomputed zeta table matches the FIPS 203 Montgomery roots.
- **Montgomery and Barrett reduction** in the Kyber ring, with a computed `N_PRIME` where `q * N_PRIME = -1 (mod 2^16)`, checked against plain modular reduction over hundreds of products.
- **Module-LWE key encapsulation (ML-KEM)** with educational parameter sets carrying FIPS 203 names (`toy-64`, `ML-KEM-512`, `ML-KEM-768`, `ML-KEM-1024`). Centered-binomial error sampling, ciphertext compression, deterministic key generation, and Fujisaki-Okamoto style implicit rejection.
- **KEM correctness sweeps** across independent seeds, reporting the exact decryption-failure count, tamper-rejection count and wrong-key rejection count for every parameter set.
- **Error distribution visualizer** for the centered binomial distribution `Psi_eta`.
- **WOTS+** (Winternitz One-Time Signature) with `w=16`, 67 hash chains and a checksum that blocks forgery.
- **XMSS** stateful hash-based signatures: a Merkle tree of WOTS+ public keys, authentication paths, one-time key exhaustion and signature verification.
- **Grover / Shor security analyzer** for secp256k1 ECDSA, RSA-2048, SHA-256, ML-KEM-768, ML-DSA-65 and SLH-DSA-128s, plus a UTXO quantum-exposure risk scorer and hybrid-signature analysis.
- **Hybrid migration and byte-accounting tables**: exact key, ciphertext and signature byte counts derived from the real implementation, and bit-security envelopes for classical plus post-quantum pairs.
- **QDay / Aevum Testnet (`tUSD8`) integration** (`src/qday-aevum.js`): official Aevum testnet parameters (`chainId: 44005` / `0xabe5`, RPC `https://rpc-test.qday.info`, official `tUSD8` ERC-20 `0x456569838f1d43009A91ebA4263147Afd7233483`, explorer and faucet links), pure JS ERC-20 ABI encoders/decoders (`balanceOf`, `decimals`, `symbol`, `name`, `totalSupply`, `transfer`, `approve`), a Post-Quantum Vault Settlement Anchor binding ML-KEM / ML-DSA risk attestations and XMSS hash-based signatures to `tUSD8` transfer calldata, a read-only JSON-RPC probe with deterministic offline simulation fallback, and EIP-1193 wallet helpers (`wallet_addEthereumChain`, `wallet_switchEthereumChain`, `eth_sendTransaction`). The anchor payload is canonically bound to chainId, token, payer, merchant, spend cap, a fresh random nonce, an enforced deadline, and the vault XMSS root; a seventeen-check verifier proves every binding, and the send path spends only verified payload fields, so a swapped `txRequest`, an expired deadline, a replayed anchor or a foreign-tree signature all fail closed.
- **FIPS 203 / 204 / 205 parameter matrix** (`src/parammatrix.js`): all eighteen approved parameter sets side by side, including the twelve officially named FIPS 205 SHA2 and SHAKE variants. Byte sizes are recomputed from the packing formulas in each standard and cross checked against the published values. Every row reports its official NIST security category and reference primitive (AES / SHA-2 resource bounds, not bit guarantees); a bit estimate appears only where the workbench estimator names the attack model that produced it, and the method is exposed per row. A deterministic operation-cost model counts NTT transforms, ring products, XOF absorbs and hash invocations closed-form in the parameters, including the FIPS 204 signing-repetition estimate and the full FIPS 205 hypertree hash workload audited against Algorithms 5-20 (every PRF, F, H, `T_len`/`T_k` compression and `PRF_msg`/`H_msg` framing call, with only the WOTS+ signature chain length charged at the uniform-digit expectation). A normalized latency index compares every set against ML-KEM-512 key generation.
- **One-click deterministic benchmark report** in JSON and CSV with explicit run parameters (seed, sweep count, cost-model version) and a SHA-256 fingerprint over the canonical payload, so the same inputs reproduce byte-identical exports. The CSV leads with a commented provenance block carrying the same seed, cost-model version, sweep count and the fingerprint labeled explicitly as the JSON payload SHA-256.
- **Deterministic hex test-vector exporter** producing a reproducible JSON bundle with copy and download controls. A second export produces the full verification bundle with every self check, the KEM sweep, the reduction certificate and the resource tables.
- **Quantum-migration and treasury policy comparator** (`src/migration-lab.js`): five deterministic migration regimes (`legacy-ecdsa`, `hybrid-ecdsa-mlkem768`, `hybrid-ecdsa-mldsa65`, `stateful-xmss-vault`, `stateless-slhdsa-128s`) evaluated against four treasury / UTXO profiles (`hot-treasury`, `high-freq-settlement`, `cold-reserve`, `qday-aevum-tusd8`) with editable volume controls. Every byte footprint, normalized work index, NIST category, and HNDL (harvest now, decrypt later) classification is recomputed live from `src/pqc.js` and `src/parammatrix.js`, and a Pareto frontier identifies the non-dominated regimes, plotted alongside all eighteen FIPS parameter sets on a log-log chart.
- **Adversarial tamper and forgery replay matrix**: 32 vectors run real engine operations rather than mocked checks: ML-KEM ciphertext bit flips, truncation, extension, non-array inputs, zero ciphertexts and wrong-key decapsulation all take the FO implicit-rejection path; WOTS+ chain and checksum forgeries are rejected; XMSS foreign-tree signatures, cross-root replays and leaf exhaustion fail closed; and mutated QDay `tUSD8` settlement anchors (wrong chainId, expired deadline, swapped `txRequest`, replayed nonce, forged display amounts) are rejected by named verification checks.
- **`#pqc=` bookmark hash codec** that serializes every workbench control into canonical JSON, UTF-8 and base64url, then restores the full state on reload. Decoding is fail-closed: hostile keys (`__proto__`, `constructor`, `prototype`), unknown controls and out-of-bounds values are dropped or clamped with a per-field report, and malformed payloads produce an error rather than partial state.
- **Cached SHA-256 audited brief exporter**: a single canonical digest-stamped object per state key backs the on-page fingerprint, the JSON download, the formula-safe CSV provenance header and the Markdown footer, so every surface shows the identical SHA-256. A tamper-check mutates a figure and proves verification catches it. Fifteen deterministic in-page self-tests cover the codec, the adversarial matrix, digest parity, XMSS exhaustion, WOTS+ forgery rejection and the latency and work derivations.

## Quick start

Open `index.html` in a browser. Or serve the folder:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

## Tests

```
npm test
```

Which runs:

```
node --test test/pqc.test.js test/analysis.test.js test/qday-aevum.test.js test/parammatrix.test.js test/migration-lab.test.js test/compliance.test.js
```

460 passing tests (108 core, 35 analysis, 46 QDay / Aevum integration, 105 parameter matrix and benchmark report, 148 migration lab, 18 compliance) cover NTT algebra, SHA-256, bit packing, error sampling, all four KEM parameter sets, WOTS+ and XMSS forgery resistance, security estimators, test-vector determinism, Montgomery and Barrett reduction, KEM correctness sweeps, exact byte accounting, the reproducible verification bundle, QDay / Aevum network constants, ERC-20 ABI encoding/decoding, PQC settlement anchor tamper detection, RPC parsing and offline simulation fallback, EIP-1193 wallet flows, the migration comparator, the adversarial replay matrix, the bookmark codec, audited brief digest parity, and repository compliance rules (no dashes, no model attributions, no private details, doc consistency, no banned page furniture).

The adversarial layer pins the failure modes a vault must survive: wrong-length or non-array ciphertexts take the FO implicit-rejection path; malformed WOTS+/XMSS signatures and Merkle proofs fail closed instead of throwing; settlement anchors carry a fresh nonce so identical inputs are not replayable; expired deadlines, wrong chainIds, swapped transaction requests, foreign-tree XMSS signatures, schema mismatches and forged display amounts are all rejected by named checks; and the wallet-facing send path consumes only the verified payload calldata and payer, so a mutated `txRequest` can never redirect funds.

Every anchor signs with a freshly generated XMSS tree whose seed is never the public demo seed. That means no WOTS+ leaf is reused across settlements: an attacker who reads the demo seed cannot rebuild the signing tree, and the verifier additionally rejects any root not issued by the current browser session. Before any wallet submission, the send path re-reads `eth_chainId` and refuses to broadcast unless the wallet actually sits on chain 44005, so a wallet that ignores the add/switch request never receives tUSD8 calldata. The hero exposes these guarantees as one-click Attack vs Defend / Replay demos computed live in the browser.

Individual suites:

```
npm run test:core         # 108 tests
npm run test:analysis     # 35 tests
npm run test:qday         # 46 tests
npm run test:matrix       # 105 tests
npm run test:lab          # 148 tests
npm run test:compliance   # 18 tests
```

## Library API

```
const pqc = require('./src/pqc.js');               // Node
const analysis = require('./src/analysis.js');     // Node
const qday = require('./src/qday-aevum.js');       // Node
const matrix = require('./src/parammatrix.js');    // Node
const lab = require('./src/migration-lab.js');     // Node
// or in the browser: window.PQC, window.PQCAnalysis, window.QDayAevum,
// window.PQCParamMatrix, window.PQCMigrationLab
```

Selected core functions: `ntt`, `inverseNTT`, `baseCaseMultiply`, `polyMul`, `schoolbookMul`, `sha256`, `xof`, `MLKEM`, `cbdSample`, `wotsGenerate`, `wotsSign`, `wotsVerify`, `XMSS`, `merkleRoot`, `groverIterations`, `shorQubits`, `securityReport`, `hybridSecurity`, `migrationRisk`, `exportTestVectors`.

Selected analysis functions: `montgomeryReduce`, `barrettReduce`, `reductionCertificate`, `nttCertificate`, `kemCorrectnessSweep`, `kemSizeTable`, `hybridMigrationTable`, `quantumResourceTable`, `hashSignatureSizes`, `verificationBundle`.

Selected QDay / Aevum functions: `NETWORK`, `CONTRACTS`, `SELECTORS`, `parseTokenUnits`, `formatTokenUnits`, `encodeBalanceOf`, `encodeTransfer`, `encodeApprove`, `decodeUint256`, `decodeUint8`, `decodeAbiString`, `decodeTransferCalldata`, `buildVaultAttestation`, `createSettlementAnchor`, `verifySettlementAnchor`, `rpcCall`, `probeTestnet`, `simulateTestnetProbe`, `buildAddChainParams`, `connectWallet`, `ensureAevumNetwork`, `sendTusd8Transfer`.

Selected parameter-matrix functions: `fipsParameterMatrix`, `benchmarkReport`, `reportCsv`, `mlKemSpecBytes`, `mlDsaSpecBytes`, `slhDsaSpecBytes`, `mlDsaExpectedAttempts`, `mlKemWorkProfile`, `mlDsaWorkProfile`, `slhDsaWorkProfile`, `securityEstimate`, `csvEscape`.

## QDay / Aevum Testnet Verification

Official testnet parameters verified live against `https://rpc-test.qday.info` on 2026-11-19:

| Parameter | Verified value |
| --- | --- |
| Network | QDay Aevum Testnet (`chainId: 44005` / `0xabe5`) |
| RPC endpoint | `https://rpc-test.qday.info` (CORS enabled) |
| Explorer | `https://explorer-test.qday.info` |
| Faucet | `https://faucet.qday.info/en` |
| `tUSD8` contract | `0x456569838f1d43009A91ebA4263147Afd7233483` |
| Live `eth_chainId` | `0xabe5` (`44005`) |
| Live `eth_blockNumber` | `0x3756d0` (`3626704`) |
| Live `tUSD8.symbol()` | `tUSD8` |
| Live `tUSD8.decimals()` | `6` |
| Live `tUSD8.totalSupply()` | `3227400` `tUSD8` (`3227400000000` raw units) |

Testnet tokens have no monetary value. Use a dedicated testnet-only account; never connect a mainnet wallet holding real funds.

## Scope and honesty

The ML-KEM implementation is an **educational** Module-LWE KEM. The ring arithmetic, NTT, centered-binomial noise, compression and FO-style decapsulation are real, but it is not FIPS 203 validated, not constant time, and not hardened against side channels. Do not use it to protect real funds. The point is to make the moving parts inspectable.

The analysis layer reports exact arithmetic over these educational primitives. The quantum resource figures are order-of-magnitude estimates built from exponent arithmetic, not hardware claims. The KEM correctness sweeps measure this implementation over the seeds shown in the UI; they are not a proof of security or a claim about FIPS 203 validated libraries. A simulated settlement send produces a deterministic settlement id and is labeled as such: it is never presented as an on-chain transaction hash, and no explorer link is fabricated for a transaction that was never broadcast. The vault attestation and XMSS tree derive from a public deterministic seed so every artifact is reproducible; that seed is a demo key, not a secret, and the resulting keypair must never custody real funds.

## Verification telemetry

The Verification section runs four independent computations in the browser: a 256-sample Montgomery and Barrett reduction certificate, a five-check NTT algebra certificate, a configurable multi-seed KEM correctness sweep, and exact byte and hybrid-security tables. The Vectors section exports a full verification bundle whose `selfChecks` object reports the outcome of every check. All figures on screen come from real computations performed at render time.

## Hackathon alignment

Built for the November 2026 DoraHacks builder challenges:

- **BCH BLAZE 2026** ($8,000, Nov 13 to Nov 22): a browser tool for reasoning about quantum exposure of Bitcoin Cash style UTXOs and migration to post-quantum or hybrid outputs.
- **Aevum QDay / Aevum Builder Challenge #1** ($1,500, Nov 16 to Dec 11): integrates live QDay Aevum testnet (`chainId: 44005`) read-only JSON-RPC probing, pure JS `tUSD8` ERC-20 ABI encoding/decoding, EIP-1193 wallet support, and a verifiable Post-Quantum Vault Settlement Anchor binding ML-KEM / ML-DSA risk metadata and XMSS signatures to `tUSD8` payment payloads.

## License

MIT. See `LICENSE`.
