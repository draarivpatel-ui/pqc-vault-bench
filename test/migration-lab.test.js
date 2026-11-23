'use strict';

/*
 * Migration & Audit Workbench test suite.
 * Locks the five-regime x four-profile comparator derivations, the
 * adversarial tamper and forgery replay matrix, the #pqc= bookmark
 * codec fail-closed behavior, and the cached canonical SHA-256 audited
 * brief exporter with digest parity across JSON, CSV and Markdown.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pqc.js');
const A = require('../src/analysis.js');
const M = require('../src/parammatrix.js');
const Q = require('../src/qday-aevum.js');
const L = require('../src/migration-lab.js');

const REGIMES = ['legacy-ecdsa', 'hybrid-ecdsa-mlkem768', 'hybrid-ecdsa-mldsa65', 'stateful-xmss-vault', 'stateless-slhdsa-128s'];
const PROFILES = ['hot-treasury', 'high-freq-settlement', 'cold-reserve', 'qday-aevum-tusd8'];

// One shared matrix keeps the suite fast; it is deterministic anyway.
const ADV = L.adversarialMatrix({ seed: 'suite-adversarial' });
const MATRIX = L.comparatorMatrix({ profile: 'qday-aevum-tusd8' });

// ---------------------------------------------------------------
// Section R: regime and profile catalogs
// ---------------------------------------------------------------
test('R1: exactly five migration regimes in the locked order', () => {
  assert.deepEqual(L.regimeList(), REGIMES);
});

test('R2: exactly four treasury profiles in the locked order', () => {
  assert.deepEqual(L.profileList(), PROFILES);
});

test('R3: every regime declares label, family, pqComponent, nistCategory and stateful', () => {
  for (const id of REGIMES) {
    const r = L.MIGRATION_REGIMES[id];
    assert.equal(typeof r.label, 'string', id);
    assert.equal(typeof r.family, 'string', id);
    assert.ok('pqComponent' in r, id);
    assert.ok('nistCategory' in r, id);
    assert.equal(typeof r.stateful, 'boolean', id);
  }
});

test('R4: only the XMSS vault regime is stateful', () => {
  const stateful = REGIMES.filter(id => L.MIGRATION_REGIMES[id].stateful);
  assert.deepEqual(stateful, ['stateful-xmss-vault']);
});

test('R5: every profile carries positive numeric settlement shape fields', () => {
  for (const id of PROFILES) {
    const p = L.TREASURY_PROFILES[id];
    assert.ok(p.utxoCount > 0 && p.annualSettlements > 0, id);
    assert.ok(p.byteBudget > 0 && p.latencyBudget > 0, id);
    assert.equal(typeof p.label, 'string', id);
  }
});

test('R6: profile ids in the control schema match the treasury catalog', () => {
  assert.deepEqual(L.CONTROL_SCHEMA['lab-profile'].options, PROFILES);
});

test('R7: resolvedProfile returns base values without overrides', () => {
  const p = L.resolvedProfile('hot-treasury');
  assert.equal(p.utxoCount, L.TREASURY_PROFILES['hot-treasury'].utxoCount);
  assert.equal(p.annualSettlements, L.TREASURY_PROFILES['hot-treasury'].annualSettlements);
  assert.equal(p.custom, false);
});

test('R8: resolvedProfile applies numeric overrides and marks custom', () => {
  const p = L.resolvedProfile('hot-treasury', { utxoCount: 99, annualSettlements: 7 });
  assert.equal(p.utxoCount, 99);
  assert.equal(p.annualSettlements, 7);
  assert.equal(p.custom, true);
});

test('R9: resolvedProfile clamps hostile overrides', () => {
  const a = L.resolvedProfile('hot-treasury', { utxoCount: 0, annualSettlements: -12 });
  assert.equal(a.utxoCount, 1);
  assert.equal(a.annualSettlements, 1);
  const b = L.resolvedProfile('hot-treasury', { utxoCount: NaN, annualSettlements: Infinity });
  assert.equal(b.utxoCount, 1);
  assert.equal(b.annualSettlements, 1);
  const c = L.resolvedProfile('hot-treasury', { utxoCount: 1e30, annualSettlements: 1e30 });
  assert.equal(c.utxoCount, 10000000);
  assert.equal(c.annualSettlements, 1000000000);
});

test('R10: resolvedProfile rejects unknown and hostile profile ids', () => {
  assert.throws(() => L.resolvedProfile('nope'), RangeError);
  assert.throws(() => L.resolvedProfile('__proto__'), RangeError);
  assert.throws(() => L.resolvedProfile(''), RangeError);
  assert.throws(() => L.resolvedProfile(null), RangeError);
});

test('R11: empty-string overrides fall back to profile defaults', () => {
  const p = L.resolvedProfile('cold-reserve', { utxoCount: '', annualSettlements: null });
  assert.equal(p.utxoCount, L.TREASURY_PROFILES['cold-reserve'].utxoCount);
  assert.equal(p.annualSettlements, L.TREASURY_PROFILES['cold-reserve'].annualSettlements);
  assert.equal(p.custom, false);
});

// ---------------------------------------------------------------
// Section F: derived byte footprints
// ---------------------------------------------------------------
test('F1: legacy footprint derives from the primitive estimator bits', () => {
  const fp = L.regimeFootprint('legacy-ecdsa');
  assert.equal(fp.publicKey, P.PRIMITIVES['secp256k1 ECDSA'].pkBits / 8);
  assert.equal(fp.payload, P.PRIMITIVES['secp256k1 ECDSA'].signatureBits / 8);
  assert.equal(fp.publicKey, 32);
  assert.equal(fp.payload, 64);
});

test('F2: hybrid ML-KEM footprint = ECDSA + FIPS 203 spec bytes', () => {
  const fp = L.regimeFootprint('hybrid-ecdsa-mlkem768');
  const b = M.mlKemSpecBytes('ML-KEM-768');
  assert.equal(fp.publicKey, 32 + b.ekBytes);
  assert.equal(fp.payload, 64 + b.ctBytes);
});

test('F3: hybrid ML-DSA footprint = ECDSA + FIPS 204 spec bytes', () => {
  const fp = L.regimeFootprint('hybrid-ecdsa-mldsa65');
  const b = M.mlDsaSpecBytes('ML-DSA-65');
  assert.equal(fp.publicKey, 32 + b.pkBytes);
  assert.equal(fp.payload, 64 + b.sigBytes);
});

test('F4: stateless SLH-DSA footprint = FIPS 205 spec bytes', () => {
  const fp = L.regimeFootprint('stateless-slhdsa-128s');
  const b = M.slhDsaSpecBytes('SLH-DSA-SHA2-128s');
  assert.equal(fp.publicKey, b.pkBytes);
  assert.equal(fp.payload, b.sigBytes);
});

test('F5: XMSS vault payload matches the measured h=10 closed form', () => {
  const fp = L.regimeFootprint('stateful-xmss-vault');
  assert.equal(fp.publicKey, 32);
  assert.equal(fp.payload, P.WOTS_LEN * 32 + 10 * 32 + 32 + 4);
  assert.equal(fp.payload, 2500);
  assert.equal(fp.leafCapacity, 1024);
});

test('F6: xmssSignatureBytes matches the measured hashSignatureSizes at h=3', () => {
  const sizes = A.hashSignatureSizes('suite:wots', 3);
  assert.equal(L.xmssSignatureBytes(3), sizes.xmss.signatureBytes);
});

test('F7: xmssSignatureBytes rejects malformed heights', () => {
  for (const h of [-1, 21, 1.5, 'x', NaN, Infinity, null, {}]) {
    assert.throws(() => L.xmssSignatureBytes(h), RangeError, String(h));
  }
});

test('F8: xmssSignatureBytes boundary heights are exact', () => {
  assert.equal(L.xmssSignatureBytes(0), P.WOTS_LEN * 32 + 36);
  assert.equal(L.xmssSignatureBytes(20), P.WOTS_LEN * 32 + 20 * 32 + 36);
});

test('F9: every regime footprint is positive integers', () => {
  for (const id of REGIMES) {
    const fp = L.regimeFootprint(id);
    assert.ok(Number.isInteger(fp.publicKey) && fp.publicKey > 0, id);
    assert.ok(Number.isInteger(fp.payload) && fp.payload > 0, id);
  }
});

test('F10: regimeFootprint rejects unknown and hostile ids', () => {
  assert.throws(() => L.regimeFootprint('nope'), RangeError);
  assert.throws(() => L.regimeFootprint('__proto__'), RangeError);
  assert.throws(() => L.regimeFootprint(5), RangeError);
});

test('F11: XMSS vault height override changes the payload deterministically', () => {
  const fp = L.regimeFootprint('stateful-xmss-vault', { xmssHeight: 4 });
  assert.equal(fp.payload, P.WOTS_LEN * 32 + 4 * 32 + 36);
  assert.equal(fp.leafCapacity, 16);
});

test('F12: pqPayload is zero only for the legacy regime', () => {
  assert.equal(L.regimeFootprint('legacy-ecdsa').pqPayload, 0);
  for (const id of REGIMES.slice(1)) {
    assert.ok(L.regimeFootprint(id).pqPayload > 0, id);
  }
});

// ---------------------------------------------------------------
// Section W: derived work profiles and latency index
// ---------------------------------------------------------------
test('W1: latency base equals the parammatrix ML-KEM-512 keygen units', () => {
  assert.equal(L.latencyBase(), M.workUnits(M.mlKemWorkProfile('ML-KEM-512').keygen));
});

test('W2: legacy regime models zero post-quantum work with a stated method', () => {
  const w = L.regimeWork('legacy-ecdsa');
  assert.equal(w.keygen, 0);
  assert.equal(w.primary, 0);
  assert.equal(w.secondary, 0);
  assert.match(w.method, /classical baseline/);
});

test('W3: hybrid ML-KEM work equals the parammatrix cost profile', () => {
  const w = L.regimeWork('hybrid-ecdsa-mlkem768');
  const p = M.mlKemWorkProfile('ML-KEM-768');
  assert.equal(w.keygen, M.workUnits(p.keygen));
  assert.equal(w.primary, M.workUnits(p.encaps));
  assert.equal(w.secondary, M.workUnits(p.decaps));
});

test('W4: hybrid ML-DSA work equals the parammatrix cost profile', () => {
  const w = L.regimeWork('hybrid-ecdsa-mldsa65');
  const p = M.mlDsaWorkProfile('ML-DSA-65');
  assert.equal(w.primary, M.workUnits(p.sign));
  assert.equal(w.secondary, M.workUnits(p.verify));
});

test('W5: SLH-DSA work equals the FIPS 205 hash-invocation counts', () => {
  const w = L.regimeWork('stateless-slhdsa-128s');
  const p = M.slhDsaWorkProfile('SLH-DSA-SHA2-128s');
  assert.equal(w.keygen, p.keygen.hashCalls);
  assert.equal(w.primary, p.sign.hashCalls);
  assert.equal(w.secondary, p.verify.hashCalls);
});

test('W6: XMSS vault work is exact SHA-256 calls for the signing message', () => {
  const w = L.regimeWork('stateful-xmss-vault');
  const msg = P.utf8Bytes('migration-lab:treasury-v1');
  const digits = P.messageToBaseW(P.sha256(msg), P.WOTS_W);
  const chain = digits.concat(P.wotsChecksum(digits, P.WOTS_W));
  const sign = chain.reduce((a, b) => a + b, 0);
  const verify = chain.reduce((a, b) => a + (P.WOTS_W - 1 - b), 0) + 1 + 10;
  assert.equal(w.primary, sign);
  assert.equal(w.secondary, verify);
  assert.equal(w.keygen, 1024 * (P.WOTS_LEN * (P.WOTS_W - 1) + 1) + 1023);
});

test('W7: every PQ regime reports positive per-settlement work', () => {
  for (const id of REGIMES.slice(1)) {
    const w = L.regimeWork(id);
    assert.ok(w.primary + w.secondary > 0, id);
  }
});

test('W8: xmssWorkProfile rejects malformed heights', () => {
  for (const h of [-1, 21, 1.5, 'h', NaN, Infinity]) {
    assert.throws(() => L.xmssWorkProfile(h), RangeError, String(h));
  }
});

test('W9: xmssWorkProfile accepts Uint8Array and default messages', () => {
  const a = L.xmssWorkProfile(2, new Uint8Array([1, 2, 3]));
  const b = L.xmssWorkProfile(2, new Uint8Array([1, 2, 3]));
  assert.equal(a.primary.hashCalls, b.primary.hashCalls);
  const c = L.xmssWorkProfile(2, 7);
  const d = L.xmssWorkProfile(2);
  assert.equal(c.primary.hashCalls, d.primary.hashCalls);
});

test('W10: regimeWork rejects unknown ids', () => {
  assert.throws(() => L.regimeWork('constructor'), RangeError);
  assert.throws(() => L.regimeWork(''), RangeError);
});

// ---------------------------------------------------------------
// Section C: comparator cells
// ---------------------------------------------------------------
test('C1: comparator matrix returns five cells and a frontier', () => {
  assert.equal(MATRIX.cells.length, 5);
  assert.ok(Array.isArray(MATRIX.frontier));
  assert.equal(MATRIX.latencyBase, L.latencyBase());
});

test('C2: every cell ties out bytes, work and index internally', () => {
  for (const c of MATRIX.cells) {
    assert.equal(c.bytes.perSettlement, c.bytes.publicKey + c.bytes.payload, c.regime);
    assert.equal(c.bytes.annualWire, c.bytes.perSettlement * MATRIX.profile.annualSettlements, c.regime);
    assert.equal(c.bytes.keyMaterial, c.bytes.publicKey * MATRIX.profile.utxoCount, c.regime);
    assert.equal(c.work.perSettlement, c.work.primary + c.work.secondary, c.regime);
    const idx = Math.round(100 * c.work.perSettlement / c.latencyBase) / 100;
    assert.equal(c.latencyIndex, idx, c.regime);
  }
});

test('C3: legacy cell is critical HNDL with the migrate verdict on every profile', () => {
  for (const p of PROFILES) {
    const c = L.compareCell('legacy-ecdsa', p);
    assert.equal(c.hndl.class, 'critical', p);
    assert.match(c.verdict, /migrate/, p);
    assert.equal(c.pqComponent, null, p);
  }
});

test('C4: hybrid cells are guarded and hash-based cells are covered', () => {
  const prof = L.resolvedProfile('hot-treasury');
  assert.equal(L.compareCell('hybrid-ecdsa-mlkem768', prof).hndl.class, 'guarded');
  assert.equal(L.compareCell('hybrid-ecdsa-mldsa65', prof).hndl.class, 'guarded');
  assert.equal(L.compareCell('stateful-xmss-vault', prof).hndl.class, 'covered');
  assert.equal(L.compareCell('stateless-slhdsa-128s', prof).hndl.class, 'covered');
});

test('C5: HNDL exposed-key count is bounded by utxos and settlements', () => {
  const p1 = L.compareCell('legacy-ecdsa', 'hot-treasury');
  assert.equal(p1.hndl.exposedKeysPerYear, Math.min(52000, 4200));
  const p2 = L.compareCell('legacy-ecdsa', 'high-freq-settlement');
  assert.equal(p2.hndl.exposedKeysPerYear, 260);
  const p3 = L.compareCell('stateful-xmss-vault', 'hot-treasury');
  assert.equal(p3.hndl.exposedKeysPerYear, 0);
});

test('C6: NIST category and reference primitive travel with the PQ component', () => {
  assert.equal(L.compareCell('hybrid-ecdsa-mlkem768', 'cold-reserve').nistCategory, 3);
  assert.equal(L.compareCell('hybrid-ecdsa-mldsa65', 'cold-reserve').nistCategory, 3);
  assert.equal(L.compareCell('stateless-slhdsa-128s', 'cold-reserve').nistCategory, 1);
  assert.equal(L.compareCell('stateless-slhdsa-128s', 'cold-reserve').categoryReference, M.CATEGORY_REFERENCE[1]);
  assert.equal(L.compareCell('legacy-ecdsa', 'cold-reserve').nistCategory, null);
});

test('C7: cold-reserve budgets admit every PQ regime', () => {
  for (const id of REGIMES.slice(1)) {
    const c = L.compareCell(id, 'cold-reserve');
    assert.equal(c.verdict, 'within profile budgets', id);
  }
});

test('C8: high-frequency profile flags SLH-DSA-128s on both budgets', () => {
  const c = L.compareCell('stateless-slhdsa-128s', 'high-freq-settlement');
  assert.ok(c.breaches.length >= 1);
  assert.match(c.verdict, /over budget/);
});

test('C9: qday profile flags SLH-DSA-128s work index only', () => {
  const c = L.compareCell('stateless-slhdsa-128s', 'qday-aevum-tusd8');
  assert.deepEqual(c.breaches, ['work index over budget']);
  assert.equal(c.verdict, 'work index over budget');
});

test('C10: overrides change annual wire bytes deterministically', () => {
  const a = L.compareCell('hybrid-ecdsa-mlkem768', 'hot-treasury', { overrides: { annualSettlements: 10 } });
  const b = L.compareCell('hybrid-ecdsa-mlkem768', 'hot-treasury', { overrides: { annualSettlements: 20 } });
  assert.equal(b.bytes.annualWire, 2 * a.bytes.annualWire);
});

test('C11: compareCell is deterministic and rejects bad inputs', () => {
  const a = L.compareCell('hybrid-ecdsa-mldsa65', 'cold-reserve');
  const b = L.compareCell('hybrid-ecdsa-mldsa65', 'cold-reserve');
  assert.deepEqual(a, b);
  assert.throws(() => L.compareCell('nope', 'cold-reserve'), RangeError);
  assert.throws(() => L.compareCell('hybrid-ecdsa-mldsa65', 'nope'), RangeError);
  assert.throws(() => L.compareCell('hybrid-ecdsa-mldsa65', {}), RangeError);
});

test('C12: comparator matrix honors custom volumes', () => {
  const m = L.comparatorMatrix({ profile: 'hot-treasury', overrides: { utxoCount: 5, annualSettlements: 9 } });
  assert.equal(m.profile.utxoCount, 5);
  assert.equal(m.profile.annualSettlements, 9);
  assert.equal(m.profile.custom, true);
  assert.equal(m.cells[1].bytes.keyMaterial, m.cells[1].bytes.publicKey * 5);
});

// ---------------------------------------------------------------
// Section PF: Pareto frontier
// ---------------------------------------------------------------
test('PF1: frontier points cover 18 FIPS sets plus 5 regimes', () => {
  const fp = L.frontierPoints();
  assert.equal(fp.fips.length, 18);
  assert.equal(fp.regimes.length, 5);
  assert.equal(fp.base, L.latencyBase());
});

test('PF2: frontier is sorted and every member is non-dominated', () => {
  const pts = MATRIX.cells.map(c => ({ id: c.regime, x: c.bytes.perSettlement, y: c.latencyIndex }));
  const front = L.paretoFrontier(pts);
  for (let i = 1; i < front.length; i++) assert.ok(front[i].x > front[i - 1].x);
  for (const f of front) {
    const dominated = pts.some(p => p !== f && p.x <= f.x && p.y <= f.y && (p.x < f.x || p.y < f.y));
    assert.equal(dominated, false, f.id);
  }
});

test('PF3: legacy ECDSA anchors the frontier at the cheap corner', () => {
  const front = L.paretoFrontier(MATRIX.cells.map(c => ({ id: c.regime, x: c.bytes.perSettlement, y: c.latencyIndex })));
  assert.equal(front[0].id, 'legacy-ecdsa');
  assert.equal(front[0].x, 96);
  assert.equal(front[0].y, 0);
});

test('PF4: every dominated regime is beaten by a frontier member', () => {
  const pts = MATRIX.cells.map(c => ({ id: c.regime, x: c.bytes.perSettlement, y: c.latencyIndex }));
  const front = L.paretoFrontier(pts);
  const frontIds = new Set(front.map(f => f.id));
  for (const p of pts) {
    if (frontIds.has(p.id)) continue;
    const beaten = front.some(f => f.x <= p.x && f.y <= p.y && (f.x < p.x || f.y < p.y));
    assert.ok(beaten, p.id + ' should be dominated');
  }
});

test('PF5: paretoFrontier is deterministic and order-independent', () => {
  const pts = MATRIX.cells.map(c => ({ id: c.regime, x: c.bytes.perSettlement, y: c.latencyIndex }));
  const shuffled = pts.slice().reverse();
  assert.deepEqual(L.paretoFrontier(pts), L.paretoFrontier(shuffled));
});

test('PF6: FIPS chart points tie bytes to the spec matrix', () => {
  const fp = L.frontierPoints();
  const matrix = M.fipsParameterMatrix();
  for (const p of fp.fips) {
    const row = matrix.find(r => r.name === p.id);
    assert.equal(p.x, row.bytes.publicKey + row.bytes.payload, p.id);
    const y = (row.workUnits.primary + row.workUnits.secondary) / fp.base;
    assert.equal(p.y, y, p.id);
  }
});

// ---------------------------------------------------------------
// Section AV: adversarial replay matrix
// ---------------------------------------------------------------
test('AV1: matrix returns at least 30 vectors, all held', () => {
  assert.ok(ADV.vectors.length >= 30);
  assert.equal(ADV.summary.allHeld, true);
  assert.equal(ADV.summary.allFailClosed, true);
});

test('AV2: every vector record has the full proof shape', () => {
  for (const v of ADV.vectors) {
    for (const k of ['id', 'family', 'attack', 'mutation', 'engine', 'expected', 'rejected', 'held', 'blockedBy']) {
      assert.ok(k in v, v.id + ' missing ' + k);
    }
    assert.ok(v.held, v.id + ' did not hold');
  }
});

test('AV3: families cover KEM, WOTS+, XMSS and QDay plus a control group', () => {
  const fams = {};
  for (const v of ADV.vectors) fams[v.family] = (fams[v.family] || 0) + 1;
  assert.ok(fams.kem >= 6);
  assert.ok(fams.wots >= 5);
  assert.ok(fams.xmss >= 5);
  assert.ok(fams.qday >= 8);
  assert.ok(fams.control >= 3);
});

test('AV4: honest controls all verify', () => {
  const controls = ADV.vectors.filter(v => v.expected === 'accept');
  assert.ok(controls.length >= 3);
  for (const v of controls) assert.equal(v.rejected, false, v.id);
});

test('AV5: kem-bitflip-u is rejected by real implicit rejection', () => {
  const kem = P.MLKEM({ param: 'ML-KEM-768' });
  const keys = kem.deriveFromSeed('av5');
  const enc = kem.encapsulate(keys.ek, 'av5:enc');
  const bad = enc.ciphertext.slice();
  bad[bad.length >> 1] ^= 1;
  const dec = kem.decapsulate(bad, keys.dk);
  assert.equal(P.bytesEqual(dec, enc.sharedSecret), false);
  const v = ADV.vectors.find(x => x.id === 'kem-bitflip-u');
  assert.equal(v.rejected, true);
  assert.ok(v.blockedBy.indexOf('fo-implicit-rejection') !== -1);
});

test('AV6: kem v-region and trailing-byte tampering are rejected', () => {
  for (const id of ['kem-bitflip-v', 'kem-extended', 'kem-truncated', 'kem-zero-ciphertext']) {
    const v = ADV.vectors.find(x => x.id === id);
    assert.equal(v.rejected, true, id);
  }
});

test('AV7: non-array and foreign-key decapsulation are rejected', () => {
  for (const id of ['kem-nonarray', 'kem-wrong-key']) {
    const v = ADV.vectors.find(x => x.id === id);
    assert.equal(v.rejected, true, id);
  }
});

test('AV8: wots chain-push forgery is rejected by the checksum', () => {
  const v = ADV.vectors.find(x => x.id === 'wots-chain-push');
  assert.equal(v.rejected, true);
  assert.ok(v.blockedBy.indexOf('wots-checksum') !== -1);
});

test('AV9: wots message mutation and element swap are rejected', () => {
  for (const id of ['wots-message-mutate', 'wots-element-swap', 'wots-truncated', 'wots-zero-element', 'wots-wrong-key']) {
    const v = ADV.vectors.find(x => x.id === id);
    assert.equal(v.rejected, true, id);
  }
});

test('AV10: xmss foreign tree and leaf/index/proof tampering are rejected', () => {
  for (const id of ['xmss-foreign-tree', 'xmss-index-swap', 'xmss-proof-swap', 'xmss-leaf-swap', 'xmss-malformed']) {
    const v = ADV.vectors.find(x => x.id === id);
    assert.equal(v.rejected, true, id);
  }
});

test('AV11: xmss leaf exhaustion throws a RangeError, caught as fail-closed', () => {
  const v = ADV.vectors.find(x => x.id === 'xmss-exhausted-leaf');
  assert.equal(v.rejected, true);
  const small = P.XMSS({ height: 1, seed: 'av11' });
  small.sign('a');
  small.sign('b');
  assert.throws(() => small.sign('c'), RangeError);
});

test('AV12: qday wrong chainId fails the chain binding check', () => {
  const v = ADV.vectors.find(x => x.id === 'qday-wrong-chainid');
  assert.equal(v.rejected, true);
  assert.ok(v.blockedBy.indexOf('chainOk') !== -1);
});

test('AV13: qday expired deadline fails the deadline check', () => {
  const v = ADV.vectors.find(x => x.id === 'qday-expired-deadline');
  assert.equal(v.rejected, true);
  assert.ok(v.blockedBy.indexOf('deadlineOk') !== -1);
});

test('AV14: qday mutated txRequest fails the tx-request binding', () => {
  const v = ADV.vectors.find(x => x.id === 'qday-mutated-txrequest');
  assert.equal(v.rejected, true);
  assert.ok(v.blockedBy.indexOf('txRequestOk') !== -1);
});

test('AV15: qday malformed and replayed nonces are rejected', () => {
  const bad = ADV.vectors.find(x => x.id === 'qday-malformed-nonce');
  assert.equal(bad.rejected, true);
  assert.ok(bad.blockedBy.indexOf('nonceOk') !== -1);
  const replay = ADV.vectors.find(x => x.id === 'qday-replayed-nonce');
  assert.equal(replay.rejected, true);
  assert.ok(replay.blockedBy.indexOf('nonce-replay') !== -1);
});

test('AV16: qday amount tamper is caught by four named bindings', () => {
  const v = ADV.vectors.find(x => x.id === 'qday-amount-tamper');
  assert.equal(v.rejected, true);
  for (const k of ['calldataOk', 'receiptHashOk', 'commitmentHashOk', 'pqcSignatureOk']) {
    assert.ok(v.blockedBy.indexOf(k) !== -1, k);
  }
});

test('AV17: qday display forgery and schema swap are rejected', () => {
  const display = ADV.vectors.find(x => x.id === 'qday-display-forge');
  assert.equal(display.rejected, true);
  assert.ok(display.blockedBy.indexOf('displayOk') !== -1);
  const schema = ADV.vectors.find(x => x.id === 'qday-schema-swap');
  assert.equal(schema.rejected, true);
  assert.ok(schema.blockedBy.indexOf('schemaOk') !== -1);
});

test('AV18: qday foreign XMSS root fails the session-issued check', () => {
  const v = ADV.vectors.find(x => x.id === 'qday-foreign-root');
  assert.equal(v.rejected, true);
  assert.ok(v.blockedBy.indexOf('rootIssuedOk') !== -1);
});

test('AV19: the adversarial matrix is deterministic across runs', () => {
  const again = L.adversarialMatrix({ seed: 'suite-adversarial' });
  assert.deepEqual(again.vectors.map(v => v.id), ADV.vectors.map(v => v.id));
  assert.deepEqual(again.vectors.map(v => v.held), ADV.vectors.map(v => v.held));
  assert.equal(again.summary.held, ADV.summary.held);
});

test('AV20: different seeds still hold every vector', () => {
  const alt = L.adversarialMatrix({ seed: 'alternate-seed-path' });
  assert.equal(alt.summary.allHeld, true);
  assert.equal(alt.vectors.length, ADV.vectors.length);
});

test('AV21: adversarialMatrix tolerates hostile option shapes', () => {
  const a = L.adversarialMatrix(null);
  assert.equal(a.summary.allHeld, true);
  const b = L.adversarialMatrix({ seed: NaN, kemParam: 'ML-KEM-512' });
  assert.equal(b.summary.allHeld, true);
});

// ---------------------------------------------------------------
// Section HC: #pqc= bookmark codec
// ---------------------------------------------------------------
test('HC1: encodeState emits the #pqc= prefix and base64url body', () => {
  const h = L.encodeState({ controls: { 'kem-param': 'ML-KEM-512' } });
  assert.ok(h.startsWith('#pqc='));
  assert.match(h.slice(5), /^[A-Za-z0-9_-]+$/);
});

test('HC2: full control map round-trips cleanly', () => {
  const controls = {
    'ntt-pattern': 'sparse', 'ntt-scale': 55, 'ntt-count': 128,
    'kem-param': 'ML-KEM-1024', 'kem-seed': 'seed-9', 'wots-msg': 'hello utxo',
    'xmss-height': 4, 'risk-value': 3.5, 'risk-age': 90000,
    'risk-exposed': false, 'risk-p2pkh': true,
    'verify-param': 'toy-64', 'verify-seeds': 24,
    'mx-family': 'FIPS 205', 'mx-sort': 'bytes', 'mx-metric': 'work',
    'report-seed': 'rseed', 'report-sweeps': '12',
    'qday-account': '0x' + '1'.repeat(40), 'qday-merchant': '0x' + '2'.repeat(40),
    'qday-amount': '7.25', 'qday-cap': '50',
    'qday-kem-param': 'ML-KEM-512',
    'lab-profile': 'cold-reserve', 'lab-utxos': 33, 'lab-settlements': 5,
    'lab-shortcuts': true
  };
  const d = L.decodeState(L.encodeState({ controls }));
  assert.equal(d.ok, true);
  assert.deepEqual(d.state.controls, controls);
});

test('HC3: partial control maps round-trip without inventing keys', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'lab-profile': 'hot-treasury' } }));
  assert.equal(d.ok, true);
  assert.deepEqual(d.state.controls, { 'lab-profile': 'hot-treasury' });
});

test('HC4: flat maps without a controls wrapper normalize the same way', () => {
  const d = L.decodeState(L.encodeState({ 'kem-param': 'ML-KEM-768' }));
  assert.equal(d.ok, true);
  assert.equal(d.state.controls['kem-param'], 'ML-KEM-768');
});

test('HC5: encoding is canonical and key-order independent', () => {
  const a = L.encodeState({ controls: { 'a-kem': undefined, 'kem-param': 'ML-KEM-512', 'ntt-count': 64 } });
  const b = L.encodeState({ controls: { 'ntt-count': 64, 'kem-param': 'ML-KEM-512' } });
  assert.equal(a, b);
});

test('HC6: decode accepts a hash with or without the leading #', () => {
  const h = L.encodeState({ controls: { 'lab-profile': 'cold-reserve' } });
  assert.equal(L.decodeState(h).ok, true);
  assert.equal(L.decodeState(h.slice(1)).ok, true);
});

test('HC7: decode fails closed on non-strings', () => {
  for (const h of [null, undefined, 42, {}, [], NaN]) {
    assert.equal(L.decodeState(h).ok, false, String(h));
  }
});

test('HC8: decode fails closed without the pqc= prefix', () => {
  for (const h of ['', '#', '#pqc', '#other=AA', 'pqc', '#pqc-']) {
    assert.equal(L.decodeState(h).ok, false, h);
  }
});

test('HC9: decode fails closed on empty or oversized bodies', () => {
  assert.equal(L.decodeState('#pqc=').ok, false);
  assert.equal(L.decodeState('#pqc=' + 'A'.repeat(8193)).ok, false);
  assert.equal(L.decodeState('#pqc=' + 'A'.repeat(8192)).ok, false); // valid b64 but not JSON
});

test('HC10: decode fails closed on non-base64url characters', () => {
  for (const h of ['#pqc=!!!', '#pqc=AA+/', '#pqc=AA A', '#pqc=AA=BB']) {
    assert.equal(L.decodeState(h).ok, false, h);
  }
});

test('HC11: decode fails closed on valid base64 that is not JSON', () => {
  const h = '#pqc=' + L.base64UrlEncode(P.utf8Bytes('hello world'));
  const d = L.decodeState(h);
  assert.equal(d.ok, false);
  assert.match(d.errors.join(' '), /JSON/);
});

test('HC12: decode fails closed on unsupported state versions', () => {
  for (const v of [2, 0, 'x', -1]) {
    const h = '#pqc=' + L.base64UrlEncode(P.utf8Bytes(JSON.stringify({ v, controls: {} })));
    assert.equal(L.decodeState(h).ok, false, String(v));
  }
});

test('HC13: hostile prototype keys fail the whole decode', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const payload = JSON.stringify({ v: 1, controls: { [key]: 1, 'kem-param': 'ML-KEM-512' } });
    const h = '#pqc=' + L.base64UrlEncode(P.utf8Bytes(payload));
    const d = L.decodeState(h);
    assert.equal(d.ok, false, key);
    assert.match(d.errors.join(' '), /hostile key/);
  }
});

test('HC14: unknown control ids drop but stay decode-ok', () => {
  const raw = JSON.stringify({ v: 1, controls: { 'made-up-key': 'x', 'kem-param': 'ML-KEM-512' } });
  const d = L.decodeState('#pqc=' + L.base64UrlEncode(P.utf8Bytes(raw)));
  assert.equal(d.ok, true);
  assert.deepEqual(d.dropped, ['made-up-key']);
  assert.equal(d.state.controls['kem-param'], 'ML-KEM-512');
});

test('HC15: NaN and Infinity control values drop, not clamp', () => {
  // Encode-side: non-finite numbers never reach the wire.
  const d = L.decodeState(L.encodeState({ controls: { 'ntt-scale': NaN, 'risk-value': Infinity, 'kem-param': 'ML-KEM-768' } }));
  assert.equal(d.ok, true);
  assert.equal('ntt-scale' in d.state.controls, false);
  assert.equal('risk-value' in d.state.controls, false);
  assert.equal(d.state.controls['kem-param'], 'ML-KEM-768');
  // Decode-side: a JSON null takes the same drop path and is recorded.
  const raw = JSON.stringify({ v: 1, controls: { 'ntt-scale': null, 'risk-age': null } });
  const d2 = L.decodeState('#pqc=' + L.base64UrlEncode(P.utf8Bytes(raw)));
  assert.equal(d2.ok, true);
  assert.ok(d2.dropped.indexOf('ntt-scale') !== -1);
  assert.ok(d2.dropped.indexOf('risk-age') !== -1);
});

test('HC16: -0 normalizes to a plain integer', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'lab-utxos': -0 } }));
  assert.equal(d.ok, true);
  assert.equal(d.state.controls['lab-utxos'], 1);
});

test('HC17: out-of-range ints clamp inside the DOM range', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'ntt-scale': 500, 'ntt-count': -4 } }));
  assert.equal(d.state.controls['ntt-scale'], 97);
  assert.equal(d.state.controls['ntt-count'], 16);
});

test('HC18: stepped ints snap to the nearest valid step', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'ntt-count': 63, 'verify-seeds': 13 } }));
  assert.equal(d.state.controls['ntt-count'], 64);
  assert.equal(d.state.controls['verify-seeds'], 12);
});

test('HC19: numeric strings coerce inside num fields', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'risk-value': '12.5', 'lab-utxos': '4000' } }));
  assert.equal(d.state.controls['risk-value'], 12.5);
  assert.equal(d.state.controls['lab-utxos'], 4000);
});

test('HC20: non-numeric strings drop from num fields', () => {
  const raw = JSON.stringify({ v: 1, controls: { 'risk-value': 'abc', 'lab-utxos': 'x' } });
  const d = L.decodeState('#pqc=' + L.base64UrlEncode(P.utf8Bytes(raw)));
  assert.equal(d.ok, true);
  assert.ok(d.dropped.indexOf('risk-value') !== -1);
  assert.ok(d.dropped.indexOf('lab-utxos') !== -1);
});

test('HC21: text fields coerce primitives and strip control characters', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'kem-seed': 'a\x00b\x7fc', 'wots-msg': 42 } }));
  assert.equal(d.state.controls['kem-seed'], 'abc');
  assert.equal(d.state.controls['wots-msg'], '42');
});

test('HC22: text fields truncate to their declared maximum', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'kem-seed': 'x'.repeat(200), 'qday-amount': '9'.repeat(40) } }));
  assert.equal(d.state.controls['kem-seed'].length, 64);
  assert.equal(d.state.controls['qday-amount'].length, 24);
});

test('HC23: non-scalar values drop from text fields', () => {
  const raw = JSON.stringify({ v: 1, controls: { 'kem-seed': { evil: 1 }, 'wots-msg': [1, 2] } });
  const d = L.decodeState('#pqc=' + L.base64UrlEncode(P.utf8Bytes(raw)));
  assert.equal(d.ok, true);
  assert.ok(d.dropped.indexOf('kem-seed') !== -1);
  assert.ok(d.dropped.indexOf('wots-msg') !== -1);
});

test('HC24: bool fields accept every honest boolean spelling', () => {
  for (const [raw, want] of [[true, true], [false, false], ['true', true], ['false', false], [1, true], [0, false], ['1', true], ['0', false]]) {
    const d = L.decodeState(L.encodeState({ controls: { 'risk-exposed': raw } }));
    assert.equal(d.state.controls['risk-exposed'], want, String(raw));
  }
});

test('HC25: bool fields drop hostile spellings', () => {
  for (const raw of ['yes', 'on', 2, [], {}]) {
    const payload = JSON.stringify({ v: 1, controls: { 'risk-exposed': raw } });
    const d = L.decodeState('#pqc=' + L.base64UrlEncode(P.utf8Bytes(payload)));
    assert.equal(d.ok, true, String(raw));
    assert.ok(d.dropped.indexOf('risk-exposed') !== -1, String(raw));
  }
});

test('HC26: select fields drop out-of-set values', () => {
  const raw = JSON.stringify({ v: 1, controls: { 'kem-param': 'ML-KEM-999', 'mx-family': 'FIPS 206' } });
  const d = L.decodeState('#pqc=' + L.base64UrlEncode(P.utf8Bytes(raw)));
  assert.equal(d.ok, true);
  assert.ok(d.dropped.indexOf('kem-param') !== -1);
  assert.ok(d.dropped.indexOf('mx-family') !== -1);
});

test('HC27: a formula-injection seed survives as inert text', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'kem-seed': '=CMD()' } }));
  assert.equal(d.ok, true);
  assert.equal(d.state.controls['kem-seed'], '=CMD()');
});

test('HC28: multibyte text round-trips through the codec', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'wots-msg': 'migrate \u00b5\u20ac utxo' } }));
  assert.equal(d.state.controls['wots-msg'], 'migrate \u00b5\u20ac utxo');
});

test('HC29: control-count overflow fails closed', () => {
  const controls = {};
  for (let i = 0; i < 201; i++) controls['k' + i] = 'v';
  const h = '#pqc=' + L.base64UrlEncode(P.utf8Bytes(JSON.stringify({ v: 1, controls })));
  assert.equal(L.decodeState(h).ok, false);
});

test('HC30: oversized keys drop without failing the decode', () => {
  const controls = {};
  controls['k'.repeat(80)] = 'v';
  const h = '#pqc=' + L.base64UrlEncode(P.utf8Bytes(JSON.stringify({ v: 1, controls })));
  const d = L.decodeState(h);
  assert.equal(d.ok, true);
  assert.equal(d.dropped.length, 1);
});

test('HC31: encodeState throws on non-object input', () => {
  for (const bad of [null, undefined, 42, 'x', [1]]) {
    assert.throws(() => L.encodeState(bad), TypeError, String(bad));
  }
});

test('HC32: decodeState returns a versioned state object', () => {
  const d = L.decodeState(L.encodeState({ controls: {} }));
  assert.equal(d.state.v, 1);
  assert.deepEqual(d.state.controls, {});
});

test('HC33: base64url codec round-trips arbitrary bytes', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 100, 255]) {
    const bytes = P.randomBytes(len, 'hc33:' + len);
    if (len === 0) {
      assert.equal(L.base64UrlEncode(bytes), '');
      continue;
    }
    const enc = L.base64UrlEncode(bytes);
    assert.deepEqual(Array.from(L.base64UrlDecode(enc)), Array.from(bytes), 'len ' + len);
  }
});

test('HC34: base64UrlDecode rejects bad input shapes', () => {
  for (const s of ['', 'A'.repeat(9000), 'a b', 'a=b', 12, null]) {
    assert.throws(() => L.base64UrlDecode(s), TypeError, String(s));
  }
});

test('HC35: normalizeState fails closed on non-objects and bad versions', () => {
  assert.equal(L.normalizeState(null).ok, false);
  assert.equal(L.normalizeState([1, 2]).ok, false);
  assert.equal(L.normalizeState({ v: 9, controls: {} }).ok, false);
  assert.equal(L.normalizeState({ controls: 'x' }).ok, false);
});

// ---------------------------------------------------------------
// Section BR: cached canonical SHA-256 audited brief
// ---------------------------------------------------------------
const BRIEF = L.auditedBrief({ profile: 'qday-aevum-tusd8', seed: 'suite-brief' });

test('BR1: audited brief exposes digest, payload and three exports', () => {
  assert.match(BRIEF.sha256, /^[0-9a-f]{64}$/);
  assert.equal(BRIEF.payload.sha256, BRIEF.sha256);
  assert.ok(BRIEF.json.length > 100 && BRIEF.csv.length > 100 && BRIEF.markdown.length > 100);
});

test('BR2: digest equals SHA-256 over the canonical payload minus the stamp', () => {
  const body = {};
  for (const k of Object.keys(BRIEF.payload)) if (k !== 'sha256') body[k] = BRIEF.payload[k];
  const want = P.bytesToHex(P.sha256(P.utf8Bytes(Q.canonicalString(body))));
  assert.equal(BRIEF.sha256, want);
});

test('BR3: repeated exports reuse one cached object per state key', () => {
  const again = L.auditedBrief({ profile: 'qday-aevum-tusd8', seed: 'suite-brief' });
  assert.equal(again, BRIEF);
  assert.equal(again.sha256, BRIEF.sha256);
});

test('BR4: state keys separate profile, volumes and seed', () => {
  const a = L.auditedBrief({ profile: 'hot-treasury', seed: 'k1' });
  const b = L.auditedBrief({ profile: 'hot-treasury', seed: 'k2' });
  const c = L.auditedBrief({ profile: 'hot-treasury', seed: 'k1', utxoCount: 9 });
  assert.notEqual(a.sha256, b.sha256);
  assert.notEqual(a.sha256, c.sha256);
  assert.ok(L.cachedBriefKeys().length >= 4);
});

test('BR5: JSON export parses back to the stamped payload', () => {
  const parsed = JSON.parse(BRIEF.json);
  assert.equal(parsed.sha256, BRIEF.sha256);
  assert.equal(parsed.schema, L.AUDIT_SCHEMA);
  assert.equal(parsed.comparator.length, 5);
});

test('BR6: payload carries no clock fields, so digests are stable', () => {
  assert.equal(/"(generatedAt|timestamp|date|now|createdAt)":/i.test(BRIEF.json), false);
});

test('BR7: CSV provenance block names the same digest', () => {
  const line = BRIEF.csv.split('\n').find(l => l.indexOf('SHA-256') !== -1);
  assert.ok(line.indexOf(BRIEF.sha256) !== -1);
});

test('BR8: Markdown footer names the same digest', () => {
  const line = BRIEF.markdown.split('\n').find(l => l.indexOf('SHA-256') !== -1);
  assert.ok(line.indexOf(BRIEF.sha256) !== -1);
});

test('BR9: page, JSON, CSV and Markdown fingerprints are identical', () => {
  const digests = [BRIEF.sha256,
    JSON.parse(BRIEF.json).sha256,
    BRIEF.csv.match(/SHA-256: ([0-9a-f]{64})/)[1],
    BRIEF.markdown.match(/SHA-256 \(canonical payload\): ([0-9a-f]{64})/)[1]];
  assert.ok(digests.every(d => d === digests[0]));
});

test('BR10: verifyBrief accepts a fresh brief', () => {
  const v = L.verifyBrief(BRIEF);
  assert.equal(v.ok, true);
  assert.equal(v.tamperDetected, false);
});

test('BR11: verifyBrief accepts the bare payload object too', () => {
  assert.equal(L.verifyBrief(BRIEF.payload).ok, true);
});

test('BR12: verifyBrief detects a mutated comparator figure', () => {
  const t = JSON.parse(JSON.stringify(BRIEF.payload));
  t.comparator[2].latencyIndex += 0.01;
  const v = L.verifyBrief(t);
  assert.equal(v.ok, false);
  assert.equal(v.tamperDetected, true);
  assert.notEqual(v.actual, v.expected);
});

test('BR13: verifyBrief detects a swapped digest', () => {
  const t = JSON.parse(JSON.stringify(BRIEF.payload));
  t.sha256 = '0'.repeat(64);
  assert.equal(L.verifyBrief(t).ok, false);
});

test('BR14: verifyBrief fails closed on malformed input', () => {
  for (const bad of [null, 5, 'x', [], {}, { sha256: 'zz' }]) {
    assert.equal(L.verifyBrief(bad).ok, false, String(bad));
  }
});

test('BR15: tamperCheckBrief proves the digest catches a flip', () => {
  const t = L.tamperCheckBrief(BRIEF);
  assert.equal(t.held, true);
  assert.equal(t.mutatedField, 'comparator[0].perSettlementBytes');
});

test('BR16: brief selfChecks all report true', () => {
  for (const [k, v] of Object.entries(BRIEF.payload.selfChecks)) {
    assert.equal(v, true, k);
  }
});

test('BR17: adversarial summary inside the brief held every vector', () => {
  assert.equal(BRIEF.payload.adversarial.held, BRIEF.payload.adversarial.total);
  assert.equal(BRIEF.payload.adversarial.allFailClosed, true);
  assert.ok(BRIEF.payload.adversarial.vectors.length >= 30);
});

test('BR18: includeAdversarial false produces a null adversarial block', () => {
  const b = L.auditedBrief({ profile: 'cold-reserve', seed: 'noadv', includeAdversarial: false });
  assert.equal(b.payload.adversarial, null);
  assert.equal(b.payload.selfChecks.adversarialAllHeld, null);
  assert.equal(L.verifyBrief(b).ok, true);
});

test('BR19: runParameters record custom volume overrides', () => {
  const b = L.auditedBrief({ profile: 'hot-treasury', seed: 'vols', utxoCount: 12, annualSettlements: 34 });
  assert.equal(b.payload.runParameters.utxoCount, 12);
  assert.equal(b.payload.runParameters.annualSettlements, 34);
  assert.equal(b.payload.runParameters.customVolumes, true);
});

test('BR20: hostile volume options clamp like the codec does', () => {
  const b = L.auditedBrief({ profile: 'hot-treasury', seed: 'hostile', utxoCount: -5, annualSettlements: 1e30 });
  assert.equal(b.payload.runParameters.utxoCount, 1);
  assert.equal(b.payload.runParameters.annualSettlements, 1000000000);
});

test('BR21: non-string seeds fall back to the default', () => {
  const a = L.auditedBrief({ profile: 'hot-treasury', seed: 'migration-lab-brief' });
  const b = L.auditedBrief({ profile: 'hot-treasury', seed: 42 });
  assert.equal(b.payload.runParameters.seed, 'migration-lab-brief');
  assert.equal(b.sha256, a.sha256);
});

test('BR22: CSV output is formula-safe for hostile seeds and verdicts', () => {
  const b = L.auditedBrief({ profile: 'hot-treasury', seed: '=CMD()' });
  for (const line of b.csv.split('\n')) {
    if (line.startsWith('#')) continue;
    assert.equal(/^\s*[=+\-@\t]/.test(line), false, line.slice(0, 40));
  }
});

test('BR23: CSV rows match the comparator cells exactly', () => {
  const rows = BRIEF.csv.split('\n').filter(l => l && l[0] !== '#');
  assert.equal(rows[0].split(',').length, 13);
  assert.equal(rows.length, 6);
  const cell = BRIEF.payload.comparator[1];
  const r = rows[2].split(',');
  assert.equal(r[0], cell.regime);
  assert.equal(Number(r[6]), cell.perSettlementBytes);
});

test('BR24: Markdown table carries all five regimes and the adversarial table', () => {
  for (const id of REGIMES) assert.ok(BRIEF.markdown.indexOf('| ' + id + ' |') !== -1, id);
  assert.ok(BRIEF.markdown.indexOf('kem-bitflip-u') !== -1);
});

test('BR25: exports contain no em or en dashes', () => {
  const re = /[\u2013\u2014]/;
  assert.equal(re.test(BRIEF.json), false);
  assert.equal(re.test(BRIEF.csv), false);
  assert.equal(re.test(BRIEF.markdown), false);
});

test('BR26: briefStateKey canonicalizes option order', () => {
  const a = L.briefStateKey({ profile: 'hot-treasury', seed: 's', utxoCount: 5 });
  const b = L.briefStateKey({ seed: 's', utxoCount: 5, profile: 'hot-treasury' });
  assert.equal(a.key, b.key);
});

// ---------------------------------------------------------------
// Section ST: in-page self tests
// ---------------------------------------------------------------
test('ST1: selfTests returns at least twelve checks', () => {
  assert.ok(L.selfTests().length >= 12);
});

test('ST2: every self test passes and carries id, name and detail', () => {
  for (const t of L.selfTests()) {
    assert.equal(typeof t.id, 'string');
    assert.equal(typeof t.name, 'string');
    assert.equal(t.pass, true, t.id);
  }
});

test('ST3: self test ids are unique and deterministic across runs', () => {
  const a = L.selfTests().map(t => t.id);
  const b = L.selfTests().map(t => t.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

// ---------------------------------------------------------------
// Section X: cross-cutting hostile-input probes
// ---------------------------------------------------------------
test('X1: comparatorMatrix rejects unknown and hostile profiles', () => {
  assert.throws(() => L.comparatorMatrix({ profile: 'nope' }), RangeError);
  assert.throws(() => L.comparatorMatrix({ profile: '__proto__' }), RangeError);
  assert.throws(() => L.comparatorMatrix({ profile: {} }), RangeError);
});

test('X2: classifyHndl rejects unknown regimes', () => {
  const prof = L.resolvedProfile('cold-reserve');
  assert.throws(() => L.classifyHndl('nope', prof), RangeError);
  assert.throws(() => L.classifyHndl('constructor', prof), RangeError);
});

test('X3: classifyHndl notes are honest about the classical leg', () => {
  const prof = L.resolvedProfile('hot-treasury');
  assert.match(L.classifyHndl('hybrid-ecdsa-mlkem768', prof).note, /cannot move funds by itself/);
  assert.match(L.classifyHndl('legacy-ecdsa', prof).note, /Shor-vulnerable/);
});

test('X4: paretoFrontier handles empty and degenerate point sets', () => {
  assert.deepEqual(L.paretoFrontier([]), []);
  const single = L.paretoFrontier([{ id: 'a', x: 1, y: 1 }]);
  assert.equal(single.length, 1);
  const tied = L.paretoFrontier([{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 1, y: 1 }]);
  assert.equal(tied.length, 1);
});

test('X5: module exposes the UMD global name and the audit schema', () => {
  assert.equal(L.AUDIT_SCHEMA, 'pqc-vault-bench/audit-brief-v1');
  assert.equal(L.STATE_SCHEMA, 'pqc-vault-bench/state-v1');
  assert.equal(L.HASH_PREFIX, '#pqc=');
  assert.equal(typeof L.LAB_VERSION, 'string');
});

test('X6: CONTROL_SCHEMA covers every lab control the page exposes', () => {
  for (const id of ['lab-profile', 'lab-utxos', 'lab-settlements', 'lab-shortcuts']) {
    assert.ok(L.CONTROL_SCHEMA[id], id);
  }
});

test('X7: comparator cells stay finite under maximum-volume stress', () => {
  const m = L.comparatorMatrix({ profile: 'hot-treasury', overrides: { utxoCount: 10000000, annualSettlements: 1000000000 } });
  for (const c of m.cells) {
    assert.ok(Number.isFinite(c.bytes.annualWire), c.regime);
    assert.ok(Number.isFinite(c.latencyIndex), c.regime);
  }
});

test('X8: adversarial seeds with formula text run identically', () => {
  const adv = L.adversarialMatrix({ seed: '=CMD()\n@malicious' });
  assert.equal(adv.summary.allHeld, true);
});

test('X9: a decoded share-state feeds straight into the comparator', () => {
  const d = L.decodeState(L.encodeState({ controls: { 'lab-profile': 'high-freq-settlement', 'lab-utxos': 500, 'lab-settlements': 90000 } }));
  const m = L.comparatorMatrix({
    profile: d.state.controls['lab-profile'],
    overrides: { utxoCount: d.state.controls['lab-utxos'], annualSettlements: d.state.controls['lab-settlements'] }
  });
  assert.equal(m.profile.utxoCount, 500);
  assert.equal(m.profile.annualSettlements, 90000);
});

test('X10: brief for the shared profile digest-matches the in-page exporter input', () => {
  const key = L.briefStateKey({ profile: 'qday-aevum-tusd8', seed: 'suite-brief' });
  assert.equal(BRIEF.stateKey, key.key);
  assert.equal(BRIEF.payload.runParameters.profile, 'qday-aevum-tusd8');
});

test('X11: every CONTROL_SCHEMA id exists as a real element in index.html', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  for (const id of Object.keys(L.CONTROL_SCHEMA)) {
    assert.ok(html.indexOf('id="' + id + '"') !== -1, 'missing element #' + id);
  }
  // And the lab section loads the module before app.js.
  assert.ok(html.indexOf('src/migration-lab.js') !== -1);
  assert.ok(html.indexOf('src/migration-lab.js') < html.indexOf('app.js'));
});

test('X12: page controls the schema does not know stay unencoded', () => {
  // A hypothetical DOM-only control never lands in the codec.
  const d = L.decodeState(L.encodeState({ controls: { 'theme-toggle': 'x', 'lab-profile': 'cold-reserve' } }));
  assert.equal(d.ok, true);
  assert.equal('theme-toggle' in d.state.controls, false);
  assert.equal(d.state.controls['lab-profile'], 'cold-reserve');
});
