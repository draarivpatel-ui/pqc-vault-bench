(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PQC = api; root.MLKEM = api.MLKEM; }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ============================================================
  // Module 0: general math utilities
  // ============================================================
  const Q = 3329;            // Kyber / ML-KEM prime
  const N = 256;             // polynomial degree
  const ZETA = 17;           // primitive 256th root of unity mod Q

  function mod(x, m) {
    if (m === undefined) m = Q;
    return ((x % m) + m) % m;
  }

  function modPow(a, e, m) {
    if (m === undefined) m = Q;
    let r = 1;
    a = mod(a, m);
    while (e > 0) {
      if (e & 1) r = mod(r * a, m);
      a = mod(a * a, m);
      e = Math.floor(e / 2);
    }
    return r;
  }

  function bitRev7(x) {
    let r = 0;
    for (let i = 0; i < 7; i++) r = (r << 1) | ((x >> i) & 1);
    return r;
  }

  // Precomputed tables of the negacyclic Number Theoretic Transform.
  // ZETAS[j] = ZETA^bitRev7(j) mod Q. GAMMAS[i] = ZETA^(2*bitRev7(i)+1).
  const ZETAS = new Array(128);
  const ZETAS_INV = new Array(128);
  const GAMMAS = new Array(128);
  for (let j = 0; j < 128; j++) {
    const z = modPow(ZETA, bitRev7(j));
    ZETAS[j] = z;
    ZETAS_INV[j] = modPow(z, Q - 2);
  }
  for (let i = 0; i < 128; i++) GAMMAS[i] = modPow(ZETA, 2 * bitRev7(i) + 1);
  const INV_128 = 3303; // 128^(-1) mod Q

  function assertPoly(a, name) {
    if (!a || a.length !== N) throw new TypeError((name || 'poly') + ' must have exactly ' + N + ' coefficients');
    for (let i = 0; i < N; i++) {
      if (!Number.isInteger(a[i])) throw new TypeError((name || 'poly') + '[' + i + '] must be an integer');
    }
    return a;
  }

  // ============================================================
  // Module 1: Number Theoretic Transform (Kyber / ML-KEM ring)
  // Ring is Z_Q[x] / (x^256 + 1). The transform uses 7 Cooley-Tukey
  // stages; the last stage leaves 128 quadratic factors, so products
  // in the NTT domain are completed with baseCaseMultiply.
  // ============================================================
  function ntt(f) {
    assertPoly(f, 'f');
    const a = f.slice();
    for (let s = 0; s < 7; s++) {
      const len = 128 >> s;
      const base = 1 << s;
      const blocks = 128 / len;
      for (let b = 0; b < blocks; b++) {
        const w = ZETAS[base + b];
        const start = b * 2 * len;
        for (let j = start; j < start + len; j++) {
          const t = mod(w * a[j + len]);
          const u = a[j];
          a[j] = mod(u + t);
          a[j + len] = mod(u - t);
        }
      }
    }
    return a;
  }

  function inverseNTT(a) {
    assertPoly(a, 'a');
    const f = a.slice();
    for (let s = 6; s >= 0; s--) {
      const len = 128 >> s;
      const base = 1 << s;
      const blocks = 128 / len;
      for (let b = 0; b < blocks; b++) {
        const w = ZETAS_INV[base + b];
        const start = b * 2 * len;
        for (let j = start; j < start + len; j++) {
          const u = f[j], v = f[j + len];
          f[j] = mod(u + v);
          f[j + len] = mod(w * (u - v));
        }
      }
    }
    for (let i = 0; i < N; i++) f[i] = mod(f[i] * INV_128);
    return f;
  }

  // Complete the product of two NTT-domain polynomials over the 128
  // quadratic factors: (a0 + a1*y)*(b0 + b1*y) mod (y^2 - gamma_i).
  function baseCaseMultiply(A, B) {
    assertPoly(A, 'A');
    assertPoly(B, 'B');
    const C = new Array(N);
    for (let i = 0; i < 128; i++) {
      const a0 = A[2 * i], a1 = A[2 * i + 1];
      const b0 = B[2 * i], b1 = B[2 * i + 1];
      C[2 * i] = mod(mod(a0 * b0) + mod(GAMMAS[i] * mod(a1 * b1)));
      C[2 * i + 1] = mod(mod(a0 * b1) + mod(a1 * b0));
    }
    return C;
  }

  function polyMul(a, b) {
    return inverseNTT(baseCaseMultiply(ntt(a), ntt(b)));
  }

  function schoolbookMul(a, b) {
    assertPoly(a, 'a');
    assertPoly(b, 'b');
    const c = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      if (a[i] === 0) continue;
      for (let j = 0; j < N; j++) {
        if (b[j] === 0) continue;
        const s = i + j;
        if (s < N) c[s] = mod(c[s] + a[i] * b[j]);
        else c[s - N] = mod(c[s - N] - a[i] * b[j]); // x^256 = -1
      }
    }
    return c;
  }

  function polyAdd(a, b) {
    assertPoly(a, 'a'); assertPoly(b, 'b');
    const c = new Array(N);
    for (let i = 0; i < N; i++) c[i] = mod(a[i] + b[i]);
    return c;
  }

  function polySub(a, b) {
    assertPoly(a, 'a'); assertPoly(b, 'b');
    const c = new Array(N);
    for (let i = 0; i < N; i++) c[i] = mod(a[i] - b[i]);
    return c;
  }

  function polyZero() { return new Array(N).fill(0); }

  function polyOne() {
    const p = polyZero();
    p[0] = 1;
    return p;
  }

  // ============================================================
  // Module 2: deterministic pseudo random bytes (test-vector grade)
  // A small SHA-256 implementation keeps the whole library dependency
  // free while giving reproducible hex outputs.
  // ============================================================
  const K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function sha256(bytes) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = bytes.length;
    const withPad = new Uint8Array((((l + 8) >> 6) + 1) * 64);
    withPad.set(bytes);
    withPad[l] = 0x80;
    const bitLen = l * 8;
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    withPad[withPad.length - 8] = (hi >>> 24) & 0xff;
    withPad[withPad.length - 7] = (hi >>> 16) & 0xff;
    withPad[withPad.length - 6] = (hi >>> 8) & 0xff;
    withPad[withPad.length - 5] = hi & 0xff;
    withPad[withPad.length - 4] = (lo >>> 24) & 0xff;
    withPad[withPad.length - 3] = (lo >>> 16) & 0xff;
    withPad[withPad.length - 2] = (lo >>> 8) & 0xff;
    withPad[withPad.length - 1] = lo & 0xff;
    const w = new Array(64);
    for (let off = 0; off < withPad.length; off += 64) {
      for (let i = 0; i < 16; i++) {
        w[i] = ((withPad[off + 4 * i] << 24) | (withPad[off + 4 * i + 1] << 16) |
                (withPad[off + 4 * i + 2] << 8) | withPad[off + 4 * i + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ ((~e >>> 0) & g);
        const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      out[4 * i] = (H[i] >>> 24) & 0xff;
      out[4 * i + 1] = (H[i] >>> 16) & 0xff;
      out[4 * i + 2] = (H[i] >>> 8) & 0xff;
      out[4 * i + 3] = H[i] & 0xff;
    }
    return out;
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return new Uint8Array(out);
  }

  function bytesToHex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
  }

  function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
      throw new TypeError('hex must be an even-length hex string');
    }
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  function hashHex(msg, personalization) {
    const p = personalization ? utf8Bytes(personalization) : new Uint8Array(0);
    const m = typeof msg === 'string' ? utf8Bytes(msg) : msg;
    const buf = new Uint8Array(p.length + m.length);
    buf.set(p, 0);
    buf.set(m, p.length);
    return bytesToHex(sha256(buf));
  }

  // Extendable output function: deterministic byte stream from a seed
  // using counter-mode SHA-256. No external randomness is required.
  function xof(seed, length, label) {
    const s = typeof seed === 'string' ? utf8Bytes(seed) : seed;
    const lbl = label ? utf8Bytes(label) : new Uint8Array(0);
    const out = new Uint8Array(length);
    let produced = 0, counter = 0;
    while (produced < length) {
      const ctr = new Uint8Array(4);
      ctr[0] = (counter >>> 24) & 0xff; ctr[1] = (counter >>> 16) & 0xff;
      ctr[2] = (counter >>> 8) & 0xff; ctr[3] = counter & 0xff;
      const buf = new Uint8Array(lbl.length + s.length + 4);
      buf.set(lbl, 0); buf.set(s, lbl.length); buf.set(ctr, lbl.length + s.length);
      const block = sha256(buf);
      for (let i = 0; i < block.length && produced < length; i++) out[produced++] = block[i];
      counter++;
    }
    return out;
  }

  function randomBytes(length, seed) {
    return xof(seed === undefined ? 'pqc-vault-bench/default' : seed, length, 'rnd');
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }

  // ============================================================
  // Module 3: Module-LWE KEM (ML-KEM educational / toy-to-spec)
  // Supports the FIPS 203 parameter sets ML-KEM-512/768/1024 and a
  // compact "toy" set. The lattice arithmetic is real: polynomials
  // live in the Kyber ring, multiplication uses the NTT, and errors
  // are sampled from a centered binomial distribution. The KEM is a
  // Fujisaki-Okamoto style LWE PKE and is explicitly educational: it
  // is not a validated, constant-time implementation of FIPS 203.
  // ============================================================
  const KEM_PARAMS = Object.freeze({
    'toy-64':  { k: 2, eta1: 2, eta2: 1, du: 8, dv: 4, name: 'Toy ML-KEM (n=64 effective, k=2)' },
    'ML-KEM-512':  { k: 2, eta1: 3, eta2: 2, du: 10, dv: 4, name: 'ML-KEM-512 (FIPS 203, educational)' },
    'ML-KEM-768':  { k: 3, eta1: 2, eta2: 2, du: 10, dv: 4, name: 'ML-KEM-768 (FIPS 203, educational)' },
    'ML-KEM-1024': { k: 4, eta1: 2, eta2: 2, du: 11, dv: 5, name: 'ML-KEM-1024 (FIPS 203, educational)' }
  });
  const KEM_DEFAULT = 'ML-KEM-768';

  function cbdSample(bytes, eta) {
    // Centered binomial distribution Psi_eta using 2*eta bits per coeff.
    const cnt = 2 * eta * N;
    if (bytes.length * 8 < cnt) throw new RangeError('not enough bytes for CBD sampling');
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      let a = 0, b = 0;
      for (let j = 0; j < eta; j++) {
        const idx = i * 2 * eta + j;
        a += (bytes[idx >> 3] >> (idx & 7)) & 1;
        const idx2 = idx + eta;
        b += (bytes[idx2 >> 3] >> (idx2 & 7)) & 1;
      }
      out[i] = mod(a - b);
    }
    return out;
  }

  function samplePoly(seed, label, eta) {
    return cbdSample(xof(seed, Math.ceil(2 * eta * N / 8), label), eta);
  }

  function matrixFromSeed(seed, k) {
    // Deterministic public matrix A from a seed. Each entry is a uniform
    // polynomial generated by rejection sampling on 12-bit candidates.
    // The seed is canonical: key generation uses A[i][j] and encapsulation
    // uses the transpose A[j][i] of this exact same matrix.
    const A = [];
    for (let i = 0; i < k; i++) {
      A[i] = [];
      for (let j = 0; j < k; j++) {
        const bytes = xof(seed, 4 * N, 'A:' + i + ':' + j);
        const p = new Array(N);
        let bi = 0, filled = 0;
        while (filled < N && bi + 2 <= bytes.length) {
          const v = (bytes[bi] | (bytes[bi + 1] << 8)) & 0x0fff;
          bi += 2;
          if (v < Q) p[filled++] = v;
        }
        if (filled < N) throw new Error('matrix XOF stream exhausted');
        A[i][j] = p;
      }
    }
    return A;
  }

  function compress(x, d) {
    if (d >= 12) return mod(x);
    const t = Math.pow(2, d);
    return mod(Math.round((x * t) / Q)) % t;
  }

  function decompress(x, d) {
    if (d >= 12) return mod(x);
    const t = Math.pow(2, d);
    return mod(Math.round((x * Q) / t));
  }

  function compressPoly(p, d) {
    return p.map(x => compress(x, d));
  }

  function decompressPoly(p, d) {
    return p.map(x => decompress(x, d));
  }

  function encodePoly(p, d) {
    // d bits per coefficient, LSB-first bit packing.
    const bits = N * d;
    const out = new Uint8Array(Math.ceil(bits / 8));
    for (let i = 0; i < N; i++) {
      let v = mod(p[i]) % Math.pow(2, d);
      for (let b = 0; b < d; b++) {
        const bit = (v >> b) & 1;
        const pos = i * d + b;
        out[pos >> 3] |= bit << (pos & 7);
      }
    }
    return out;
  }

  function decodePoly(bytes, d) {
    if (!bytes || bytes.length * 8 < N * d) {
      throw new RangeError('decodePoly needs at least ' + Math.ceil(N * d / 8) + ' bytes for d=' + d);
    }
    const p = new Array(N);
    const mask = Math.pow(2, d) - 1;
    for (let i = 0; i < N; i++) {
      let v = 0;
      for (let b = 0; b < d; b++) {
        const pos = i * d + b;
        v |= ((bytes[pos >> 3] >> (pos & 7)) & 1) << b;
      }
      p[i] = v & mask;
    }
    return p;
  }

  function polyToBytes12(p) { return encodePoly(p, 12); }
  function bytesToPoly12(bytes) { return decodePoly(bytes, 12); }

  function shakeKey(sharedSecret, ciphertext, label) {
    // Key derivation from the shared secret and ciphertext (KDF-lite).
    const s = typeof sharedSecret === 'string' ? utf8Bytes(sharedSecret) : sharedSecret;
    const c = ciphertext instanceof Uint8Array ? ciphertext : utf8Bytes(String(ciphertext));
    const lbl = utf8Bytes(label || 'MLKEM-KDF');
    const buf = new Uint8Array(s.length + c.length + lbl.length);
    buf.set(s, 0); buf.set(c, s.length); buf.set(lbl, s.length + c.length);
    return sha256(buf);
  }

  function ciphertextToBytes(ct, params) {
    const uBytes = [];
    for (let i = 0; i < params.k; i++) uBytes.push(encodePoly(ct.u[i], params.du));
    const vBytes = encodePoly(ct.v, params.dv);
    let total = vBytes.length;
    for (const u of uBytes) total += u.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const u of uBytes) { out.set(u, off); off += u.length; }
    out.set(vBytes, off);
    return out;
  }

  function MLKEM(options) {
    const opts = options || {};
    const paramName = opts.param || KEM_DEFAULT;
    // An own-property check is required: KEM_PARAMS['__proto__'] and
    // KEM_PARAMS['constructor'] resolve through Object.prototype, not to
    // undefined, so a plain lookup smuggles hostile names through.
    const params = Object.prototype.hasOwnProperty.call(KEM_PARAMS, paramName)
      ? KEM_PARAMS[paramName] : null;
    if (!params) throw new RangeError('unknown ML-KEM parameter set: ' + paramName);
    const k = params.k;

    // A deterministic noise stream tied to the message hash gives the
    // Fujisaki-Okamoto transform the property that decapsulation can
    // re-encrypt the recovered message and reproduce the ciphertext.
    function encapsInternal(ekBytes, mBytes) {
      const rho = ekBytes.slice(0, 32);
      const tHat = [];
      let off = 32;
      for (let i = 0; i < k; i++) { tHat.push(bytesToPoly12(ekBytes.slice(off, off + 384))); off += 384; }
      const mBits = decodePoly(mBytes, 1);
      const mPoly = mBits.map(b => b * Math.ceil(Q / 2)); // 0 or ~q/2
      const A = matrixFromSeed(bytesToHex(rho), k);
      const AHat = A.map(row => row.map(p => ntt(p)));
      const noise = bytesToHex(mBytes);
      const r = [], e1 = [];
      for (let i = 0; i < k; i++) {
        r.push(samplePoly(noise, 'r:' + i, params.eta1));
        e1.push(samplePoly(noise, 'e1:' + i, params.eta2));
      }
      const e2 = samplePoly(noise, 'e2:0', params.eta2);
      const rHat = r.map(p => ntt(p));
      // u = A^T o r + e1. Keygen uses A[i][j] for row i, so the
      // encapsulation transpose is A[j][i].
      const u = [];
      for (let i = 0; i < k; i++) {
        let acc = new Array(N).fill(0);
        for (let j = 0; j < k; j++) {
          const prod = baseCaseMultiply(AHat[j][i], rHat[j]);
          for (let d = 0; d < N; d++) acc[d] = mod(acc[d] + prod[d]);
        }
        const uPoly = inverseNTT(acc);
        for (let d = 0; d < N; d++) uPoly[d] = mod(uPoly[d] + e1[i][d]);
        u.push(uPoly);
      }
      // v = t^T o r + e2 + encode(m), where t was computed as A o s + e.
      let vAcc = new Array(N).fill(0);
      for (let j = 0; j < k; j++) {
        const prod = baseCaseMultiply(tHat[j], rHat[j]);
        for (let d = 0; d < N; d++) vAcc[d] = mod(vAcc[d] + prod[d]);
      }
      const vPoly = inverseNTT(vAcc);
      for (let d = 0; d < N; d++) vPoly[d] = mod(vPoly[d] + e2[d] + mPoly[d]);
      // u is a vector of k polynomials; compress each polynomial, not the vector.
      const ct = { u: u.map(poly => compressPoly(poly, params.du)), v: compressPoly(vPoly, params.dv) };
      return { ciphertext: ciphertextToBytes(ct, params), r, e1, e2 };
    }

    function deriveFromSeed(seedStr) {
      const seed = typeof seedStr === 'string' ? utf8Bytes(seedStr) : (seedStr || utf8Bytes('mlkem-default-seed'));
      const rho = xof(seed, 32, 'rho');
      const sigma = xof(seed, 32, 'sigma');
      const z = xof(seed, 32, 'z');
      const sigmaHex = bytesToHex(sigma);
      const A = matrixFromSeed(bytesToHex(rho), k);
      const AHat = A.map(row => row.map(p => ntt(p)));
      const s = [], e = [];
      for (let i = 0; i < k; i++) {
        s.push(samplePoly(sigmaHex, 's:' + i, params.eta1));
        e.push(samplePoly(sigmaHex, 'e:' + i, params.eta1));
      }
      const sHat = s.map(p => ntt(p));
      const eHat = e.map(p => ntt(p));
      // t = A o s + e, expressed in the NTT domain.
      const tHat = [];
      for (let i = 0; i < k; i++) {
        let acc = new Array(N).fill(0);
        for (let j = 0; j < k; j++) {
          const prod = baseCaseMultiply(AHat[i][j], sHat[j]);
          for (let d = 0; d < N; d++) acc[d] = mod(acc[d] + prod[d]);
        }
        for (let d = 0; d < N; d++) acc[d] = mod(acc[d] + eHat[i][d]);
        tHat.push(acc);
      }
      const ek = new Uint8Array(32 + k * 384);
      ek.set(rho, 0);
      let off = 32;
      for (let i = 0; i < k; i++) { ek.set(polyToBytes12(tHat[i]), off); off += 384; }
      const ekHash = sha256(ek);
      return {
        param: paramName, params, A, AHat, ek, s, e, tHat, rho,
        dk: { sHat, ek, ekHash, z },
        sigma: sigmaHex,
        errors: e
      };
    }

    function encapsulate(ekBytes, seedStr) {
      const m = xof(seedStr === undefined ? 'encaps-default-seed' : seedStr, 32, 'm');
      const result = encapsInternal(ekBytes, m);
      const K = shakeKey(m, result.ciphertext, 'MLKEM-SSK');
      return {
        ciphertext: result.ciphertext, sharedSecret: K, m,
        r: result.r, e1: result.e1, e2: result.e2
      };
    }

    function decapsulate(ctBytes, dk) {
      const du = params.du, dv = params.dv;
      const uLen = Math.ceil(N * du / 8), vLen = Math.ceil(N * dv / 8);
      const expected = k * uLen + vLen;
      // Malformed input (wrong type or wrong length) takes the FO implicit
      // rejection path directly instead of being decoded with zero padding.
      if (!(ctBytes instanceof Uint8Array) || ctBytes.length !== expected) {
        const bad = ctBytes instanceof Uint8Array ? ctBytes : new Uint8Array(0);
        return shakeKey(dk.z, bad, 'MLKEM-REJECT');
      }
      let off = 0;
      const uCompressed = [];
      for (let i = 0; i < k; i++) { uCompressed.push(decodePoly(ctBytes.slice(off, off + uLen), du)); off += uLen; }
      const vCompressed = decodePoly(ctBytes.slice(off, off + vLen), dv);
      const u = uCompressed.map(p => decompressPoly(p, du));
      const v = decompressPoly(vCompressed, dv);
      const uHat = u.map(p => ntt(p));
      let acc = new Array(N).fill(0);
      for (let i = 0; i < k; i++) {
        const prod = baseCaseMultiply(dk.sHat[i], uHat[i]);
        for (let d = 0; d < N; d++) acc[d] = mod(acc[d] + prod[d]);
      }
      const noisy = inverseNTT(acc);
      // Recover the message bit by rounding the centered difference to
      // the nearer of 0 and q/2 (the FIPS 203 Compress/Decode rule).
      const mPrime = new Array(N);
      for (let d = 0; d < N; d++) {
        const t = mod(v[d] - noisy[d]);
        mPrime[d] = Math.round((2 * t) / Q) % 2;
      }
      const mBytes = encodePoly(mPrime, 1);
      // FO implicit rejection: only accept a ciphertext we can reproduce.
      const re = encapsInternal(dk.ek, mBytes);
      if (bytesEqual(re.ciphertext, ctBytes)) return shakeKey(mBytes, ctBytes, 'MLKEM-SSK');
      return shakeKey(dk.z, ctBytes, 'MLKEM-REJECT');
    }

    function errorHistogram(seedStr, eta) {
      const e = samplePoly(seedStr || 'histogram-seed', 'hist', eta || params.eta1);
      const centered = e.map(x => x > Q / 2 ? x - Q : x);
      const counts = {};
      for (const v of centered) counts[v] = (counts[v] || 0) + 1;
      const bins = Object.keys(counts).map(Number).sort((a, b) => a - b).map(value => ({ value, count: counts[value] }));
      let mean = 0;
      for (const v of centered) mean += v;
      mean /= N;
      let variance = 0;
      for (const v of centered) variance += (v - mean) * (v - mean);
      variance /= N;
      return { bins, mean, variance, stdDev: Math.sqrt(variance), min: Math.min.apply(null, centered), max: Math.max.apply(null, centered), eta: eta || params.eta1 };
    }

    return { param: paramName, params, k, deriveFromSeed, encapsulate, decapsulate, errorHistogram };
  }

  // ============================================================
  // Module 4: WOTS+ and XMSS (stateful hash-based signatures)
  // A compact, fully deterministic Winternitz one-time signature
  // scheme plus a Merkle tree of WOTS+ public keys. All hashes use
  // the internal SHA-256, so the code stays dependency free.
  // ============================================================
  const WOTS_W = 16;          // Winternitz parameter (4 bits per chain step)
  const WOTS_L1 = 64;         // 32 bytes * 2 nibbles
  const WOTS_L2 = 3;          // checksum digits base 16
  const WOTS_LEN = WOTS_L1 + WOTS_L2;

  function H(msg) { return sha256(typeof msg === 'string' ? utf8Bytes(msg) : msg); }
  function hashPair(a, b) {
    const buf = new Uint8Array(64);
    buf.set(a, 0); buf.set(b, 32);
    return sha256(buf);
  }

  // A WOTS+ hash chain is a plain iterated, address-separated hash. The
  // secret seed is used only to derive the starting values, so a verifier
  // can recompute the public end of the chain from a signature element.
  function wotsChain(x, start, steps, address) {
    let cur = x.slice();
    const addr = address || new Uint8Array([0, 0]);
    for (let i = start; i < start + steps; i++) {
      const buf = new Uint8Array(32 + 4);
      buf.set(cur, 0);
      buf[32] = (addr[0] + i) & 0xff;
      buf[33] = addr[1] & 0xff;
      buf[34] = (addr[0] ^ i) & 0xff;
      buf[35] = 0x57; // WOTS chain domain tag
      cur = sha256(buf);
    }
    return cur;
  }

  function messageToBaseW(msgBytes, w) {
    const digits = [];
    const logW = Math.round(Math.log2(w));
    if (w === 16) {
      for (const b of msgBytes) { digits.push(b >> 4, b & 0x0f); }
    } else {
      for (const b of msgBytes) for (let shift = 8 - logW; shift >= 0; shift -= logW) digits.push((b >> shift) & (w - 1));
    }
    return digits;
  }

  function wotsChecksum(digits, w) {
    let sum = 0;
    for (const d of digits) sum += (w - 1) - d;
    const out = [];
    if (w === 16) {
      out.push((sum >> 8) & 0x0f, (sum >> 4) & 0x0f, sum & 0x0f);
    } else {
      const logW = Math.round(Math.log2(w));
      let s = sum;
      const maxDigits = Math.ceil(16 / logW);
      for (let i = 0; i < maxDigits; i++) { out.unshift(s & (w - 1)); s >>= logW; }
    }
    return out;
  }

  function wotsGenerate(seed) {
    const s = typeof seed === 'string' ? utf8Bytes(seed) : seed;
    const sk = [];
    const pk = [];
    for (let i = 0; i < WOTS_LEN; i++) {
      sk.push(xof(s, 32, 'wots-sk:' + i));
      pk.push(wotsChain(sk[i], 0, WOTS_W - 1, new Uint8Array([i, 0])));
    }
    const buf = new Uint8Array(WOTS_LEN * 32);
    pk.forEach((p, i) => buf.set(p, i * 32));
    return { sk, pk, seed: s, pkHash: bytesToHex(sha256(buf)) };
  }

  function wotsPublicKeyHex(keyPair) {
    return keyPair.pkHash;
  }

  function wotsSign(message, keyPair) {
    const m = typeof message === 'string' ? utf8Bytes(message) : message;
    const digest = sha256(m);
    const digits = messageToBaseW(digest, WOTS_W);
    const chain = digits.concat(wotsChecksum(digits, WOTS_W));
    const sig = new Array(WOTS_LEN);
    for (let i = 0; i < WOTS_LEN; i++) sig[i] = wotsChain(keyPair.sk[i], 0, chain[i], new Uint8Array([i, 0]));
    return { signature: sig, digest: bytesToHex(digest), chain };
  }

  function wotsVerify(message, signature, publicKeyHash) {
    try {
      if (!Array.isArray(signature) || signature.length !== WOTS_LEN) return false;
      if (typeof publicKeyHash !== 'string' || publicKeyHash.length !== 64) return false;
      const m = typeof message === 'string' ? utf8Bytes(message) : message;
      const digest = sha256(m);
      const digits = messageToBaseW(digest, WOTS_W);
      const chain = digits.concat(wotsChecksum(digits, WOTS_W));
      const pk = new Array(WOTS_LEN);
      for (let i = 0; i < WOTS_LEN; i++) {
        const el = signature[i];
        if (!(el instanceof Uint8Array) || el.length !== 32) return false;
        pk[i] = wotsChain(el, chain[i], WOTS_W - 1 - chain[i], new Uint8Array([i, 0]));
      }
      const buf = new Uint8Array(WOTS_LEN * 32);
      pk.forEach((p, i) => buf.set(p, i * 32));
      return bytesToHex(sha256(buf)) === publicKeyHash;
    } catch (err) {
      return false;
    }
  }

  function merkleRoot(leaves, height) {
    let level = leaves.slice();
    const levels = [level.slice()];
    const h = height === undefined ? Math.ceil(Math.log2(Math.max(1, level.length))) : height;
    for (let d = 0; d < h; d++) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const a = level[i];
        const b = i + 1 < level.length ? level[i + 1] : a;
        next.push(hashPair(a, b));
      }
      level = next;
      levels.push(level.slice());
    }
    return { root: level[0], levels, height: h };
  }

  function merkleProof(levels, index) {
    const proof = [];
    let idx = index;
    for (let d = 0; d < levels.length - 1; d++) {
      const sibling = idx ^ 1;
      proof.push(bytesToHex(levels[d][sibling] !== undefined ? levels[d][sibling] : levels[d][idx]));
      idx >>= 1;
    }
    return proof;
  }

  function verifyMerkleProof(leafHex, proof, rootHex, index, height) {
    try {
      if (!Array.isArray(proof) || !Number.isInteger(index) || index < 0) return false;
      const h = height === undefined ? proof.length : height;
      if (!Number.isInteger(h) || h < 0 || proof.length !== h) return false;
      if (typeof leafHex !== 'string' || leafHex.length !== 64) return false;
      if (typeof rootHex !== 'string' || rootHex.length !== 64) return false;
      let cur = hexToBytes(leafHex);
      if (cur.length !== 32) return false;
      let idx = index;
      for (let d = 0; d < h; d++) {
        const sib = hexToBytes(proof[d]);
        if (sib.length !== 32) return false;
        cur = (idx & 1) ? hashPair(sib, cur) : hashPair(cur, sib);
        idx >>= 1;
      }
      return bytesToHex(cur) === rootHex;
    } catch (err) {
      return false;
    }
  }

  function XMSS(options) {
    const opts = options || {};
    const treeHeight = opts.height === undefined ? 3 : opts.height; // 2^height one-time keys
    // The height bounds every leaf generated below: a fractional or huge
    // height either silently builds a wrong-shaped tree or hangs the tab
    // generating 2^height leaves, so fail fast on anything outside [1, 20].
    if (!Number.isInteger(treeHeight) || treeHeight < 1 || treeHeight > 20) {
      throw new RangeError('XMSS height must be an integer in [1, 20]: ' + treeHeight);
    }
    const leafCount = 1 << treeHeight;
    const seedStr = opts.seed || 'xmss-default-seed';
    const leaves = [];
    const keyPairs = [];
    for (let i = 0; i < leafCount; i++) {
      const kp = wotsGenerate(seedStr + ':leaf:' + i);
      keyPairs.push(kp);
      leaves.push(hexToBytes(wotsPublicKeyHex(kp)));
    }
    const tree = merkleRoot(leaves, treeHeight);
    const rootHex = bytesToHex(tree.root);
    let index = 0;
    const spent = new Set();

    function sign(message) {
      if (index >= leafCount) throw new RangeError('XMSS key exhausted: all ' + leafCount + ' one-time keys used');
      const useIndex = opts.stateless ? Math.floor(Math.random() * leafCount) : index;
      const sig = wotsSign(message, keyPairs[useIndex]);
      const proof = merkleProof(tree.levels, useIndex);
      const signature = {
        index: useIndex,
        wots: sig.signature.map(bytesToHex),
        digest: sig.digest,
        leaf: bytesToHex(leaves[useIndex]),
        proof,
        root: rootHex,
        message: typeof message === 'string' ? message : bytesToHex(message)
      };
      spent.add(useIndex);
      if (!opts.stateless) index++;
      return signature;
    }

    function verify(signature, message) {
      try {
        if (!signature || typeof signature !== 'object') return false;
        if (!Number.isInteger(signature.index) || signature.index < 0 || signature.index >= leafCount) return false;
        const msg = message === undefined ? signature.message : message;
        const pkHash = signature.leaf;
        if (!wotsVerify(msg, signature.wots.map(hexToBytes), pkHash)) return false;
        if (!verifyMerkleProof(signature.leaf, signature.proof, rootHex, signature.index, treeHeight)) return false;
        return true;
      } catch (err) {
        return false;
      }
    }

    return {
      height: treeHeight, leafCount, root: rootHex, levels: tree.levels,
      sign, verify,
      get index() { return index; },
      get remaining() { return leafCount - index; },
      get spent() { return Array.from(spent); }
    };
  }

  // ============================================================
  // Module 5: Grover / Shor security analyzer
  // A classical-vs-quantum bit-security estimator for the primitives
  // most relevant to UTXO quantum migration.
  // ============================================================
  const PRIMITIVES = Object.freeze({
    'secp256k1 ECDSA': { family: 'elliptic curve', pkBits: 256, signatureBits: 512, classical: 128, quantum: 0, quantumAttack: 'Shor', note: 'Discrete logarithm on a 256-bit curve; Shor solves it in polynomial time.' },
    'RSA-2048':       { family: 'factoring', pkBits: 2048, signatureBits: 2048, classical: 112, quantum: 0, quantumAttack: 'Shor', note: 'Integer factorization; Shor solves it in polynomial time.' },
    'SHA-256 (preimage)': { family: 'hash', pkBits: 256, signatureBits: 256, classical: 256, quantum: 128, quantumAttack: 'Grover', note: 'Grover halves preimage security.' },
    'ML-KEM-768':     { family: 'module lattice', pkBits: 1184 * 8, signatureBits: 1088 * 8, classical: 164, quantum: 149, quantumAttack: 'lattice reduction', note: 'Module-LWE; no known efficient quantum attack beyond Grover speedups.' },
    'ML-DSA-65':      { family: 'module lattice', pkBits: 1952 * 8, signatureBits: 3309 * 8, classical: 192, quantum: 171, quantumAttack: 'lattice reduction', note: 'Dilithium family; NIST PQC signature standard.' },
    'SLH-DSA-128s':   { family: 'hash based', pkBits: 32 * 8, signatureBits: 7856 * 8, classical: 128, quantum: 128, quantumAttack: 'Grover', note: 'SPHINCS+ stateless hash-based signature; conservative security.' }
  });

  function groverIterations(searchSpaceBits) {
    return Math.pow(2, searchSpaceBits / 2);
  }

  function shorQubits(modulusBits) {
    // Logical qubits needed for Shor on an n-bit modulus (roughly 2n + O(n)).
    return 2 * modulusBits + 3 * Math.ceil(Math.log2(modulusBits + 1));
  }

  function shorGates(modulusBits) {
    return Math.pow(modulusBits, 3) * 100;
  }

  function groverSecurity(hashBits, oracleGates, speedHz) {
    const iterations = groverIterations(hashBits);
    const gates = iterations * (oracleGates || 1000);
    const seconds = gates / (speedHz || 1e6);
    return { iterations, gates, seconds, years: seconds / 31557600 };
  }

  function analyzePrimitive(name) {
    // Same own-property guard as MLKEM: PRIMITIVES['__proto__'] resolves
    // through the prototype chain and would silently pass this check.
    const p = Object.prototype.hasOwnProperty.call(PRIMITIVES, name)
      ? PRIMITIVES[name] : null;
    if (!p) throw new RangeError('unknown primitive: ' + name);
    return Object.assign({}, p, { name, quantumSafe: p.quantum >= 128 });
  }

  function securityReport() {
    return Object.keys(PRIMITIVES).map(name => analyzePrimitive(name));
  }

  function hybridSecurity(a, b) {
    // A hybrid scheme is at least as strong as its strongest component.
    const pa = Object.prototype.hasOwnProperty.call(PRIMITIVES, a) ? PRIMITIVES[a] : null;
    const pb = Object.prototype.hasOwnProperty.call(PRIMITIVES, b) ? PRIMITIVES[b] : null;
    if (!pa || !pb) throw new RangeError('unknown primitive in hybrid pair');
    return {
      components: [a, b],
      classical: Math.max(pa.classical, pb.classical),
      quantum: Math.max(pa.quantum, pb.quantum),
      quantumAttack: pa.quantum === 0 || pb.quantum === 0 ? 'Shor breaks the classical half' : 'best known quantum attack on either component',
      recommendation: 'Use hybrid signatures during UTXO migration so the classical half is not a single point of failure.'
    };
  }

  function migrationRisk(utxo) {
    // Score the exposure of a UTXO whose public key is already on chain.
    const exposed = !!utxo.publicKeyRevealed;
    const p2pkh = !!utxo.p2pkh;
    // Echo only finite, non-negative magnitudes back to callers. `|| 0`
    // alone let Infinity and negative values through into the returned
    // valueBtc/ageBlocks fields (and from there into attestation JSON), even
    // though the score itself stayed bounded.
    const valueRaw = Number(utxo.valueBtc);
    const ageRaw = Number(utxo.ageBlocks);
    const value = Number.isFinite(valueRaw) && valueRaw > 0 ? valueRaw : 0;
    const ageBlocks = Number.isFinite(ageRaw) && ageRaw > 0 ? ageRaw : 0;
    let score = 0;
    if (exposed) score += 60;
    // P2PKH hides the public key behind a hash until the first spend, so its
    // exposure is latent: it only matters while the key is not yet revealed.
    if (p2pkh && !exposed) score += 20;
    if (value >= 10) score += 15; else if (value >= 1) score += 8;
    if (ageBlocks > 100000) score += 5;
    score = Math.min(100, score);
    const tier = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
    return {
      score, tier,
      exposed,
      valueBtc: value,
      ageBlocks,
      advice: exposed
        ? 'Public key is visible on chain; a sufficiently large quantum computer running Shor can derive the private key. Migrate to a PQC or hybrid output.'
        : 'Public key is still hashed; exposure begins when the UTXO is spent. Migrate before broadcasting a spend.'
    };
  }

  // ============================================================
  // Module 6: deterministic hex test-vector exporter
  // ============================================================
  function exportTestVectors(seed) {
    const s = seed || 'pqc-vault-bench-vector-v1';
    const kem = MLKEM({ param: KEM_DEFAULT });
    const keys = kem.deriveFromSeed(s);
    const enc = kem.encapsulate(keys.ek, s + ':encaps');
    const dec = kem.decapsulate(enc.ciphertext, keys.dk);
    const xmss = XMSS({ height: 2, seed: s + ':xmss' });
    const sig = xmss.sign('BCH UTXO quantum migration');
    const poly = Array.from({ length: N }, (_, i) => (i * 37 + 11) % Q);
    const polyB = Array.from({ length: N }, (_, i) => (i * 13 + 5) % Q);
    const nttHead = ntt(poly).slice(0, 8);
    return {
      schema: 'pqc-vault-bench/v1',
      seed: s,
      params: { q: Q, n: N, zeta: ZETA, kem: KEM_DEFAULT, wotsW: WOTS_W, wotsLen: WOTS_LEN },
      ntt: {
        inputHead: poly.slice(0, 8),
        forwardHead: nttHead,
        inverseMatches: inverseNTT(ntt(poly)).every((v, i) => v === poly[i]),
        convolutionMatches: polyMul(poly, polyB).every((v, i) => v === schoolbookMul(poly, polyB)[i]),
        zetaHead: ZETAS.slice(0, 8),
        gammaHead: GAMMAS.slice(0, 8)
      },
      kem: {
        encapsulationKey: bytesToHex(keys.ek).slice(0, 64) + '...',
        encapsulationKeyLength: keys.ek.length,
        ciphertext: bytesToHex(enc.ciphertext).slice(0, 64) + '...',
        ciphertextLength: enc.ciphertext.length,
        sharedSecret: bytesToHex(enc.sharedSecret),
        decapsulationMatches: bytesEqual(enc.sharedSecret, dec)
      },
      wots: {
        len: WOTS_LEN,
        publicKeyHash: wotsPublicKeyHex(wotsGenerate(s + ':wots')),
        sampleSignatureHead: wotsSign('vector', wotsGenerate(s + ':wots')).signature[0].slice(0, 8)
      },
      xmss: {
        root: xmss.root,
        height: xmss.height,
        leafCount: xmss.leafCount,
        firstSignatureIndex: sig.index,
        firstSignatureValid: xmss.verify(sig)
      },
      hashes: {
        sha256Empty: bytesToHex(sha256(new Uint8Array(0))),
        sha256Abc: bytesToHex(sha256(utf8Bytes('abc'))),
        hashHexSample: hashHex('migration', 'PQC')
      },
      security: securityReport().map(p => ({ name: p.name, classical: p.classical, quantum: p.quantum }))
    };
  }

  // ============================================================
  // Public API
  // ============================================================
  const api = {
    Q, N, ZETA, ZETAS, ZETAS_INV, GAMMAS, INV_128,
    mod, modPow, bitRev7, assertPoly,
    ntt, inverseNTT, baseCaseMultiply, polyMul, schoolbookMul,
    polyAdd, polySub, polyZero, polyOne,
    sha256, utf8Bytes, bytesToHex, hexToBytes, hashHex, xof, randomBytes, bytesEqual,
    KEM_PARAMS, KEM_DEFAULT, cbdSample, samplePoly, matrixFromSeed,
    compress, decompress, compressPoly, decompressPoly,
    encodePoly, decodePoly, polyToBytes12, bytesToPoly12, shakeKey,
    MLKEM,
    WOTS_W, WOTS_L1, WOTS_L2, WOTS_LEN,
    H, hashPair, wotsChain, messageToBaseW, wotsChecksum,
    wotsGenerate, wotsPublicKeyHex, wotsSign, wotsVerify,
    merkleRoot, merkleProof, verifyMerkleProof, XMSS,
    PRIMITIVES, groverIterations, shorQubits, shorGates, groverSecurity,
    analyzePrimitive, securityReport, hybridSecurity, migrationRisk,
    exportTestVectors
  };
  return api;
}));
