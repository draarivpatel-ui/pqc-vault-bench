'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pqc = require('../src/pqc.js');

const Q = pqc.Q;
const N = pqc.N;

function ramp(start, step) {
  return Array.from({ length: N }, (_, i) => (start + i * step) % Q);
}

// ---------------------------------------------------------------
// Section 1: constants and modular arithmetic (tests 1-8)
// ---------------------------------------------------------------
test('1: Kyber ring constants are the FIPS 203 values', () => {
  assert.equal(Q, 3329);
  assert.equal(N, 256);
  assert.equal(pqc.ZETA, 17);
});

test('2: mod normalizes negative and oversized inputs', () => {
  assert.equal(pqc.mod(-1), Q - 1);
  assert.equal(pqc.mod(Q + 7), 7);
  assert.equal(pqc.mod(-Q - 3), Q - 3);
  assert.equal(pqc.mod(10, 7), 3);
});

test('3: modPow matches Fermat little theorem', () => {
  assert.equal(pqc.modPow(17, Q - 1), 1);
  assert.equal(pqc.modPow(17, 128), 3328);
  assert.equal(pqc.modPow(17, 256), 1);
});

test('4: bitRev7 is its own inverse', () => {
  for (let i = 0; i < 128; i++) assert.equal(pqc.bitRev7(pqc.bitRev7(i)), i);
});

test('5: zeta table matches the FIPS 203 Montgomery-prefixed roots', () => {
  // zeta[j] = 17^brv7(j) (plain integer form); the first 8 Montgomery
  // forms are 2285, 2571, 2970, 1812, 1493, 1422, 287, 202.
  const mont = pqc.ZETAS.slice(0, 8).map(z => pqc.mod(z * pqc.modPow(2, 16)));
  assert.deepEqual(mont, [2285, 2571, 2970, 1812, 1493, 1422, 287, 202]);
});

test('6: each zeta inverse multiplies with its zeta to 1', () => {
  for (let j = 0; j < 128; j++) assert.equal(pqc.mod(pqc.ZETAS[j] * pqc.ZETAS_INV[j]), 1);
});

test('7: INV_128 is the modular inverse of 128', () => {
  assert.equal(pqc.mod(128 * pqc.INV_128), 1);
});

test('8: assertPoly rejects wrong lengths and non integers', () => {
  assert.throws(() => pqc.ntt([1, 2, 3]), TypeError);
  assert.throws(() => pqc.ntt(new Array(N).fill(0.5)), TypeError);
  assert.doesNotThrow(() => pqc.ntt(new Array(N).fill(0)));
});

// ---------------------------------------------------------------
// Section 2: Number Theoretic Transform (tests 9-20)
// ---------------------------------------------------------------
test('9: NTT round trip recovers the input polynomial', () => {
  const a = ramp(11, 37);
  assert.deepEqual(pqc.inverseNTT(pqc.ntt(a)), a);
});

test('10: NTT of the zero polynomial is zero', () => {
  assert.deepEqual(pqc.ntt(pqc.polyZero()), pqc.polyZero());
});

test('11: NTT is linear (additivity)', () => {
  const a = ramp(3, 17), b = ramp(5, 29);
  const lhs = pqc.ntt(pqc.polyAdd(a, b));
  const rhs = pqc.polyAdd(pqc.ntt(a), pqc.ntt(b));
  assert.deepEqual(lhs, rhs);
});

test('12: NTT is linear (homogeneity)', () => {
  const a = ramp(7, 41), c = 123;
  const scaled = a.map(x => pqc.mod(x * c));
  const rhs = pqc.ntt(a).map(x => pqc.mod(x * c));
  assert.deepEqual(pqc.ntt(scaled), rhs);
});

test('13: polyMul agrees with schoolbook negacyclic convolution', () => {
  const a = ramp(11, 37), b = ramp(5, 13);
  assert.deepEqual(pqc.polyMul(a, b), pqc.schoolbookMul(a, b));
});

