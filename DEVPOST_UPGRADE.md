# PQC Vault Bench: Upgrade Notes and Devpost Copy

Target: Aevum QDay Builder Challenge #1 ($1,500, opens Nov 16 CST) and BCH BLAZE 2026.

## Verified test results

Command, run from the repo root:

```
npm test
```

Which expands to:

```
node --test test/pqc.test.js test/analysis.test.js test/qday-aevum.test.js test/parammatrix.test.js test/compliance.test.js
```

Actual result: **276 tests, 276 pass, 0 fail.**

| Suite | Tests | What it locks |
| --- | --- | --- |
| `test/pqc.test.js` | 100 | NTT algebra, SHA-256, packing, CBD sampling, four KEM sets, WOTS+/XMSS forgery resistance, security estimators, vector determinism, malformed-input fail-closed decapsulation and signature verification, latent P2PKH exposure scoring |
| `test/analysis.test.js` | 30 | Montgomery/Barrett reduction, NTT certificate, KEM correctness sweeps, byte accounting, hybrid envelopes, quantum resources, verification bundle |
| `test/qday-aevum.test.js` | 34 | QDay Aevum testnet constants (`44005` / `0xabe5`), pure JS `tUSD8` ABI encoding/decoding, PQC vault settlement anchor verification and tamper detection, replay-resistant nonces, deadline expiry, XMSS root binding, txRequest binding, schema and chain domain separation, JSON-RPC client and offline fallback, EIP-1193 wallet flows, UI wiring |
| `test/parammatrix.test.js` | 97 | All eighteen FIPS 203/204/205 parameter-set byte derivations against published sizes (including the twelve named SHA2 and SHAKE SLH-DSA variants), NIST category/reference reporting with bit figures only where a named model produces them, the deterministic operation-cost model (NTT, ring products, XOF absorbs, hash invocations) with the FIPS 205 sign and verify hash counts audited against Algorithms 14-17 and 19-20 (every FORS secret-value PRF, the T_k root compression and the PRF_msg / H_msg framing), the FIPS 204 signing-repetition estimate, SLH-DSA sign/verify asymmetry, the fingerprinted JSON benchmark report, the provenance-block CSV export, and caption-preserving table rendering |
| `test/compliance.test.js` | 15 | Zero dashes, zero model attributions, zero private details, docs consistent with the real count, no static network calls, no smooth scroll, titles stand alone, honest simulated sends, local favicon |

Honesty harness: `python3 hark_honesty_and_defect_harness.py --audit repos/pqc-vault-bench --project pqc-vault-bench` reports **0 violations**.

## Architecture highlights

- `src/pqc.js` (unchanged core): the Kyber ring NTT, an educational Module-LWE KEM with all four FIPS-named parameter sets, WOTS+, XMSS, SHA-256, the Grover/Shor estimator and the deterministic hex test-vector exporter.
- `src/analysis.js` (new): a pure analysis layer over the core. Montgomery and Barrett reduction with a computed `N_PRIME`, a five-property NTT certificate (round trip, additivity, convolution theorem, `x^256 = -1` in both domains), a seeded KEM correctness sweep that counts decryption failures and implicit rejections, exact byte accounting for every KEM set and both hash signatures, a hybrid migration table, quantum resource estimates, and `verificationBundle()` which ties everything into one reproducible JSON object with a `selfChecks` map.
- `src/qday-aevum.js` (new): zero-dependency QDay Aevum testnet (`chainId: 44005`) and `tUSD8` (`0x456569838f1d43009A91ebA4263147Afd7233483`) integration module with pure JS ERC-20 ABI encoders/decoders, a PQC Vault Settlement Anchor whose canonical payload binds chainId, token, payer, merchant, spend cap, a fresh nonce, an enforced deadline and the vault XMSS root to `tUSD8` transfer calldata, a seventeen-check verifier that rejects swapped transaction requests, replayed anchors, expired deadlines and foreign-tree signatures, a read-only JSON-RPC probe with deterministic offline simulation fallback, and EIP-1193 wallet helpers.
- `src/parammatrix.js` (new): the FIPS 203 / 204 / 205 parameter matrix covering all eighteen approved parameter sets, including the twelve officially named FIPS 205 SHA2 and SHAKE variants. Byte accounting is recomputed from the packing formulas in each standard and cross checked against published sizes; every row reports its NIST security category and reference primitive, and a bit estimate appears only where the workbench estimator names its attack model; a deterministic operation-cost model counts NTT transforms, ring products, XOF absorbs and hash invocations closed-form in the parameters, including the FIPS 204 signing-repetition estimate (about 4.26 / 5.09 / 3.85 attempts for ML-DSA-44/65/87) and the full FIPS 205 hypertree sign and verify workload audited against Algorithms 5-20. `benchmarkReport()` emits a reproducible JSON bundle with explicit run parameters, a version stamp and a SHA-256 fingerprint; `reportCsv()` emits the flat CSV export preceded by a commented provenance block (seed, cost-model version, sweep count, and the digest labeled as the JSON payload fingerprint) with formula-injection-safe escaping.
- `src/domtable.js` (new): a small accessible data-table renderer that rebuilds only the thead and tbody on every render, so each table's screen-reader caption node stays intact in the DOM.
- `app.js` and `index.html`: Verification section and interactive QDay Aevum Testnet (`tUSD8`) panel with live RPC probe, wallet connect/switch, settlement anchor builder, tamper check, and simulated/wallet transfer execution. A new Matrix section renders the eighteen-row parameter matrix with standard/sort/metric controls, per-row NIST category, reference primitive and named security method, a one-click JSON and CSV benchmark export, and full keyboard navigation: a skip link, focusable chart bars with the same tooltips as hover, Escape-to-dismiss, an aria-live announcer for computed results and self-healing invalid-input recovery.
- `style.css`: small additions for the data tables, a screen-reader-only caption class, a section subhead, the skip link and focus-visible keyboard styles. No new dependency, no build step, no network call.

