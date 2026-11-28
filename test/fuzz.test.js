"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");
const crypto = require("node:crypto");
const pqc = require("../src/pqc.js");
const lab = require("../src/migration-lab.js");

const byteArray = fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 256 });

test("fast-check SHA-256 matches the Node platform digest", () => {
  fc.assert(fc.property(byteArray, (bytes) => {
    const input = Uint8Array.from(bytes);
    assert.equal(pqc.bytesToHex(pqc.sha256(input)), crypto.createHash("sha256").update(input).digest("hex"));
  }), { seed: 220505, numRuns: 120 });
});

test("fast-check hex encoding round-trips arbitrary bytes", () => {
  fc.assert(fc.property(byteArray, (bytes) => {
    const input = Uint8Array.from(bytes);
    assert.deepEqual(pqc.hexToBytes(pqc.bytesToHex(input)), input);
  }), { seed: 871226, numRuns: 120 });
});

test("fast-check NTT inversion and multiplication match the negacyclic ring", () => {
  const coefficient = fc.integer({ min: 0, max: pqc.Q - 1 });
  const polynomial = fc.array(coefficient, { minLength: pqc.N, maxLength: pqc.N });
  fc.assert(fc.property(polynomial, polynomial, (a, b) => {
    assert.deepEqual(pqc.inverseNTT(pqc.ntt(a)), a);
    const product = pqc.polyMul(a, b);
    assert.deepEqual(product, pqc.schoolbookMul(a, b));
    assert.ok(product.every((value) => Number.isInteger(value) && value >= 0 && value < pqc.Q));
  }), { seed: 3329, numRuns: 10 });
});

test("fast-check migration risk stays bounded and exposure never lowers risk", () => {
  const magnitude = fc.oneof(
    fc.integer({ min: 0, max: 1000 }),
    fc.constant(-1),
    fc.constant(Number.NaN),
    fc.constant(Number.POSITIVE_INFINITY)
  );
  fc.assert(fc.property(
    magnitude,
    fc.integer({ min: -10, max: 200000 }),
    fc.boolean(),
    (valueBtc, ageBlocks, p2pkh) => {
      const hidden = pqc.migrationRisk({ publicKeyRevealed: false, p2pkh, valueBtc, ageBlocks });
      const exposed = pqc.migrationRisk({ publicKeyRevealed: true, p2pkh, valueBtc, ageBlocks });
      for (const risk of [hidden, exposed]) {
        assert.ok(risk.score >= 0 && risk.score <= 100);
        const expectedTier = risk.score >= 75 ? "critical" : risk.score >= 50 ? "high" : risk.score >= 25 ? "medium" : "low";
        assert.equal(risk.tier, expectedTier);
        assert.ok(Number.isFinite(risk.valueBtc) && risk.valueBtc >= 0);
        assert.ok(Number.isFinite(risk.ageBlocks) && risk.ageBlocks >= 0);
      }
      assert.ok(exposed.score >= hidden.score);
    }
  ), { seed: 0xE21D, numRuns: 120 });
});

test("fast-check bookmark state round-trips valid controls exactly", () => {
  const seedUnit = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_");
  const controls = fc.record({
    "lab-profile": fc.constantFrom(...lab.profileList()),
    "lab-utxos": fc.integer({ min: 1, max: 100000 }),
    "lab-settlements": fc.integer({ min: 1, max: 1000000 }),
    "lab-seed": fc.string({ unit: seedUnit, minLength: 0, maxLength: 20 }),
    "lab-shortcuts": fc.boolean()
  });
  fc.assert(fc.property(controls, (value) => {
    const encoded = lab.encodeState({ controls: value });
    const decoded = lab.decodeState(encoded);
    assert.equal(encoded.startsWith(lab.HASH_PREFIX), true);
    assert.equal(decoded.ok, true, decoded.errors.join("; "));
    assert.deepEqual(Object.keys(decoded.state.controls).sort(), Object.keys(value).sort());
    for (const key of Object.keys(value)) assert.equal(decoded.state.controls[key], value[key]);
  }), { seed: 0xB00C, numRuns: 100 });
});