test('14: polyMul agrees with schoolbook on random-like polynomials', () => {
  for (let t = 0; t < 3; t++) {
    const a = ramp(t * 3 + 1, t * 11 + 7);
    const b = ramp(t * 5 + 2, t * 17 + 3);
    assert.deepEqual(pqc.polyMul(a, b), pqc.schoolbookMul(a, b));
  }
});

test('15: x^255 * x = -1 in the negacyclic ring', () => {
  const x255 = pqc.polyZero(); x255[255] = 1;
  const x = pqc.polyZero(); x[1] = 1;
  const prod = pqc.polyMul(x255, x);
  assert.equal(prod[0], Q - 1);
  for (let i = 1; i < N; i++) assert.equal(prod[i], 0);
});

test('16: multiplication by the one polynomial is identity', () => {
  const a = ramp(9, 23);
  assert.deepEqual(pqc.polyMul(a, pqc.polyOne()), a);
});

test('17: polyMul is commutative', () => {
  const a = ramp(4, 31), b = ramp(6, 19);
  assert.deepEqual(pqc.polyMul(a, b), pqc.polyMul(b, a));
});

test('18: baseCaseMultiply output has 256 integer coefficients', () => {
  const A = pqc.ntt(ramp(1, 7)), B = pqc.ntt(ramp(2, 11));
  const C = pqc.baseCaseMultiply(A, B);
  assert.equal(C.length, N);
  assert.ok(C.every(v => Number.isInteger(v) && v >= 0 && v < Q));
});

test('19: polyAdd and polySub are inverse operations', () => {
  const a = ramp(13, 43), b = ramp(2, 5);
  assert.deepEqual(pqc.polySub(pqc.polyAdd(a, b), b), a);
});

test('20: baseCaseMultiply rejects wrong-length input', () => {
  assert.throws(() => pqc.baseCaseMultiply([1], pqc.ntt(ramp(1, 1))), TypeError);
});

