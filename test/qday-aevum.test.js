'use strict';

/*
 * Unit tests for src/qday-aevum.js (QDay / Aevum Testnet chainId 44005 & tUSD8).
 * Uses only clearly test-only deterministic addresses and mocked RPC/EIP-1193 providers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Q = require('../src/qday-aevum.js');

const ROOT = path.resolve(__dirname, '..');
const TEST_PAYER = '0x0000000000000000000000000000000000000101';
const TEST_MERCHANT = '0x0000000000000000000000000000000000000202';

// Real ABI responses captured from live QDay Aevum RPC (chain 44005).
const LIVE_SYMBOL_HEX =
  '0x0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000005' +
  '7455534438000000000000000000000000000000000000000000000000000000';
const LIVE_DECIMALS_HEX =
  '0x0000000000000000000000000000000000000000000000000000000000000006';
const LIVE_TOTAL_SUPPLY_HEX =
  '0x000000000000000000000000000000000000000000000000000002ef7007d200';

// =========================================================================
// Section 1: Network & contract configuration
// =========================================================================

test('Q1: official QDay Aevum testnet network constants match specification', () => {
  assert.equal(Q.NETWORK.chainId, 44005);
  assert.equal(Q.NETWORK.chainIdHex, '0xabe5');
  assert.equal(Number(BigInt(Q.NETWORK.chainIdHex)), Q.NETWORK.chainId);
  assert.equal(Q.NETWORK.rpcUrl, 'https://rpc-test.qday.info');
  assert.equal(Q.NETWORK.explorerUrl, 'https://explorer-test.qday.info');
  assert.equal(Q.NETWORK.faucetUrl, 'https://faucet.qday.info/en');
  assert.equal(Q.NETWORK.nativeCurrency.symbol, 'tQDAY');
  assert.equal(Q.NETWORK.nativeCurrency.decimals, 18);
});

test('Q2: official tUSD8 and faucet contract constants match QDay official links', () => {
  assert.equal(Q.CONTRACTS.tUSD8.address, '0x456569838f1d43009A91ebA4263147Afd7233483');
  assert.equal(Q.CONTRACTS.tUSD8.symbol, 'tUSD8');
  assert.equal(Q.CONTRACTS.tUSD8.decimals, 6);
  assert.equal(Q.CONTRACTS.faucet.address, '0xE5074CBbd046AFb491EB8692abD6cF7ECCC6dEE5');
});

test('Q3: explorer URL builders validate inputs and format links cleanly', () => {
  assert.equal(
    Q.explorerAddressUrl(Q.CONTRACTS.tUSD8.address),
    'https://explorer-test.qday.info/address/0x456569838f1d43009a91eba4263147afd7233483'
  );
  assert.equal(
    Q.explorerTokenUrl(),
    'https://explorer-test.qday.info/token/0x456569838f1d43009a91eba4263147afd7233483'
  );
  const tx = '0x' + 'ab'.repeat(32);
  assert.equal(Q.explorerTxUrl(tx), 'https://explorer-test.qday.info/tx/' + tx);
  assert.throws(() => Q.explorerTxUrl('0x1234'), TypeError);
});

// =========================================================================
// Section 2: Address, token unit, and ERC-20 ABI encoding/decoding
// =========================================================================

test('Q4: address validation and normalization reject malformed addresses', () => {
  assert.equal(Q.isValidAddress(TEST_PAYER), true);
  assert.equal(Q.isValidAddress('0x1234'), false);
  assert.equal(Q.isValidAddress('not-an-address'), false);
  assert.equal(Q.normalizeAddress(Q.CONTRACTS.tUSD8.address), Q.CONTRACTS.tUSD8.address.toLowerCase());
  assert.throws(() => Q.normalizeAddress('0xdead'), TypeError);
});

test('Q5: parseTokenUnits and formatTokenUnits preserve exact 6-decimal precision', () => {
  assert.equal(Q.parseTokenUnits('0', 6), 0n);
  assert.equal(Q.parseTokenUnits('25', 6), 25000000n);
  assert.equal(Q.parseTokenUnits('25.5', 6), 25500000n);
  assert.equal(Q.parseTokenUnits('0.000001', 6), 1n);
  assert.equal(Q.formatTokenUnits(25500000n, 6), '25.5');
  assert.equal(Q.formatTokenUnits(3227400000000n, 6), '3227400');
  assert.equal(Q.formatTokenUnits(1n, 6), '0.000001');
  assert.throws(() => Q.parseTokenUnits('1.1234567', 6), RangeError);
  assert.throws(() => Q.parseTokenUnits('-5', 6), TypeError);
});

test('Q6: ERC-20 read selectors and balanceOf calldata encoding are exact', () => {
  assert.equal(Q.encodeName(), '0x06fdde03');
  assert.equal(Q.encodeSymbol(), '0x95d89b41');
  assert.equal(Q.encodeDecimals(), '0x313ce567');
  assert.equal(Q.encodeTotalSupply(), '0x18160ddd');
  const bal = Q.encodeBalanceOf(TEST_PAYER);
  assert.equal(bal.length, 2 + 8 + 64);
  assert.equal(bal, '0x70a08231' + '0'.repeat(24) + TEST_PAYER.slice(2));
});

test('Q7: ERC-20 transfer and approve calldata encode and round-trip decode cleanly', () => {
  const raw = Q.parseTokenUnits('42.25', 6);
  const calldata = Q.encodeTransfer(TEST_MERCHANT, raw);
  assert.equal(calldata.length, 2 + 8 + 64 + 64);
  assert.ok(calldata.startsWith('0xa9059cbb'));

  const decoded = Q.decodeTransferCalldata(calldata);
  assert.equal(decoded.selector, '0xa9059cbb');
  assert.equal(decoded.to, TEST_MERCHANT);
  assert.equal(decoded.amountRaw, 42250000n);

  const approve = Q.encodeApprove(TEST_MERCHANT, raw);
  assert.ok(approve.startsWith('0x095ea7b3'));
  assert.equal(approve.length, 2 + 8 + 64 + 64);
});

test('Q8: ABI decoders parse live QDay tUSD8 symbol, decimals, totalSupply, and bytes32 fallback', () => {
  assert.equal(Q.decodeAbiString(LIVE_SYMBOL_HEX), 'tUSD8');
  assert.equal(Q.decodeUint8(LIVE_DECIMALS_HEX), 6);
  const supply = Q.decodeUint256(LIVE_TOTAL_SUPPLY_HEX);
  assert.equal(supply, 3227400000000n);
  assert.equal(Q.formatTokenUnits(supply, 6), '3227400');

  // bytes32 fallback (non-standard ERC-20 returning 32-byte right-padded ASCII)
  const b32 = '0x7455534438' + '00'.repeat(27);
  assert.equal(Q.decodeAbiString(b32), 'tUSD8');
});

test('Q9: ABI decoders reject malformed or non-transfer calldata', () => {
  assert.throws(() => Q.decodeTransferCalldata('0x1234'), TypeError);
  assert.throws(() => Q.decodeTransferCalldata(Q.encodeApprove(TEST_MERCHANT, 1n)), TypeError);
  assert.throws(() => Q.decodeUint256('0x1234'), TypeError);
  assert.throws(() => Q.encodeUint256(-1), RangeError);
});

// =========================================================================
// Section 3: Post-Quantum Vault Settlement Anchor & Tamper Detection
// =========================================================================

test('Q10: buildVaultAttestation produces deterministic ML-KEM + ML-DSA-65 attestation', () => {
  const a1 = Q.buildVaultAttestation({ seed: 'anchor-test-1', kemParam: 'ML-KEM-768' });
  const a2 = Q.buildVaultAttestation({ seed: 'anchor-test-1', kemParam: 'ML-KEM-768' });
  assert.deepEqual(a1, a2);
  assert.equal(a1.chainId, 44005);
  assert.equal(a1.decapsulationMatches, true);
  assert.equal(a1.mlDsaQuantumBits, 171);
  assert.match(a1.attestationHash, /^0x[0-9a-f]{64}$/);
});

test('Q11: createSettlementAnchor builds a complete verifiable tUSD8 anchor across KEM profiles', () => {
  for (const kemParam of ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024']) {
    const anchor = Q.createSettlementAnchor({
      payer: TEST_PAYER,
      merchant: TEST_MERCHANT,
      amountTusd8: '19.75',
      spendCapTusd8: '100',
      seed: 'suite:' + kemParam,
      kemParam
    });
    const result = Q.verifySettlementAnchor(anchor);
    assert.equal(result.valid, true, kemParam + ' errors: ' + result.errors.join(', '));
    assert.deepEqual(result.errors, []);
    assert.equal(anchor.txRequest.to, Q.CONTRACTS.tUSD8.address);
    assert.equal(anchor.txRequest.chainId, '0xabe5');
    assert.equal(anchor.payload.amountRaw, '19750000');
  }
});

test('Q12: createSettlementAnchor enforces positive amount and scoped spend cap', () => {
  assert.throws(() => Q.createSettlementAnchor({
    payer: TEST_PAYER,
    merchant: TEST_MERCHANT,
    amountTusd8: '0',
    spendCapTusd8: '100'
  }), RangeError);

  assert.throws(() => Q.createSettlementAnchor({
    payer: TEST_PAYER,
    merchant: TEST_MERCHANT,
    amountTusd8: '150',
    spendCapTusd8: '100'
  }), RangeError);
});

test('Q13: verifySettlementAnchor detects tampering in payload, calldata, attestation, or XMSS signature', () => {
  const base = Q.createSettlementAnchor({
    payer: TEST_PAYER,
    merchant: TEST_MERCHANT,
    amountTusd8: '25',
    spendCapTusd8: '100',
    seed: 'tamper-suite'
  });

  // 1. Tamper amountRaw
  const t1 = JSON.parse(JSON.stringify(base));
  t1.payload.amountRaw = '25000001';
  const r1 = Q.verifySettlementAnchor(t1);
  assert.equal(r1.valid, false);
  assert.equal(r1.checks.calldataOk, false);
  assert.equal(r1.checks.receiptHashOk, false);

  // 2. Tamper calldata recipient
  const t2 = JSON.parse(JSON.stringify(base));
  t2.payload.calldata = Q.encodeTransfer(TEST_PAYER, 25000000n);
  const r2 = Q.verifySettlementAnchor(t2);
  assert.equal(r2.valid, false);
  assert.equal(r2.checks.calldataOk, false);

  // 3. Tamper attestation riskScore
  const t3 = JSON.parse(JSON.stringify(base));
  t3.attestation.riskScore = 0;
  const r3 = Q.verifySettlementAnchor(t3);
  assert.equal(r3.valid, false);
  assert.equal(r3.checks.attestationOk, false);

  // 4. Tamper XMSS Merkle proof node
  const t4 = JSON.parse(JSON.stringify(base));
  const orig = t4.signature.proof[0];
  t4.signature.proof[0] = (orig[0] === '0' ? '1' : '0') + orig.slice(1);
  const r4 = Q.verifySettlementAnchor(t4);
  assert.equal(r4.valid, false);
  assert.equal(r4.checks.pqcSignatureOk, false);

  // 5. Tamper commitmentHash
  const t5 = JSON.parse(JSON.stringify(base));
  t5.commitmentHash = '0x' + '00'.repeat(32);
  const r5 = Q.verifySettlementAnchor(t5);
  assert.equal(r5.valid, false);
  assert.equal(r5.checks.commitmentHashOk, false);
});

// =========================================================================
// Section 4: JSON-RPC Client & Deterministic Offline Fallback
// =========================================================================

test('Q14: probeTestnet parses live-shaped JSON-RPC responses including balanceOf', async () => {
  const mockFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    let result;
    if (body.method === 'eth_chainId') result = '0xabe5';
    else if (body.method === 'eth_blockNumber') result = '0x3756d0';
    else if (body.method === 'eth_call') {
      const data = body.params[0].data;
      if (data === Q.SELECTORS.symbol) result = LIVE_SYMBOL_HEX;
      else if (data === Q.SELECTORS.decimals) result = LIVE_DECIMALS_HEX;
      else if (data === Q.SELECTORS.totalSupply) result = LIVE_TOTAL_SUPPLY_HEX;
      else if (data.startsWith(Q.SELECTORS.balanceOf)) {
        result = '0x' + (125000000n).toString(16).padStart(64, '0');
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: body.id, result })
    };
  };

  const res = await Q.probeTestnet({ fetch: mockFetch, account: TEST_PAYER });
  assert.equal(res.mode, 'live');
  assert.equal(res.live, true);
  assert.equal(res.chainId, 44005);
  assert.equal(res.chainIdMatches, true);
  assert.equal(res.blockNumber, 3626704);
  assert.equal(res.token.symbol, 'tUSD8');
  assert.equal(res.token.decimals, 6);
  assert.equal(res.token.totalSupplyFormatted, '3227400');
  assert.equal(res.accountBalanceFormatted, '125');
});

test('Q15: probeTestnet falls back deterministically when network or RPC fails', async () => {
  const failingFetch = async () => { throw new Error('simulated network offline'); };
  const r1 = await Q.probeTestnet({ fetch: failingFetch, account: TEST_PAYER });
  const r2 = await Q.probeTestnet({ fetch: failingFetch, account: TEST_PAYER });
  assert.deepEqual(r1, r2);
  assert.equal(r1.mode, 'simulation');
  assert.equal(r1.live, false);
  assert.equal(r1.chainId, 44005);
  assert.equal(r1.token.symbol, 'tUSD8');
  assert.equal(r1.token.decimals, 6);
  assert.match(r1.fallbackReason, /simulated network offline/);
});

test('Q16: rpcCall surfaces JSON-RPC error payloads cleanly', async () => {
  const errFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } })
  });
  await assert.rejects(
    () => Q.rpcCall('eth_call', [], { fetch: errFetch }),
    /execution reverted/
  );
});

// =========================================================================
// Section 5: EIP-1193 Wallet Helpers
// =========================================================================

test('Q17: buildAddChainParams and wallet helpers work with mock EIP-1193 provider and fallback', async () => {
  const params = Q.buildAddChainParams();
  assert.equal(params.chainId, '0xabe5');
  assert.equal(params.rpcUrls[0], 'https://rpc-test.qday.info');
  assert.equal(params.blockExplorerUrls[0], 'https://explorer-test.qday.info');

  // Offline / no-provider simulation
  const simConn = await Q.connectWallet(null);
  assert.equal(simConn.connected, false);
  assert.equal(simConn.mode, 'simulation');

  const anchor = Q.createSettlementAnchor({
    payer: TEST_PAYER,
    merchant: TEST_MERCHANT,
    amountTusd8: '10',
    spendCapTusd8: '50',
    seed: 'wallet-sim'
  });
  const simTx = await Q.sendTusd8Transfer(null, anchor);
  assert.equal(simTx.simulated, true);
  assert.match(simTx.txHash, /^0x[0-9a-f]{64}$/);
  assert.ok(simTx.explorerUrl.startsWith('https://explorer-test.qday.info/tx/0x'));

  // Mock provider that needs wallet_addEthereumChain (4902) before sending tx
  const calls = [];
  const fakeTxHash = '0x' + 'cd'.repeat(32);
  let addedChain = false;
  const mockProvider = {
    async request(req) {
      calls.push(req.method);
      if (req.method === 'eth_requestAccounts') return [TEST_PAYER];
      if (req.method === 'eth_chainId') return '0x1';
      if (req.method === 'wallet_switchEthereumChain') {
        if (!addedChain) {
          const e = new Error('unrecognized chain');
          e.code = 4902;
          throw e;
        }
        return null;
      }
      if (req.method === 'wallet_addEthereumChain') {
        addedChain = true;
        return null;
      }
      if (req.method === 'eth_sendTransaction') {
        assert.equal(req.params[0].to, Q.CONTRACTS.tUSD8.address);
        assert.equal(req.params[0].data, anchor.payload.calldata);
        return fakeTxHash;
      }
      throw new Error('unexpected method: ' + req.method);
    }
  };

  const conn = await Q.connectWallet(mockProvider);
  assert.equal(conn.connected, true);
  assert.equal(conn.account, TEST_PAYER);
  assert.equal(conn.onAevum, false);

  const tx = await Q.sendTusd8Transfer(mockProvider, anchor);
  assert.equal(tx.simulated, false);
  assert.equal(tx.status, 'submitted');
  assert.equal(tx.txHash, fakeTxHash);
  assert.ok(calls.includes('wallet_switchEthereumChain'));
  assert.ok(calls.includes('wallet_addEthereumChain'));
  assert.ok(calls.includes('eth_sendTransaction'));
});

test('Q18: sendTusd8Transfer refuses to submit a tampered anchor', async () => {
  const anchor = Q.createSettlementAnchor({
    payer: TEST_PAYER,
    merchant: TEST_MERCHANT,
    amountTusd8: '10',
    spendCapTusd8: '50',
    seed: 'refuse-tampered'
  });
  anchor.payload.amountRaw = '999999999';
  await assert.rejects(() => Q.sendTusd8Transfer(null, anchor), /invalid settlement anchor/);
});

// =========================================================================
// Section 6: Web UI Wiring & Clean Heading Layout
// =========================================================================

test('Q19: index.html loads src/qday-aevum.js before app.js and exposes QDay panel controls', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('src/analysis.js') < html.indexOf('src/qday-aevum.js'));
  assert.ok(html.indexOf('src/qday-aevum.js') < html.indexOf('app.js'));

  const requiredIds = [
    'qday',
    'qday-account',
    'qday-probe',
    'qday-connect',
    'qday-switch',
    'qday-net-checks',
    'qday-net-readout',
    'qday-merchant',
    'qday-amount',
    'qday-cap',
    'qday-kem-param',
    'qday-anchor-build',
    'qday-anchor-tamper',
    'qday-send',
    'qday-calldata',
    'qday-attest',
    'qday-receipt',
    'qday-commit',
    'qday-xmss-root',
    'qday-anchor-checks',
    'qday-verdict'
  ];
  for (const id of requiredIds) {
    assert.ok(html.includes('id="' + id + '"'), 'index.html missing #' + id);
  }

  // QDay section heading must stand alone without eyebrow, kicker, or tagline.
  const m = html.match(/<section id="qday"[\s\S]*?<div class="section-head">([\s\S]*?)<\/div>/);
  assert.ok(m, 'qday section-head found');
  assert.equal(/class="(?:kicker|eyebrow)"/.test(m[1]), false, 'no kicker or eyebrow above QDay title');
  assert.equal(/<p[\s>]/.test(m[1]), false, 'no tagline paragraph under QDay title');
});
