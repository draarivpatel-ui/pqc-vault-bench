/*
 * FIPS 203 / 204 / 205 parameter matrix and deterministic benchmark report.
 *
 * A side-by-side comparison layer over the three NIST post-quantum
 * standards. Byte sizes are derived from the packing formulas in each
 * standard and cross checked against the published sizes, not copied from
 * tables. The cost model counts primitive operations closed-form in the
 * parameters, so every figure reproduces exactly; it is a deterministic
 * cost model, not a wall-clock benchmark. Zero dependencies. UMD.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const P = isNode ? require('./pqc.js') : root.PQC;
  const A = isNode ? require('./analysis.js') : root.PQCAnalysis;
  const api = factory(P, A);
  if (isNode) module.exports = api;
  else root.PQCParamMatrix = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P, A) {
  'use strict';

  const WORKBENCH_VERSION = '1.2.0';
  const REPORT_SCHEMA = 'pqc-vault-bench/benchmark-v2';
  const COST_MODEL = 'param-cost-v2';

  // ============================================================
  // Section 1: approved parameter sets and exact byte accounting
  // Published columns come from the standards; derived columns are
  // recomputed from the packing formulas and must match them.
  // ============================================================

  // FIPS 203 approved sets. ek = 384k + 32, dk = 768k + 96,
  // ct = 32(du*k + dv) bytes over 256 coefficients.
  const ML_KEM_SPEC = Object.freeze({
    'ML-KEM-512':  Object.freeze({ k: 2, eta1: 3, eta2: 2, du: 10, dv: 4, category: 1, ek: 800,  dk: 1632, ct: 768 }),
    'ML-KEM-768':  Object.freeze({ k: 3, eta1: 2, eta2: 2, du: 10, dv: 4, category: 3, ek: 1184, dk: 2400, ct: 1088 }),
    'ML-KEM-1024': Object.freeze({ k: 4, eta1: 2, eta2: 2, du: 11, dv: 5, category: 5, ek: 1568, dk: 3168, ct: 1568 })
  });

  // FIPS 204 approved sets over Z_8380417[x]/(x^256 + 1), d = 13.
  const ML_DSA_Q = 8380417;
  const ML_DSA_PARAMS = Object.freeze({
    'ML-DSA-44': Object.freeze({ lambda: 128, k: 4, l: 4, eta: 2, tau: 39, beta: 78,  omega: 80, gamma1: 131072, gamma2: (ML_DSA_Q - 1) / 88, category: 2, pk: 1312, sk: 2560, sig: 2420 }),
    'ML-DSA-65': Object.freeze({ lambda: 192, k: 6, l: 5, eta: 4, tau: 49, beta: 196, omega: 55, gamma1: 524288, gamma2: (ML_DSA_Q - 1) / 32, category: 3, pk: 1952, sk: 4032, sig: 3309 }),
    'ML-DSA-87': Object.freeze({ lambda: 256, k: 8, l: 7, eta: 2, tau: 60, beta: 120, omega: 75, gamma1: 524288, gamma2: (ML_DSA_Q - 1) / 32, category: 5, pk: 2592, sk: 4896, sig: 4627 })
  });

  // FIPS 205 approved sets, Winternitz w = 16 throughout. h = d * hPrime.
  // Table 2 and section 11 name twelve sets: each security category ships
  // in a SHA2 and a SHAKE instantiation that share every parameter and the
  // published signature size, so the matrix carries the twelve official
  // names rather than six unnamed hash-family pairs.
  const SLH_W = 16;
  const SLH_DSA_PARAMS = Object.freeze({
    'SLH-DSA-SHA2-128s':  Object.freeze({ n: 16, h: 63, d: 7,  hPrime: 9, a: 12, kFors: 14, m: 30, category: 1, sig: 7856,  hashFamily: 'SHA2' }),
    'SLH-DSA-SHA2-128f':  Object.freeze({ n: 16, h: 66, d: 22, hPrime: 3, a: 6,  kFors: 33, m: 34, category: 1, sig: 17088, hashFamily: 'SHA2' }),
    'SLH-DSA-SHA2-192s':  Object.freeze({ n: 24, h: 63, d: 7,  hPrime: 9, a: 14, kFors: 17, m: 39, category: 3, sig: 16224, hashFamily: 'SHA2' }),
    'SLH-DSA-SHA2-192f':  Object.freeze({ n: 24, h: 66, d: 22, hPrime: 3, a: 8,  kFors: 33, m: 42, category: 3, sig: 35664, hashFamily: 'SHA2' }),
    'SLH-DSA-SHA2-256s':  Object.freeze({ n: 32, h: 64, d: 8,  hPrime: 8, a: 14, kFors: 22, m: 47, category: 5, sig: 29792, hashFamily: 'SHA2' }),
    'SLH-DSA-SHA2-256f':  Object.freeze({ n: 32, h: 68, d: 17, hPrime: 4, a: 9,  kFors: 35, m: 49, category: 5, sig: 49856, hashFamily: 'SHA2' }),
    'SLH-DSA-SHAKE-128s': Object.freeze({ n: 16, h: 63, d: 7,  hPrime: 9, a: 12, kFors: 14, m: 30, category: 1, sig: 7856,  hashFamily: 'SHAKE' }),
    'SLH-DSA-SHAKE-128f': Object.freeze({ n: 16, h: 66, d: 22, hPrime: 3, a: 6,  kFors: 33, m: 34, category: 1, sig: 17088, hashFamily: 'SHAKE' }),
    'SLH-DSA-SHAKE-192s': Object.freeze({ n: 24, h: 63, d: 7,  hPrime: 9, a: 14, kFors: 17, m: 39, category: 3, sig: 16224, hashFamily: 'SHAKE' }),
    'SLH-DSA-SHAKE-192f': Object.freeze({ n: 24, h: 66, d: 22, hPrime: 3, a: 8,  kFors: 33, m: 42, category: 3, sig: 35664, hashFamily: 'SHAKE' }),
    'SLH-DSA-SHAKE-256s': Object.freeze({ n: 32, h: 64, d: 8,  hPrime: 8, a: 14, kFors: 22, m: 47, category: 5, sig: 29792, hashFamily: 'SHAKE' }),
    'SLH-DSA-SHAKE-256f': Object.freeze({ n: 32, h: 68, d: 17, hPrime: 4, a: 9,  kFors: 35, m: 49, category: 5, sig: 49856, hashFamily: 'SHAKE' })
  });

  function packBytes(coeffs, bits) { return Math.ceil(coeffs * bits / 8); }

  // Lookups must use own-property checks: table['__proto__'] and
  // table['constructor'] resolve through Object.prototype, not to
  // undefined, so a plain index smuggles hostile names through.
  function own(table, key) {
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
  }

  function mlKemSpecBytes(name) {
    const p = own(ML_KEM_SPEC, name);
    if (!p) throw new RangeError('unknown ML-KEM parameter set: ' + name);
    return {
      ekBytes: 384 * p.k + 32,
      dkBytes: 768 * p.k + 96,
      ctBytes: 32 * (p.du * p.k + p.dv)
    };
  }

  // FIPS 204 packing widths: t1 uses 10 bits per coefficient, t0 uses 13,
  // z uses log2(2*gamma1), eta secrets use ceil(log2(2*eta + 1)). The
  // signature is c~ (lambda/4) || z || h, with h holding omega index bytes
  // plus k boundary bytes.
  function mlDsaSpecBytes(name) {
    const p = own(ML_DSA_PARAMS, name);
    if (!p) throw new RangeError('unknown ML-DSA parameter set: ' + name);
    const etaBits = p.eta === 2 ? 3 : 4;
    const zBits = Math.round(Math.log2(2 * p.gamma1));
    return {
      pkBytes: 32 + p.k * packBytes(256, 10),
      skBytes: 32 + 32 + 64 + (p.k + p.l) * packBytes(256, etaBits) + p.k * packBytes(256, 13),
      sigBytes: p.lambda / 4 + p.l * packBytes(256, zBits) + p.omega + p.k
    };
  }

  // WOTS+ chain count at w = 16: len1 = 2n, len2 = 3.
  function slhDsaLen(p) { return 2 * p.n + 3; }

  // The digest field m splits into FORS indices, one tree index and one
  // tree layer field (FIPS 205 section 11).
  function slhDsaM(p) {
    return Math.ceil(p.kFors * p.a / 8) + Math.ceil(p.hPrime / 8) + Math.ceil((p.h - p.hPrime) / 8);
  }

  function slhDsaSpecBytes(name) {
    const p = own(SLH_DSA_PARAMS, name);
    if (!p) throw new RangeError('unknown SLH-DSA parameter set: ' + name);
    const len = slhDsaLen(p);
    return {
      pkBytes: 2 * p.n,
      skBytes: 4 * p.n,
      forsSigBytes: p.kFors * (1 + p.a) * p.n,
      htSigBytes: (p.h + p.d * len) * p.n,
      sigBytes: p.n * (1 + p.kFors * (1 + p.a) + p.h + p.d * len)
    };
  }

  // ============================================================
  // Section 2: security levels
  // Implemented schemes report the workbench estimator with its attack
  // model named. The rest report the official NIST security category and
  // its reference primitive verbatim: a category is a computational
  // resource bound (key or collision search against a reference scheme),
  // not a bit guarantee, so category rows deliberately carry no bit
  // figures. Any bit estimate shown is always paired with the method and
  // attack model that produced it.
  // ============================================================
  const CATEGORY_REFERENCE = Object.freeze({
    1: 'AES-128 key search',
    2: 'SHA-256 collision search',
    3: 'AES-192 key search',
    4: 'SHA-384 collision search',
    5: 'AES-256 key search'
  });

  function securityEstimate(name, category) {
    const referencePrimitive = own(CATEGORY_REFERENCE, category);
    if (!referencePrimitive) throw new RangeError('unknown NIST category: ' + category);
    // The estimator is keyed by scheme geometry; the two SLH-DSA hash
    // families share parameters, so SHA2 and SHAKE names map onto the
    // same underlying estimator entry.
    const estName = name.replace(/^(SLH-DSA)-(?:SHA2|SHAKE)-/, '$1-');
    if (P.PRIMITIVES && P.PRIMITIVES[estName]) {
      const p = P.analyzePrimitive(estName);
      return {
        category, referencePrimitive,
        classical: p.classical, quantum: p.quantum,
        method: 'workbench-estimator', estimateModel: p.quantumAttack
      };
    }
    return {
      category, referencePrimitive,
      classical: null, quantum: null,
      method: 'nist-category', estimateModel: null
    };
  }

  // ============================================================
  // Section 3: deterministic operation-cost model
  // One lattice ring transform or NTT-domain product costs 4 hash-call
  // units; hashes, XOF absorbs, samples and packs cost 1. The weights are
  // exposed so the model can be recomputed and argued with.
  // ============================================================
  const COST_WEIGHTS = Object.freeze({ ntt: 4, polyProduct: 4, hashCall: 1, sample: 1 });

  // Exported with every report so a consumer can see the exact
  // convention the FIPS 205 figures were produced under; the
  // term-by-term derivation sits with slhDsaWorkProfile.
  const SLH_DSA_COUNT_CONVENTION = 'every FIPS 205 hash-primitive invocation ' +
    '(PRF, PRF_msg, H_msg, F, H and the T_k / T_len compressions) counts as one unit, ' +
    'exactly as Algorithms 5-20 execute it; the only approximation is the WOTS+ ' +
    'signature chain length, charged at the uniform base-w digit expectation ' +
    '(w - 1) / 2 per chain';

  function workUnits(profile) {
    const w = COST_WEIGHTS;
    return w.ntt * ((profile.nttForward || 0) + (profile.nttInverse || 0)) +
      w.polyProduct * (profile.polyProduct || 0) +
      w.hashCall * ((profile.sha256Calls || 0) + (profile.xofCalls || 0) + (profile.xofBlocks || 0) + (profile.hashCalls || 0)) +
      w.sample * ((profile.cbdSamples || 0) + (profile.packCalls || 0));
  }

  function scaleProfile(profile, s) {
    const out = {};
    for (const k in profile) out[k] = profile[k] * s;
    return out;
  }

  // Counts trace the code path in src/pqc.js: the matrix XOF pulls 4N
  // bytes per polynomial and CBD samples pull ceil(2*eta*N/8) bytes.
  function mlKemWorkProfile(name) {
    const spec = own(ML_KEM_SPEC, name);
    if (!spec) throw new RangeError('unknown ML-KEM parameter set: ' + name);
    const k = spec.k, N = P.N;
    const matrixBlocks = k * k * Math.ceil(4 * N / 32);
    const cbdBlocks = eta => Math.ceil(Math.ceil(2 * eta * N / 8) / 32);
    const keygen = {
      nttForward: k * k + 2 * k,
      nttInverse: 0,
      polyProduct: k * k,
      xofCalls: 3 + k * k + 2 * k,
      xofBlocks: 3 + matrixBlocks + 2 * k * cbdBlocks(spec.eta1),
      sha256Calls: 1,
      cbdSamples: 2 * k,
      packCalls: k
    };
    const encaps = {
      nttForward: k * k + k,
      nttInverse: k + 1,
      polyProduct: k * k + k,
      xofCalls: 1 + k * k + 2 * k + 1,
      xofBlocks: 1 + matrixBlocks + k * cbdBlocks(spec.eta1) + (k + 1) * cbdBlocks(spec.eta2),
      sha256Calls: 1,
      cbdSamples: 2 * k + 1,
      packCalls: k + 1
    };
    const decaps = {
      nttForward: encaps.nttForward + k,
      nttInverse: encaps.nttInverse + 1,
      polyProduct: encaps.polyProduct + k,
      xofCalls: encaps.xofCalls - 1,
      xofBlocks: encaps.xofBlocks - 1,
      sha256Calls: 1,
      cbdSamples: encaps.cbdSamples,
      packCalls: encaps.packCalls + k + 1
    };
    return { keygen, encaps, decaps };
  }

  // FIPS 204 signing loops until z and r0 both clear their bounds. The
  // acceptance estimate is the worst-case product the design uses, an
  // exact formula in gamma1, gamma2, beta, k and l.
  function mlDsaExpectedAttempts(name) {
    const p = own(ML_DSA_PARAMS, name);
    if (!p) throw new RangeError('unknown ML-DSA parameter set: ' + name);
    const pz = Math.pow((2 * (p.gamma1 - p.beta) + 1) / (2 * p.gamma1 + 1), 256 * p.l);
    const pr = Math.pow((2 * (p.gamma2 - p.beta) + 1) / (2 * p.gamma2 + 1), 256 * p.k);
    const pAccept = pz * pr;
    return { pAccept, expectedAttempts: 1 / pAccept };
  }

  function mlDsaWorkProfile(name) {
    const p = own(ML_DSA_PARAMS, name);
    if (!p) throw new RangeError('unknown ML-DSA parameter set: ' + name);
    const k = p.k, l = p.l;
    const keygen = {
      nttForward: l,
      nttInverse: k,
      polyProduct: k * l,
      xofCalls: k * l + (k + l) + 1,
      sha256Calls: 0,
      packCalls: 2 * (k + l)
    };
    const signPerAttempt = {
      nttForward: l + 1,
      nttInverse: l + 3 * k,
      polyProduct: k * l + l + 2 * k,
      xofCalls: l + 2,
      sha256Calls: 0,
      packCalls: 2 * k + l
    };
    const verify = {
      nttForward: l + 1,
      nttInverse: k,
      polyProduct: k * l + k,
      xofCalls: 2,
      sha256Calls: 0,
      packCalls: k
    };
    const expectedAttempts = mlDsaExpectedAttempts(name).expectedAttempts;
    return { keygen, signPerAttempt, sign: scaleProfile(signPerAttempt, expectedAttempts), verify, expectedAttempts };
  }

  // Hash invocations for the FIPS 205 hypertree construction. Signing
  // reveals an XMSS authentication path per layer, which is why the
  // small-signature variants cost orders of magnitude more hash work
  // than the fast ones.
  //
  // Counting convention (param-cost-v2): every execution of a FIPS 205
  // hash-family primitive counts as one hashCall: PRF, PRF_msg, H_msg,
  // F, H and the T_l compressions (T_len on WOTS+ public keys and XMSS
  // leaves, T_k on the FORS roots). Address writes, base-w digit
  // extraction and tree/leaf index arithmetic are free. Each term below
  // traces named lines of Algorithms 5-20 and is exact in the parameter
  // set, with one documented approximation: a WOTS+ signature chain
  // runs chain(sk, 0, s) where s is a base-w digit of the message or
  // checksum, so wots_sign and wots_pkFromSig are charged the
  // uniform-digit expectation (w - 1) / 2 F calls per chain. Every
  // other term, including every PRF that derives a secret value, is
  // counted invocation for invocation.
  function slhDsaWorkProfile(name) {
    const p = own(SLH_DSA_PARAMS, name);
    if (!p) throw new RangeError('unknown SLH-DSA parameter set: ' + name);
    const len = slhDsaLen(p);
    const leaves = Math.pow(2, p.hPrime);
    // Algorithm 6 wots_pkGen: len chains x (1 PRF + (w - 1) F) + 1 T_len.
    const wotsPkGen = len * SLH_W + 1;
    // Algorithm 7 wots_sign: len chains x (1 PRF + s F), charged at the
    // uniform-digit expectation s = (w - 1) / 2 from the convention.
    const wotsSign = len + len * (SLH_W - 1) / 2;
    // Algorithm 8 wots_pkFromSig: len chain completions x (w - 1 - s) F,
    // the same expectation, + 1 T_len. No PRF: the signature carries
    // the start value of each chain.
    const wotsPkFromSig = len * (SLH_W - 1) / 2 + 1;
    // Algorithm 16 fors_sign, per tree: 1 PRF (Algorithm 14 fors_skGen)
    // reveals the secret value; the auth path is one Algorithm 15
    // fors_node sibling subtree per level j = 0..a-1. A height-j
    // subtree runs 2^j leaves x (1 PRF + 1 F) + (2^j - 1) H, so a
    // signing path totals (2^a - 1) PRF + (2^a - 1) F + (2^a - 1 - a) H
    // and one tree totals 2^a PRF + (2^a - 1) F + (2^a - 1 - a) H
    // = 3 * 2^a - 2 - a calls. For 128s the FORS side alone runs
    // k * 2^a = 14 * 4096 = 57,344 secret-value PRFs.
    const forsSignPerTree = 3 * Math.pow(2, p.a) - 2 - p.a;
    // Algorithm 17 fors_pkFromSig, run inside both Algorithms 19 and 20:
    // per tree 1 F on the revealed value + a H merges up the auth path,
    // then one T_k compresses all k roots.
    const forsPkFromSig = p.kFors * (1 + p.a) + 1;
    // Algorithm 9 xmss_node over a full height-h' tree: 2^h' leaves of
    // one wots_pkGen each + 2^h' - 1 internal H. Algorithm 18
    // slh_keygen_internal is exactly this on the top hypertree layer.
    const xmssTree = leaves * wotsPkGen + (leaves - 1);
    // Algorithm 10 xmss_sign: the auth path is one Algorithm 9 sibling
    // subtree per level j = 0..h'-1, i.e. 2^h' - 1 leaves and
    // 2^h' - 1 - h' internal nodes, then one wots_sign.
    const xmssSign = (leaves - 1) * wotsPkGen + (leaves - 1 - p.hPrime) + wotsSign;
    // Algorithm 11 xmss_pkFromSig: one wots_pkFromSig, then h' H merges
    // up the auth path to the tree root.
    const xmssPkFromSig = wotsPkFromSig + p.hPrime;
    // Algorithm 12 ht_sign: one xmss_sign per hypertree layer plus one
    // xmss_pkFromSig between successive layers to recover the root that
    // the next layer signs: d signatures and d - 1 root recoveries.
    // Algorithm 13 ht_verify: one xmss_pkFromSig per layer.
    const htSign = p.d * xmssSign + (p.d - 1) * xmssPkFromSig;
    const htVerify = p.d * xmssPkFromSig;
    // Algorithm 19 slh_sign_internal: 1 PRF_msg for the randomizer R +
    // 1 H_msg for the digest + fors_sign + fors_pkFromSig + ht_sign.
    // Algorithm 20 slh_verify_internal: 1 H_msg + fors_pkFromSig +
    // ht_verify.
    return {
      keygen: { hashCalls: xmssTree },
      sign: { hashCalls: 2 + p.kFors * forsSignPerTree + forsPkFromSig + htSign },
      verify: { hashCalls: 1 + forsPkFromSig + htVerify },
      wotsLen: len
    };
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  // ============================================================
  // Section 4: the side-by-side matrix
  // ============================================================
  function fipsParameterMatrix() {
    const kemMeasured = A.kemSizeTable();
    const rows = [];
    for (const name of Object.keys(ML_KEM_SPEC)) {
      const p = ML_KEM_SPEC[name];
      const b = mlKemSpecBytes(name);
      const w = mlKemWorkProfile(name);
      const measured = kemMeasured.find(r => r.name === name);
      rows.push({
        name, standard: 'FIPS 203', family: 'ML-KEM', role: 'kem', category: p.category,
        params: { k: p.k, eta1: p.eta1, eta2: p.eta2, du: p.du, dv: p.dv },
        bytes: {
          publicKey: b.ekBytes, secretKey: b.dkBytes, payload: b.ctBytes,
          handshakeTotal: b.ekBytes + b.ctBytes
        },
        publishedBytes: { publicKey: p.ek, secretKey: p.dk, payload: p.ct },
        publishedBytesMatch: b.ekBytes === p.ek && b.dkBytes === p.dk && b.ctBytes === p.ct,
        measuredBytes: measured
          ? { publicKey: measured.encapsulationKeyBytes, payload: measured.ciphertextBytes }
          : null,
        measuredMatchesSpec: !!measured && measured.encapsulationKeyBytes === b.ekBytes && measured.ciphertextBytes === b.ctBytes,
        security: securityEstimate(name, p.category),
        work: { keygen: w.keygen, primary: w.encaps, secondary: w.decaps },
        operationLabels: { primary: 'encapsulate', secondary: 'decapsulate' },
        workUnits: { keygen: workUnits(w.keygen), primary: workUnits(w.encaps), secondary: workUnits(w.decaps) }
      });
    }
    for (const name of Object.keys(ML_DSA_PARAMS)) {
      const p = ML_DSA_PARAMS[name];
      const b = mlDsaSpecBytes(name);
      const w = mlDsaWorkProfile(name);
      rows.push({
        name, standard: 'FIPS 204', family: 'ML-DSA', role: 'signature', category: p.category,
        params: { k: p.k, l: p.l, eta: p.eta, tau: p.tau, beta: p.beta, omega: p.omega, gamma1: p.gamma1, gamma2: p.gamma2 },
        bytes: {
          publicKey: b.pkBytes, secretKey: b.skBytes, payload: b.sigBytes,
          handshakeTotal: b.pkBytes + b.sigBytes
        },
        publishedBytes: { publicKey: p.pk, secretKey: p.sk, payload: p.sig },
        publishedBytesMatch: b.pkBytes === p.pk && b.skBytes === p.sk && b.sigBytes === p.sig,
        measuredBytes: null, measuredMatchesSpec: null,
        security: securityEstimate(name, p.category),
        work: { keygen: w.keygen, primary: w.sign, secondary: w.verify },
        workPerAttempt: w.signPerAttempt,
        expectedAttempts: w.expectedAttempts,
        operationLabels: { primary: 'sign', secondary: 'verify' },
        workUnits: { keygen: workUnits(w.keygen), primary: workUnits(w.sign), secondary: workUnits(w.verify) }
      });
    }
    for (const name of Object.keys(SLH_DSA_PARAMS)) {
      const p = SLH_DSA_PARAMS[name];
      const b = slhDsaSpecBytes(name);
      const w = slhDsaWorkProfile(name);
      rows.push({
        name, standard: 'FIPS 205', family: 'SLH-DSA', role: 'signature', category: p.category,
        params: { n: p.n, h: p.h, d: p.d, hPrime: p.hPrime, a: p.a, kFors: p.kFors, m: p.m, wotsLen: w.wotsLen, hashFamily: p.hashFamily },
        bytes: {
          publicKey: b.pkBytes, secretKey: b.skBytes, payload: b.sigBytes,
          handshakeTotal: b.pkBytes + b.sigBytes,
          forsSigBytes: b.forsSigBytes, htSigBytes: b.htSigBytes
        },
        publishedBytes: { publicKey: 2 * p.n, secretKey: 4 * p.n, payload: p.sig },
        publishedBytesMatch: b.sigBytes === p.sig,
        measuredBytes: null, measuredMatchesSpec: null,
        security: securityEstimate(name, p.category),
        work: { keygen: w.keygen, primary: w.sign, secondary: w.verify },
        operationLabels: { primary: 'sign', secondary: 'verify' },
        workUnits: { keygen: workUnits(w.keygen), primary: workUnits(w.sign), secondary: workUnits(w.verify) }
      });
    }
    // A single latency index relative to the cheapest approved operation:
    // ML-KEM-512 key generation equals 1.00.
    const base = rows[0].workUnits.keygen;
    for (const r of rows) {
      r.workUnits = { keygen: round2(r.workUnits.keygen), primary: round2(r.workUnits.primary), secondary: round2(r.workUnits.secondary) };
      r.latencyIndex = {
        keygen: round2(r.workUnits.keygen / base),
        primary: round2(r.workUnits.primary / base),
        secondary: round2(r.workUnits.secondary / base)
      };
    }
    return rows;
  }

  // ============================================================
  // Section 5: deterministic benchmark report (JSON + CSV)
  // The bundle contains explicit run parameters and a version stamp, and
  // its fingerprint is SHA-256 over the canonical serialization, so two
  // reports built from the same options are byte identical.
  // ============================================================
  function benchmarkReport(options) {
    const opts = options || {};
    const seed = (typeof opts.seed === 'string' && opts.seed.trim()) ? opts.seed.trim() : 'pqc-vault-bench-report';
    const runSweeps = opts.sweeps !== false;
    const parsed = Math.floor(Number(opts.sweepCount));
    // A report built with sweeps: false ran zero sweeps, so its
    // provenance must say 0 rather than the sweep-path default.
    const sweepCount = runSweeps ? (Number.isFinite(parsed) ? Math.max(4, Math.min(48, parsed)) : 8) : 0;
    const matrix = fipsParameterMatrix();
    const sweeps = runSweeps ?
      Object.keys(ML_KEM_SPEC).map(param => A.kemCorrectnessSweep({ param, count: sweepCount, seed: seed + ':sweep:' + param })) : [];
    const payload = {
      schema: REPORT_SCHEMA,
      workbenchVersion: WORKBENCH_VERSION,
      generatedBy: 'src/parammatrix.js',
      costModel: {
        name: COST_MODEL,
        weights: COST_WEIGHTS,
        note: 'deterministic operation counts closed-form in the parameter sets; a relative cost model, not a wall-clock benchmark',
        convention: SLH_DSA_COUNT_CONVENTION,
        changelog: 'param-cost-v2 re-audits the SLH-DSA sign and verify profiles against FIPS 205 ' +
          'Algorithms 14-17 and 19-20 and now counts the FORS secret-value PRFs, the T_k FORS-root ' +
          'compression, and the PRF_msg / H_msg framing calls that param-cost-v1 omitted'
      },
      runParameters: {
        seed, sweepCount, sweepsIncluded: sweeps.length > 0,
        parameterSets: matrix.length
      },
      matrix,
      kemSizes: A.kemSizeTable(),
      sweeps,
      hashSignatureSizes: A.hashSignatureSizes(seed + ':wots', 3),
      securityTable: P.securityReport().map(x => ({ name: x.name, classical: x.classical, quantum: x.quantum })),
      selfChecks: {
        matrixComplete: matrix.length === 18 && new Set(matrix.map(r => r.name)).size === 18,
        slhDsaFamiliesComplete: matrix.filter(r => r.standard === 'FIPS 205').length === 12 &&
          ['SHA2', 'SHAKE'].every(f => matrix.filter(r => r.standard === 'FIPS 205' && r.params.hashFamily === f).length === 6),
        derivedBytesMatchPublished: matrix.every(r => r.publishedBytesMatch),
        kemMeasuredMatchesSpec: matrix.filter(r => r.role === 'kem').every(r => r.measuredMatchesSpec),
        sweepsClean: sweeps.every(s => s.decryptionFailures === 0),
        categoriesCoverNist: [1, 2, 3, 5].every(c => matrix.some(r => r.category === c)),
        categoryRowsCarryNoBits: matrix.every(r =>
          r.security.method !== 'nist-category' || (r.security.classical === null && r.security.quantum === null))
      }
    };
    const fingerprint = P.bytesToHex(P.sha256(P.utf8Bytes(JSON.stringify(payload))));
    return Object.assign({ fingerprint }, payload);
  }

  const CSV_COLUMNS = Object.freeze([
    'set', 'standard', 'family', 'nistCategory', 'nistCategoryReference',
    'pkOrEkBytes', 'skOrDkBytes', 'ctOrSigBytes', 'handshakeBytes',
    'classicalBits', 'quantumBits', 'securityMethod', 'estimateModel',
    'keygenWorkUnits', 'signOrEncapsWorkUnits', 'verifyOrDecapsWorkUnits',
    'expectedSignAttempts', 'sweepSeeds', 'sweepMatched', 'sweepDecryptionFailures'
  ]);

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    // A leading formula trigger character must stay text in a spreadsheet.
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // The CSV leads with a commented provenance block naming the run
  // parameters and the JSON payload fingerprint, so the export alone
  // identifies which run produced it. Every line carries a leading '#'
  // before the header row and every value is flattened to a single line,
  // so a hostile seed cannot inject a data row or a spreadsheet formula.
  function csvCommentLine(label, value) {
    return '# ' + label + ': ' + String(value).replace(/[\r\n\t]+/g, ' ');
  }

  function reportCsv(report) {
    const sweepBy = {};
    for (const s of (report.sweeps || [])) sweepBy[s.param] = s;
    const lines = [
      csvCommentLine('report', 'pqc-vault-bench deterministic benchmark CSV'),
      csvCommentLine('schema', report.schema),
      csvCommentLine('workbench version', report.workbenchVersion),
      csvCommentLine('report seed', report.runParameters.seed),
      csvCommentLine('cost model', report.costModel.name),
      csvCommentLine('sweep count', report.runParameters.sweepCount),
      csvCommentLine('sweeps included', report.runParameters.sweepsIncluded),
      csvCommentLine('JSON payload SHA-256 fingerprint', report.fingerprint),
      CSV_COLUMNS.join(',')
    ];
    for (const r of report.matrix) {
      const sw = sweepBy[r.name];
      lines.push([
        r.name, r.standard, r.family, r.category, r.security.referencePrimitive,
        r.bytes.publicKey, r.bytes.secretKey, r.bytes.payload, r.bytes.handshakeTotal,
        r.security.classical === null ? '' : r.security.classical,
        r.security.quantum === null ? '' : r.security.quantum,
        r.security.method, r.security.estimateModel === null ? '' : r.security.estimateModel,
        r.workUnits.keygen, r.workUnits.primary, r.workUnits.secondary,
        r.expectedAttempts !== undefined ? r.expectedAttempts.toFixed(4) : '',
        sw ? sw.count : '', sw ? sw.matched : '', sw ? sw.decryptionFailures : ''
      ].map(csvEscape).join(','));
    }
    return lines.join('\n') + '\n';
  }

  const api = {
    WORKBENCH_VERSION, REPORT_SCHEMA, COST_MODEL, SLH_DSA_COUNT_CONVENTION,
    ML_KEM_SPEC, ML_DSA_PARAMS, ML_DSA_Q, SLH_DSA_PARAMS, SLH_W, CATEGORY_REFERENCE, COST_WEIGHTS,
    packBytes, mlKemSpecBytes, mlDsaSpecBytes, slhDsaLen, slhDsaM, slhDsaSpecBytes,
    securityEstimate, workUnits, mlKemWorkProfile, mlDsaWorkProfile, mlDsaExpectedAttempts,
    slhDsaWorkProfile, fipsParameterMatrix, benchmarkReport, reportCsv, csvEscape, csvCommentLine, CSV_COLUMNS
  };
  return api;
}));