// ---------------------------------------------------------------
// Section 3: SHA-256, hex and deterministic streams (tests 21-30)
// ---------------------------------------------------------------
test('21: SHA-256 of the empty string is the standard digest', () => {
  assert.equal(pqc.bytesToHex(pqc.sha256(new Uint8Array(0))),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('22: SHA-256 of abc is the standard digest', () => {
  assert.equal(pqc.bytesToHex(pqc.sha256(pqc.utf8Bytes('abc'))),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('23: SHA-256 output is always 32 bytes', () => {
  for (let len = 0; len < 200; len++) {
    assert.equal(pqc.sha256(new Uint8Array(len).fill(len)).length, 32);
  }
});

test('24: bytesToHex and hexToBytes round trip', () => {
  const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 254, 255]);
  assert.deepEqual(pqc.hexToBytes(pqc.bytesToHex(bytes)), bytes);
});

test('25: hexToBytes rejects malformed hex', () => {
  assert.throws(() => pqc.hexToBytes('abc'), TypeError);
  assert.throws(() => pqc.hexToBytes('zz'), TypeError);
});

test('26: xof is deterministic for the same seed', () => {
  assert.deepEqual(pqc.xof('seed', 64), pqc.xof('seed', 64));
});

test('27: xof produces different streams for different labels', () => {
  assert.notDeepEqual(pqc.xof('seed', 32, 'a'), pqc.xof('seed', 32, 'b'));
});

test('28: xof returns the exact requested length', () => {
  assert.equal(pqc.xof('s', 1000).length, 1000);
  assert.equal(pqc.xof('s', 1).length, 1);
});

test('29: randomBytes is deterministic given a seed', () => {
  assert.deepEqual(pqc.randomBytes(48, 'k'), pqc.randomBytes(48, 'k'));
});

test('30: hashHex is domain separated', () => {
  assert.notEqual(pqc.hashHex('msg', 'A'), pqc.hashHex('msg', 'B'));
  assert.equal(pqc.hashHex('msg', 'A'), pqc.hashHex('msg', 'A'));
});

// ---------------------------------------------------------------
// Section 4: compression, encoding and error sampling (tests 31-40)
// ---------------------------------------------------------------
test('31: compress/decompress is close to identity for d=12', () => {
  for (const x of [0, 1, 17, 1000, 1665, 3328]) assert.equal(pqc.decompress(pqc.compress(x, 12), 12), x);
});

test('32: compress output stays inside 2^d', () => {
  for (const d of [1, 4, 10, 11]) {
    for (const x of [0, 500, 1665, 3328]) assert.ok(pqc.compress(x, d) < Math.pow(2, d));
  }
});

test('33: encodePoly/decodePoly round trips for every d', () => {
  for (const d of [1, 4, 10, 11, 12]) {
    const poly = Array.from({ length: N }, (_, i) => (i * 7 + 3) % Math.pow(2, d));
    assert.deepEqual(pqc.decodePoly(pqc.encodePoly(poly, d), d), poly);
  }
});

test('34: 12-bit polynomial byte encoding round trips', () => {
  const poly = ramp(0, 13);
  assert.deepEqual(pqc.bytesToPoly12(pqc.polyToBytes12(poly)), poly);
});

test('35: cbdSample produces coefficients inside -eta..eta (mod q)', () => {
  const eta = 2;
  const bytes = pqc.xof('cbd', 2 * eta * N / 8, 'test');
  const poly = pqc.cbdSample(bytes, eta);
  assert.equal(poly.length, N);
  for (const v of poly) {
    const centered = v > Q / 2 ? v - Q : v;
    assert.ok(centered >= -eta && centered <= eta);
  }
});

test('36: cbdSample throws on insufficient bytes', () => {
  assert.throws(() => pqc.cbdSample(new Uint8Array(2), 2), RangeError);
});

test('37: samplePoly is deterministic', () => {
  assert.deepEqual(pqc.samplePoly('s', 'lbl', 2), pqc.samplePoly('s', 'lbl', 2));
});

test('38: matrixFromSeed is deterministic and uniform-ish', () => {
  const A = pqc.matrixFromSeed('matrix-seed', 3);
  assert.equal(A.length, 3);
  assert.equal(A[0].length, 3);
  assert.ok(A[0][0].every(v => Number.isInteger(v) && v >= 0 && v < Q));
  assert.deepEqual(A, pqc.matrixFromSeed('matrix-seed', 3));
});

test('39: errorHistogram reports a symmetric centered distribution', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-768' });
  const h = kem.errorHistogram('hist', 2);
  assert.ok(h.bins.length >= 3);
  assert.ok(Math.abs(h.mean) < 0.5);
  assert.ok(h.stdDev > 0 && h.stdDev < 2);
  assert.equal(h.eta, 2);
});

test('40: errorHistogram is deterministic', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-512' });
  assert.deepEqual(kem.errorHistogram('x', 3), kem.errorHistogram('x', 3));
});

// ---------------------------------------------------------------
// Section 5: ML-KEM (tests 41-52)
// ---------------------------------------------------------------
const KEM_SETS = ['toy-64', 'ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'];

for (const param of KEM_SETS) {
  test('41: ' + param + ' deriveFromSeed returns expected key sizes', () => {
    const kem = pqc.MLKEM({ param });
    const keys = kem.deriveFromSeed('seed-' + param);
    assert.equal(keys.ek.length, 32 + kem.k * 384);
    assert.equal(keys.A.length, kem.k);
    assert.equal(keys.tHat.length, kem.k);
    assert.equal(keys.dk.sHat.length, kem.k);
  });

  test('42: ' + param + ' encapsulate/decapsulate agree on shared secret', () => {
    const kem = pqc.MLKEM({ param });
    const keys = kem.deriveFromSeed('seed-' + param);
    const enc = kem.encapsulate(keys.ek, 'enc-' + param);
    const dec = kem.decapsulate(enc.ciphertext, keys.dk);
    assert.deepEqual(dec, enc.sharedSecret);
  });

  test('43: ' + param + ' ciphertext length matches the parameter set', () => {
    const kem = pqc.MLKEM({ param });
    const keys = kem.deriveFromSeed('seed-' + param);
    const enc = kem.encapsulate(keys.ek, 'enc-' + param);
    const expected = kem.k * Math.ceil(N * kem.params.du / 8) + Math.ceil(N * kem.params.dv / 8);
    assert.equal(enc.ciphertext.length, expected);
  });
}

test('44: ML-KEM shared secret is 32 bytes', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-768' });
  const keys = kem.deriveFromSeed('s');
  const enc = kem.encapsulate(keys.ek, 'e');
  assert.equal(enc.sharedSecret.length, 32);
});

test('45: ML-KEM is deterministic for the same seeds', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-768' });
  const keys = kem.deriveFromSeed('deterministic');
  const a = kem.encapsulate(keys.ek, 'm');
  const b = kem.encapsulate(keys.ek, 'm');
  assert.deepEqual(a.ciphertext, b.ciphertext);
  assert.deepEqual(a.sharedSecret, b.sharedSecret);
});

