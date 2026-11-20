/*
 * QDay / Aevum Testnet (chainId 44005) and tUSD8 integration module.
 *
 * Zero-dependency UMD module for Node and browser use:
 * - Official QDay Aevum testnet network and tUSD8 contract constants
 * - Pure JS ERC-20 ABI encoders and decoders (balanceOf, decimals, symbol, name, totalSupply, transfer, approve)
 * - Post-Quantum Vault Settlement Anchor binding ML-KEM / ML-DSA risk attestation
 *   and an XMSS hash-based signature to a tUSD8 testnet settlement payload
 * - Read-only JSON-RPC client with graceful offline simulation fallback
 * - EIP-1193 wallet helpers (wallet_addEthereumChain, wallet_switchEthereumChain, eth_sendTransaction)
 *
 * Testnet only. Educational PQC primitives are not FIPS 203 validated and must not protect real funds.
 */
(function (root, factory) {
  const P = (typeof module === 'object' && module.exports)
    ? require('./pqc.js')
    : root.PQC;
  const api = factory(P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QDayAevum = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  const NETWORK = Object.freeze({
    name: 'QDay Aevum Testnet',
    chainId: 44005,
    chainIdHex: '0xabe5',
    rpcUrl: 'https://rpc-test.qday.info',
    explorerUrl: 'https://explorer-test.qday.info',
    faucetUrl: 'https://faucet.qday.info/en',
    nativeCurrency: Object.freeze({
      name: 'QDay Testnet',
      symbol: 'tQDAY',
      decimals: 18
    })
  });

  const CONTRACTS = Object.freeze({
    tUSD8: Object.freeze({
      address: '0x456569838f1d43009A91ebA4263147Afd7233483',
      name: 'tUSD8',
      symbol: 'tUSD8',
      decimals: 6
    }),
    faucet: Object.freeze({
      address: '0xE5074CBbd046AFb491EB8692abD6cF7ECCC6dEE5'
    })
  });

  // Standard ERC-20 4-byte function selectors (first 4 bytes of keccak256 signature).
  const SELECTORS = Object.freeze({
    name: '0x06fdde03',
    symbol: '0x95d89b41',
    decimals: '0x313ce567',
    totalSupply: '0x18160ddd',
    balanceOf: '0x70a08231',
    transfer: '0xa9059cbb',
    approve: '0x095ea7b3',
    allowance: '0xdd62ed3e'
  });

  // Clearly test-only deterministic addresses for offline demos and unit tests.
  const DEMO_ADDRESSES = Object.freeze({
    payer: '0x0000000000000000000000000000000000000101',
    merchant: '0x0000000000000000000000000000000000000202'
  });

  const MAX_UINT256 = (1n << 256n) - 1n;

  function explorerAddressUrl(address) {
    return NETWORK.explorerUrl + '/address/' + normalizeAddress(address);
  }

  function explorerTokenUrl(address) {
    return NETWORK.explorerUrl + '/token/' + normalizeAddress(address || CONTRACTS.tUSD8.address);
  }

  function explorerTxUrl(txHash) {
    if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new TypeError('txHash must be a 32-byte 0x-prefixed hex string');
    }
    return NETWORK.explorerUrl + '/tx/' + txHash;
  }

  function isValidAddress(addr) {
    return typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
  }

  function normalizeAddress(addr) {
    if (!isValidAddress(addr)) {
      throw new TypeError('invalid EVM address: ' + String(addr));
    }
    return addr.trim().toLowerCase();
  }

  function strip0x(hex) {
    if (typeof hex !== 'string') throw new TypeError('expected hex string');
    const s = hex.trim();
    return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
  }

  function bytesToUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  // ---- Pure JS ERC-20 ABI encoding & decoding -----------------------------

  function encodeAddress(addr) {
    return normalizeAddress(addr).slice(2).padStart(64, '0');
  }

  function encodeUint256(value) {
    let n;
    if (typeof value === 'bigint') n = value;
    else if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 0) throw new RangeError('uint256 number must be a non-negative integer');
      n = BigInt(value);
    } else if (typeof value === 'string') {
      const s = value.trim();
      if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(s)) throw new TypeError('invalid uint256 string: ' + value);
      n = BigInt(s);
    } else {
      throw new TypeError('unsupported uint256 input');
    }
    if (n < 0n || n > MAX_UINT256) throw new RangeError('uint256 out of range');
    return n.toString(16).padStart(64, '0');
  }

  function parseTokenUnits(amount, decimals) {
    const dec = decimals === undefined ? CONTRACTS.tUSD8.decimals : decimals;
    if (!Number.isInteger(dec) || dec < 0 || dec > 36) throw new RangeError('invalid decimals');
    const raw = typeof amount === 'number' ? String(amount) : String(amount || '').trim();
    if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) throw new TypeError('invalid token amount: ' + amount);
    const parts = raw.split('.');
    const whole = parts[0];
    const frac = parts[1] || '';
    if (frac.length > dec) throw new RangeError('too many decimal places for token with ' + dec + ' decimals');
    const paddedFrac = frac.padEnd(dec, '0');
    return BigInt(whole) * (10n ** BigInt(dec)) + BigInt(paddedFrac || '0');
  }

  function formatTokenUnits(rawUnits, decimals) {
    const dec = decimals === undefined ? CONTRACTS.tUSD8.decimals : decimals;
    const val = typeof rawUnits === 'bigint' ? rawUnits : BigInt(rawUnits);
    if (val < 0n) throw new RangeError('token units cannot be negative');
    if (dec === 0) return val.toString(10);
    const scale = 10n ** BigInt(dec);
    const whole = val / scale;
    const frac = (val % scale).toString(10).padStart(dec, '0').replace(/0+$/, '');
    return frac.length ? whole.toString(10) + '.' + frac : whole.toString(10);
  }

  function encodeName() { return SELECTORS.name; }
  function encodeSymbol() { return SELECTORS.symbol; }
  function encodeDecimals() { return SELECTORS.decimals; }
  function encodeTotalSupply() { return SELECTORS.totalSupply; }

  function encodeBalanceOf(account) {
    return SELECTORS.balanceOf + encodeAddress(account);
  }

  function encodeTransfer(to, amountRaw) {
    return SELECTORS.transfer + encodeAddress(to) + encodeUint256(amountRaw);
  }

  function encodeApprove(spender, amountRaw) {
    return SELECTORS.approve + encodeAddress(spender) + encodeUint256(amountRaw);
  }

  function decodeUint256(hexData) {
    const body = strip0x(hexData);
    if (body.length === 0) return 0n;
    if (!/^[0-9a-fA-F]+$/.test(body) || body.length < 64) {
      throw new TypeError('invalid uint256 ABI response');
    }
    return BigInt('0x' + body.slice(0, 64));
  }

  function decodeUint8(hexData) {
    const v = decodeUint256(hexData);
    if (v > 255n) throw new RangeError('uint8 overflow in ABI response');
    return Number(v);
  }

  function decodeAbiString(hexData) {
    const body = strip0x(hexData);
    if (body.length === 0) return '';
    if (!/^[0-9a-fA-F]+$/.test(body) || body.length % 2 !== 0) {
      throw new TypeError('invalid hex in ABI string response');
    }
    // Fallback for fixed bytes32 string tokens (single 32-byte word).
    if (body.length === 64) {
      const rawBytes = P.hexToBytes(body);
      let end = rawBytes.length;
      while (end > 0 && rawBytes[end - 1] === 0) end--;
      return bytesToUtf8(rawBytes.slice(0, end));
    }
    if (body.length < 128) throw new TypeError('truncated ABI string response');
    const offsetBytes = Number(BigInt('0x' + body.slice(0, 64)));
    const offsetHex = offsetBytes * 2;
    if (offsetHex + 64 > body.length) throw new RangeError('ABI string offset out of bounds');
    const lenBytes = Number(BigInt('0x' + body.slice(offsetHex, offsetHex + 64)));
    const dataStart = offsetHex + 64;
    const dataEnd = dataStart + lenBytes * 2;
    if (dataEnd > body.length) throw new RangeError('ABI string length out of bounds');
    return bytesToUtf8(P.hexToBytes(body.slice(dataStart, dataEnd)));
  }

  function decodeTransferCalldata(calldata) {
    const clean = strip0x(calldata).toLowerCase();
    if (clean.length !== 8 + 64 + 64) {
      throw new TypeError('ERC-20 transfer calldata must be 68 bytes');
    }
    const selector = '0x' + clean.slice(0, 8);
    if (selector !== SELECTORS.transfer) {
      throw new TypeError('unexpected function selector: ' + selector);
    }
    const addrWord = clean.slice(8, 72);
    if (addrWord.slice(0, 24) !== '0'.repeat(24)) {
      throw new TypeError('non-zero padding in ABI address word');
    }
    const to = '0x' + addrWord.slice(24);
    const amountRaw = BigInt('0x' + clean.slice(72, 136));
    return { selector, to, amountRaw };
  }

  // ---- Canonical SHA-256 commitments & PQC Vault Settlement Anchor --------

  function canonicalString(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalString).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalString(value[k])).join(',') + '}';
  }

  function sha256Hex0x(input, domain) {
    return '0x' + P.hashHex(input, domain || 'qday-aevum:');
  }

  function buildVaultAttestation(options) {
    const opts = options || {};
    const seed = String(opts.seed || 'qday-aevum-vault-v1');
    const kemParam = opts.kemParam || P.KEM_DEFAULT;
    const kem = P.MLKEM({ param: kemParam });
    const keys = kem.deriveFromSeed(seed + ':kem');
    const enc = kem.encapsulate(keys.ek, seed + ':encaps');
    const dec = kem.decapsulate(enc.ciphertext, keys.dk);
    const decapsulationMatches = P.bytesEqual(enc.sharedSecret, dec);

    const riskInput = Object.assign({
      publicKeyRevealed: true,
      p2pkh: false,
      valueBtc: 2.5,
      ageBlocks: 50000
    }, opts.riskInput || {});
    const risk = P.migrationRisk(riskInput);
    const mlDsa = P.analyzePrimitive('ML-DSA-65');
    const hybrid = P.hybridSecurity('secp256k1 ECDSA', 'ML-DSA-65');

    const body = {
      schema: 'qday-aevum/pqc-attestation-v1',
      chainId: NETWORK.chainId,
      token: CONTRACTS.tUSD8.address.toLowerCase(),
      seed,
      kemParam,
      ekHash: '0x' + P.bytesToHex(P.sha256(keys.ek)),
      ctHash: '0x' + P.bytesToHex(P.sha256(enc.ciphertext)),
      sharedSecretHash: '0x' + P.bytesToHex(P.sha256(enc.sharedSecret)),
      decapsulationMatches,
      signatureProfile: 'ML-DSA-65 + XMSS-SHA256',
      mlDsaClassicalBits: mlDsa.classical,
      mlDsaQuantumBits: mlDsa.quantum,
      hybridQuantumBits: hybrid.quantum,
      riskScore: risk.score,
      riskTier: risk.tier
    };
    const attestationHash = sha256Hex0x(canonicalString(body), 'qday-attestation:');
    return Object.assign({}, body, { attestationHash });
  }

  function createSettlementAnchor(options) {
    const opts = options || {};
    const payer = normalizeAddress(opts.payer || DEMO_ADDRESSES.payer);
    const merchant = normalizeAddress(opts.merchant || DEMO_ADDRESSES.merchant);
    const amountTusd8 = opts.amountTusd8 !== undefined ? String(opts.amountTusd8).trim() : '25';
    const spendCapTusd8 = opts.spendCapTusd8 !== undefined ? String(opts.spendCapTusd8).trim() : '100';
    const amountRaw = parseTokenUnits(amountTusd8, CONTRACTS.tUSD8.decimals);
    const spendCapRaw = parseTokenUnits(spendCapTusd8, CONTRACTS.tUSD8.decimals);
    if (amountRaw <= 0n) throw new RangeError('settlement amount must be greater than zero');
    if (amountRaw > spendCapRaw) throw new RangeError('settlement amount exceeds scoped spend cap');

    const deadlineUnix = opts.deadlineUnix !== undefined ? Number(opts.deadlineUnix) : 1893456000;
    if (!Number.isInteger(deadlineUnix) || deadlineUnix <= 0) {
      throw new RangeError('deadlineUnix must be a positive integer');
    }

    const seed = String(opts.seed || 'qday-aevum-vault-v1');
    const attestation = buildVaultAttestation({
      seed,
      kemParam: opts.kemParam || P.KEM_DEFAULT,
      riskInput: opts.riskInput
    });
    const calldata = encodeTransfer(merchant, amountRaw);

    const payload = {
      schema: 'qday-aevum/tusd8-settlement-v1',
      chainId: NETWORK.chainId,
      chainIdHex: NETWORK.chainIdHex,
      token: CONTRACTS.tUSD8.address.toLowerCase(),
      tokenSymbol: CONTRACTS.tUSD8.symbol,
      tokenDecimals: CONTRACTS.tUSD8.decimals,
      payer,
      merchant,
      amountTusd8: formatTokenUnits(amountRaw, CONTRACTS.tUSD8.decimals),
      amountRaw: amountRaw.toString(10),
      spendCapTusd8: formatTokenUnits(spendCapRaw, CONTRACTS.tUSD8.decimals),
      spendCapRaw: spendCapRaw.toString(10),
      deadlineUnix,
      calldata,
      attestationHash: attestation.attestationHash
    };

    const receiptHash = sha256Hex0x(canonicalString(payload), 'qday-receipt:');
    const commitmentHash = sha256Hex0x(
      receiptHash + ':' + calldata + ':' + attestation.attestationHash,
      'qday-commitment:'
    );

    const xmss = P.XMSS({ height: 2, seed: seed + ':qday-anchor-xmss' });
    const signature = xmss.sign(receiptHash);

    const txRequest = {
      from: payer,
      to: CONTRACTS.tUSD8.address,
      data: calldata,
      value: '0x0',
      chainId: NETWORK.chainIdHex
    };

    return {
      payload,
      attestation,
      receiptHash,
      commitmentHash,
      signature,
      txRequest,
      explorerTokenUrl: explorerTokenUrl(CONTRACTS.tUSD8.address)
    };
  }

  function verifySettlementAnchor(anchor) {
    const errors = [];
    const checks = {
      chainOk: false,
      tokenOk: false,
      spendCapOk: false,
      calldataOk: false,
      attestationOk: false,
      receiptHashOk: false,
      commitmentHashOk: false,
      pqcSignatureOk: false
    };

    if (!anchor || typeof anchor !== 'object' || !anchor.payload || !anchor.attestation || !anchor.signature) {
      return { valid: false, checks, errors: ['anchor object is incomplete'] };
    }

    const p = anchor.payload;
    const att = anchor.attestation;

    checks.chainOk = p.chainId === NETWORK.chainId && p.chainIdHex === NETWORK.chainIdHex;
    if (!checks.chainOk) errors.push('chainId mismatch (expected 44005 / 0xabe5)');

    checks.tokenOk = isValidAddress(p.token) &&
      normalizeAddress(p.token) === normalizeAddress(CONTRACTS.tUSD8.address) &&
      p.tokenDecimals === CONTRACTS.tUSD8.decimals;
    if (!checks.tokenOk) errors.push('token address or decimals mismatch for official tUSD8');

    try {
      const amountRaw = BigInt(p.amountRaw);
      const spendCapRaw = BigInt(p.spendCapRaw);
      checks.spendCapOk = amountRaw > 0n && amountRaw <= spendCapRaw;
      if (!checks.spendCapOk) errors.push('amount violates positive or spend-cap constraint');

      const decoded = decodeTransferCalldata(p.calldata);
      checks.calldataOk = normalizeAddress(decoded.to) === normalizeAddress(p.merchant) &&
        decoded.amountRaw === amountRaw;
      if (!checks.calldataOk) errors.push('ERC-20 transfer calldata does not match payload merchant or amount');
    } catch (err) {
      errors.push('calldata or amount decode failed: ' + err.message);
    }

    try {
      const attBody = Object.assign({}, att);
      delete attBody.attestationHash;
      const expectedAttHash = sha256Hex0x(canonicalString(attBody), 'qday-attestation:');
      checks.attestationOk = att.attestationHash === expectedAttHash &&
        p.attestationHash === expectedAttHash &&
        att.decapsulationMatches === true;
      if (!checks.attestationOk) errors.push('PQC attestation digest mismatch or decapsulation invalid');
    } catch (err) {
      errors.push('attestation verification error: ' + err.message);
    }

    const expectedReceipt = sha256Hex0x(canonicalString(p), 'qday-receipt:');
    checks.receiptHashOk = anchor.receiptHash === expectedReceipt;
    if (!checks.receiptHashOk) errors.push('receiptHash does not match canonical settlement payload');

    const expectedCommitment = sha256Hex0x(
      anchor.receiptHash + ':' + p.calldata + ':' + p.attestationHash,
      'qday-commitment:'
    );
    checks.commitmentHashOk = anchor.commitmentHash === expectedCommitment;
    if (!checks.commitmentHashOk) errors.push('commitmentHash mismatch');

    try {
      const sig = anchor.signature;
      const wotsOk = sig.message === anchor.receiptHash &&
        Array.isArray(sig.wots) &&
        P.wotsVerify(anchor.receiptHash, sig.wots.map(P.hexToBytes), sig.leaf);
      const merkleOk = Array.isArray(sig.proof) &&
        P.verifyMerkleProof(sig.leaf, sig.proof, sig.root, sig.index, sig.proof.length);
      checks.pqcSignatureOk = !!(wotsOk && merkleOk);
      if (!checks.pqcSignatureOk) errors.push('XMSS/WOTS+ signature or Merkle authentication path failed');
    } catch (err) {
      errors.push('signature verification error: ' + err.message);
    }

    const valid = Object.values(checks).every(Boolean);
    return { valid, checks, errors };
  }

  // ---- JSON-RPC read-only client + deterministic simulation fallback ------

  async function rpcCall(method, params, options) {
    const opts = options || {};
    const fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) throw new Error('fetch is unavailable in this environment');

    const rpcUrl = opts.rpcUrl || NETWORK.rpcUrl;
    const timeoutMs = opts.timeoutMs || 8000;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: opts.id || 1,
      method,
      params: params || []
    });

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchFn(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller ? controller.signal : undefined
      });
      if (!res || !res.ok) {
        throw new Error('RPC HTTP status ' + (res ? res.status : 'unknown'));
      }
      const data = await res.json();
      if (data.error) {
        throw new Error('RPC error ' + data.error.code + ': ' + data.error.message);
      }
      if (data.result === undefined) {
        throw new Error('RPC response missing result');
      }
      return data.result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function simulateTestnetProbe(options) {
    const opts = options || {};
    const account = opts.account && isValidAddress(opts.account)
      ? normalizeAddress(opts.account)
      : DEMO_ADDRESSES.payer;
    const seedBytes = P.sha256(P.utf8Bytes('qday-sim:' + account));
    const blockOffset = ((seedBytes[0] << 8) | seedBytes[1]) % 4096;
    const blockNumber = 3626704 + blockOffset;
    const simBalanceRaw = BigInt(250 + (seedBytes[2] % 500)) * 1000000n;
    const simTotalSupplyRaw = 3227400000000n;

    return {
      mode: 'simulation',
      live: false,
      fallbackReason: opts.fallbackReason || 'offline deterministic simulation',
      rpcUrl: opts.rpcUrl || NETWORK.rpcUrl,
      chainId: NETWORK.chainId,
      chainIdHex: NETWORK.chainIdHex,
      chainIdMatches: true,
      blockNumber,
      blockNumberHex: '0x' + blockNumber.toString(16),
      token: {
        address: CONTRACTS.tUSD8.address,
        symbol: CONTRACTS.tUSD8.symbol,
        decimals: CONTRACTS.tUSD8.decimals,
        totalSupplyRaw: simTotalSupplyRaw.toString(10),
        totalSupplyFormatted: formatTokenUnits(simTotalSupplyRaw, CONTRACTS.tUSD8.decimals)
      },
      account,
      accountBalanceRaw: simBalanceRaw.toString(10),
      accountBalanceFormatted: formatTokenUnits(simBalanceRaw, CONTRACTS.tUSD8.decimals)
    };
  }

  async function probeTestnet(options) {
    const opts = options || {};
    const account = opts.account && isValidAddress(opts.account)
      ? normalizeAddress(opts.account)
      : null;
    try {
      const rpcOpts = { fetch: opts.fetch, rpcUrl: opts.rpcUrl, timeoutMs: opts.timeoutMs };
      const [chainHex, blockHex, symHex, decHex, supHex] = await Promise.all([
        rpcCall('eth_chainId', [], Object.assign({ id: 1 }, rpcOpts)),
        rpcCall('eth_blockNumber', [], Object.assign({ id: 2 }, rpcOpts)),
        rpcCall('eth_call', [{ to: CONTRACTS.tUSD8.address, data: encodeSymbol() }, 'latest'], Object.assign({ id: 3 }, rpcOpts)),
        rpcCall('eth_call', [{ to: CONTRACTS.tUSD8.address, data: encodeDecimals() }, 'latest'], Object.assign({ id: 4 }, rpcOpts)),
        rpcCall('eth_call', [{ to: CONTRACTS.tUSD8.address, data: encodeTotalSupply() }, 'latest'], Object.assign({ id: 5 }, rpcOpts))
      ]);

      const chainId = Number(BigInt(chainHex));
      const blockNumber = Number(BigInt(blockHex));
      const symbol = decodeAbiString(symHex);
      const decimals = decodeUint8(decHex);
      const totalSupplyRaw = decodeUint256(supHex);

      let accountBalanceRaw = null;
      let accountBalanceFormatted = null;
      if (account) {
        const balHex = await rpcCall(
          'eth_call',
          [{ to: CONTRACTS.tUSD8.address, data: encodeBalanceOf(account) }, 'latest'],
          Object.assign({ id: 6 }, rpcOpts)
        );
        const bal = decodeUint256(balHex);
        accountBalanceRaw = bal.toString(10);
        accountBalanceFormatted = formatTokenUnits(bal, decimals);
      }

      return {
        mode: 'live',
        live: true,
        fallbackReason: null,
        rpcUrl: opts.rpcUrl || NETWORK.rpcUrl,
        chainId,
        chainIdHex: '0x' + chainId.toString(16),
        chainIdMatches: chainId === NETWORK.chainId,
        blockNumber,
        blockNumberHex: blockHex,
        token: {
          address: CONTRACTS.tUSD8.address,
          symbol,
          decimals,
          totalSupplyRaw: totalSupplyRaw.toString(10),
          totalSupplyFormatted: formatTokenUnits(totalSupplyRaw, decimals)
        },
        account,
        accountBalanceRaw,
        accountBalanceFormatted
      };
    } catch (err) {
      return simulateTestnetProbe({
        account,
        rpcUrl: opts.rpcUrl,
        fallbackReason: err && err.message ? err.message : String(err)
      });
    }
  }

  // ---- EIP-1193 wallet helpers --------------------------------------------

  function buildAddChainParams() {
    return {
      chainId: NETWORK.chainIdHex,
      chainName: NETWORK.name,
      nativeCurrency: Object.assign({}, NETWORK.nativeCurrency),
      rpcUrls: [NETWORK.rpcUrl],
      blockExplorerUrls: [NETWORK.explorerUrl]
    };
  }

  async function connectWallet(provider) {
    if (!provider || typeof provider.request !== 'function') {
      return {
        connected: false,
        mode: 'simulation',
        account: DEMO_ADDRESSES.payer,
        chainId: NETWORK.chainId,
        chainIdHex: NETWORK.chainIdHex,
        onAevum: false,
        reason: 'No EIP-1193 wallet detected; deterministic simulation mode active.'
      };
    }
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || accounts.length === 0 || !isValidAddress(accounts[0])) {
      throw new Error('wallet returned no valid accounts');
    }
    const chainHex = await provider.request({ method: 'eth_chainId' });
    const chainId = Number(BigInt(chainHex));
    return {
      connected: true,
      mode: 'wallet',
      account: normalizeAddress(accounts[0]),
      chainId,
      chainIdHex: '0x' + chainId.toString(16),
      onAevum: chainId === NETWORK.chainId,
      reason: null
    };
  }

  async function ensureAevumNetwork(provider) {
    if (!provider || typeof provider.request !== 'function') {
      return {
        switched: false,
        added: false,
        mode: 'simulation',
        chainId: NETWORK.chainId,
        chainIdHex: NETWORK.chainIdHex
      };
    }
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK.chainIdHex }]
      });
      return {
        switched: true,
        added: false,
        mode: 'wallet',
        chainId: NETWORK.chainId,
        chainIdHex: NETWORK.chainIdHex
      };
    } catch (err) {
      const code = err && (err.code || (err.data && err.data.originalError && err.data.originalError.code));
      if (code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [buildAddChainParams()]
        });
        return {
          switched: true,
          added: true,
          mode: 'wallet',
          chainId: NETWORK.chainId,
          chainIdHex: NETWORK.chainIdHex
        };
      }
      throw err;
    }
  }

  async function sendTusd8Transfer(provider, anchor) {
    const verification = verifySettlementAnchor(anchor);
    if (!verification.valid) {
      throw new Error('refusing transfer for invalid settlement anchor: ' + verification.errors.join('; '));
    }
    if (!provider || typeof provider.request !== 'function') {
      const simTxHash = sha256Hex0x(
        anchor.receiptHash + ':' + anchor.commitmentHash,
        'qday-sim-tx:'
      );
      return {
        simulated: true,
        status: 'simulated',
        txHash: simTxHash,
        explorerUrl: explorerTxUrl(simTxHash),
        chainId: NETWORK.chainId,
        to: CONTRACTS.tUSD8.address,
        data: anchor.txRequest.data
      };
    }
    await ensureAevumNetwork(provider);
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: anchor.txRequest.from,
        to: CONTRACTS.tUSD8.address,
        data: anchor.txRequest.data,
        value: '0x0'
      }]
    });
    return {
      simulated: false,
      status: 'submitted',
      txHash,
      explorerUrl: /^0x[0-9a-fA-F]{64}$/.test(String(txHash)) ? explorerTxUrl(txHash) : NETWORK.explorerUrl,
      chainId: NETWORK.chainId,
      to: CONTRACTS.tUSD8.address,
      data: anchor.txRequest.data
    };
  }

  const api = {
    NETWORK,
    CONTRACTS,
    SELECTORS,
    DEMO_ADDRESSES,
    explorerAddressUrl,
    explorerTokenUrl,
    explorerTxUrl,
    isValidAddress,
    normalizeAddress,
    encodeAddress,
    encodeUint256,
    parseTokenUnits,
    formatTokenUnits,
    encodeName,
    encodeSymbol,
    encodeDecimals,
    encodeTotalSupply,
    encodeBalanceOf,
    encodeTransfer,
    encodeApprove,
    decodeUint256,
    decodeUint8,
    decodeAbiString,
    decodeTransferCalldata,
    canonicalString,
    buildVaultAttestation,
    createSettlementAnchor,
    verifySettlementAnchor,
    rpcCall,
    simulateTestnetProbe,
    probeTestnet,
    buildAddChainParams,
    connectWallet,
    ensureAevumNetwork,
    sendTusd8Transfer
  };

  return api;
}));
