# PQC Vault Bench

A zero-dependency, interactive Post-Quantum Cryptography and UTXO Quantum-Migration Workbench. Everything runs in the browser with plain JavaScript: no build step, no npm packages, no network calls.

Live demo: https://aariv.me/pqc-vault-bench/

## What is inside

- **Number Theoretic Transform (NTT)** over the Kyber / ML-KEM ring `Z_3329[x]/(x^256+1)`. Seven Cooley-Tukey stages with base-case multiplication produce exact negacyclic convolution. Verified against an O(n^2) schoolbook reference. The precomputed zeta table matches the FIPS 203 Montgomery roots.
- **Module-LWE key encapsulation (ML-KEM)** with educational parameter sets carrying FIPS 203 names (`toy-64`, `ML-KEM-512`, `ML-KEM-768`, `ML-KEM-1024`). Centered-binomial error sampling, ciphertext compression, deterministic key generation, and Fujisaki-Okamoto style implicit rejection.
- **Error distribution visualizer** for the centered binomial distribution `Psi_eta`.
- **WOTS+** (Winternitz One-Time Signature) with `w=16`, 67 hash chains and a checksum that blocks forgery.
- **XMSS** stateful hash-based signatures: a Merkle tree of WOTS+ public keys, authentication paths, one-time key exhaustion and signature verification.
- **Grover / Shor security analyzer** for secp256k1 ECDSA, RSA-2048, SHA-256, ML-KEM-768, ML-DSA-65 and SLH-DSA-128s, plus a UTXO quantum-exposure risk scorer and hybrid-signature analysis.
- **Deterministic hex test-vector exporter** producing a reproducible JSON bundle with copy and download controls.

## Quick start

Open `index.html` in a browser. Or serve the folder:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

## Tests

```
node --test test/pqc.test.js
```

94 passing unit tests cover NTT algebra, SHA-256, bit packing, error sampling, all four KEM parameter sets, WOTS+ and XMSS forgery resistance, security estimators and test-vector determinism.

## Library API

```
const pqc = require('./src/pqc.js');          // Node
// or in the browser: window.PQC
```

Selected functions: `ntt`, `inverseNTT`, `baseCaseMultiply`, `polyMul`, `schoolbookMul`, `sha256`, `xof`, `MLKEM`, `cbdSample`, `wotsGenerate`, `wotsSign`, `wotsVerify`, `XMSS`, `merkleRoot`, `groverIterations`, `shorQubits`, `securityReport`, `hybridSecurity`, `migrationRisk`, `exportTestVectors`.

## Scope and honesty

The ML-KEM implementation is an **educational** Module-LWE KEM. The ring arithmetic, NTT, centered-binomial noise, compression and FO-style decapsulation are real, but it is not FIPS 203 validated, not constant time, and not hardened against side channels. Do not use it to protect real funds. The point is to make the moving parts inspectable.

## Hackathon alignment

Built for the November 2026 DoraHacks builder challenges:

- **BCH BLAZE 2026** ($8,000, Nov 13 to Nov 22): a browser tool for reasoning about quantum exposure of Bitcoin Cash style UTXOs and migration to post-quantum or hybrid outputs.
- **Aevum QDay / Aevum Builder Challenge #1** ($1,500, Nov 16 to Dec 11): QDay is a post-quantum EVM network, and this workbench is an educational companion for the cryptography behind post-quantum migration.

## License

MIT. See `LICENSE`.