test('46: different encaps seeds give different ciphertexts', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-768' });
  const keys = kem.deriveFromSeed('s');
  const a = kem.encapsulate(keys.ek, 'm1');
  const b = kem.encapsulate(keys.ek, 'm2');
  assert.notDeepEqual(a.ciphertext, b.ciphertext);
});

test('47: a tampered ciphertext is implicitly rejected', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-768' });
  const keys = kem.deriveFromSeed('s');
  const enc = kem.encapsulate(keys.ek, 'e');
  const bad = enc.ciphertext.slice();
  bad[7] ^= 1;
  assert.notDeepEqual(kem.decapsulate(bad, keys.dk), enc.sharedSecret);
});

test('48: decapsulation with a different secret key is rejected', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-768' });
  const k1 = kem.deriveFromSeed('key-one');
  const k2 = kem.deriveFromSeed('key-two');
  const enc = kem.encapsulate(k1.ek, 'e');
  assert.notDeepEqual(kem.decapsulate(enc.ciphertext, k2.dk), enc.sharedSecret);
});

test('49: MLKEM rejects an unknown parameter set', () => {
  assert.throws(() => pqc.MLKEM({ param: 'ML-KEM-999' }), RangeError);
});

test('50: KEM_PARAMS exposes four parameter sets', () => {
  assert.equal(Object.keys(pqc.KEM_PARAMS).length, 4);
  assert.equal(pqc.KEM_DEFAULT, 'ML-KEM-768');
});

test('51: shakeKey is deterministic and domain separated', () => {
  const c = new Uint8Array([1, 2, 3]);
  assert.deepEqual(pqc.shakeKey('s', c, 'A'), pqc.shakeKey('s', c, 'A'));
  assert.notDeepEqual(pqc.shakeKey('s', c, 'A'), pqc.shakeKey('s', c, 'B'));
});