Every number shown in the UI is computed at render time from the primitives above. Nothing is asserted without a computation behind it.

## What is honest

- The KEM is educational: real lattice arithmetic, not FIPS 203 validated, not constant time. The README says so and the analysis layer repeats it.
- A correctness sweep over N seeds is a measurement of this implementation on those seeds, not a security proof. The UI labels it as a count out of the seeds run.
- Quantum resource figures are order-of-magnitude estimates from exponent arithmetic, not hardware benchmarks.
- Test counts, byte counts, self-check results, and QDay Aevum testnet RPC readings (`chainId: 44005`, `tUSD8` symbol, decimals, and total supply) come from the live runs and suites listed above. No mainnet deployment, human trial, or partnership claim appears anywhere.

## Devpost description

**PQC Vault Bench** is a browser workbench for the cryptography behind post-quantum UTXO migration, built for Aevum QDay. It makes the moving parts of a migration decision inspectable: run Kyber-ring NTT arithmetic against an O(n^2) schoolbook reference, execute a Module-LWE key encapsulation across all four FIPS-named parameter sets, sign a transaction with stateful WOTS+ and XMSS, and quantify what Shor and Grover actually do to a Bitcoin-style public key.

The upgrade adds a verification layer built from real arithmetic rather than claims. Montgomery and Barrett reduction are checked against plain modular reduction over hundreds of products. A five-check NTT certificate verifies invertibility, additivity, the convolution theorem and the negacyclic rule. A configurable multi-seed KEM sweep counts decryption failures and confirms Fujisaki-Okamoto implicit rejection on every tampered ciphertext. Exact key, ciphertext and signature byte tables, a hybrid migration bit-security envelope, and quantum resource estimates all derive from the implementation itself. A full verification bundle exports every self check as reproducible JSON.

A third layer puts all three NIST standards side by side: all eighteen approved FIPS 203, 204 and 205 parameter sets, including the twelve officially named SHA2 and SHAKE SLH-DSA variants, with byte sizes recomputed from the packing formulas (cross checked against the published tables), the NIST security category and reference primitive for every set, bit estimates only where a named attack model produces them, and a deterministic operation-cost model that counts NTT transforms, ring products, XOF absorbs and hash invocations closed-form in the parameters, including the FIPS 205 sign and verify hash counts audited per Algorithms 5-20, FORS secret-value PRFs, T_k root compression and PRF_msg / H_msg included. The model reproduces the FIPS 204 signing-repetition counts and shows exactly why the SLH-DSA small variants trade signing speed for signature size. A one-click benchmark report exports the same data as fingerprinted JSON or provenance-block CSV, byte-identical for identical run parameters.

Zero dependencies, zero build step. 276 passing tests across five suites, including adversarial regression tests that prove a swapped transaction request, a replayed anchor, an expired deadline or a foreign-tree XMSS signature all fail closed, plus a compliance suite that locks the no-dash and no-attribution rules. Everything runs locally in the browser with optional user-triggered read-only QDay Aevum testnet RPC queries and EIP-1193 wallet integration, and the whole project stays explicitly educational: this is a tool for reasoning about post-quantum migration and testnet settlement workflows, not a library for protecting real funds.

## Devpost bullets

- Real Kyber-ring mathematics: seven-stage Cooley-Tukey NTT, base-case multiplication, schoolbook cross-check, FIPS 203 zeta roots, plus Montgomery and Barrett reduction verified against plain modular arithmetic.
- Educational ML-KEM with four FIPS-named parameter sets, centered-binomial noise, ciphertext compression, and a measured correctness sweep that counts decryption failures and implicit rejections over independent seeds.
- WOTS+ one-time signatures and a stateful XMSS Merkle tree, with exact signature byte accounting and forgery-resistance tests.
- QDay Aevum testnet (`chainId: 44005`) and `tUSD8` integration: live read-only JSON-RPC probe with deterministic offline fallback, pure JS ERC-20 ABI calldata generation, EIP-1193 wallet helpers, and a verifiable Post-Quantum Vault Settlement Anchor with spend-cap checks and tamper detection.
- Full FIPS 203 / 204 / 205 parameter matrix: all eighteen approved sets with spec-derived byte accounting, official NIST categories and reference primitives, named bit estimates only where a model produces them, a deterministic operation-cost model, and one-click fingerprinted JSON and provenance-block CSV benchmark reports.
- Accessible and keyboard navigable: skip link, focusable chart marks, aria-live result announcements, caption-preserving table rendering, and self-healing invalid input.
- Honest and reproducible: 276 passing tests, 0 violations on the local honesty harness, zero dependencies, and a plainly stated educational scope boundary.

## Submission checklist

- [x] Tests pass: 276 of 276.
- [x] Honesty harness: 0 violations.
- [x] No em dashes or en dashes in any file.
- [x] No model attributions or model names in any file.
- [x] README updated with accurate counts, live QDay RPC verification, and scope.
- [x] DEVPOST_UPGRADE.md updated with verified counts and copy.
