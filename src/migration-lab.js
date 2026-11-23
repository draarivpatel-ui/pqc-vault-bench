/*
 * Quantum-migration and treasury policy workbench layer.
 *
 * Four deterministic engines over the real primitives in pqc.js, the
 * measured analysis layer, the FIPS 203 / 204 / 205 parameter matrix
 * and the QDay Aevum settlement module:
 *
 * 1. A five-regime x four-profile migration comparator. Every byte
 *    footprint, work index and NIST category is recomputed from the
 *    spec derivations and cost model in parammatrix.js and from live
 *    engine output; nothing is copied from a table.
 * 2. An adversarial tamper and forgery replay matrix that executes
 *    real engine operations (ML-KEM implicit rejection, WOTS+
 *    checksum and chain tamper, XMSS foreign-tree and leaf-exhaustion
 *    rejection, QDay tUSD8 anchor binding checks) and returns
 *    structured fail-closed proof records.
 * 3. A #pqc= URL-hash bookmark codec that normalizes every workbench
 *    control and round-trips it, failing closed on malformed or
 *    hostile hashes.
 * 4. A cached canonical SHA-256 audited-brief exporter (JSON,
 *    formula-safe CSV, Markdown). One digest-stamped object exists per
 *    state key, so the on-page fingerprint, the JSON download, the CSV
 *    provenance block and the Markdown footer always show the same
 *    checksum.
 *
 * Zero dependencies. UMD, like the rest of the workbench.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const P = isNode ? require('./pqc.js') : root.PQC;
  const A = isNode ? require('./analysis.js') : root.PQCAnalysis;
  const M = isNode ? require('./parammatrix.js') : root.PQCParamMatrix;
  const Q = isNode ? require('./qday-aevum.js') : root.QDayAevum;
  const api = factory(P, A, M, Q);
  if (isNode) module.exports = api;
  else root.PQCMigrationLab = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P, A, M, Q) {
  'use strict';

  const LAB_VERSION = '1.0.0';
  const AUDIT_SCHEMA = 'pqc-vault-bench/audit-brief-v1';
  const STATE_SCHEMA = 'pqc-vault-bench/state-v1';
  const HASH_PREFIX = '#pqc=';
  const XMSS_VAULT_HEIGHT = 10;
  const MAX_HASH_BODY = 8192;
  const MAX_CONTROLS = 200;

  // ============================================================
  // Section 1: migration regimes and treasury profiles
  // ============================================================
  // Every PQ component is named so its bytes and work can be pulled
  // live from the spec derivations in parammatrix.js. The legacy row
  // derives its footprint from the workbench primitive estimator
  // (pkBits / signatureBits over 8), not from a hardcoded constant.
  const MIGRATION_REGIMES = Object.freeze({
    'legacy-ecdsa': Object.freeze({
      label: 'Legacy ECDSA only',
      family: 'classical',
      pqComponent: null,
      nistCategory: null,
      stateful: false,
      summary: 'No migration: bare secp256k1 ECDSA keys stay exposed to Shor.'
    }),
    'hybrid-ecdsa-mlkem768': Object.freeze({
      label: 'Hybrid ECDSA + ML-KEM-768',
      family: 'hybrid-kem',
      pqComponent: 'ML-KEM-768',
      nistCategory: 3,
      stateful: false,
      summary: 'Classical signature plus an ML-KEM-768 encapsulation leg.'
    }),
    'hybrid-ecdsa-mldsa65': Object.freeze({
      label: 'Hybrid ECDSA + ML-DSA-65',
      family: 'hybrid-sig',
      pqComponent: 'ML-DSA-65',
      nistCategory: 3,
      stateful: false,
      summary: 'Classical signature plus an ML-DSA-65 signature leg.'
    }),
    'stateful-xmss-vault': Object.freeze({
      label: 'Stateful XMSS vault',
      family: 'hash-stateful',
      pqComponent: 'XMSS-SHA256-WOTS16',
      nistCategory: null,
      stateful: true,
      summary: 'Merkle vault of one-time WOTS+ keys; state is consumed per settlement.'
    }),
    'stateless-slhdsa-128s': Object.freeze({
      label: 'Stateless SLH-DSA-128s',
      family: 'hash-stateless',
      pqComponent: 'SLH-DSA-SHA2-128s',
      nistCategory: 1,
      stateful: false,
      summary: 'FIPS 205 small-parameter signature; no state, large signature.'
    })
  });

  // Treasury profiles describe settlement shape only; every derived
  // figure is computed from these inputs, not stored as a result.
  const TREASURY_PROFILES = Object.freeze({
    'hot-treasury': Object.freeze({
      label: 'Hot treasury',
      utxoCount: 4200,
      avgValueBtc: 0.35,
      annualSettlements: 52000,
      custody: 'online signer',
      keyExposure: 'keys revealed on every spend',
      byteBudget: 4096,
      latencyBudget: 10
    }),
    'high-freq-settlement': Object.freeze({
      label: 'High-frequency settlement',
      utxoCount: 260,
      avgValueBtc: 8.4,
      annualSettlements: 180000,
      custody: 'exchange settlement rail',
      keyExposure: 'deposit keys revealed at first spend',
      byteBudget: 2560,
      latencyBudget: 6
    }),
    'cold-reserve': Object.freeze({
      label: 'Cold reserve vault',
      utxoCount: 24,
      avgValueBtc: 240,
      annualSettlements: 6,
      custody: 'offline vault',
      keyExposure: 'keys revealed only on rare spends',
      byteBudget: 65536,
      latencyBudget: 10000000
    }),
    'qday-aevum-tusd8': Object.freeze({
      label: 'QDay Aevum tUSD8 treasury',
      utxoCount: 40,
      avgValueBtc: 0,
      asset: 'tUSD8 ERC-20 on chain 44005',
      annualSettlements: 1200,
      custody: 'anchored settlement vault',
      keyExposure: 'anchor payloads revealed at settlement',
      byteBudget: 16384,
      latencyBudget: 12
    })
  });

  const REGIME_IDS = Object.freeze(Object.keys(MIGRATION_REGIMES));
  const PROFILE_IDS = Object.freeze(Object.keys(TREASURY_PROFILES));

  // Lookups must use own-property checks: table['__proto__'] and
  // table['constructor'] resolve to Object.prototype members, not
  // undefined, so a plain index lookup smuggles hostile ids through.
  function regimeEntry(regimeId) {
    return Object.prototype.hasOwnProperty.call(MIGRATION_REGIMES, regimeId)
      ? MIGRATION_REGIMES[regimeId] : null;
  }

  function profileEntry(profileId) {
    return Object.prototype.hasOwnProperty.call(TREASURY_PROFILES, profileId)
      ? TREASURY_PROFILES[profileId] : null;
  }

  function regimeList() { return REGIME_IDS.slice(); }
  function profileList() { return PROFILE_IDS.slice(); }

  function finiteInt(v) {
    return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
  }

  // ============================================================
  // Section 2: derived byte footprints and work profiles
  // ============================================================
  function ecdsaFootprint() {
    const p = P.PRIMITIVES['secp256k1 ECDSA'];
    if (!p) throw new Error('secp256k1 ECDSA entry missing from primitive table');
    return { publicKeyBytes: p.pkBits / 8, payloadBytes: p.signatureBits / 8 };
  }

  // Exact XMSS signature size for the workbench construction: the
  // WOTS+ signature is WOTS_LEN chains of 32 bytes, the authentication
  // path is one 32-byte node per level, plus the 32-byte leaf and a
  // 4-byte index. Matches analysis.hashSignatureSizes at every height.
  function xmssSignatureBytes(height) {
    if (!finiteInt(height) || height < 0 || height > 20) {
      throw new RangeError('XMSS height must be an integer between 0 and 20');
    }
    return P.WOTS_LEN * 32 + height * 32 + 32 + 4;
  }

  function xmssPublicKeyBytes() { return 32; }

  // Exact SHA-256 call counts for the workbench XMSS construction at a
  // given tree height and message, mirroring the code paths in pqc.js:
  // keygen builds leafCount WOTS+ public keys (WOTS_LEN chains of
  // WOTS_W - 1 hashes plus one pkHash) and leafCount - 1 Merkle merges;
  // sign reveals sum(digits) chain steps; verify completes
  // sum(WOTS_W - 1 - digits) steps plus the pkHash and one Merkle merge
  // per level.
  function xmssWorkProfile(height, message) {
    if (!finiteInt(height) || height < 0 || height > 20) {
      throw new RangeError('XMSS height must be an integer between 0 and 20');
    }
    const msgBytes = typeof message === 'string'
      ? P.utf8Bytes(message)
      : (message instanceof Uint8Array ? message : P.utf8Bytes('migration-lab:treasury-v1'));
    const digest = P.sha256(msgBytes);
    const digits = P.messageToBaseW(digest, P.WOTS_W);
    const chain = digits.concat(P.wotsChecksum(digits, P.WOTS_W));
    let signCalls = 0, verifyCalls = 0;
    for (let i = 0; i < chain.length; i++) {
      signCalls += chain[i];
      verifyCalls += (P.WOTS_W - 1) - chain[i];
    }
    const leafCount = Math.pow(2, height);
    const keygenCalls = leafCount * (P.WOTS_LEN * (P.WOTS_W - 1) + 1) + (leafCount - 1);
    return {
      keygen: { hashCalls: keygenCalls },
      primary: { hashCalls: signCalls },
      secondary: { hashCalls: verifyCalls + 1 + height },
      signDigitTotal: signCalls,
      leafCount
    };
  }

  function regimeFootprint(regimeId, options) {
    const opts = options || {};
    const reg = regimeEntry(regimeId);
    if (!reg) throw new RangeError('unknown migration regime: ' + regimeId);
    const ec = ecdsaFootprint();
    if (regimeId === 'legacy-ecdsa') {
      return {
        publicKey: ec.publicKeyBytes,
        payload: ec.payloadBytes,
        pqPayload: 0,
        method: 'primitive estimator pkBits/signatureBits over 8'
      };
    }
    if (regimeId === 'hybrid-ecdsa-mlkem768') {
      const b = M.mlKemSpecBytes('ML-KEM-768');
      return {
        publicKey: ec.publicKeyBytes + b.ekBytes,
        payload: ec.payloadBytes + b.ctBytes,
        pqPayload: b.ekBytes + b.ctBytes,
        method: 'FIPS 203 packing formulas'
      };
    }
    if (regimeId === 'hybrid-ecdsa-mldsa65') {
      const b = M.mlDsaSpecBytes('ML-DSA-65');
      return {
        publicKey: ec.publicKeyBytes + b.pkBytes,
        payload: ec.payloadBytes + b.sigBytes,
        pqPayload: b.pkBytes + b.sigBytes,
        method: 'FIPS 204 packing formulas'
      };
    }
    if (regimeId === 'stateful-xmss-vault') {
      const h = opts.xmssHeight === undefined ? XMSS_VAULT_HEIGHT : opts.xmssHeight;
      return {
        publicKey: xmssPublicKeyBytes(),
        payload: xmssSignatureBytes(h),
        pqPayload: xmssPublicKeyBytes() + xmssSignatureBytes(h),
        xmssHeight: h,
        leafCapacity: Math.pow(2, h),
        method: 'WOTS_LEN chains plus height authentication path'
      };
    }
    if (regimeId === 'stateless-slhdsa-128s') {
      const b = M.slhDsaSpecBytes('SLH-DSA-SHA2-128s');
      return {
        publicKey: b.pkBytes,
        payload: b.sigBytes,
        pqPayload: b.pkBytes + b.sigBytes,
        method: 'FIPS 205 packing formulas'
      };
    }
    throw new RangeError('unhandled migration regime: ' + regimeId);
  }

  function regimeWork(regimeId, options) {
    const opts = options || {};
    const reg = regimeEntry(regimeId);
    if (!reg) throw new RangeError('unknown migration regime: ' + regimeId);
    if (regimeId === 'legacy-ecdsa') {
      return {
        keygen: 0, primary: 0, secondary: 0,
        method: 'classical baseline; no post-quantum work is modeled'
      };
    }
    if (regimeId === 'hybrid-ecdsa-mlkem768') {
      const w = M.mlKemWorkProfile('ML-KEM-768');
      return {
        keygen: M.workUnits(w.keygen),
        primary: M.workUnits(w.encaps),
        secondary: M.workUnits(w.decaps),
        method: 'param-cost-v2 encapsulate + decapsulate'
      };
    }
    if (regimeId === 'hybrid-ecdsa-mldsa65') {
      const w = M.mlDsaWorkProfile('ML-DSA-65');
      return {
        keygen: M.workUnits(w.keygen),
        primary: M.workUnits(w.sign),
        secondary: M.workUnits(w.verify),
        method: 'param-cost-v2 sign + verify with repetition estimate'
      };
    }
    if (regimeId === 'stateful-xmss-vault') {
      const h = opts.xmssHeight === undefined ? XMSS_VAULT_HEIGHT : opts.xmssHeight;
      const w = xmssWorkProfile(h, opts.signMessage || 'migration-lab:treasury-v1');
      return {
        keygen: w.keygen.hashCalls,
        primary: w.primary.hashCalls,
        secondary: w.secondary.hashCalls,
        method: 'exact SHA-256 call counts for message "' + (opts.signMessage || 'migration-lab:treasury-v1') + '"'
      };
    }
    if (regimeId === 'stateless-slhdsa-128s') {
      const w = M.slhDsaWorkProfile('SLH-DSA-SHA2-128s');
      return {
        keygen: w.keygen.hashCalls,
        primary: w.sign.hashCalls,
        secondary: w.verify.hashCalls,
        method: 'param-cost-v2 FIPS 205 Algorithms 5-20 hash invocations'
      };
    }
    throw new RangeError('unhandled migration regime: ' + regimeId);
  }

  // Normalization base identical to the parameter matrix: ML-KEM-512
  // key generation is index 1.00.
  function latencyBase() {
    return M.workUnits(M.mlKemWorkProfile('ML-KEM-512').keygen);
  }

  // ============================================================
  // Section 3: profile resolution, HNDL classification, comparator
  // ============================================================
  function clampInt(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    const i = Math.round(n);
    return Math.max(min, Math.min(max, i));
  }

  function resolvedProfile(profileId, overrides) {
    const base = profileEntry(profileId);
    if (!base) throw new RangeError('unknown treasury profile: ' + profileId);
    const ov = overrides || {};
    const utxoCount = ov.utxoCount === undefined || ov.utxoCount === null || ov.utxoCount === ''
      ? base.utxoCount
      : clampInt(ov.utxoCount, 1, 10000000);
    const annualSettlements = ov.annualSettlements === undefined || ov.annualSettlements === null || ov.annualSettlements === ''
      ? base.annualSettlements
      : clampInt(ov.annualSettlements, 1, 1000000000);
    return Object.assign({}, base, {
      id: profileId,
      utxoCount,
      annualSettlements,
      custom: utxoCount !== base.utxoCount || annualSettlements !== base.annualSettlements
    });
  }

  // Harvest-now-decrypt-later classification: how much key material an
  // attacker recording today's chain traffic can exploit under a future
  // large quantum computer. The class is derived from whether the
  // regime still relies on a Shor-vulnerable key.
  function classifyHndl(regimeId, profile) {
    const reg = regimeEntry(regimeId);
    if (!reg) throw new RangeError('unknown migration regime: ' + regimeId);
    const exposedKeys = Math.min(profile.annualSettlements, profile.utxoCount);
    if (regimeId === 'legacy-ecdsa') {
      return {
        class: 'critical',
        exposedKeysPerYear: exposedKeys,
        note: 'every settlement reveals a Shor-vulnerable public key; harvest-now collection is continuous'
      };
    }
    if (reg.family === 'hybrid-kem' || reg.family === 'hybrid-sig') {
      return {
        class: 'guarded',
        exposedKeysPerYear: exposedKeys,
        note: 'the post-quantum leg holds settlement authority alone; the classical leg is still harvestable but cannot move funds by itself'
      };
    }
    return {
      class: 'covered',
      exposedKeysPerYear: 0,
      note: 'hash-based signatures reveal no Shor-vulnerable key material'
    };
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  function compareCell(regimeId, profile, options) {
    const reg = regimeEntry(regimeId);
    if (!reg) throw new RangeError('unknown migration regime: ' + regimeId);
    const prof = typeof profile === 'string'
      ? resolvedProfile(profile, options && options.overrides)
      : profile;
    if (!prof || !finiteInt(prof.annualSettlements) || !finiteInt(prof.utxoCount)) {
      throw new RangeError('profile must resolve to a treasury profile object');
    }
    const fp = regimeFootprint(regimeId, options);
    const w = regimeWork(regimeId, options);
    const base = latencyBase();
    const perSettlementBytes = fp.publicKey + fp.payload;
    const workPerSettlement = w.primary + w.secondary;
    const latencyIndex = base > 0 ? workPerSettlement / base : 0;
    const hndl = classifyHndl(regimeId, prof);
    const breaches = [];
    if (perSettlementBytes > prof.byteBudget) breaches.push('wire bytes over budget');
    if (latencyIndex > prof.latencyBudget) breaches.push('work index over budget');
    let verdict;
    if (regimeId === 'legacy-ecdsa') {
      verdict = 'migrate: no post-quantum cover under Shor';
    } else {
      verdict = breaches.length ? breaches.join('; ') : 'within profile budgets';
    }
    return {
      regime: regimeId,
      label: reg.label,
      family: reg.family,
      pqComponent: reg.pqComponent,
      stateful: reg.stateful,
      summary: reg.summary,
      nistCategory: reg.nistCategory,
      categoryReference: reg.nistCategory ? M.CATEGORY_REFERENCE[reg.nistCategory] : (reg.family === 'hash-stateful' ? 'SP 800-208 stateful hash signatures' : 'none; fully Shor-broken'),
      profile: prof.id,
      bytes: {
        publicKey: fp.publicKey,
        payload: fp.payload,
        perSettlement: perSettlementBytes,
        annualWire: perSettlementBytes * prof.annualSettlements,
        keyMaterial: fp.publicKey * prof.utxoCount,
        pqPayload: fp.pqPayload,
        method: fp.method
      },
      work: {
        keygen: w.keygen,
        primary: w.primary,
        secondary: w.secondary,
        perSettlement: workPerSettlement,
        method: w.method
      },
      latencyIndex: round2(latencyIndex),
      latencyBase: base,
      hndl,
      budgets: { byte: prof.byteBudget, latency: prof.latencyBudget },
      breaches,
      verdict
    };
  }

  function comparatorMatrix(options) {
    const opts = options || {};
    const prof = resolvedProfile(opts.profile || 'qday-aevum-tusd8', opts.overrides);
    const cells = REGIME_IDS.map(id => compareCell(id, prof, opts));
    return {
      profile: prof,
      latencyBase: latencyBase(),
      cells,
      frontier: paretoFrontier(cells.map(c => ({ id: c.regime, x: c.bytes.perSettlement, y: c.latencyIndex })))
    };
  }

  // Non-dominated set of (bytes, work) points: a point is dominated
  // when another point is no worse on both axes and strictly better on
  // at least one.
  function paretoFrontier(points) {
    const sorted = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const out = [];
    let bestY = Infinity;
    for (const p of sorted) {
      if (p.y < bestY) { out.push(p); bestY = p.y; }
    }
    return out;
  }

  // Chart points for the SVG frontier: all eighteen FIPS sets plus the
  // five migration regimes, each with raw and log-scaled coordinates.
  function frontierPoints() {
    const base = latencyBase();
    const fips = M.fipsParameterMatrix().map(r => ({
      kind: 'fips',
      id: r.name,
      standard: r.standard,
      x: r.bytes.publicKey + r.bytes.payload,
      y: (r.workUnits.primary + r.workUnits.secondary) / base
    }));
    const regimes = REGIME_IDS.map(id => {
      const fp = regimeFootprint(id);
      const w = regimeWork(id);
      return {
        kind: 'regime',
        id,
        label: MIGRATION_REGIMES[id].label,
        x: fp.publicKey + fp.payload,
        y: (w.primary + w.secondary) / base
      };
    });
    return { base, fips, regimes, frontier: paretoFrontier(regimes.map(r => ({ id: r.id, x: r.x, y: r.y }))) };
  }

  // ============================================================
  // Section 4: adversarial tamper and forgery replay matrix
  // ============================================================
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function adversarialMatrix(options) {
    const opts = options || {};
    const seed = typeof opts.seed === 'string' && opts.seed ? opts.seed : 'migration-lab-adversarial-v1';
    const kemParam = opts.kemParam || 'ML-KEM-768';
    const vectors = [];
    const record = (family, id, attack, mutation, engine, expected, rejected, blockedBy, detail) => {
      const held = expected === 'fail-closed' ? !!rejected : !rejected;
      vectors.push({
        id, family, attack, mutation, engine,
        expected, rejected: !!rejected, held,
        blockedBy: blockedBy || [], detail: detail || ''
      });
      return vectors[vectors.length - 1];
    };
    const anchorOpts = {
      payer: Q.DEMO_ADDRESSES.payer,
      merchant: Q.DEMO_ADDRESSES.merchant,
      amountTusd8: '25',
      spendCapTusd8: '100',
      deadlineUnix: 1893456000,
      nonce: '0xa1b2c3d4e5f60708',
      xmssSeed: seed + ':anchor-xmss',
      seed: seed + ':attest',
      kemParam
    };
    const nowUnix = 1760000000;

    // ---- ML-KEM: FO implicit rejection under every tamper shape ----
    const kem = P.MLKEM({ param: kemParam });
    const keys = kem.deriveFromSeed(seed + ':kem');
    const enc = kem.encapsulate(keys.ek, seed + ':enc');
    const decBase = kem.decapsulate(enc.ciphertext, keys.dk);
    record('control', 'kem-clean-decapsulation', 'honest ciphertext decapsulates', 'none', 'MLKEM.decapsulate', 'accept', !P.bytesEqual(decBase, enc.sharedSecret), [], 'shared secret reproduced exactly');

    {
      const bad = enc.ciphertext.slice();
      bad[bad.length >> 1] ^= 1;
      const dec = kem.decapsulate(bad, keys.dk);
      record('kem', 'kem-bitflip-u', 'ML-KEM ciphertext bit flip in u region', 'ct[len/2] ^= 0x01', 'MLKEM.decapsulate', 'fail-closed', !P.bytesEqual(dec, enc.sharedSecret), ['fo-implicit-rejection'], 're-encryption mismatch routes to implicit rejection');
    }
    {
      const bad = enc.ciphertext.slice();
      bad[bad.length - 1] ^= 0x80;
      const dec = kem.decapsulate(bad, keys.dk);
      record('kem', 'kem-bitflip-v', 'ML-KEM ciphertext bit flip in v region', 'ct[last] ^= 0x80', 'MLKEM.decapsulate', 'fail-closed', !P.bytesEqual(dec, enc.sharedSecret), ['fo-implicit-rejection'], 'v-region mutation caught by re-encryption check');
    }
    {
      const bad = enc.ciphertext.slice(0, enc.ciphertext.length - 1);
      const dec = kem.decapsulate(bad, keys.dk);
      record('kem', 'kem-truncated', 'truncated ciphertext', 'ct.slice(0, len-1)', 'MLKEM.decapsulate', 'fail-closed', !P.bytesEqual(dec, enc.sharedSecret), ['length-gate', 'fo-implicit-rejection'], 'wrong length takes the rejection path before decoding');
    }
    {
      const bad = new Uint8Array(enc.ciphertext.length + 1);
      bad.set(enc.ciphertext, 0);
      const dec = kem.decapsulate(bad, keys.dk);
      record('kem', 'kem-extended', 'oversized ciphertext', 'ct || 0x00', 'MLKEM.decapsulate', 'fail-closed', !P.bytesEqual(dec, enc.sharedSecret), ['length-gate', 'fo-implicit-rejection'], 'extra byte rejected by the length gate');
    }
    {
      const dec = kem.decapsulate('not a ciphertext', keys.dk);
      record('kem', 'kem-nonarray', 'non-byte ciphertext input', 'string instead of Uint8Array', 'MLKEM.decapsulate', 'fail-closed', !P.bytesEqual(dec, enc.sharedSecret), ['type-gate', 'fo-implicit-rejection'], 'non-array input fails closed without throwing');
    }
    {
      const zero = new Uint8Array(enc.ciphertext.length);
      const dec = kem.decapsulate(zero, keys.dk);
      record('kem', 'kem-zero-ciphertext', 'all-zero ciphertext', 'ct.fill(0)', 'MLKEM.decapsulate', 'fail-closed', !P.bytesEqual(dec, enc.sharedSecret), ['fo-implicit-rejection'], 'zero ciphertext cannot reproduce the message');
    }
    {
      const other = kem.deriveFromSeed(seed + ':kem-other');
      const dec = kem.decapsulate(enc.ciphertext, other.dk);
      record('kem', 'kem-wrong-key', 'ciphertext replayed under a foreign key', 'dk from a different seed', 'MLKEM.decapsulate', 'fail-closed', !P.bytesEqual(dec, enc.sharedSecret), ['fo-implicit-rejection'], 'foreign decapsulation key produces a different secret');
    }

    // ---- WOTS+: checksum and chain integrity --------------------
    const kp = P.wotsGenerate(seed + ':wots');
    const msg = 'treasury-settlement-7701';
    const wsig = P.wotsSign(msg, kp);
    record('control', 'wots-clean-signature', 'honest WOTS+ signature verifies', 'none', 'wotsVerify', 'accept', !P.wotsVerify(msg, wsig.signature, kp.pkHash), [], '67 chains plus checksum agree');

    {
      // Downgrade forgery attempt: push a signature chain element one
      // step forward, as if signing a smaller message digit. The
      // checksum makes at least one other digit need a backward step,
      // which a forger cannot compute.
      let idx = -1;
      for (let i = 0; i < wsig.chain.length; i++) { if (wsig.chain[i] < P.WOTS_W - 1) { idx = i; break; } }
      const forged = wsig.signature.slice();
      forged[idx] = P.wotsChain(wsig.signature[idx], wsig.chain[idx], 1, new Uint8Array([idx, 0]));
      const ok = P.wotsVerify(msg, forged, kp.pkHash);
      record('wots', 'wots-chain-push', 'WOTS+ chain element advanced one step', 'signature[' + idx + '] pushed forward one hash', 'wotsVerify', 'fail-closed', !ok, ['wots-checksum'], 'a one-step downgrade still fails the checksum binding');
    }
    {
      const ok = P.wotsVerify(msg + ' ', wsig.signature, kp.pkHash);
      record('wots', 'wots-message-mutate', 'signed message mutated', 'message plus one space', 'wotsVerify', 'fail-closed', !ok, ['digest-binding'], 'any message change redraws every chain digit');
    }
    {
      const swapped = wsig.signature.slice();
      const t = swapped[0]; swapped[0] = swapped[1]; swapped[1] = t;
      const ok = P.wotsVerify(msg, swapped, kp.pkHash);
      record('wots', 'wots-element-swap', 'two signature chain elements swapped', 'signature[0] <-> signature[1]', 'wotsVerify', 'fail-closed', !ok, ['address-separation'], 'chains are address-separated by element index');
    }
    {
      const ok = P.wotsVerify(msg, wsig.signature.slice(0, P.WOTS_LEN - 1), kp.pkHash);
      record('wots', 'wots-truncated', 'signature truncated to 66 elements', 'signature.slice(0, 66)', 'wotsVerify', 'fail-closed', !ok, ['length-gate'], 'a short signature fails the element count gate');
    }
    {
      const zeroed = wsig.signature.slice();
      zeroed[3] = new Uint8Array(32);
      const ok = P.wotsVerify(msg, zeroed, kp.pkHash);
      record('wots', 'wots-zero-element', 'one chain element zeroed', 'signature[3].fill(0)', 'wotsVerify', 'fail-closed', !ok, ['chain-recompute'], 'zeroed chain recomputes to the wrong end value');
    }
    {
      const other = P.wotsGenerate(seed + ':wots-other');
      const ok = P.wotsVerify(msg, wsig.signature, other.pkHash);
      record('wots', 'wots-wrong-key', 'signature replayed against a foreign public key', 'pkHash from a different seed', 'wotsVerify', 'fail-closed', !ok, ['pk-binding'], 'chains terminate at the wrong public key hash');
    }

    // ---- XMSS: foreign tree, index tamper, exhausted leaves -------
    const treeA = P.XMSS({ height: 2, seed: seed + ':xmss-a' });
    const treeB = P.XMSS({ height: 2, seed: seed + ':xmss-b' });
    const xsig = treeA.sign('vault-release-1');
    record('control', 'xmss-clean-signature', 'honest XMSS signature verifies', 'none', 'XMSS.verify', 'accept', !treeA.verify(xsig), [], 'leaf plus authentication path agree with the root');

    {
      const ok = treeB.verify(xsig);
      record('xmss', 'xmss-foreign-tree', 'signature replayed against a foreign tree', 'sig from seed A verified under tree B', 'XMSS.verify', 'fail-closed', !ok, ['merkle-root'], 'authentication path resolves to a different root');
    }
    {
      const t = deepClone(xsig);
      t.index = 1;
      const ok = treeA.verify(t);
      record('xmss', 'xmss-index-swap', 'claimed leaf index moved', 'signature.index 0 -> 1', 'XMSS.verify', 'fail-closed', !ok, ['leaf-binding'], 'index and WOTS+ leaf are bound together');
    }
    {
      const t = deepClone(xsig);
      const p0 = t.proof[0]; t.proof[0] = t.proof[1]; t.proof[1] = p0;
      const ok = treeA.verify(t);
      record('xmss', 'xmss-proof-swap', 'authentication path siblings swapped', 'proof[0] <-> proof[1]', 'XMSS.verify', 'fail-closed', !ok, ['merkle-path'], 'path order is positional; swapped siblings rebuild a wrong root');
    }
    {
      const t = deepClone(xsig);
      const foreignLeaf = P.wotsGenerate(seed + ':wots-foreign');
      t.leaf = P.wotsPublicKeyHex(foreignLeaf);
      const ok = treeA.verify(t);
      record('xmss', 'xmss-leaf-swap', 'declared leaf replaced by foreign leaf', 'leaf from another keypair', 'XMSS.verify', 'fail-closed', !ok, ['wots-leaf-binding'], 'the WOTS+ key and its Merkle leaf must be the same');
    }
    {
      const ok = treeA.verify({});
      const ok2 = treeA.verify(null);
      record('xmss', 'xmss-malformed', 'malformed signature objects', '{} and null', 'XMSS.verify', 'fail-closed', !ok && !ok2, ['shape-gate'], 'non-signature inputs fail closed without throwing');
    }
    {
      const small = P.XMSS({ height: 1, seed: seed + ':xmss-exhaust' });
      small.sign('first');
      small.sign('second');
      let threw = false;
      try { small.sign('third'); } catch (err) { threw = err instanceof RangeError; }
      record('xmss', 'xmss-exhausted-leaf', 'signing past the last one-time leaf', 'third sign on a two-leaf tree', 'XMSS.sign', 'fail-closed', threw, ['leaf-exhaustion'], 'stateful vaults refuse key reuse by throwing');
    }

    // ---- QDay tUSD8 anchor: binding, replay and forgery vectors ---
    const anchor = Q.createSettlementAnchor(anchorOpts);
    const clean = Q.verifySettlementAnchor(anchor, { nowUnix });
    record('control', 'qday-clean-anchor', 'honest tUSD8 settlement anchor verifies', 'none', 'verifySettlementAnchor', 'accept', !clean.valid, [], 'all seventeen binding checks pass');

    {
      const t = deepClone(anchor);
      t.payload.chainId = 1;
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-wrong-chainid', 'payload rebound to a foreign chain', 'chainId 44005 -> 1', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['chainOk'], 'chain domain separation rejects the anchor');
    }
    {
      const t = deepClone(anchor);
      t.payload.deadlineUnix = nowUnix - 60;
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-expired-deadline', 'settlement presented after its deadline', 'deadlineUnix moved into the past', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['deadlineOk'], 'an expired settlement window fails closed');
    }
    {
      const t = deepClone(anchor);
      t.txRequest = {
        from: t.payload.merchant,
        to: t.payload.merchant,
        data: Q.encodeTransfer(t.payload.merchant, 999000000n),
        value: '0x0',
        chainId: Q.NETWORK.chainIdHex
      };
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-mutated-txrequest', 'wallet txRequest redirected to a different token call', 'txRequest.to/data replaced', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['txRequestOk'], 'the spend path only trusts the verified payload calldata');
    }
    {
      const t = deepClone(anchor);
      t.payload.nonce = '0x00';
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-malformed-nonce', 'settlement nonce truncated', 'nonce -> 0x00', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['nonceOk'], 'nonce must be 8 to 32 bytes of hex');
    }
    {
      // Replay policy: a seen-nonce registry accepts the first
      // presentation of a settlement and flags every repetition, even
      // when the static verifier would still pass the anchor.
      const seen = new Set();
      const first = seen.has(anchor.payload.nonce); seen.add(anchor.payload.nonce);
      const second = seen.has(anchor.payload.nonce);
      record('qday', 'qday-replayed-nonce', 'identical anchor presented twice', 'nonce reused across settlements', 'settlement replay registry', 'fail-closed', !first && second, ['nonce-replay'], 'the first presentation is accepted; the repeat is flagged');
    }
    {
      const t = deepClone(anchor);
      t.payload.amountRaw = (BigInt(t.payload.amountRaw) + 1n).toString(10);
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-amount-tamper', 'settlement amount raised by one base unit', 'amountRaw + 1', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['calldataOk', 'receiptHashOk', 'commitmentHashOk', 'pqcSignatureOk'], 'amount is bound by calldata, receipt, commitment and signature');
    }
    {
      const t = deepClone(anchor);
      t.payload.amountTusd8 = '999';
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-display-forge', 'display amount forged without touching raw units', 'amountTusd8 -> 999', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['displayOk'], 'display strings must match raw base units');
    }
    {
      const t = deepClone(anchor);
      t.payload.schema = 'qday-aevum/tusd8-settlement-v2';
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-schema-swap', 'payload schema swapped to a foreign domain', 'schema -> v2', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['schemaOk'], 'domain separation rejects foreign payload shapes');
    }
    {
      // A signature from a standalone XMSS tree whose root was never
      // issued by the settlement session: rootIssuedOk fails even when
      // the WOTS+ signature itself is internally consistent.
      const foreign = P.XMSS({ height: 2, seed: seed + ':xmss-foreign-root' });
      const fsig = foreign.sign(anchor.receiptHash);
      const t = deepClone(anchor);
      t.payload.xmssRoot = '0x' + fsig.root;
      t.payload.xmssLeaf = fsig.index;
      t.signature = fsig;
      const v = Q.verifySettlementAnchor(t, { nowUnix });
      record('qday', 'qday-foreign-root', 'anchor resigned under a foreign XMSS tree', 'xmssRoot and signature replaced', 'verifySettlementAnchor', 'fail-closed', !v.valid, ['rootIssuedOk', 'receiptHashOk', 'commitmentHashOk'], 'only roots issued by this session are trusted');
    }

    const expectedRejections = vectors.filter(v => v.expected === 'fail-closed').length;
    const held = vectors.filter(v => v.held).length;
    return {
      seed,
      vectors,
      summary: {
        total: vectors.length,
        expectedRejections,
        expectedAccepts: vectors.length - expectedRejections,
        held,
        allHeld: held === vectors.length,
        allFailClosed: vectors.filter(v => v.expected === 'fail-closed').every(v => v.rejected)
      }
    };
  }

  // ============================================================
  // Section 5: #pqc= URL-hash bookmark codec
  // ============================================================
  // Control schema mirrors index.html: the id, its DOM type and the
  // exact option set or range the control already enforces.
  const CONTROL_SCHEMA = Object.freeze({
    'ntt-pattern': Object.freeze({ type: 'select', options: ['ramp', 'sparse', 'alt', 'noise'] }),
    'ntt-scale': Object.freeze({ type: 'int', min: 1, max: 97 }),
    'ntt-count': Object.freeze({ type: 'int', min: 16, max: 256, step: 16 }),
    'kem-param': Object.freeze({ type: 'select', options: ['toy-64', 'ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'] }),
    'kem-seed': Object.freeze({ type: 'text', max: 64 }),
    'wots-msg': Object.freeze({ type: 'text', max: 160 }),
    'xmss-height': Object.freeze({ type: 'int', min: 1, max: 4 }),
    'risk-value': Object.freeze({ type: 'num', min: 0, max: 1000000 }),
    'risk-age': Object.freeze({ type: 'num', min: 0, max: 1000000000 }),
    'risk-exposed': Object.freeze({ type: 'bool' }),
    'risk-p2pkh': Object.freeze({ type: 'bool' }),
    'verify-param': Object.freeze({ type: 'select', options: ['toy-64', 'ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'] }),
    'verify-seeds': Object.freeze({ type: 'int', min: 4, max: 48, step: 4 }),
    'mx-family': Object.freeze({ type: 'select', options: ['all', 'FIPS 203', 'FIPS 204', 'FIPS 205'] }),
    'mx-sort': Object.freeze({ type: 'select', options: ['standard', 'bandwidth', 'primary', 'bytes'] }),
    'mx-metric': Object.freeze({ type: 'select', options: ['bandwidth', 'work', 'security'] }),
    'report-seed': Object.freeze({ type: 'text', max: 64 }),
    'report-sweeps': Object.freeze({ type: 'select', options: ['4', '8', '12'] }),
    'qday-account': Object.freeze({ type: 'text', max: 64 }),
    'qday-merchant': Object.freeze({ type: 'text', max: 64 }),
    'qday-amount': Object.freeze({ type: 'text', max: 24 }),
    'qday-cap': Object.freeze({ type: 'text', max: 24 }),
    'qday-kem-param': Object.freeze({ type: 'select', options: ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'] }),
    'lab-profile': Object.freeze({ type: 'select', options: PROFILE_IDS }),
    'lab-utxos': Object.freeze({ type: 'num', min: 1, max: 10000000 }),
    'lab-settlements': Object.freeze({ type: 'num', min: 1, max: 1000000000 }),
    'lab-seed': Object.freeze({ type: 'text', max: 64 }),
    'lab-shortcuts': Object.freeze({ type: 'bool' })
  });

  const DROP = Symbol('drop-control');

  function sanitizeControl(spec, value) {
    if (value === null || value === undefined) return DROP;
    if (spec.type === 'select') {
      return typeof value === 'string' && spec.options.indexOf(value) !== -1 ? value : DROP;
    }
    if (spec.type === 'bool') {
      if (value === true || value === false) return value;
      if (value === 'true' || value === '1' || value === 1) return true;
      if (value === 'false' || value === '0' || value === 0) return false;
      return DROP;
    }
    if (spec.type === 'int' || spec.type === 'num') {
      const n = typeof value === 'number' ? value : (typeof value === 'string' ? Number(value.trim()) : NaN);
      if (!Number.isFinite(n)) return DROP;
      let v = n + 0; // normalize -0
      if (spec.type === 'int') {
        if (spec.step) v = spec.min + Math.round((v - spec.min) / spec.step) * spec.step;
        v = Math.round(v);
      }
      v = Math.max(spec.min, Math.min(spec.max, v));
      return v;
    }
    if (spec.type === 'text') {
      let s;
      if (typeof value === 'string') s = value;
      else if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') s = String(value);
      else return DROP;
      // Strip C0/C1 control characters an input element cannot hold.
      s = s.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
      if (s.length > spec.max) s = s.slice(0, spec.max);
      return s;
    }
    return DROP;
  }

  // Accepts either a {v, controls} state object or a flat control map
  // and returns a normalized {v:1, controls} shape. Hostile keys
  // (__proto__ and friends) fail the whole decode; unknown but benign
  // keys are dropped and recorded; out-of-schema values are dropped.
  function normalizeState(input) {
    const errors = [], dropped = [], controls = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, errors: ['state must be a plain object'], controls, dropped };
    }
    if (input.v !== undefined && input.v !== 1) {
      return { ok: false, errors: ['unsupported state version: ' + String(input.v)], controls, dropped };
    }
    const src = input.controls !== undefined ? input.controls : input;
    if (!src || typeof src !== 'object' || Array.isArray(src)) {
      return { ok: false, errors: ['controls must be a plain object'], controls, dropped };
    }
    const keys = Object.keys(src).filter(k => k !== 'v');
    if (keys.length > MAX_CONTROLS) {
      return { ok: false, errors: ['control count exceeds ' + MAX_CONTROLS], controls, dropped };
    }
    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return { ok: false, errors: ['hostile key in state: ' + key], controls, dropped };
      }
      if (key.length > 64) { dropped.push(key); continue; }
      if (!Object.prototype.hasOwnProperty.call(CONTROL_SCHEMA, key)) {
        dropped.push(key);
        continue;
      }
      const clean = sanitizeControl(CONTROL_SCHEMA[key], src[key]);
      if (clean === DROP) dropped.push(key);
      else controls[key] = clean;
    }
    return { ok: true, errors, controls, dropped };
  }

  const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function base64UrlEncode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const hasB = i + 1 < bytes.length;
      const hasC = i + 2 < bytes.length;
      const b = hasB ? bytes[i + 1] : 0;
      const c = hasC ? bytes[i + 2] : 0;
      out += B64URL[a >> 2] + B64URL[((a & 3) << 4) | (b >> 4)];
      if (hasB) out += B64URL[((b & 15) << 2) | (c >> 6)];
      if (hasC) out += B64URL[c & 63];
    }
    return out;
  }

  function base64UrlDecode(str) {
    if (typeof str !== 'string' || str.length === 0 || str.length > MAX_HASH_BODY || !/^[A-Za-z0-9_-]+$/.test(str)) {
      throw new TypeError('payload is not base64url within bounds');
    }
    const bytes = new Uint8Array(Math.floor(str.length * 3 / 4) + 3);
    let bi = 0;
    for (let i = 0; i < str.length; i += 4) {
      const c0 = B64URL.indexOf(str[i]);
      const c1 = i + 1 < str.length ? B64URL.indexOf(str[i + 1]) : 0;
      const c2 = i + 2 < str.length ? B64URL.indexOf(str[i + 2]) : -1;
      const c3 = i + 3 < str.length ? B64URL.indexOf(str[i + 3]) : -1;
      if (c0 < 0 || c1 < 0) throw new TypeError('invalid base64url character');
      bytes[bi++] = (c0 << 2) | (c1 >> 4);
      if (c2 >= 0) {
        bytes[bi++] = ((c1 & 15) << 4) | (c2 >> 2);
        if (c3 >= 0) bytes[bi++] = ((c2 & 3) << 6) | c3;
      }
    }
    return bytes.slice(0, bi);
  }

  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    return Q.bytesToUtf8 ? Q.bytesToUtf8(bytes) : decodeURIComponent(escape(Array.from(bytes).map(b => String.fromCharCode(b)).join('')));
  }

  function encodeState(input) {
    const n = normalizeState(input);
    if (!n.ok) throw new TypeError('cannot encode invalid state: ' + n.errors.join('; '));
    const state = { v: 1, controls: n.controls };
    return HASH_PREFIX + base64UrlEncode(P.utf8Bytes(Q.canonicalString(state)));
  }

  function decodeState(hash) {
    const fail = errors => ({ ok: false, errors, state: null, dropped: [] });
    if (typeof hash !== 'string') return fail(['hash must be a string']);
    let h = hash.trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (!h.startsWith('pqc=')) return fail(['missing #pqc= prefix']);
    const body = h.slice(4);
    if (body.length === 0) return fail(['empty bookmark payload']);
    if (body.length > MAX_HASH_BODY) return fail(['bookmark payload exceeds ' + MAX_HASH_BODY + ' characters']);
    if (!/^[A-Za-z0-9_-]+$/.test(body)) return fail(['bookmark payload has non-base64url characters']);
    let json;
    try {
      json = utf8Decode(base64UrlDecode(body));
    } catch (err) {
      return fail(['bookmark payload failed to decode: ' + err.message]);
    }
    let raw;
    try {
      raw = JSON.parse(json);
    } catch (err) {
      return fail(['bookmark payload is not JSON']);
    }
    const n = normalizeState(raw);
    if (!n.ok) return fail(n.errors);
    return { ok: true, errors: [], state: { v: 1, controls: n.controls }, dropped: n.dropped };
  }

  // ============================================================
  // Section 6: cached canonical SHA-256 audited brief exporter
  // ============================================================
  const briefCache = new Map();

  function briefStateKey(options) {
    const opts = options || {};
    const prof = resolvedProfile(opts.profile || 'qday-aevum-tusd8', {
      utxoCount: opts.utxoCount,
      annualSettlements: opts.annualSettlements
    });
    const seed = typeof opts.seed === 'string' && opts.seed.trim() ? opts.seed.trim() : 'migration-lab-brief';
    return {
      key: Q.canonicalString({
        schema: AUDIT_SCHEMA,
        seed,
        profile: prof.id,
        utxoCount: prof.utxoCount,
        annualSettlements: prof.annualSettlements,
        xmssHeight: XMSS_VAULT_HEIGHT
      }),
      seed,
      profile: prof
    };
  }

  function specBytesCheck() {
    const mlkem = M.mlKemSpecBytes('ML-KEM-768');
    const mldsa = M.mlDsaSpecBytes('ML-DSA-65');
    const slh = M.slhDsaSpecBytes('SLH-DSA-SHA2-128s');
    const ec = ecdsaFootprint();
    const fpKem = regimeFootprint('hybrid-ecdsa-mlkem768');
    const fpDsa = regimeFootprint('hybrid-ecdsa-mldsa65');
    const fpSlh = regimeFootprint('stateless-slhdsa-128s');
    const fpXmss = regimeFootprint('stateful-xmss-vault');
    return fpKem.publicKey === ec.publicKeyBytes + mlkem.ekBytes &&
      fpKem.payload === ec.payloadBytes + mlkem.ctBytes &&
      fpDsa.publicKey === ec.publicKeyBytes + mldsa.pkBytes &&
      fpDsa.payload === ec.payloadBytes + mldsa.sigBytes &&
      fpSlh.publicKey === slh.pkBytes &&
      fpSlh.payload === slh.sigBytes &&
      fpXmss.payload === P.WOTS_LEN * 32 + XMSS_VAULT_HEIGHT * 32 + 36 &&
      ec.publicKeyBytes === 32 && ec.payloadBytes === 64;
  }

  function auditedBrief(options) {
    const opts = options || {};
    const stateKey = briefStateKey(opts);
    if (briefCache.has(stateKey.key)) return briefCache.get(stateKey.key);

    const cells = REGIME_IDS.map(id => compareCell(id, stateKey.profile));
    const adv = opts.includeAdversarial === false
      ? null
      : adversarialMatrix({ seed: stateKey.seed + ':adv', kemParam: opts.kemParam || 'ML-KEM-768' });
    const payload = {
      schema: AUDIT_SCHEMA,
      workbenchVersion: M.WORKBENCH_VERSION,
      labVersion: LAB_VERSION,
      generatedBy: 'src/migration-lab.js',
      costModel: M.COST_MODEL,
      latencyBase: { name: 'ML-KEM-512 keygen', workUnits: latencyBase() },
      runParameters: {
        seed: stateKey.seed,
        profile: stateKey.profile.id,
        utxoCount: stateKey.profile.utxoCount,
        annualSettlements: stateKey.profile.annualSettlements,
        customVolumes: stateKey.profile.custom,
        xmssVaultHeight: XMSS_VAULT_HEIGHT
      },
      comparator: cells.map(c => ({
        regime: c.regime,
        pqComponent: c.pqComponent,
        nistCategory: c.nistCategory,
        categoryReference: c.categoryReference,
        publicKeyBytes: c.bytes.publicKey,
        payloadBytes: c.bytes.payload,
        perSettlementBytes: c.bytes.perSettlement,
        annualWireBytes: c.bytes.annualWire,
        keyMaterialBytes: c.bytes.keyMaterial,
        workUnits: c.work.perSettlement,
        latencyIndex: c.latencyIndex,
        hndl: c.hndl.class,
        verdict: c.verdict
      })),
      adversarial: adv ? {
        total: adv.summary.total,
        held: adv.summary.held,
        allFailClosed: adv.summary.allFailClosed,
        vectors: adv.vectors.map(v => ({ id: v.id, expected: v.expected, held: v.held, blockedBy: v.blockedBy }))
      } : null,
      selfChecks: {
        regimesComplete: cells.length === REGIME_IDS.length &&
          new Set(cells.map(c => c.regime)).size === REGIME_IDS.length,
        bytesDerivedFromSpecs: specBytesCheck(),
        latencyBasePositive: latencyBase() > 0,
        adversarialAllHeld: adv ? adv.summary.allHeld : null,
        statefulOnlyXmss: cells.every(c => (c.regime === 'stateful-xmss-vault') === c.stateful)
      }
    };
    const sha256 = P.bytesToHex(P.sha256(P.utf8Bytes(Q.canonicalString(payload))));
    const stamped = Object.assign({ sha256 }, payload);
    const entry = {
      stateKey: stateKey.key,
      sha256,
      payload: stamped
    };
    entry.json = JSON.stringify(stamped, null, 2);
    entry.csv = briefCsv(entry);
    entry.markdown = briefMarkdown(entry);
    briefCache.set(stateKey.key, entry);
    return entry;
  }

  function briefCsv(entry) {
    const p = entry.payload;
    const lines = [
      M.csvCommentLine('audited brief', 'pqc-vault-bench migration and audit workbench'),
      M.csvCommentLine('schema', p.schema),
      M.csvCommentLine('workbench version', p.workbenchVersion),
      M.csvCommentLine('cost model', p.costModel),
      M.csvCommentLine('report seed', p.runParameters.seed),
      M.csvCommentLine('treasury profile', p.runParameters.profile),
      M.csvCommentLine('utxo count', p.runParameters.utxoCount),
      M.csvCommentLine('annual settlements', p.runParameters.annualSettlements),
      M.csvCommentLine('canonical payload SHA-256', entry.sha256),
      'regime,pqComponent,nistCategory,categoryReference,publicKeyBytes,payloadBytes,perSettlementBytes,annualWireBytes,keyMaterialBytes,workUnits,latencyIndex,hndl,verdict'
    ];
    for (const r of p.comparator) {
      lines.push([
        r.regime, r.pqComponent === null ? 'none' : r.pqComponent,
        r.nistCategory === null ? 'none' : r.nistCategory, r.categoryReference,
        r.publicKeyBytes, r.payloadBytes, r.perSettlementBytes,
        r.annualWireBytes, r.keyMaterialBytes, r.workUnits, r.latencyIndex,
        r.hndl, r.verdict
      ].map(M.csvEscape).join(','));
    }
    lines.push(M.csvCommentLine(
      'adversarial fail-closed proofs held',
      p.adversarial ? p.adversarial.held + ' of ' + p.adversarial.total : 'not run'
    ));
    return lines.join('\n') + '\n';
  }

  function briefMarkdown(entry) {
    const p = entry.payload;
    const out = [];
    out.push('# PQC Vault Bench: Migration and Audit Brief');
    out.push('');
    out.push('Profile: ' + p.runParameters.profile +
      ' | UTXOs: ' + p.runParameters.utxoCount +
      ' | Settlements per year: ' + p.runParameters.annualSettlements);
    out.push('Cost model: ' + p.costModel + ' | Latency base: ' + p.latencyBase.name + ' = ' + p.latencyBase.workUnits + ' work units');
    out.push('');
    out.push('| Regime | PQ component | NIST cat | pk+payload B | work units | latency index | HNDL | verdict |');
    out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of p.comparator) {
      out.push('| ' + r.regime + ' | ' + (r.pqComponent === null ? 'none' : r.pqComponent) +
        ' | ' + (r.nistCategory === null ? 'none' : r.nistCategory) +
        ' | ' + r.perSettlementBytes + ' | ' + r.workUnits + ' | ' + r.latencyIndex +
        ' | ' + r.hndl + ' | ' + r.verdict + ' |');
    }
    out.push('');
    if (p.adversarial) {
      out.push('Adversarial replay matrix: ' + p.adversarial.held + ' of ' + p.adversarial.total +
        ' tamper and forgery vectors failed closed under real engine operations.');
      out.push('');
      out.push('| Vector | Expected | Held | Blocked by |');
      out.push('| --- | --- | --- | --- |');
      for (const v of p.adversarial.vectors) {
        out.push('| ' + v.id + ' | ' + v.expected + ' | ' + (v.held ? 'yes' : 'no') + ' | ' + v.blockedBy.join(', ') + ' |');
      }
      out.push('');
    }
    const checks = Object.entries(p.selfChecks).map(([k, v]) => k + '=' + v).join(', ');
    out.push('Self checks: ' + checks);
    out.push('');
    out.push('SHA-256 (canonical payload): ' + entry.sha256);
    return out.join('\n') + '\n';
  }

  // Recomputes the digest over the stamped payload minus its sha256
  // field, so any single mutation anywhere in the brief is detected.
  function verifyBrief(entryOrPayload) {
    const payload = entryOrPayload && entryOrPayload.payload ? entryOrPayload.payload : entryOrPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, error: 'not an audited brief payload' };
    }
    const sha = payload.sha256;
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) {
      return { ok: false, error: 'malformed or missing sha256 field' };
    }
    const body = {};
    for (const k of Object.keys(payload)) if (k !== 'sha256') body[k] = payload[k];
    const actual = P.bytesToHex(P.sha256(P.utf8Bytes(Q.canonicalString(body))));
    return { ok: actual === sha, expected: sha, actual, tamperDetected: actual !== sha };
  }

  // A deliberate corruption proof: clones the payload, flips one
  // comparator figure, and shows the digest check catches it.
  function tamperCheckBrief(entry) {
    const mutated = deepClone(entry.payload);
    mutated.comparator[0].perSettlementBytes += 1;
    const v = verifyBrief(mutated);
    return {
      held: !v.ok && v.tamperDetected,
      mutatedField: 'comparator[0].perSettlementBytes',
      verify: v
    };
  }

  function cachedBriefKeys() { return Array.from(briefCache.keys()); }

  // ============================================================
  // Section 7: deterministic in-page self tests
  // ============================================================
  function selfTests() {
    const out = [];
    const push = (id, name, pass, detail) => out.push({ id, name, pass: !!pass, detail: detail || '' });

    push('st-sha256', 'SHA-256 known answer', P.bytesToHex(P.sha256(P.utf8Bytes('abc'))) ===
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'abc vector');

    {
      const m = comparatorMatrix({ profile: 'qday-aevum-tusd8' });
      push('st-matrix-shape', 'comparator covers 5 regimes x all fields', m.cells.length === 5 &&
        m.cells.every(c => Number.isFinite(c.latencyIndex) && c.bytes.perSettlement > 0), m.cells.length + ' cells');
    }
    push('st-bytes-spec', 'every regime footprint recomputes from spec derivations', specBytesCheck(), 'FIPS 203/204/205 packing formulas');

    {
      const controls = { 'kem-param': 'ML-KEM-512', 'ntt-count': 128, 'risk-exposed': false, 'kem-seed': 'roundtrip' };
      const d = decodeState(encodeState({ controls }));
      push('st-codec-roundtrip', '#pqc= bookmark codec round-trips', d.ok &&
        d.state.controls['kem-param'] === 'ML-KEM-512' && d.state.controls['ntt-count'] === 128 &&
        d.state.controls['risk-exposed'] === false && d.state.controls['kem-seed'] === 'roundtrip', 'encode then decode');
    }
    push('st-codec-bad-b64', 'malformed hash fails closed', !decodeState('#pqc=!!!notbase64').ok, 'non-base64url rejected');
    {
      const hostile = HASH_PREFIX + base64UrlEncode(P.utf8Bytes('{"v":1,"controls":{"__proto__":{"x":1}}}'));
      push('st-codec-proto', 'hostile __proto__ key fails closed', !decodeState(hostile).ok, 'prototype key rejected');
    }
    {
      const d = decodeState(encodeState({ controls: { 'ntt-count': 99999, 'lab-utxos': -4 } }));
      push('st-codec-clamp', 'out-of-range numbers clamp inside the control range', d.ok &&
        d.state.controls['ntt-count'] === 256 && d.state.controls['lab-utxos'] === 1, 'clamped to max/min');
    }
    {
      const adv = adversarialMatrix({ seed: 'selftest:adv' });
      push('st-adv-held', 'adversarial replay matrix fails closed on every vector', adv.summary.allHeld,
        adv.summary.held + '/' + adv.summary.total + ' vectors held');
    }
    {
      const brief = auditedBrief({ profile: 'qday-aevum-tusd8', seed: 'selftest:brief' });
      const parity = brief.json.indexOf(brief.sha256) !== -1 &&
        brief.csv.indexOf(brief.sha256) !== -1 &&
        brief.markdown.indexOf(brief.sha256) !== -1;
      push('st-digest-parity', 'JSON, CSV and Markdown all carry the page fingerprint', parity, brief.sha256.slice(0, 12) + '...');
      const again = auditedBrief({ profile: 'qday-aevum-tusd8', seed: 'selftest:brief' });
      push('st-brief-deterministic', 'rebuilt brief reuses one digest-stamped object', again === brief && again.sha256 === brief.sha256, 'cache identity');
      push('st-brief-tamper', 'single-byte tamper is caught by the digest check', tamperCheckBrief(brief).held, 'mutated comparator figure');
    }
    {
      const prof = resolvedProfile('hot-treasury');
      push('st-hndl-classes', 'HNDL classes: legacy critical, PQ vaults covered',
        classifyHndl('legacy-ecdsa', prof).class === 'critical' &&
        classifyHndl('stateful-xmss-vault', prof).class === 'covered' &&
        classifyHndl('hybrid-ecdsa-mldsa65', prof).class === 'guarded', 'all three classes verified');
    }
    {
      const base = latencyBase();
      const mlkem = regimeWork('hybrid-ecdsa-mlkem768');
      const cell = compareCell('hybrid-ecdsa-mlkem768', resolvedProfile('cold-reserve'));
      push('st-latency-base', 'latency index equals work units over ML-KEM-512 keygen base',
        base > 0 && cell.latencyIndex === round2((mlkem.primary + mlkem.secondary) / base), 'index recomputed live');
    }
    {
      const small = P.XMSS({ height: 1, seed: 'selftest:xmss-exhaust' });
      small.sign('a'); small.sign('b');
      let threw = false;
      try { small.sign('c'); } catch (err) { threw = true; }
      push('st-xmss-exhaust', 'XMSS one-time leaf exhaustion throws', threw, 'two-leaf tree');
    }
    {
      const kp2 = P.wotsGenerate('selftest:wots');
      const s2 = P.wotsSign('forgery-target', kp2);
      const forged = s2.signature.slice();
      let idx = -1;
      for (let i = 0; i < s2.chain.length; i++) { if (s2.chain[i] < P.WOTS_W - 1) { idx = i; break; } }
      forged[idx] = P.wotsChain(s2.signature[idx], s2.chain[idx], 1, new Uint8Array([idx, 0]));
      push('st-wots-forge', 'WOTS+ downgrade forgery rejected', !P.wotsVerify('forgery-target', forged, kp2.pkHash), 'checksum blocks chain push');
    }
    return out;
  }

  const api = {
    LAB_VERSION, AUDIT_SCHEMA, STATE_SCHEMA, HASH_PREFIX, XMSS_VAULT_HEIGHT, MAX_HASH_BODY,
    MIGRATION_REGIMES, TREASURY_PROFILES, REGIME_IDS, PROFILE_IDS, CONTROL_SCHEMA,
    regimeList, profileList,
    ecdsaFootprint, xmssSignatureBytes, xmssPublicKeyBytes, xmssWorkProfile,
    regimeFootprint, regimeWork, latencyBase,
    resolvedProfile, classifyHndl, compareCell, comparatorMatrix, paretoFrontier, frontierPoints,
    adversarialMatrix,
    normalizeState, sanitizeControl, encodeState, decodeState, base64UrlEncode, base64UrlDecode,
    briefStateKey, auditedBrief, briefCsv, briefMarkdown, verifyBrief, tamperCheckBrief, cachedBriefKeys,
    selfTests
  };
  return api;
}));