test('52: bytesEqual handles length differences', () => {
  assert.equal(pqc.bytesEqual(new Uint8Array([1]), new Uint8Array([1, 2])), false);
  assert.equal(pqc.bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
});

// ---------------------------------------------------------------
// Section 6: WOTS+ and XMSS (tests 53-64)
// ---------------------------------------------------------------
test('53: WOTS+ constants are consistent', () => {
  assert.equal(pqc.WOTS_W, 16);
  assert.equal(pqc.WOTS_LEN, 67);
  assert.equal(pqc.WOTS_L1, 64);
  assert.equal(pqc.WOTS_L2, 3);
});

test('54: wotsGenerate produces 67 chains of 32 bytes', () => {
  const kp = pqc.wotsGenerate('seed');
  assert.equal(kp.sk.length, pqc.WOTS_LEN);
  assert.equal(kp.pk.length, pqc.WOTS_LEN);
  assert.ok(kp.sk.every(x => x.length === 32));
});

test('55: wotsPublicKeyHex returns a 64-char hex digest', () => {
  assert.match(pqc.wotsPublicKeyHex(pqc.wotsGenerate('seed')), /^[0-9a-f]{64}$/);
});

test('56: wotsChain reaches the same endpoint from any split point', () => {
  const start = pqc.xof('chain', 32, 'start');
  const full = pqc.wotsChain(start, 0, 15, new Uint8Array([3, 0]));
  const partial = pqc.wotsChain(start, 0, 6, new Uint8Array([3, 0]));
  const rest = pqc.wotsChain(partial, 6, 9, new Uint8Array([3, 0]));
  assert.deepEqual(rest, full);
});

test('57: messageToBaseW with w=16 yields 64 nibbles', () => {
  const digest = pqc.sha256(pqc.utf8Bytes('m'));
  assert.equal(pqc.messageToBaseW(digest, 16).length, 64);
});

test('58: wotsChecksum counters forgery (sum is monotone in digits)', () => {
  const digits = new Array(64).fill(0);
  const c1 = pqc.wotsChecksum(digits, 16);
  digits[0] = 15;
  const c2 = pqc.wotsChecksum(digits, 16);
  // Raising one message digit by 15 lowers the checksum by 15, so the
  // checksum chains must move in the opposite direction to stay valid.
  assert.notDeepEqual(c1, c2);
  const total = c => c[0] * 256 + c[1] * 16 + c[2];
  assert.equal(total(c1) - total(c2), 15);
});

test('59: wotsSign/wotsVerify accepts an honest signature', () => {
  const kp = pqc.wotsGenerate('wots-seed');
  const sig = pqc.wotsSign('BCH UTXO migration', kp);
  assert.equal(pqc.wotsVerify('BCH UTXO migration', sig.signature, kp.pkHash), true);
});

test('60: wotsVerify rejects a modified message', () => {
  const kp = pqc.wotsGenerate('wots-seed');
  const sig = pqc.wotsSign('original', kp);
  assert.equal(pqc.wotsVerify('tampered', sig.signature, kp.pkHash), false);
});

test('61: wotsVerify rejects a modified signature element', () => {
  const kp = pqc.wotsGenerate('wots-seed');
  const sig = pqc.wotsSign('original', kp);
  const bad = sig.signature.map(x => x.slice());
  bad[0][0] ^= 1;
  assert.equal(pqc.wotsVerify('original', bad, kp.pkHash), false);
});

test('62: merkleRoot builds a deterministic single root', () => {
  const leaves = Array.from({ length: 4 }, (_, i) => pqc.sha256(pqc.utf8Bytes('leaf' + i)));
  const tree = pqc.merkleRoot(leaves, 2);
  assert.equal(tree.root.length, 32);
  assert.equal(tree.levels.length, 3);
  assert.deepEqual(tree.root, pqc.merkleRoot(leaves, 2).root);
});

test('63: merkleProof verifies for every leaf', () => {
  const leaves = Array.from({ length: 8 }, (_, i) => pqc.sha256(pqc.utf8Bytes('leaf' + i)));
  const tree = pqc.merkleRoot(leaves, 3);
  const root = pqc.bytesToHex(tree.root);
  for (let i = 0; i < 8; i++) {
    const proof = pqc.merkleProof(tree.levels, i);
    assert.equal(pqc.verifyMerkleProof(pqc.bytesToHex(leaves[i]), proof, root, i, 3), true);
  }
});

test('64: merkleProof rejects a wrong leaf', () => {
  const leaves = Array.from({ length: 4 }, (_, i) => pqc.sha256(pqc.utf8Bytes('leaf' + i)));
  const tree = pqc.merkleRoot(leaves, 2);
  const proof = pqc.merkleProof(tree.levels, 0);
  const wrong = pqc.bytesToHex(pqc.sha256(pqc.utf8Bytes('not a leaf')));
  assert.equal(pqc.verifyMerkleProof(wrong, proof, pqc.bytesToHex(tree.root), 0, 2), false);
});

test('65: XMSS signs and verifies every leaf of a height-3 tree', () => {
  const xmss = pqc.XMSS({ height: 3, seed: 'xmss-seed' });
  const sigs = [];
  for (let i = 0; i < 8; i++) sigs.push(xmss.sign('tx-' + i));
  assert.ok(sigs.every(s => xmss.verify(s)));
  assert.equal(xmss.remaining, 0);
});

test('66: XMSS signature includes a valid Merkle proof', () => {
  const xmss = pqc.XMSS({ height: 2, seed: 'xmss-seed' });
  const sig = xmss.sign('proof-check');
  assert.equal(sig.proof.length, 2);
  assert.equal(pqc.verifyMerkleProof(sig.leaf, sig.proof, sig.root, sig.index, 2), true);
});

test('67: XMSS rejects a message swap', () => {
  const xmss = pqc.XMSS({ height: 2, seed: 'xmss-seed' });
  const sig = xmss.sign('message A');
  assert.equal(xmss.verify(sig, 'message B'), false);
});

test('68: XMSS is stateful and exhausts its one-time keys', () => {
  const xmss = pqc.XMSS({ height: 1, seed: 'xmss-seed' });
  assert.equal(xmss.leafCount, 2);
  xmss.sign('one');
  xmss.sign('two');
  assert.equal(xmss.index, 2);
  assert.throws(() => xmss.sign('three'), RangeError);
});

test('69: XMSS root is deterministic for the same seed', () => {
  const a = pqc.XMSS({ height: 2, seed: 'fixed' });
  const b = pqc.XMSS({ height: 2, seed: 'fixed' });
  assert.equal(a.root, b.root);
});

// ---------------------------------------------------------------
// Section 7: Grover / Shor security analyzer (tests 70-78)
// ---------------------------------------------------------------
test('70: PRIMITIVES includes the three schemes from the brief', () => {
  assert.ok(pqc.PRIMITIVES['secp256k1 ECDSA']);
  assert.ok(pqc.PRIMITIVES['ML-DSA-65']);
  assert.ok(pqc.PRIMITIVES['SLH-DSA-128s']);
});

test('71: secp256k1 has zero quantum security under Shor', () => {
  const p = pqc.analyzePrimitive('secp256k1 ECDSA');
  assert.equal(p.quantum, 0);
  assert.equal(p.quantumAttack, 'Shor');
  assert.equal(p.quantumSafe, false);
});

test('72: ML-DSA-65 and SLH-DSA are quantum safe', () => {
  assert.equal(pqc.analyzePrimitive('ML-DSA-65').quantumSafe, true);
  assert.equal(pqc.analyzePrimitive('SLH-DSA-128s').quantumSafe, true);
});

test('73: Grover iterations halve the exponent', () => {
  assert.equal(pqc.groverIterations(128), Math.pow(2, 64));
  assert.equal(pqc.groverIterations(256), Math.pow(2, 128));
});

test('74: Shor logical qubit estimate grows with modulus size', () => {
  assert.ok(pqc.shorQubits(2048) > pqc.shorQubits(256));
  assert.ok(pqc.shorGates(2048) > pqc.shorGates(256));
});

test('75: groverSecurity reports monotone work in bits', () => {
  const a = pqc.groverSecurity(64, 1000, 1e6);
  const b = pqc.groverSecurity(128, 1000, 1e6);
  assert.ok(b.iterations > a.iterations);
  assert.ok(b.seconds > a.seconds);
});

test('76: hybridSecurity takes the strongest component', () => {
  const h = pqc.hybridSecurity('secp256k1 ECDSA', 'ML-DSA-65');
  assert.equal(h.classical, 192);
  assert.equal(h.quantum, 171);
});

test('77: securityReport covers every primitive', () => {
  assert.equal(pqc.securityReport().length, Object.keys(pqc.PRIMITIVES).length);
});

test('78: analyzePrimitive rejects an unknown scheme', () => {
  assert.throws(() => pqc.analyzePrimitive('ROT13'), RangeError);
});

// ---------------------------------------------------------------
// Section 8: UTXO migration risk and test vectors (tests 79-85)
// ---------------------------------------------------------------
test('79: an exposed high-value UTXO is critical', () => {
  const r = pqc.migrationRisk({ publicKeyRevealed: true, p2pkh: true, valueBtc: 50, ageBlocks: 500000 });
  assert.equal(r.tier, 'critical');
  // 60 exposed + 15 value + 5 age; P2PKH adds nothing once the key is revealed.
  assert.equal(r.score, 80);
});

test('80: a hidden low-value UTXO is low risk', () => {
  const r = pqc.migrationRisk({ publicKeyRevealed: false, p2pkh: false, valueBtc: 0.01, ageBlocks: 10 });
  assert.equal(r.tier, 'low');
});

test('81: risk advice differs for exposed and hidden keys', () => {
  assert.notEqual(
    pqc.migrationRisk({ publicKeyRevealed: true }).advice,
    pqc.migrationRisk({ publicKeyRevealed: false }).advice
  );
});

test('82: exportTestVectors reports all self-checks passing', () => {
  const v = pqc.exportTestVectors();
  assert.equal(v.ntt.inverseMatches, true);
  assert.equal(v.ntt.convolutionMatches, true);
  assert.equal(v.kem.decapsulationMatches, true);
  assert.equal(v.xmss.firstSignatureValid, true);
});

test('83: test vectors are deterministic hex', () => {
  const a = pqc.exportTestVectors('fixed-seed');
  const b = pqc.exportTestVectors('fixed-seed');
  assert.deepEqual(a, b);
  assert.match(a.kem.sharedSecret, /^[0-9a-f]{64}$/);
});

test('84: test vectors include the FIPS 203 ring parameters', () => {
  const v = pqc.exportTestVectors();
  assert.equal(v.params.q, 3329);
  assert.equal(v.params.n, 256);
  assert.equal(v.params.zeta, 17);
});

test('85: test vector security table includes ECDSA and ML-DSA-65', () => {
  const names = pqc.exportTestVectors().security.map(x => x.name);
  assert.ok(names.includes('secp256k1 ECDSA'));
  assert.ok(names.includes('ML-DSA-65'));
  assert.equal(pqc.exportTestVectors().security.find(x => x.name === 'secp256k1 ECDSA').quantum, 0);
});

// ---------------------------------------------------------------
// Section 9: adversarial hardening (tests 86-91)
// ---------------------------------------------------------------
test('86: decapsulate implicitly rejects wrong-length and non-array ciphertexts', () => {
  const kem = pqc.MLKEM({ param: 'ML-KEM-768' });
  const keys = kem.deriveFromSeed('hardening');
  const enc = kem.encapsulate(keys.ek, 'hardening-enc');
  // One byte short and one byte long both fail the FO re-encryption match.
  const short = kem.decapsulate(enc.ciphertext.slice(0, enc.ciphertext.length - 1), keys.dk);
  assert.notDeepEqual(short, enc.sharedSecret);
  const long = new Uint8Array(enc.ciphertext.length + 1);
  long.set(enc.ciphertext); long[long.length - 1] = 7;
  assert.notDeepEqual(kem.decapsulate(long, keys.dk), enc.sharedSecret);
  // Non-Uint8Array input rejects instead of throwing.
  assert.notDeepEqual(kem.decapsulate([1, 2, 3], keys.dk), enc.sharedSecret);
  assert.notDeepEqual(kem.decapsulate(null, keys.dk), enc.sharedSecret);
  // Rejection is still deterministic for the same malformed input.
  assert.deepEqual(
    kem.decapsulate(enc.ciphertext.slice(0, 10), keys.dk),
    kem.decapsulate(enc.ciphertext.slice(0, 10), keys.dk)
  );
});

test('87: wotsVerify returns false on malformed signatures instead of throwing', () => {
  const kp = pqc.wotsGenerate('wots-hardening');
  const sig = pqc.wotsSign('msg', kp);
  assert.equal(pqc.wotsVerify('msg', sig.signature, kp.pkHash), true);
  assert.equal(pqc.wotsVerify('msg', sig.signature.slice(0, 66), kp.pkHash), false);
  assert.equal(pqc.wotsVerify('msg', 'not-an-array', kp.pkHash), false);
  assert.equal(pqc.wotsVerify('msg', null, kp.pkHash), false);
  const badLen = sig.signature.slice();
  badLen[0] = new Uint8Array(16);
  assert.equal(pqc.wotsVerify('msg', badLen, kp.pkHash), false);
  assert.equal(pqc.wotsVerify('msg', sig.signature, 'short'), false);
});

test('88: verifyMerkleProof and XMSS.verify reject malformed inputs cleanly', () => {
  const xmss = pqc.XMSS({ height: 2, seed: 'xmss-hardening' });
  const sig = xmss.sign('bound message');
  assert.equal(xmss.verify(sig), true);
  // Truncated and extended proofs fail closed, never throw.
  const trunc = Object.assign({}, sig, { proof: sig.proof.slice(0, 1) });
  assert.equal(xmss.verify(trunc), false);
  const long = Object.assign({}, sig, { proof: sig.proof.concat(sig.proof[0]) });
  assert.equal(xmss.verify(long), false);
  const badHex = Object.assign({}, sig, { proof: ['zz' + sig.proof[0].slice(2)] });
  assert.equal(xmss.verify(badHex), false);
  const badIndex = Object.assign({}, sig, { index: 99 });
  assert.equal(xmss.verify(badIndex), false);
  assert.equal(pqc.verifyMerkleProof(sig.leaf, sig.proof, sig.root, 0, sig.proof.length), true);
  assert.equal(pqc.verifyMerkleProof(sig.leaf, sig.proof, sig.root, 0, 9), false);
  assert.equal(pqc.verifyMerkleProof(sig.leaf, null, sig.root, 0, 2), false);
  assert.equal(pqc.verifyMerkleProof('xx', sig.proof, sig.root, 0, 2), false);
});

test('89: decodePoly refuses out-of-bounds reads on short input', () => {
  assert.throws(() => pqc.decodePoly(new Uint8Array(100), 12), RangeError);
  assert.throws(() => pqc.decodePoly(new Uint8Array(31), 1), RangeError);
  assert.throws(() => pqc.decodePoly(null, 1), RangeError);
  assert.doesNotThrow(() => pqc.decodePoly(new Uint8Array(384), 12));
  assert.doesNotThrow(() => pqc.decodePoly(new Uint8Array(32), 1));
});

test('90: P2PKH exposure risk is latent and applies only while the key is hidden', () => {
  const hidden = pqc.migrationRisk({ publicKeyRevealed: false, p2pkh: true, valueBtc: 0.5, ageBlocks: 10 });
  assert.equal(hidden.score, 20);
  assert.equal(hidden.tier, 'low');
  const revealed = pqc.migrationRisk({ publicKeyRevealed: true, p2pkh: true, valueBtc: 0.5, ageBlocks: 10 });
  assert.equal(revealed.score, 60);
  assert.equal(revealed.tier, 'high');
  // Once the key is revealed, the P2PKH flag changes nothing.
  const revealedBare = pqc.migrationRisk({ publicKeyRevealed: true, p2pkh: false, valueBtc: 0.5, ageBlocks: 10 });
  assert.equal(revealedBare.score, revealed.score);
  // A hidden non-P2PKH output has no latent spend exposure.
  const hiddenBare = pqc.migrationRisk({ publicKeyRevealed: false, p2pkh: false, valueBtc: 0.5, ageBlocks: 10 });
  assert.equal(hiddenBare.score, 0);
});

test('91: exportTestVectors exercises every self check path after hardening', () => {
  const v = pqc.exportTestVectors('hardening-vectors');
  assert.equal(v.kem.decapsulationMatches, true);
  assert.equal(v.xmss.firstSignatureValid, true);
  // A vector blob tampered after the fact is still verifiable as an object.
  const json = JSON.parse(JSON.stringify(v));
  assert.equal(json.ntt.inverseMatches, true);
});
