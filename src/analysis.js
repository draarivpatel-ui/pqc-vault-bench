/*
 * PQC Vault Bench analysis layer.
 *
 * Real, deterministic computations over the primitives in src/pqc.js:
 * Montgomery and Barrett reduction in the Kyber ring, NTT round-trip
 * certificates, KEM correctness sweeps with decryption-failure accounting,
 * hybrid migration comparisons, hash-based signature byte accounting, and
 * quantum resource estimates. Zero dependencies. UMD, like the core library.
 *
 * Nothing here is a validated cryptographic implementation. The measurements
 * are exact arithmetic over the educational primitives in the core library,
 * and every claim in the output is derived from a computation performed here.
 */
(function (root, factory) {
  const P = (typeof module === 'object' && module.exports)
    ? require('./pqc.js')
    : root.PQC;
  const api = factory(P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PQCAnalysis = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  const Q = P.Q;
  const N = P.N;
  const R = 1 << 16;              // Montgomery radix 2^16 (FIPS 203 convention)
  const R2 = (R * R) % Q;

  // Newton iteration for n^-1 (mod 2^bits). n must be odd. Each step doubles
  // the number of correct low bits, so `bits` steps are more than enough.
  function inversePowerOfTwo(n, bits) {
    const m = 1 << bits;
    let inv = 1;
    for (let i = 0; i < bits; i++) inv = ((inv * (2 - n * inv)) % m + m) % m;
    return inv;
  }

  // Montgomery needs n' with n*n' === -1 (mod R), that is -n^-1 mod R.
  const Q_INV_R = inversePowerOfTwo(Q, 16);
  const N_PRIME = (R - Q_INV_R) % R;   // Q * N_PRIME === -1 (mod 2^16)

  // Montgomery reduction of an integer T < Q*R. Returns T*R^-1 mod Q.
  function montgomeryReduce(t) {
    const m = ((t % R) * N_PRIME) % R;
    let r = Math.floor((t + m * Q) / R);
    while (r >= Q) r -= Q;
    return r;
  }

  function toMont(a) { return P.mod(a * R); }
  function fromMont(a) { return montgomeryReduce(P.mod(a)); }

  // Barrett reduction: reduction without dividing by Q. Precomputes
  // floor(2^k / Q) once; k is chosen so the reciprocal estimate is within one
  // multiple of Q of the true quotient, then corrected by subtraction only.
  const BARRETT_K = 24;
  const BARRETT_MU = Math.floor(Math.pow(2, BARRETT_K) / Q);
  function barrettReduce(a) {
    const qhat = Math.floor((a * BARRETT_MU) / Math.pow(2, BARRETT_K));
    let r = a - qhat * Q;
    while (r >= Q) r -= Q;
    while (r < 0) r += Q;
    return r;
  }

  // Prove Montgomery and Barrett agree with the plain modular reduction on a
  // deterministic sweep of products of ring elements.
  function reductionCertificate(samples) {
    const n = samples || 512;
    let montOk = 0, barrettOk = 0;
    const failures = [];
    for (let i = 0; i < n; i++) {
      const a = (i * 37 + 11) % Q;
      const b = (i * 91 + 7) % Q;
      const plain = P.mod(a * b);
      const mont = fromMont(montgomeryReduce(toMont(a) * toMont(b)));
      const barr = barrettReduce(a * b);
      if (mont === plain) montOk++; else failures.push({ i, kind: 'montgomery', a, b, got: mont, want: plain });
      if (barr === plain) barrettOk++; else failures.push({ i, kind: 'barrett', a, b, got: barr, want: plain });
    }
    return {
      samples: n, montgomeryMatches: montOk, barrettMatches: barrettOk,
      allMatch: failures.length === 0, failures: failures.slice(0, 8),
      constants: { R, R2: R2, nPrime: N_PRIME, barrettK: BARRETT_K, barrettMu: BARRETT_MU }
    };
  }

  // A full NTT correctness certificate: invertibility, additivity, the
  // convolution theorem, and the negation rule x^N = -1 in the ring.
  function nttCertificate() {
    const a = Array.from({ length: N }, (_, i) => (i * 37 + 11) % Q);
    const b = Array.from({ length: N }, (_, i) => (i * 13 + 5) % Q);
    const A = P.ntt(a), B = P.ntt(b);
    const roundTrip = P.inverseNTT(A).every((v, i) => v === a[i]);
    const additivity = P.ntt(P.polyAdd(a, b)).every((v, i) => v === P.mod(A[i] + B[i]));
    const convolution = P.polyMul(a, b).every((v, i) => v === P.schoolbookMul(a, b)[i]);
    const xN = P.polyZero(); xN[N - 1] = 1;
    const x = P.polyZero(); x[1] = 1;
    const neg = P.polyMul(xN, x);
    const negacyclic = neg[0] === Q - 1 && neg.slice(1).every(v => v === 0);
    const xHat = P.ntt(x);
    const xNHat = P.ntt(xN);
    // In the NTT domain the product x^(N-1)*x is the constant -1.
    const negDomain = P.baseCaseMultiply(xNHat, xHat);
    const negDomainOk = P.inverseNTT(negDomain)[0] === Q - 1;
    return {
      roundTrip, additivity, convolution, negacyclic, negDomainOk,
      allPass: roundTrip && additivity && convolution && negacyclic && negDomainOk,
      zetaHead: P.ZETAS.slice(0, 8), gammaHead: P.GAMMAS.slice(0, 8),
      inv128: P.INV_128
    };
  }

  // Sweep KEM correctness across many independent seeds and report the exact
  // decryption-failure count. Also measure implicit rejection on tampered
  // ciphertexts. This is a real computation, not a stated guarantee.
  function kemCorrectnessSweep(options) {
    const opts = options || {};
    const param = opts.param || P.KEM_DEFAULT;
    const count = Math.max(1, Math.min(opts.count || 40, 400));
    const kem = P.MLKEM({ param });
    let matched = 0, rejected = 0, tamperRejected = 0;
    const failures = [];
    let totalCiphertextBytes = 0, totalKeyBytes = 0;
    for (let i = 0; i < count; i++) {
      const seed = (opts.seed || 'kem-sweep') + ':' + i;
      const keys = kem.deriveFromSeed(seed);
      const enc = kem.encapsulate(keys.ek, seed + ':enc');
      const dec = kem.decapsulate(enc.ciphertext, keys.dk);
      const ok = P.bytesEqual(enc.sharedSecret, dec);
      if (ok) matched++; else failures.push({ i, seed, kind: 'decapsulation-mismatch' });
      totalCiphertextBytes += enc.ciphertext.length;
      totalKeyBytes += keys.ek.length;
      // A single-bit flip in the ciphertext must not reproduce the secret.
      const bad = enc.ciphertext.slice();
      bad[bad.length >> 1] ^= 1;
      const badKey = kem.decapsulate(bad, keys.dk);
      if (!P.bytesEqual(badKey, enc.sharedSecret)) tamperRejected++;
      // A ciphertext decapsulated under a different key must not reproduce it.
      const other = kem.deriveFromSeed(seed + ':other');
      const wrongKey = kem.decapsulate(enc.ciphertext, other.dk);
      if (!P.bytesEqual(wrongKey, enc.sharedSecret)) rejected++;
    }
    return {
      param, count, matched, decryptionFailures: failures.length,
      tamperRejections: tamperRejected, wrongKeyRejections: rejected,
      correctnessRate: matched / count,
      avgCiphertextBytes: totalCiphertextBytes / count,
      avgEncapsulationKeyBytes: totalKeyBytes / count,
      failures: failures.slice(0, 8)
    };
  }

  // Exact byte accounting for the four FIPS-named KEM parameter sets, derived
  // from the real ciphertext and key lengths produced by the implementation.
  function kemSizeTable() {
    return Object.keys(P.KEM_PARAMS).map(name => {
      const kem = P.MLKEM({ param: name });
      const keys = kem.deriveFromSeed('size-table:' + name);
      const enc = kem.encapsulate(keys.ek, 'size-table-enc:' + name);
      const p = kem.params;
      return {
        name, k: kem.k, eta1: p.eta1, eta2: p.eta2, du: p.du, dv: p.dv,
        encapsulationKeyBytes: keys.ek.length,
        ciphertextBytes: enc.ciphertext.length,
        sharedSecretBytes: enc.sharedSecret.length,
        expectedCiphertextBytes: kem.k * Math.ceil(N * p.du / 8) + Math.ceil(N * p.dv / 8)
      };
    });
  }

  // Hybrid migration comparison: for each classical primitive, pair it with
  // each post-quantum primitive and report the exact bit-security envelope.
  function hybridMigrationTable() {
    const classical = ['secp256k1 ECDSA', 'RSA-2048'];
    const pqc = ['ML-KEM-768', 'ML-DSA-65', 'SLH-DSA-128s'];
    const rows = [];
    for (const c of classical) for (const p of pqc) {
      const h = P.hybridSecurity(c, p);
      rows.push({
        classical: c, postQuantum: p,
        classicalBits: h.classical, quantumBits: h.quantum,
        classicalHalfBrokenBy: P.PRIMITIVES[c].quantumAttack,
        pqAttack: P.PRIMITIVES[p].quantumAttack,
        note: h.recommendation
      });
    }
    return rows;
  }

  // Concrete quantum resource estimates. These are order-of-magnitude models
  // built from the exponent arithmetic, not hardware claims.
  function quantumResourceTable(speedHz, oracleGates) {
    const names = Object.keys(P.PRIMITIVES);
    return names.map(name => {
      const p = P.analyzePrimitive(name);
      let gateEstimate = null;
      if (p.quantumAttack === 'Grover') {
        const g = P.groverSecurity(p.classical, oracleGates || 1000, speedHz || 1e6);
        gateEstimate = { iterations: g.iterations, gates: g.gates, years: g.years };
      } else if (p.quantumAttack === 'Shor') {
        gateEstimate = {
          logicalQubits: P.shorQubits(p.pkBits),
          gateCount: P.shorGates(p.pkBits)
        };
      }
      return {
        name, classicalBits: p.classical, quantumBits: p.quantum,
        quantumAttack: p.quantumAttack, quantumSafe: p.quantumSafe,
        estimate: gateEstimate
      };
    });
  }

  // Exact signature and public-key byte accounting for WOTS+ and XMSS.
  function hashSignatureSizes(wotsSeed, xmssHeight) {
    const kp = P.wotsGenerate(wotsSeed || 'size-wots');
    const sig = P.wotsSign('size probe', kp);
    const xmss = P.XMSS({ height: xmssHeight === undefined ? 3 : xmssHeight, seed: 'size-xmss' });
    const xs = xmss.sign('size probe');
    const wotsSigBytes = sig.signature.reduce((s, x) => s + x.length, 0);
    const xmssSigBytes = xs.wots.reduce((s, h) => s + h.length / 2, 0) +
      xs.proof.reduce((s, h) => s + h.length / 2, 0) + xs.leaf.length / 2 + 4;
    return {
      wots: {
        chains: P.WOTS_LEN, chainBytes: 32, signatureBytes: wotsSigBytes,
        publicKeyHashBytes: 32, digestBytes: 32, checksumDigits: P.WOTS_L2
      },
      xmss: {
        height: xmss.height, leafCount: xmss.leafCount,
        signatureBytes: xmssSigBytes, proofNodes: xs.proof.length,
        rootBytes: 32, oneTimeKeys: xmss.leafCount
      }
    };
  }

  // A single reproducible verification bundle that ties every module together.
  function verificationBundle(seed) {
    const s = seed || 'pqc-vault-bench-upgrade-v1';
    const vectors = P.exportTestVectors(s);
    const reduction = reductionCertificate(256);
    const ntt = nttCertificate();
    const kem = kemCorrectnessSweep({ count: 24, seed: s + ':kem' });
    return {
      schema: 'pqc-vault-bench/verification-v2',
      seed: s,
      generatedBy: 'src/analysis.js',
      selfChecks: {
        sha256KnownAnswers: vectors.hashes.sha256Abc ===
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        nttAllPass: ntt.allPass,
        reductionAllMatch: reduction.allMatch,
        kemNoDecryptionFailures: kem.decryptionFailures === 0,
        kemAllTamperRejected: kem.tamperRejections === kem.count,
        kemAllWrongKeyRejected: kem.wrongKeyRejections === kem.count,
        xmssFirstSignatureValid: vectors.xmss.firstSignatureValid,
        kemDecapsulationMatches: vectors.kem.decapsulationMatches
      },
      reduction: { samples: reduction.samples, montgomeryMatches: reduction.montgomeryMatches, barrettMatches: reduction.barrettMatches, constants: reduction.constants },
      ntt: { allPass: ntt.allPass, roundTrip: ntt.roundTrip, additivity: ntt.additivity, convolution: ntt.convolution, negacyclic: ntt.negacyclic },
      kem,
      kemSizes: kemSizeTable(),
      hybridMigration: hybridMigrationTable(),
      quantumResources: quantumResourceTable(1e6, 1000),
      hashSignatureSizes: hashSignatureSizes(s + ':wots', 3),
      securityTable: vectors.security
    };
  }

  const api = {
    R, R2, N_PRIME, Q_INV_R, BARRETT_K, BARRETT_MU,
    montgomeryReduce, toMont, fromMont, barrettReduce, inversePowerOfTwo,
    reductionCertificate, nttCertificate, kemCorrectnessSweep, kemSizeTable,
    hybridMigrationTable, quantumResourceTable, hashSignatureSizes,
    verificationBundle
  };
  return api;
}));
