'use strict';

/*
 * FIPS parameter matrix and benchmark report test suite.
 * Locks the spec-derived byte accounting for all eighteen approved FIPS
 * 203/204/205 parameter sets, the deterministic operation-cost model,
 * the reproducible JSON/CSV benchmark report and its edge cases.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pqc.js');
const A = require('../src/analysis.js');
const M = require('../src/parammatrix.js');

// ---------------------------------------------------------------
// Section P: spec parameter tables and byte accounting
// ---------------------------------------------------------------
test('P1: ML_KEM_SPEC holds exactly the three approved sets', () => {
  assert.deepEqual(Object.keys(M.ML_KEM_SPEC), ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024']);
  assert.equal(M.ML_KEM_SPEC['ML-KEM-512'].k, 2);
  assert.equal(M.ML_KEM_SPEC['ML-KEM-768'].k, 3);
  assert.equal(M.ML_KEM_SPEC['ML-KEM-1024'].k, 4);
});

test('P2: ML-KEM-512 byte accounting matches FIPS 203', () => {
  const b = M.mlKemSpecBytes('ML-KEM-512');
  assert.equal(b.ekBytes, 800);
  assert.equal(b.dkBytes, 1632);
  assert.equal(b.ctBytes, 768);
});

test('P3: ML-KEM-768 byte accounting matches FIPS 203', () => {
  const b = M.mlKemSpecBytes('ML-KEM-768');
  assert.equal(b.ekBytes, 1184);
  assert.equal(b.dkBytes, 2400);
  assert.equal(b.ctBytes, 1088);
});

test('P4: ML-KEM-1024 byte accounting matches FIPS 203', () => {
  const b = M.mlKemSpecBytes('ML-KEM-1024');
  assert.equal(b.ekBytes, 1568);
  assert.equal(b.dkBytes, 3168);
  assert.equal(b.ctBytes, 1568);
});

test('P5: every ML-KEM derived size equals its published size', () => {
  for (const name of Object.keys(M.ML_KEM_SPEC)) {
    const p = M.ML_KEM_SPEC[name];
    const b = M.mlKemSpecBytes(name);
    assert.equal(b.ekBytes, p.ek, name);
    assert.equal(b.dkBytes, p.dk, name);
    assert.equal(b.ctBytes, p.ct, name);
  }
});

test('P6: ML-DSA params satisfy beta = tau * eta and integer gamma2', () => {
  for (const [name, p] of Object.entries(M.ML_DSA_PARAMS)) {
    assert.equal(p.beta, p.tau * p.eta, name);
    assert.ok(Number.isInteger(p.gamma2), name);
    assert.equal(p.gamma1 === 131072 || p.gamma1 === 524288, true, name);
  }
});

test('P7: ML-DSA public key sizes match the published table', () => {
  assert.equal(M.mlDsaSpecBytes('ML-DSA-44').pkBytes, 1312);
  assert.equal(M.mlDsaSpecBytes('ML-DSA-65').pkBytes, 1952);
  assert.equal(M.mlDsaSpecBytes('ML-DSA-87').pkBytes, 2592);
});

test('P8: ML-DSA secret key sizes match the published table', () => {
  assert.equal(M.mlDsaSpecBytes('ML-DSA-44').skBytes, 2560);
  assert.equal(M.mlDsaSpecBytes('ML-DSA-65').skBytes, 4032);
  assert.equal(M.mlDsaSpecBytes('ML-DSA-87').skBytes, 4896);
});

test('P9: ML-DSA signature sizes match the published table', () => {
  assert.equal(M.mlDsaSpecBytes('ML-DSA-44').sigBytes, 2420);
  assert.equal(M.mlDsaSpecBytes('ML-DSA-65').sigBytes, 3309);
  assert.equal(M.mlDsaSpecBytes('ML-DSA-87').sigBytes, 4627);
});

test('P10: every ML-DSA derived size equals its published size', () => {
  for (const [name, p] of Object.entries(M.ML_DSA_PARAMS)) {
    const b = M.mlDsaSpecBytes(name);
    assert.equal(b.pkBytes, p.pk, name);
    assert.equal(b.skBytes, p.sk, name);
    assert.equal(b.sigBytes, p.sig, name);
  }
});

test('P11: SLH_DSA_PARAMS holds the twelve officially named sets', () => {
  assert.deepEqual(Object.keys(M.SLH_DSA_PARAMS), [
    'SLH-DSA-SHA2-128s', 'SLH-DSA-SHA2-128f',
    'SLH-DSA-SHA2-192s', 'SLH-DSA-SHA2-192f',
    'SLH-DSA-SHA2-256s', 'SLH-DSA-SHA2-256f',
    'SLH-DSA-SHAKE-128s', 'SLH-DSA-SHAKE-128f',
    'SLH-DSA-SHAKE-192s', 'SLH-DSA-SHAKE-192f',
    'SLH-DSA-SHAKE-256s', 'SLH-DSA-SHAKE-256f'
  ]);
});

test('P11b: every SLH-DSA name declares the hash family it names', () => {
  for (const [name, p] of Object.entries(M.SLH_DSA_PARAMS)) {
    assert.equal(p.hashFamily, name.includes('-SHAKE-') ? 'SHAKE' : 'SHA2', name);
  }
});

test('P11c: SHA2 and SHAKE pairs share identical parameters and sizes', () => {
  for (const suffix of ['128s', '128f', '192s', '192f', '256s', '256f']) {
    const a = M.SLH_DSA_PARAMS['SLH-DSA-SHA2-' + suffix];
    const b = M.SLH_DSA_PARAMS['SLH-DSA-SHAKE-' + suffix];
    for (const k of ['n', 'h', 'd', 'hPrime', 'a', 'kFors', 'm', 'category', 'sig']) {
      assert.equal(b[k], a[k], suffix + ' ' + k);
    }
  }
});

test('P12: hypertree height splits evenly into d layers of hPrime', () => {
  for (const [name, p] of Object.entries(M.SLH_DSA_PARAMS)) {
    assert.equal(p.h, p.d * p.hPrime, name);
  }
});

test('P13: WOTS+ chain count is 2n + 3 at w = 16', () => {
  assert.equal(M.slhDsaLen(M.SLH_DSA_PARAMS['SLH-DSA-SHA2-128s']), 35);
  assert.equal(M.slhDsaLen(M.SLH_DSA_PARAMS['SLH-DSA-SHA2-192s']), 51);
  assert.equal(M.slhDsaLen(M.SLH_DSA_PARAMS['SLH-DSA-SHA2-256s']), 67);
  assert.equal(M.slhDsaLen(M.SLH_DSA_PARAMS['SLH-DSA-SHAKE-256f']), 67);
});

test('P14: the digest field m recomputes the Table 2 column for all sets', () => {
  for (const [name, p] of Object.entries(M.SLH_DSA_PARAMS)) {
    assert.equal(M.slhDsaM(p), p.m, name);
  }
});

test('P15: SLH-DSA signature formula reproduces all twelve published sizes', () => {
  const want = { '128s': 7856, '128f': 17088, '192s': 16224, '192f': 35664, '256s': 29792, '256f': 49856 };
  for (const name of Object.keys(M.SLH_DSA_PARAMS)) {
    const suffix = name.split('-').slice(3).join('-');
    assert.equal(M.slhDsaSpecBytes(name).sigBytes, want[suffix], name);
  }
});

test('P16: SLH-DSA public and secret key sizes are 2n and 4n', () => {
  for (const [name, p] of Object.entries(M.SLH_DSA_PARAMS)) {
    const b = M.slhDsaSpecBytes(name);
    assert.equal(b.pkBytes, 2 * p.n, name);
    assert.equal(b.skBytes, 4 * p.n, name);
  }
});

test('P17: SLH signature splits into R, FORS and hypertree parts', () => {
  for (const name of Object.keys(M.SLH_DSA_PARAMS)) {
    const p = M.SLH_DSA_PARAMS[name];
    const b = M.slhDsaSpecBytes(name);
    assert.equal(b.sigBytes, p.n + b.forsSigBytes + b.htSigBytes, name);
  }
});

test('P18: fast variants sign smaller trees but carry larger signatures', () => {
  for (const fam of ['SHA2', 'SHAKE']) {
    for (const [s, f] of [['128s', '128f'], ['192s', '192f'], ['256s', '256f']]) {
      const a = 'SLH-DSA-' + fam + '-' + s, b = 'SLH-DSA-' + fam + '-' + f;
      assert.ok(M.slhDsaSpecBytes(a).sigBytes < M.slhDsaSpecBytes(b).sigBytes, a + ' < ' + b);
    }
  }
});

test('P19: packBytes handles exact and inexact bit widths', () => {
  assert.equal(M.packBytes(256, 8), 256);
  assert.equal(M.packBytes(256, 3), 96);
  assert.equal(M.packBytes(256, 13), 416);
  assert.equal(M.packBytes(256, 18), 576);
});

test('P20: unknown parameter names fail closed with RangeError', () => {
  assert.throws(() => M.mlKemSpecBytes('ML-KEM-256'), RangeError);
  assert.throws(() => M.mlDsaSpecBytes('ML-DSA-99'), RangeError);
  assert.throws(() => M.slhDsaSpecBytes('SLH-DSA-512x'), RangeError);
  assert.throws(() => M.slhDsaSpecBytes('SLH-DSA-128s'), RangeError);
  assert.throws(() => M.mlKemWorkProfile('nope'), RangeError);
  assert.throws(() => M.mlDsaWorkProfile('nope'), RangeError);
  assert.throws(() => M.slhDsaWorkProfile('nope'), RangeError);
});

// ---------------------------------------------------------------
// Section S: security levels (NIST categories vs bit estimates)
// ---------------------------------------------------------------
test('S1: implemented schemes report the workbench estimator with a named model', () => {
  const s = M.securityEstimate('ML-KEM-768', 3);
  assert.equal(s.method, 'workbench-estimator');
  assert.equal(s.estimateModel, 'lattice reduction');
  assert.equal(s.classical, 164);
  assert.equal(s.quantum, 149);
  assert.equal(s.category, 3);
  assert.equal(s.referencePrimitive, 'AES-192 key search');
});

test('S2: both SLH-DSA 128s families map to the shared estimator entry', () => {
  for (const name of ['SLH-DSA-SHA2-128s', 'SLH-DSA-SHAKE-128s']) {
    const s = M.securityEstimate(name, 1);
    assert.equal(s.method, 'workbench-estimator', name);
    assert.equal(s.estimateModel, 'Grover', name);
    assert.equal(s.quantum, 128, name);
    assert.equal(s.referencePrimitive, 'AES-128 key search', name);
  }
});

test('S3: uncovered sets report the NIST category and reference, never bits', () => {
  assert.deepEqual(M.securityEstimate('ML-KEM-512', 1), {
    category: 1, referencePrimitive: 'AES-128 key search',
    classical: null, quantum: null, method: 'nist-category', estimateModel: null
  });
  assert.deepEqual(M.securityEstimate('ML-KEM-1024', 5), {
    category: 5, referencePrimitive: 'AES-256 key search',
    classical: null, quantum: null, method: 'nist-category', estimateModel: null
  });
  assert.deepEqual(M.securityEstimate('ML-DSA-44', 2), {
    category: 2, referencePrimitive: 'SHA-256 collision search',
    classical: null, quantum: null, method: 'nist-category', estimateModel: null
  });
});

test('S4: every matrix row names its category reference; only estimator rows carry bits', () => {
  const seen = new Set();
  for (const r of M.fipsParameterMatrix()) {
    seen.add(r.security.referencePrimitive);
    assert.ok(r.category >= 1 && r.category <= 5, r.name);
    assert.ok(M.CATEGORY_REFERENCE[r.category], r.name);
    assert.equal(r.security.referencePrimitive, M.CATEGORY_REFERENCE[r.category], r.name);
    if (r.security.method === 'workbench-estimator') {
      assert.ok(r.security.quantum >= 128, r.name);
      assert.ok(r.security.classical >= r.security.quantum, r.name);
      assert.ok(r.security.estimateModel, r.name);
    } else {
      assert.equal(r.security.method, 'nist-category', r.name);
      assert.equal(r.security.classical, null, r.name);
      assert.equal(r.security.quantum, null, r.name);
      assert.equal(r.security.estimateModel, null, r.name);
    }
  }
  assert.ok(seen.has('AES-128 key search'));
  assert.ok(seen.has('SHA-256 collision search'));
  assert.ok(seen.has('AES-256 key search'));
});

test('S4b: no matrix row presents a category floor as quantum bits', () => {
  // The reviewed defect: category rows used to emit 128/256 as quantum
  // bits under 'nist-category-floor'. That method and those figures are
  // gone entirely.
  for (const r of M.fipsParameterMatrix()) {
    assert.notEqual(r.security.method, 'nist-category-floor', r.name);
    if (r.security.method === 'nist-category') {
      assert.equal(r.security.quantum, null, r.name);
      assert.equal(r.security.classical, null, r.name);
    }
  }
});

test('S5: an unknown NIST category is rejected', () => {
  assert.throws(() => M.securityEstimate('ghost', 7), RangeError);
});

// ---------------------------------------------------------------
// Section W: deterministic operation-cost model
// ---------------------------------------------------------------
test('W1: ML-KEM keygen NTT count follows k^2 + 2k', () => {
  assert.equal(M.mlKemWorkProfile('ML-KEM-512').keygen.nttForward, 8);
  assert.equal(M.mlKemWorkProfile('ML-KEM-768').keygen.nttForward, 15);
  assert.equal(M.mlKemWorkProfile('ML-KEM-1024').keygen.nttForward, 24);
});

test('W2: ML-KEM decapsulation is encapsulation plus key recovery', () => {
  for (const name of Object.keys(M.ML_KEM_SPEC)) {
    const w = M.mlKemWorkProfile(name);
    const k = M.ML_KEM_SPEC[name].k;
    assert.equal(w.decaps.nttForward, w.encaps.nttForward + k, name);
    assert.equal(w.decaps.polyProduct, w.encaps.polyProduct + k, name);
    assert.ok(M.workUnits(w.decaps) > M.workUnits(w.encaps), name);
  }
});

test('W3: ML-KEM work units are pinned to exact computed values', () => {
  assert.equal(M.workUnits(M.mlKemWorkProfile('ML-KEM-512').keygen), 221);
  assert.equal(M.workUnits(M.mlKemWorkProfile('ML-KEM-768').encaps), 458);
});

test('W4: ML-KEM work grows with the security category', () => {
  for (const phase of ['keygen', 'encaps', 'decaps']) {
    const a = M.workUnits(M.mlKemWorkProfile('ML-KEM-512')[phase]);
    const b = M.workUnits(M.mlKemWorkProfile('ML-KEM-768')[phase]);
    const c = M.workUnits(M.mlKemWorkProfile('ML-KEM-1024')[phase]);
    assert.ok(a < b && b < c, phase);
  }
});

test('W5: ML-DSA-44 expects about 4.25 signing repetitions', () => {
  const e = M.mlDsaExpectedAttempts('ML-DSA-44');
  assert.ok(e.expectedAttempts > 4.0 && e.expectedAttempts < 4.6, e.expectedAttempts);
  assert.ok(e.pAccept > 0 && e.pAccept < 1);
});

test('W6: ML-DSA-65 expects about 5.1 signing repetitions', () => {
  const e = M.mlDsaExpectedAttempts('ML-DSA-65');
  assert.ok(e.expectedAttempts > 4.8 && e.expectedAttempts < 5.4, e.expectedAttempts);
});

test('W7: ML-DSA-87 expects about 3.85 signing repetitions', () => {
  const e = M.mlDsaExpectedAttempts('ML-DSA-87');
  assert.ok(e.expectedAttempts > 3.6 && e.expectedAttempts < 4.2, e.expectedAttempts);
});

test('W8: ML-DSA sign cost scales the per-attempt profile by repetitions', () => {
  const w = M.mlDsaWorkProfile('ML-DSA-65');
  assert.equal(w.sign.nttForward, w.signPerAttempt.nttForward * w.expectedAttempts);
  assert.ok(M.workUnits(w.sign) > M.workUnits(w.verify));
});

test('W9: ML-DSA verification is cheaper than signing', () => {
  for (const name of Object.keys(M.ML_DSA_PARAMS)) {
    const w = M.mlDsaWorkProfile(name);
    assert.ok(M.workUnits(w.verify) < M.workUnits(w.sign), name);
  }
});

test('W10: SLH small variants cost far more sign hashes than fast ones', () => {
  for (const fam of ['SHA2', 'SHAKE']) {
    for (const [s, f] of [['128s', '128f'], ['192s', '192f'], ['256s', '256f']]) {
      const a = 'SLH-DSA-' + fam + '-' + s, b = 'SLH-DSA-' + fam + '-' + f;
      assert.ok(M.slhDsaWorkProfile(a).sign.hashCalls > M.slhDsaWorkProfile(b).sign.hashCalls, a);
    }
  }
});

test('W11: SLH-DSA-SHA2-128s sign cost is pinned to the exact hash count', () => {
  // 14 FORS trees of height 12 plus 7 hypertree layers of 512-leaf XMSS
  // trees with 35-chain WOTS+ keys and one T_len leaf compression per
  // leaf: a real structural figure.
  assert.equal(M.slhDsaWorkProfile('SLH-DSA-SHA2-128s').sign.hashCalls, 2130712.5);
});

test('W11b: FIPS 205 Algorithm 6 counts one T_len compression per leaf', () => {
  // 512 WOTS+ leaves at 560 chain hash calls each (35 chains x w=16),
  // one T_len compression per leaf, then 511 internal node hashes:
  // 512 * (560 + 1) + 511 = 287743.
  const w = M.slhDsaWorkProfile('SLH-DSA-SHA2-128s');
  assert.equal(w.keygen.hashCalls, 287743);
  // SHAKE-128s shares the parameters, so the count is identical.
  assert.equal(M.slhDsaWorkProfile('SLH-DSA-SHAKE-128s').keygen.hashCalls, 287743);
  // Verify traces the same pseudocode: per layer the WOTS+ chain
  // completion, the T_len compression of the recovered key, and the h'
  // auth path node hashes.
  assert.equal(w.verify.hashCalls, 14 * (1 + 12) + 7 * (262.5 + 1 + 9));
});

test('W12: SLH verify is always at least an order cheaper than sign', () => {
  for (const name of Object.keys(M.SLH_DSA_PARAMS)) {
    const w = M.slhDsaWorkProfile(name);
    assert.ok(w.verify.hashCalls * 10 < w.sign.hashCalls, name);
  }
});

test('W13: workUnits weights each primitive class', () => {
  assert.equal(M.workUnits({ nttForward: 1 }), 4);
  assert.equal(M.workUnits({ polyProduct: 1 }), 4);
  assert.equal(M.workUnits({ sha256Calls: 1 }), 1);
  assert.equal(M.workUnits({ hashCalls: 1 }), 1);
  assert.equal(M.workUnits({}), 0);
});

test('W14: the latency index normalizes ML-KEM-512 keygen to 1', () => {
  const row = M.fipsParameterMatrix().find(r => r.name === 'ML-KEM-512');
  assert.equal(row.latencyIndex.keygen, 1);
});

test('W15: every work profile produces positive finite work units', () => {
  for (const r of M.fipsParameterMatrix()) {
    for (const phase of ['keygen', 'primary', 'secondary']) {
      assert.ok(Number.isFinite(r.workUnits[phase]) && r.workUnits[phase] > 0, r.name + ' ' + phase);
    }
  }
});

// ---------------------------------------------------------------
// Section M: the side-by-side matrix
// ---------------------------------------------------------------
test('M1: the matrix covers all eighteen approved parameter sets', () => {
  const m = M.fipsParameterMatrix();
  assert.equal(m.length, 18);
  assert.equal(new Set(m.map(r => r.name)).size, 18);
});

test('M2: standard coverage is 3 ML-KEM, 3 ML-DSA and 12 SLH-DSA sets', () => {
  const m = M.fipsParameterMatrix();
  assert.equal(m.filter(r => r.standard === 'FIPS 203').length, 3);
  assert.equal(m.filter(r => r.standard === 'FIPS 204').length, 3);
  assert.equal(m.filter(r => r.standard === 'FIPS 205').length, 12);
});

test('M2b: every FIPS 205 row carries its official SHA2 or SHAKE name', () => {
  const m = M.fipsParameterMatrix().filter(r => r.standard === 'FIPS 205');
  const sha2 = m.filter(r => r.params.hashFamily === 'SHA2');
  const shake = m.filter(r => r.params.hashFamily === 'SHAKE');
  assert.equal(sha2.length, 6);
  assert.equal(shake.length, 6);
  for (const r of m) {
    assert.match(r.name, /^SLH-DSA-(SHA2|SHAKE)-(128|192|256)(s|f)$/, r.name);
    assert.ok(r.name.includes('-' + r.params.hashFamily + '-'), r.name);
  }
});

test('M3: every row has a valid NIST category and role', () => {
  for (const r of M.fipsParameterMatrix()) {
    assert.ok([1, 2, 3, 4, 5].includes(r.category), r.name);
    assert.ok(r.role === 'kem' || r.role === 'signature', r.name);
  }
});

test('M4: every derived byte field matches its published figure', () => {
  for (const r of M.fipsParameterMatrix()) assert.equal(r.publishedBytesMatch, true, r.name);
});

test('M5: measured implementation sizes match spec for all KEM rows', () => {
  for (const r of M.fipsParameterMatrix().filter(x => x.role === 'kem')) {
    assert.equal(r.measuredMatchesSpec, true, r.name);
  }
});

test('M6: handshake totals equal public key plus payload bytes', () => {
  for (const r of M.fipsParameterMatrix()) {
    assert.equal(r.bytes.handshakeTotal, r.bytes.publicKey + r.bytes.payload, r.name);
  }
});

test('M7: every row names its operation labels and security method', () => {
  for (const r of M.fipsParameterMatrix()) {
    assert.ok(r.operationLabels.primary && r.operationLabels.secondary, r.name);
    assert.ok(['workbench-estimator', 'nist-category'].includes(r.security.method), r.name);
  }
});

test('M8: KEM rows label encapsulate and decapsulate, DSA rows sign and verify', () => {
  for (const r of M.fipsParameterMatrix()) {
    if (r.role === 'kem') assert.equal(r.operationLabels.primary, 'encapsulate');
    else assert.equal(r.operationLabels.primary, 'sign');
  }
});

test('M9: the matrix is deterministic across calls', () => {
  assert.deepEqual(M.fipsParameterMatrix(), M.fipsParameterMatrix());
});

test('M10: signature rows expose the SLH signature split only where it exists', () => {
  for (const r of M.fipsParameterMatrix()) {
    if (r.family === 'SLH-DSA') assert.ok(r.bytes.htSigBytes > 0 && r.bytes.forsSigBytes > 0, r.name);
    else assert.equal(r.bytes.htSigBytes, undefined, r.name);
  }
});

test('M11: ML-DSA rows carry expected signing attempts from the model', () => {
  for (const r of M.fipsParameterMatrix().filter(x => x.family === 'ML-DSA')) {
    assert.ok(r.expectedAttempts > 1 && r.expectedAttempts < 10, r.name);
    assert.equal(typeof r.workPerAttempt.polyProduct, 'number');
  }
});

test('M12: categories are monotone within each standard', () => {
  for (const fam of ['ML-KEM', 'ML-DSA']) {
    const cats = M.fipsParameterMatrix().filter(r => r.family === fam).map(r => r.category);
    assert.deepEqual(cats, cats.slice().sort((a, b) => a - b), fam);
  }
});

// ---------------------------------------------------------------
// Section R: deterministic benchmark report
// ---------------------------------------------------------------
test('R1: the report declares schema, version and cost model', () => {
  const r = M.benchmarkReport({ seed: 't' });
  assert.equal(r.schema, 'pqc-vault-bench/benchmark-v1');
  assert.equal(typeof r.workbenchVersion, 'string');
  assert.equal(r.costModel.name, 'param-cost-v1');
  assert.equal(r.costModel.weights, M.COST_WEIGHTS);
});

test('R2: run parameters echo the seed and clamp the sweep count', () => {
  assert.equal(M.benchmarkReport({ seed: 'abc', sweepCount: 12 }).runParameters.seed, 'abc');
  assert.equal(M.benchmarkReport({ sweepCount: 999 }).runParameters.sweepCount, 48);
  assert.equal(M.benchmarkReport({ sweepCount: 0 }).runParameters.sweepCount, 4);
  assert.equal(M.benchmarkReport({ sweepCount: 'junk' }).runParameters.sweepCount, 8);
});

test('R3: an empty or missing seed falls back to the default', () => {
  assert.equal(M.benchmarkReport({ seed: '   ' }).runParameters.seed, 'pqc-vault-bench-report');
  assert.equal(M.benchmarkReport({}).runParameters.seed, 'pqc-vault-bench-report');
});

test('R4: every self check in the report passes', () => {
  const r = M.benchmarkReport({ seed: 'check', sweepCount: 4 });
  for (const [k, v] of Object.entries(r.selfChecks)) assert.equal(v, true, k);
});

test('R5: the report contains matrix, size table, sweeps and signature sizes', () => {
  const r = M.benchmarkReport({ seed: 'full' });
  assert.equal(r.matrix.length, 18);
  assert.equal(r.kemSizes.length, 4);
  assert.equal(r.sweeps.length, 3);
  assert.equal(r.hashSignatureSizes.wots.chains, 67);
  assert.equal(r.securityTable.length, Object.keys(P.PRIMITIVES).length);
});

test('R6: the fingerprint is a 64-hex SHA-256 over the payload', () => {
  const r = M.benchmarkReport({ seed: 'fp' });
  assert.match(r.fingerprint, /^[0-9a-f]{64}$/);
});

test('R7: the whole report is deterministic byte for byte', () => {
  const a = JSON.stringify(M.benchmarkReport({ seed: 'det', sweepCount: 4 }));
  const b = JSON.stringify(M.benchmarkReport({ seed: 'det', sweepCount: 4 }));
  assert.equal(a, b);
});

test('R8: different seeds change the fingerprint and the sweep material', () => {
  const a = M.benchmarkReport({ seed: 'seed-a', sweepCount: 4 });
  const b = M.benchmarkReport({ seed: 'seed-b', sweepCount: 4 });
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test('R9: sweeps can be excluded and the report stays valid', () => {
  const r = M.benchmarkReport({ seed: 'no-sweeps', sweeps: false });
  assert.equal(r.sweeps.length, 0);
  assert.equal(r.runParameters.sweepsIncluded, false);
  assert.match(r.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(r.selfChecks.sweepsClean, true);
});

test('R10: the fingerprint covers the payload, not itself', () => {
  const r = M.benchmarkReport({ seed: 'fp2' });
  const payload = Object.assign({}, r);
  delete payload.fingerprint;
  const expect = P.bytesToHex(P.sha256(P.utf8Bytes(JSON.stringify(payload))));
  assert.equal(r.fingerprint, expect);
});

test('R11: sweep rows in the report carry the seeded parameter names', () => {
  const r = M.benchmarkReport({ seed: 'names' });
  assert.deepEqual(r.sweeps.map(s => s.param), ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024']);
  for (const s of r.sweeps) assert.equal(s.decryptionFailures, 0);
});

test('R12: self checks certify the eighteen-set hash-family split and method honesty', () => {
  const r = M.benchmarkReport({ seed: 'checks', sweepCount: 4 });
  assert.equal(r.selfChecks.matrixComplete, true);
  assert.equal(r.selfChecks.slhDsaFamiliesComplete, true);
  assert.equal(r.selfChecks.categoryRowsCarryNoBits, true);
});

// ---------------------------------------------------------------
// Section C: CSV export and edge cases
// ---------------------------------------------------------------
function csvDataLines(csv) {
  return csv.split('\n').filter(l => l && !l.startsWith('#'));
}

test('C1: the CSV header matches the declared column order', () => {
  const csv = M.reportCsv(M.benchmarkReport({ seed: 'csv', sweepCount: 4 }));
  assert.equal(csvDataLines(csv)[0], M.CSV_COLUMNS.join(','));
});

test('C2: the CSV carries one row per parameter set', () => {
  const csv = M.reportCsv(M.benchmarkReport({ seed: 'csv', sweepCount: 4 }));
  assert.equal(csvDataLines(csv).length, 19);
});

test('C2b: the CSV leads with a labeled provenance block', () => {
  const rep = M.benchmarkReport({ seed: 'prov', sweepCount: 4 });
  const lines = M.reportCsv(rep).split('\n');
  assert.equal(lines[0], '# report: pqc-vault-bench deterministic benchmark CSV');
  assert.equal(lines[1], '# schema: pqc-vault-bench/benchmark-v1');
  assert.equal(lines[2], '# workbench version: ' + rep.workbenchVersion);
  assert.equal(lines[3], '# report seed: prov');
  assert.equal(lines[4], '# cost model: ' + rep.costModel.name);
  assert.equal(lines[5], '# sweep count: 4');
  assert.equal(lines[6], '# JSON payload SHA-256 fingerprint: ' + rep.fingerprint);
  assert.match(lines[6], /[0-9a-f]{64}$/);
});

test('C2c: a hostile seed cannot inject a row or a formula into the provenance block', () => {
  const rep = M.benchmarkReport({ seed: '=cmd\n+1\n@x\t-evil', sweepCount: 4 });
  const csv = M.reportCsv(rep);
  const comments = csv.split('\n').filter(l => l.startsWith('#'));
  assert.equal(comments.length, 7);
  const seedLine = comments.find(l => l.startsWith('# report seed: '));
  assert.equal(seedLine, '# report seed: =cmd +1 @x -evil');
  assert.equal(csvDataLines(csv).length, 19);
  // No injected line survived outside the comment block.
  for (const l of csv.split('\n')) {
    if (!l.startsWith('#')) assert.equal(/^[@=+-]/.test(l), false, l.slice(0, 40));
  }
});

test('C2d: category rows export empty bit cells; estimator rows export named figures', () => {
  const csv = M.reportCsv(M.benchmarkReport({ seed: 'csv', sweepCount: 4 }));
  const kem = csvDataLines(csv).find(l => l.startsWith('ML-KEM-512,')).split(',');
  assert.equal(kem[3], '1');
  assert.equal(kem[4], 'AES-128 key search');
  assert.equal(kem[9], '');
  assert.equal(kem[10], '');
  assert.equal(kem[11], 'nist-category');
  assert.equal(kem[12], '');
  const est = csvDataLines(csv).find(l => l.startsWith('ML-KEM-768,')).split(',');
  assert.equal(est[9], '164');
  assert.equal(est[10], '149');
  assert.equal(est[11], 'workbench-estimator');
  assert.equal(est[12], 'lattice reduction');
});

test('C3: csvEscape quotes commas, quotes and newlines', () => {
  assert.equal(M.csvEscape('a,b'), '"a,b"');
  assert.equal(M.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(M.csvEscape('x\ny'), '"x\ny"');
  assert.equal(M.csvEscape('plain'), 'plain');
  assert.equal(M.csvEscape(42), '42');
});

test('C4: csvEscape blocks spreadsheet formula injection', () => {
  for (const bad of ['=1+1', '+1', '-2', '@cmd', '\ttab']) {
    assert.equal(M.csvEscape(bad)[0], "'", bad);
  }
});

test('C5: csvEscape passes null and undefined through as empty', () => {
  assert.equal(M.csvEscape(null), '');
  assert.equal(M.csvEscape(undefined), '');
});

test('C6: every CSV row has the full column count', () => {
  const csv = M.reportCsv(M.benchmarkReport({ seed: 'csv', sweepCount: 4 }));
  for (const line of csvDataLines(csv)) {
    assert.equal(line.split(',').length, M.CSV_COLUMNS.length, line.slice(0, 40));
  }
});

test('C7: KEM rows carry sweep statistics, signature rows leave them empty', () => {
  const csv = M.reportCsv(M.benchmarkReport({ seed: 'csv', sweepCount: 4 }));
  const lines = csvDataLines(csv).slice(1);
  const kem = lines.find(l => l.startsWith('ML-KEM-512,')).split(',');
  assert.equal(kem[17], '4');
  assert.equal(kem[18], '4');
  assert.equal(kem[19], '0');
  const dsa = lines.find(l => l.startsWith('ML-DSA-44,')).split(',');
  assert.equal(dsa[17], '');
  assert.equal(dsa[18], '');
});

test('C8: expected sign attempts appear only on ML-DSA rows', () => {
  const csv = M.reportCsv(M.benchmarkReport({ seed: 'csv', sweepCount: 4 }));
  for (const line of csvDataLines(csv).slice(1)) {
    const cells = line.split(',');
    if (cells[0].startsWith('ML-DSA')) assert.match(cells[16], /^[0-9]+\.[0-9]{4}$/);
    else assert.equal(cells[16], '');
  }
});

test('C9: the CSV is deterministic and ends with a newline', () => {
  const a = M.reportCsv(M.benchmarkReport({ seed: 'csv-det', sweepCount: 4 }));
  assert.equal(a, M.reportCsv(M.benchmarkReport({ seed: 'csv-det', sweepCount: 4 })));
  assert.ok(a.endsWith('\n'));
});

test('C10: the CSV survives a report without sweeps', () => {
  const csv = M.reportCsv(M.benchmarkReport({ seed: 'csv', sweeps: false }));
  const lines = csvDataLines(csv);
  assert.equal(lines.length, 19);
  assert.equal(lines[1].split(',')[17], '');
});

// ---------------------------------------------------------------
// Section E: edge cases and cross-module consistency
// ---------------------------------------------------------------
test('E1: matrix KEM byte rows agree with the analysis size table', () => {
  const sizes = A.kemSizeTable();
  for (const r of M.fipsParameterMatrix().filter(x => x.role === 'kem')) {
    const row = sizes.find(s => s.name === r.name);
    assert.equal(r.bytes.publicKey, row.encapsulationKeyBytes, r.name);
    assert.equal(r.bytes.payload, row.ciphertextBytes, r.name);
  }
});

test('E2: matrix rows expose parameter detail for tooltips and reports', () => {
  const m = M.fipsParameterMatrix();
  assert.equal(m.find(r => r.name === 'ML-DSA-65').params.tau, 49);
  assert.equal(m.find(r => r.name === 'SLH-DSA-SHA2-256f').params.hPrime, 4);
  assert.equal(m.find(r => r.name === 'ML-KEM-768').params.du, 10);
});

test('E3: slhDsaM needs no external input and is deterministic', () => {
  for (const name of Object.keys(M.SLH_DSA_PARAMS)) {
    assert.equal(M.slhDsaM(M.SLH_DSA_PARAMS[name]), M.slhDsaM(M.SLH_DSA_PARAMS[name]));
  }
});

test('E4: workUnits is linear in each primitive class', () => {
  const w = M.mlKemWorkProfile('ML-KEM-768');
  assert.equal(M.workUnits(w.keygen) * 2, M.workUnits({
    nttForward: w.keygen.nttForward * 2,
    nttInverse: w.keygen.nttInverse * 2,
    polyProduct: w.keygen.polyProduct * 2,
    xofCalls: w.keygen.xofCalls * 2,
    xofBlocks: w.keygen.xofBlocks * 2,
    sha256Calls: w.keygen.sha256Calls * 2,
    cbdSamples: w.keygen.cbdSamples * 2,
    packCalls: w.keygen.packCalls * 2
  }));
});

test('E5: the matrix and report expose stable version stamps', () => {
  assert.equal(M.WORKBENCH_VERSION, '1.1.0');
  assert.equal(M.REPORT_SCHEMA, 'pqc-vault-bench/benchmark-v1');
  assert.equal(M.COST_MODEL, 'param-cost-v1');
});

test('E6: every latency index is finite, positive and normalized', () => {
  for (const r of M.fipsParameterMatrix()) {
    for (const k of ['keygen', 'primary', 'secondary']) {
      assert.ok(Number.isFinite(r.latencyIndex[k]) && r.latencyIndex[k] > 0, r.name + ' ' + k);
    }
  }
});

// ---------------------------------------------------------------
// Section D: table rendering keeps its accessible caption
// ---------------------------------------------------------------
const DT = require('../src/domtable.js');

// A minimal table double implementing the DOM surface renderDataTable
// uses: children, querySelector('caption'), child.remove() and
// insertAdjacentHTML() for the generated thead/tbody markup.
function fakeTable(withCaption) {
  const table = { tag: 'table', children: [] };
  function add(tag, extra) {
    const c = Object.assign({ tag, parent: table }, extra);
    c.remove = () => {
      const i = table.children.indexOf(c);
      if (i >= 0) table.children.splice(i, 1);
    };
    table.children.push(c);
    return c;
  }
  if (withCaption) add('caption', { text: 'FIPS parameter sets' });
  table.querySelector = sel => table.children.find(c => c.tag === sel) || null;
  table.insertAdjacentHTML = (pos, html) => {
    for (const m of html.matchAll(/<(\w+)\b[\s\S]*?<\/\1>/g)) add(m[1], { html: m[0] });
  };
  return table;
}

test('D1: renderDataTable replaces thead and tbody but keeps the caption node', () => {
  const table = fakeTable(true);
  const caption = table.children[0];
  DT.renderDataTable(table, ['a', 'b'], [[1, 2], [3, 4]]);
  assert.equal(table.children.length, 3);
  assert.equal(table.children[0], caption, 'caption node identity must be preserved');
  assert.equal(table.children[1].tag, 'thead');
  assert.equal(table.children[2].tag, 'tbody');
});

test('D2: repeated renders and filters never delete the caption', () => {
  const table = fakeTable(true);
  const caption = table.children[0];
  DT.renderDataTable(table, ['a', 'b'], [[1, 2]]);
  DT.renderDataTable(table, ['a', 'b'], []);
  DT.renderDataTable(table, ['x', 'y', 'z'], [[9, 8, 7]]);
  assert.equal(table.children[0], caption, 'caption must survive every re-render');
  assert.equal(table.children.length, 3);
  assert.equal(table.children[0].text, 'FIPS parameter sets');
  assert.equal(table.querySelector('caption'), caption);
  assert.ok(table.querySelector('tbody').html.includes('9'));
});

test('D3: renderDataTable still builds head and body when no caption exists', () => {
  const table = fakeTable(false);
  DT.renderDataTable(table, ['a'], [[1]]);
  assert.equal(table.children.length, 2);
  assert.equal(table.children[0].tag, 'thead');
  assert.equal(table.children[1].tag, 'tbody');
});

test('D4: the page wires the matrix table through the caption-preserving renderer', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  // The old defect overwrote the whole table, caption included.
  assert.equal(/t\.innerHTML\s*=\s*head \+ body/.test(app), false);
  assert.match(app, /PQCDomTable/);
  assert.match(app, /DT\.renderDataTable/);
  assert.match(html, /<table id="mx-table" class="data-table"><caption class="sr-only">/);
  assert.ok(html.indexOf('src/domtable.js') < html.indexOf('app.js') && html.indexOf('src/domtable.js') > html.indexOf('src/parammatrix.js'));
});
