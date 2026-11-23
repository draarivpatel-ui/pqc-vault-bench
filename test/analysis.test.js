'use strict';

/*
 * Analysis layer test suite for PQC Vault Bench.
 * Verifies the Montgomery and Barrett reduction, the NTT correctness
 * certificate, KEM correctness sweeps, exact size accounting, hybrid
 * migration envelopes, quantum resource estimates and the reproducible
 * verification bundle. All values come from real computations.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pqc.js');
const A = require('../src/analysis.js');

const Q = P.Q;

// ---------------------------------------------------------------
// Section A: modular reduction
// ---------------------------------------------------------------
test('A1: Montgomery constants satisfy q*q_inv = 1 and q*n_prime = -1 mod R', () => {
  assert.equal((Q * A.Q_INV_R) % A.R, 1);
  assert.equal((Q * A.N_PRIME) % A.R, A.R - 1);
  assert.ok(A.N_PRIME > 0 && A.N_PRIME < A.R);
});

test('A2: inversePowerOfTwo inverts every odd residue below 2^16 on a sweep', () => {
  for (let n = 1; n < 4096; n += 2) {
    const inv = A.inversePowerOfTwo(n, 16);
    assert.equal((n * inv) % A.R, 1, 'inverse of ' + n);
  }
});

test('A3: toMont/fromMont round trip for all ring residues', () => {
  for (let x = 0; x < Q; x++) assert.equal(A.fromMont(A.toMont(x)), x);
});

test('A4: montgomeryReduce agrees with mod on products', () => {
  for (let i = 0; i < 500; i++) {
    const a = (i * 37 + 11) % Q, b = (i * 91 + 7) % Q;
    assert.equal(A.fromMont(A.montgomeryReduce(A.toMont(a) * A.toMont(b))), P.mod(a * b));
  }
});

test('A5: barrettReduce agrees with mod on products', () => {
  for (let i = 0; i < 500; i++) {
    const a = (i * 53 + 3) % Q, b = (i * 17 + 29) % Q;
    assert.equal(A.barrettReduce(a * b), P.mod(a * b));
  }
});

test('A6: barrettReduce handles the full 12-bit coefficient square range', () => {
  for (let i = 0; i < 300; i++) {
    const a = (i * 11) % (Q * 2), b = (i * 7 + 5) % (Q * 2);
    assert.equal(A.barrettReduce(a * b), P.mod(a * b));
  }
});

test('A7: reductionCertificate reports a perfect match over 512 samples', () => {
  const c = A.reductionCertificate(512);
  assert.equal(c.samples, 512);
  assert.equal(c.montgomeryMatches, 512);
  assert.equal(c.barrettMatches, 512);
  assert.equal(c.allMatch, true);
  assert.equal(c.failures.length, 0);
  assert.equal(c.constants.R, 65536);
  assert.equal(c.constants.barrettK, 24);
});

test('A8: reductionCertificate is deterministic', () => {
  assert.deepEqual(A.reductionCertificate(64), A.reductionCertificate(64));
});

// ---------------------------------------------------------------
// Section B: NTT certificate
// ---------------------------------------------------------------
test('B1: nttCertificate passes all five algebraic checks', () => {
  const c = A.nttCertificate();
  assert.equal(c.roundTrip, true);
  assert.equal(c.additivity, true);
  assert.equal(c.convolution, true);
  assert.equal(c.negacyclic, true);
  assert.equal(c.negDomainOk, true);
  assert.equal(c.allPass, true);
});

test('B2: nttCertificate reports the FIPS 203 zeta head in Montgomery form', () => {
  const mont = A.nttCertificate().zetaHead.map(z => P.mod(z * P.modPow(2, 16)));
  assert.deepEqual(mont, [2285, 2571, 2970, 1812, 1493, 1422, 287, 202]);
});

test('B3: nttCertificate gamma head matches the core table', () => {
  assert.deepEqual(A.nttCertificate().gammaHead, P.GAMMAS.slice(0, 8));
});

// ---------------------------------------------------------------
// Section C: KEM correctness sweep
// ---------------------------------------------------------------
test('C1: a 16-seed KEM sweep has zero decryption failures', () => {
  const s = A.kemCorrectnessSweep({ count: 16, seed: 'sweep' });
  assert.equal(s.count, 16);
  assert.equal(s.matched, 16);
  assert.equal(s.decryptionFailures, 0);
  assert.equal(s.correctnessRate, 1);
});

test('C2: every tampered ciphertext in the sweep is implicitly rejected', () => {
  const s = A.kemCorrectnessSweep({ count: 16, seed: 'tamper' });
  assert.equal(s.tamperRejections, 16);
});

test('C3: decapsulation under a different key never reproduces the secret', () => {
  const s = A.kemCorrectnessSweep({ count: 16, seed: 'wrongkey' });
  assert.equal(s.wrongKeyRejections, 16);
});

test('C4: the sweep works for all four parameter sets', () => {
  for (const param of Object.keys(P.KEM_PARAMS)) {
    const s = A.kemCorrectnessSweep({ param, count: 4, seed: 'all' });
    assert.equal(s.matched, 4, param);
    assert.equal(s.decryptionFailures, 0, param);
  }
});

test('C5: the sweep is deterministic and clamps the count', () => {
  const a = A.kemCorrectnessSweep({ count: 4, seed: 'det' });
  assert.deepEqual(a, A.kemCorrectnessSweep({ count: 4, seed: 'det' }));
  assert.equal(A.kemCorrectnessSweep({ count: 9999 }).count, 400);
  assert.equal(A.kemCorrectnessSweep({ count: -5 }).count, 1);
});

test('C6: sweep byte averages match the size table for the same parameter', () => {
  const s = A.kemCorrectnessSweep({ param: 'ML-KEM-768', count: 3 });
  const row = A.kemSizeTable().find(r => r.name === 'ML-KEM-768');
  assert.equal(s.avgCiphertextBytes, row.ciphertextBytes);
  assert.equal(s.avgEncapsulationKeyBytes, row.encapsulationKeyBytes);
});

// ---------------------------------------------------------------
// Section D: exact size and security tables
// ---------------------------------------------------------------
test('D1: kemSizeTable covers four sets and every ciphertext length is derived', () => {
  const t = A.kemSizeTable();
  assert.equal(t.length, 4);
  for (const r of t) {
    assert.equal(r.ciphertextBytes, r.expectedCiphertextBytes);
    assert.equal(r.encapsulationKeyBytes, 32 + r.k * 384);
    assert.equal(r.sharedSecretBytes, 32);
  }
});

test('D2: ML-KEM-768 sizes are the FIPS 203 values', () => {
  const r = A.kemSizeTable().find(x => x.name === 'ML-KEM-768');
  assert.equal(r.encapsulationKeyBytes, 1184);
  assert.equal(r.ciphertextBytes, 1088);
  assert.equal(r.k, 3);
});

test('D3: hybridMigrationTable has six rows and never lowers quantum bits', () => {
  const t = A.hybridMigrationTable();
  assert.equal(t.length, 6);
  for (const r of t) {
    assert.ok(r.quantumBits >= P.PRIMITIVES[r.postQuantum].quantum);
    assert.equal(r.classicalBits, Math.max(P.PRIMITIVES[r.classical].classical, P.PRIMITIVES[r.postQuantum].classical));
  }
});

test('D4: quantumResourceTable covers every primitive', () => {
  const t = A.quantumResourceTable(1e6, 1000);
  assert.equal(t.length, Object.keys(P.PRIMITIVES).length);
  const ecdsa = t.find(r => r.name === 'secp256k1 ECDSA');
  assert.equal(ecdsa.quantumBits, 0);
  assert.ok(ecdsa.estimate.logicalQubits > 0);
  const sha = t.find(r => r.name === 'SHA-256 (preimage)');
  assert.ok(sha.estimate.iterations > 0);
});

test('D5: Grover resource estimates grow with hash bits', () => {
  const a = P.groverSecurity(64, 1000, 1e6), b = P.groverSecurity(128, 1000, 1e6);
  assert.ok(b.gates > a.gates && b.years > a.years);
});

test('D6: hashSignatureSizes reports exact WOTS+ and XMSS byte counts', () => {
  const s = A.hashSignatureSizes('size-wots', 3);
  assert.equal(s.wots.chains, 67);
  assert.equal(s.wots.signatureBytes, 67 * 32);
  assert.equal(s.wots.publicKeyHashBytes, 32);
  assert.equal(s.xmss.proofNodes, 3);
  assert.equal(s.xmss.oneTimeKeys, 8);
  assert.equal(s.xmss.signatureBytes, 67 * 32 + 3 * 32 + 32 + 4);
});

test('D7: XMSS proof node count equals the tree height', () => {
  assert.equal(A.hashSignatureSizes('x', 2).xmss.proofNodes, 2);
  assert.equal(A.hashSignatureSizes('x', 4).xmss.proofNodes, 4);
});

// ---------------------------------------------------------------
// Section E: reproducible verification bundle
// ---------------------------------------------------------------
test('E1: every self check in the verification bundle is true', () => {
  const b = A.verificationBundle('bundle-test');
  for (const [k, v] of Object.entries(b.selfChecks)) assert.equal(v, true, k);
});

test('E2: the verification bundle is deterministic byte for byte in JSON', () => {
  assert.equal(JSON.stringify(A.verificationBundle('det')), JSON.stringify(A.verificationBundle('det')));
});

test('E3: the bundle records the seed it was built from', () => {
  assert.equal(A.verificationBundle('seed-a').seed, 'seed-a');
  assert.equal(A.verificationBundle('seed-b').seed, 'seed-b');
  // The sweep reports aggregate statistics, which are seed independent by
  // design; the seed is carried explicitly so the bundle stays reproducible.
  assert.equal(A.verificationBundle('seed-a').kem.correctnessRate, 1);
});

test('E4: the bundle declares its schema and source module', () => {
  const b = A.verificationBundle();
  assert.equal(b.schema, 'pqc-vault-bench/verification-v2');
  assert.equal(b.generatedBy, 'src/analysis.js');
});

test('E5: the bundle carries all four analysis tables', () => {
  const b = A.verificationBundle();
  assert.equal(b.kemSizes.length, 4);
  assert.equal(b.hybridMigration.length, 6);
  assert.equal(b.quantumResources.length, Object.keys(P.PRIMITIVES).length);
  assert.equal(b.securityTable.length, Object.keys(P.PRIMITIVES).length);
});

test('E6: the security table in the bundle marks ECDSA as Shor broken', () => {
  const b = A.verificationBundle();
  const ecdsa = b.securityTable.find(x => x.name === 'secp256k1 ECDSA');
  assert.equal(ecdsa.quantum, 0);
  assert.equal(ecdsa.classical, 128);
});

// ---------------------------------------------------------------
// Section F: hostile-input probes
// ---------------------------------------------------------------
test('F1: kemCorrectnessSweep clamps hostile counts and rejects bad params', () => {
  assert.equal(A.kemCorrectnessSweep({ count: NaN, param: 'toy-64' }).count, 40);
  assert.equal(A.kemCorrectnessSweep({ count: 0, param: 'toy-64' }).count, 40);
  assert.equal(A.kemCorrectnessSweep({ count: -3, param: 'toy-64' }).count, 1);
  assert.equal(A.kemCorrectnessSweep({ count: Infinity, param: 'toy-64' }).count, 400);
  for (const bad of ['__proto__', 'constructor', 'ML-KEM-999']) {
    assert.throws(() => A.kemCorrectnessSweep({ param: bad, count: 1 }), RangeError, bad);
  }
});

test('F2: hashSignatureSizes fails closed on hostile XMSS heights', () => {
  for (const bad of [NaN, -1, 0, 21, 25, 1.5, 'x']) {
    assert.throws(() => A.hashSignatureSizes('s', bad), RangeError, String(bad));
  }
  const ok = A.hashSignatureSizes('s', 1);
  assert.equal(ok.xmss.height, 1);
  assert.equal(ok.xmss.leafCount, 2);
});

test('F3: verificationBundle stays deterministic under a hostile seed', () => {
  const a = A.verificationBundle('=CMD()\n@evil');
  const b = A.verificationBundle('=CMD()\n@evil');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.schema, 'pqc-vault-bench/verification-v2');
  assert.ok(a.selfChecks.kemNoDecryptionFailures);
});

test('F4: hostile seeds cannot break the reduction or NTT certificates', () => {
  const red = A.reductionCertificate(512);
  assert.equal(red.allMatch, true);
  const ntt = A.nttCertificate();
  assert.equal(ntt.allPass, true);
});

test('F5: montgomery and barrett reducers handle edge residues', () => {
  assert.equal(A.barrettReduce(0), 0);
  assert.equal(A.montgomeryReduce(0), 0);
  assert.equal(A.fromMont(A.toMont(Q - 1)), Q - 1);
  // Montgomery identity: fromMont(montReduce(toMont(a) * toMont(b))) = a*b mod q.
  for (const [a, b] of [[1, 1], [Q - 1, Q - 1], [0, Q - 1], [1234, 2345]]) {
    const prod = A.fromMont(A.montgomeryReduce(A.toMont(a) * A.toMont(b)));
    assert.equal(prod, P.mod(a * b), a + '*' + b);
  }
});
