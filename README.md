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
- **QDay / Aevum Testnet (`tUSD8`) integration** (`src/qday-aevum.js`): official Aevum testnet parameters (`chainId: 44005` / `0xabe5`, RPC `https://rpc-test.qday.info`, official `tUSD8` ERC-20 `0x456569838f1d43009A91ebA4263147Afd7233483`, explorer and faucet links), pure JS ERC-20 ABI encoders/decoders (`balanceOf`, `decimals`, `symbol`, `name`, `totalSupply`, `transfer`, `approve`), a Post-Quantum Vault Settlement Anchor binding ML-KEM / ML-DSA risk attestations and XMSS hash-based signatures to `tUSD8` transfer calldata with spend-cap enforcement, a read-only JSON-RPC probe with deterministic offline simulation fallback, and EIP-1193 wallet helpers (`wallet_addEthereumChain`, `wallet_switchEthereumChain`, `eth_sendTransaction`).
- **Deterministic hex test-vector exporter** producing a reproducible JSON bundle with copy and download controls. A second export produces the full verification bundle with every self check, the KEM sweep, the reduction certificate and the resource tables.

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
node --test test/pqc.test.js test/analysis.test.js test/qday-aevum.test.js test/compliance.test.js
```

153 passing tests (94 core, 30 analysis, 19 QDay / Aevum integration, 10 compliance) cover NTT algebra, SHA-256, bit packing, error sampling, all four KEM parameter sets, WOTS+ and XMSS forgery resistance, security estimators, test-vector determinism, Montgomery and Barrett reduction, KEM correctness sweeps, exact byte accounting, the reproducible verification bundle, QDay / Aevum network constants, ERC-20 ABI encoding/decoding, PQC settlement anchor tamper detection, RPC parsing and offline simulation fallback, EIP-1193 wallet flows, and repository compliance rules (no dashes, no model attributions, no private details, doc consistency).

Individual suites:

```
npm run test:core         # 94 tests
npm run test:analysis     # 30 tests
npm run test:qday         # 19 tests
npm run test:compliance   # 10 tests
```

## Library API

```
const pqc = require('./src/pqc.js');               // Node
const analysis = require('./src/analysis.js');     // Node
const qday = require('./src/qday-aevum.js');       // Node
// or in the browser: window.PQC, window.PQCAnalysis, window.QDayAevum
```

Selected core functions: `ntt`, `inverseNTT`, `baseCaseMultiply`, `polyMul`, `schoolbookMul`, `sha256`, `xof`, `MLKEM`, `cbdSample`, `wotsGenerate`, `wotsSign`, `wotsVerify`, `XMSS`, `merkleRoot`, `groverIterations`, `shorQubits`, `securityReport`, `hybridSecurity`, `migrationRisk`, `exportTestVectors`.

Selected analysis functions: `montgomeryReduce`, `barrettReduce`, `reductionCertificate`, `nttCertificate`, `kemCorrectnessSweep`, `kemSizeTable`, `hybridMigrationTable`, `quantumResourceTable`, `hashSignatureSizes`, `verificationBundle`.

Selected QDay / Aevum functions: `NETWORK`, `CONTRACTS`, `SELECTORS`, `parseTokenUnits`, `formatTokenUnits`, `encodeBalanceOf`, `encodeTransfer`, `encodeApprove`, `decodeUint256`, `decodeUint8`, `decodeAbiString`, `decodeTransferCalldata`, `buildVaultAttestation`, `createSettlementAnchor`, `verifySettlementAnchor`, `rpcCall`, `probeTestnet`, `simulateTestnetProbe`, `buildAddChainParams`, `connectWallet`, `ensureAevumNetwork`, `sendTusd8Transfer`.

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

The analysis layer reports exact arithmetic over these educational primitives. The quantum resource figures are order-of-magnitude estimates built from exponent arithmetic, not hardware claims. The KEM correctness sweeps measure this implementation over the seeds shown in the UI; they are not a proof of security or a claim about FIPS 203 validated libraries.

## Verification telemetry

The Verification section runs four independent computations in the browser: a 256-sample Montgomery and Barrett reduction certificate, a five-check NTT algebra certificate, a configurable multi-seed KEM correctness sweep, and exact byte and hybrid-security tables. The Vectors section exports a full verification bundle whose `selfChecks` object reports the outcome of every check. All figures on screen come from real computations performed at render time.

## Hackathon alignment

Built for the November 2026 DoraHacks builder challenges:

- **BCH BLAZE 2026** ($8,000, Nov 13 to Nov 22): a browser tool for reasoning about quantum exposure of Bitcoin Cash style UTXOs and migration to post-quantum or hybrid outputs.
- **Aevum QDay / Aevum Builder Challenge #1** ($1,500, Nov 16 to Dec 11): integrates live QDay Aevum testnet (`chainId: 44005`) read-only JSON-RPC probing, pure JS `tUSD8` ERC-20 ABI encoding/decoding, EIP-1193 wallet support, and a verifiable Post-Quantum Vault Settlement Anchor binding ML-KEM / ML-DSA risk metadata and XMSS signatures to `tUSD8` payment payloads.

## License

MIT. See `LICENSE`.
