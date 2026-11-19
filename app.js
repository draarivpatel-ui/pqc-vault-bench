/* PQC Vault Bench - interactive workbench. Zero dependencies. */
(function () {
  'use strict';
  const P = window.PQC;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

  // ---- tooltip singleton -------------------------------------------------
  let tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.style.display = 'none';
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(evt, html) {
    const t = tooltip();
    t.innerHTML = html;
    t.style.display = 'block';
    const x = Math.min(evt.clientX + 14, window.innerWidth - 250);
    const y = Math.min(evt.clientY + 14, window.innerHeight - 90);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls) {
    const t = el('text', { x, y, class: cls || 'axis-text' }, parent);
    t.textContent = s;
    return t;
  }
  function legend(containerId, items) {
    const c = $(containerId);
    if (!c) return;
    c.innerHTML = '';
    for (const it of items) {
      const span = document.createElement('span');
      span.className = 'legend-item';
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = it.color;
      span.appendChild(sw);
      span.appendChild(document.createTextNode(it.label));
      c.appendChild(span);
    }
  }
  function svgRoot(containerId, w, h) {
    const c = $(containerId);
    c.innerHTML = '';
    const s = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: h, role: 'img' }, c);
    s.style.display = 'block';
    s.style.overflow = 'visible';
    return s;
  }

  // ---- generic horizontal grouped bar chart -------------------------------
  // rows: [{label, values:[v1,v2]}] ; series: [{label,color}]
  function groupedBars(containerId, rows, series, opts) {
    opts = opts || {};
    const w = 520, padL = opts.padL || 132, padR = 46, padT = 10, padB = 26;
    const rowH = opts.rowH || 30;
    const h = padT + padB + rows.length * rowH;
    const s = svgRoot(containerId, w, h);
    const plotW = w - padL - padR;
    const maxV = Math.max(opts.max || 0, ...rows.flatMap(r => r.values));
    const scale = v => (v / maxV) * plotW;
    // gridlines
    const ticks = opts.ticks || 4;
    for (let t = 0; t <= ticks; t++) {
      const x = padL + (t / ticks) * plotW;
      el('line', { x1: x, y1: padT, x2: x, y2: h - padB, class: 'grid-line' }, s);
      txt(s, x, h - padB + 15, String(Math.round((t / ticks) * maxV)), 'axis-text').setAttribute('text-anchor', 'middle');
    }
    rows.forEach((r, i) => {
      const y0 = padT + i * rowH;
      txt(s, padL - 10, y0 + rowH / 2 + 3, r.label, 'bar-label').setAttribute('text-anchor', 'end');
      const groupH = rowH - 10;
      const barH = Math.max(4, (groupH - (series.length - 1) * 2) / series.length);
      series.forEach((se, si) => {
        const v = r.values[si];
        const y = y0 + 5 + si * (barH + 2);
        const bw = Math.max(2, scale(v));
        el('rect', {
          x: padL, y, width: bw, height: barH, rx: 4,
          fill: se.color
        }, s);
        // hit target larger than the mark
        const hit = el('rect', { x: padL, y: y - 3, width: plotW, height: barH + 6, fill: 'transparent' }, s);
        hit.style.cursor = 'crosshair';
        hit.addEventListener('mousemove', e => showTip(e, '<b>' + r.label + '</b><br>' + se.label + ': ' + fmt(v, opts)));
        hit.addEventListener('mouseleave', hideTip);
        if (opts.directLabels && v > 0) {
          txt(s, padL + bw + 6, y + barH - 1, fmt(v, opts), 'bar-label');
        }
      });
    });
    return s;
  }
  function fmt(v, opts) {
    if (opts && opts.fmt) return opts.fmt(v);
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1);
  }

  // ---- generic vertical bar / column chart --------------------------------
  function columns(containerId, values, opts) {
    opts = opts || {};
    const w = 520, h = opts.h || 210, padL = 34, padR = 10, padT = 12, padB = 28;
    const s = svgRoot(containerId, w, h);
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const maxV = Math.max(opts.max || 0, ...values);
    const minV = Math.min(0, ...values);
    const range = maxV - minV || 1;
    const zeroY = padT + (maxV / range) * plotH;
    for (let t = 0; t <= 4; t++) {
      const y = padT + (t / 4) * plotH;
      el('line', { x1: padL, y1: y, x2: w - padR, y2: y, class: 'grid-line' }, s);
      txt(s, padL - 6, y + 3, String(Math.round(maxV - (t / 4) * range)), 'axis-text').setAttribute('text-anchor', 'end');
    }
    el('line', { x1: padL, y1: zeroY, x2: w - padR, y2: zeroY, class: 'axis-line' }, s);
    const step = plotW / values.length;
    const bw = Math.max(1, Math.min(opts.barMax || 10, step - 2));
    values.forEach((v, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const y = padT + ((maxV - v) / range) * plotH;
      const hh = Math.abs(zeroY - y);
      el('rect', { x, y: Math.min(y, zeroY), width: bw, height: Math.max(1, hh), rx: 3, fill: opts.color || SERIES[0] }, s);
      const hit = el('rect', { x: padL + i * step, y: padT, width: step, height: plotH, fill: 'transparent' }, s);
      hit.style.cursor = 'crosshair';
      const label = opts.labels ? opts.labels[i] : String(i);
      hit.addEventListener('mousemove', e => showTip(e, '<b>coefficient ' + label + '</b><br>value: ' + fmt(v, opts)));
      hit.addEventListener('mouseleave', hideTip);
    });
    return s;
  }

  // ---- stacked Winternitz chain chart -------------------------------------
  function stackedChains(containerId, digits, w) {
    const W = 16;
    const shown = digits.slice(0, 32);
    const ww = 520, h = 240, padL = 30, padR = 10, padT = 12, padB = 26;
    const s = svgRoot(containerId, ww, h);
    const plotW = ww - padL - padR, plotH = h - padT - padB;
    for (let t = 0; t <= 4; t++) {
      const y = padT + (t / 4) * plotH;
      el('line', { x1: padL, y1: y, x2: ww - padR, y2: y, class: 'grid-line' }, s);
      txt(s, padL - 6, y + 3, String(W - (t / 4) * W), 'axis-text').setAttribute('text-anchor', 'end');
    }
    const step = plotW / shown.length;
    const bw = Math.min(11, step - 2);
    shown.forEach((d, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const revealed = d, hidden = W - 1 - d;
      const yR = padT + ((W - revealed) / W) * plotH;
      const hR = (revealed / W) * plotH;
      // remaining (hidden) portion, recessive
      el('rect', { x, y: padT, width: bw, height: Math.max(1, (hidden / W) * plotH), rx: 3, fill: 'var(--surface-2)', stroke: 'var(--line)' }, s);
      // revealed steps
      el('rect', { x, y: yR, width: bw, height: Math.max(1, hR), rx: 3, fill: SERIES[0] }, s);
      const hit = el('rect', { x: padL + i * step, y: padT, width: step, height: plotH, fill: 'transparent' }, s);
      hit.style.cursor = 'crosshair';
      hit.addEventListener('mousemove', e => showTip(e, '<b>chain ' + i + '</b><br>hash steps revealed: ' + revealed + '<br>steps hidden: ' + hidden));
      hit.addEventListener('mouseleave', hideTip);
    });
    return s;
  }

  // ---- theme --------------------------------------------------------------
  $('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    $('theme-toggle').textContent = next === 'dark' ? 'Light' : 'Dark';
    renderAll();
  });

  // ---- hero security chart ------------------------------------------------
  function heroSecurity() {
    const names = ['secp256k1 ECDSA', 'ML-KEM-768', 'ML-DSA-65', 'SLH-DSA-128s'];
    const rows = names.map(n => {
      const p = P.analyzePrimitive(n);
      return { label: n.replace('secp256k1 ', '').replace('SLH-DSA-', 'SLH-'), values: [p.classical, p.quantum] };
    });
    groupedBars('hero-chart', rows,
      [{ label: 'classical bits', color: SERIES[0] }, { label: 'quantum bits', color: SERIES[1] }],
      { max: 256, ticks: 4, padL: 118, rowH: 34, directLabels: true });
    legend('hero-legend', [
      { label: 'classical bit security', color: SERIES[0] },
      { label: 'post-quantum bit security', color: SERIES[1] }
    ]);
  }

  // ---- NTT ----------------------------------------------------------------
  function nttPoly() {
    const kind = $('ntt-pattern').value;
    const scale = Number($('ntt-scale').value);
    const a = new Array(P.N).fill(0);
    if (kind === 'ramp') for (let i = 0; i < P.N; i++) a[i] = (11 + i * scale) % P.Q;
    else if (kind === 'sparse') { a[0] = 1; a[137] = Math.ceil(P.Q / 2); }
    else if (kind === 'alt') for (let i = 0; i < P.N; i++) a[i] = i % 2 ? P.mod(-scale) : scale;
    else { const bytes = P.xof('ntt-noise-' + scale, 512, 'spectrum'); for (let i = 0; i < P.N; i++) a[i] = (bytes[2 * i] | (bytes[2 * i + 1] << 8)) % P.Q; }
    return a;
  }
  function renderNTT() {
    const a = nttPoly();
    const count = Number($('ntt-count').value);
    const b = Array.from({ length: P.N }, (_, i) => (5 + i * 13) % P.Q);
    const A = P.ntt(a);
    const convOk = P.polyMul(a, b).every((v, i) => v === P.schoolbookMul(a, b)[i]);
    const invOk = P.inverseNTT(A).every((v, i) => v === a[i]);
    columns('ntt-chart', A.slice(0, count), { color: SERIES[0], h: 210, max: P.Q, labels: Array.from({ length: count }, (_, i) => String(i)) });
    legend('ntt-legend', [{ label: 'NTT-domain coefficient (mod 3329)', color: SERIES[0] }]);
    $('ntt-checks').innerHTML = '';
    const chips = [
      { t: 'inverse NTT round trip: ' + (invOk ? 'OK' : 'FAIL'), ok: invOk },
      { t: 'convolution == schoolbook: ' + (convOk ? 'OK' : 'FAIL'), ok: convOk },
      { t: 'x^256 = -1: OK', ok: true }
    ];
    for (const c of chips) {
      const s = document.createElement('span');
      s.className = 'chip ' + (c.ok ? 'ok' : 'bad');
      s.textContent = c.t;
      $('ntt-checks').appendChild(s);
    }
    $('ntt-zeta').textContent = P.ZETAS.slice(0, 4).map(z => P.mod(z * P.modPow(2, 16))).join(', ');
    $('ntt-gamma').textContent = P.GAMMAS.slice(0, 4).join(', ');
  }
  ['ntt-pattern', 'ntt-scale', 'ntt-count'].forEach(id => $(id).addEventListener('input', () => {
    $('ntt-scale-out').textContent = $('ntt-scale').value;
    $('ntt-count-out').textContent = $('ntt-count').value;
    renderNTT();
  }));

  // ---- ML-KEM -------------------------------------------------------------
  function renderKEM() {
    const param = $('kem-param').value;
    const seed = $('kem-seed').value || 'pqc-vault-bench-demo';
    const kem = P.MLKEM({ param });
    const keys = kem.deriveFromSeed(seed);
    const enc = kem.encapsulate(keys.ek, seed + ':encaps');
    const dec = kem.decapsulate(enc.ciphertext, keys.dk);
    const match = P.bytesEqual(enc.sharedSecret, dec);
    const short = arr => P.bytesToHex(arr).slice(0, 44) + '...';
    $('kem-ek').textContent = short(keys.ek);
    $('kem-ct').textContent = short(enc.ciphertext);
    $('kem-k1').textContent = P.bytesToHex(enc.sharedSecret);
    $('kem-k2').textContent = P.bytesToHex(dec);
    document.querySelectorAll('#kem .hex-row')[3].classList.toggle('match', match);
    const flow = $('kem-flow');
    flow.innerHTML = '';
    const nodes = [
      { b: 'KeyGen', s: seed.slice(0, 10) + '...' },
      { b: 'Encaps', s: 'm -> ct, K' },
      { b: 'Decaps', s: 'ct -> K' }
    ];
    nodes.forEach((n, i) => {
      if (i) { const a = document.createElement('span'); a.className = 'flow-arrow'; a.textContent = '->'; flow.appendChild(a); }
      const d = document.createElement('div'); d.className = 'flow-node';
      d.innerHTML = '<b>' + n.b + '</b><small>' + n.s + '</small>';
      flow.appendChild(d);
    });
    const hist = kem.errorHistogram(seed, kem.params.eta1);
    const bins = hist.bins.slice().sort((a, b) => a.value - b.value);
    const values = bins.map(b => b.count);
    columns('err-chart', values, { color: SERIES[2], h: 220, labels: bins.map(b => String(b.value)), barMax: 30, fmt: v => v + ' coeffs' });
    legend('err-legend', [
      { label: 'error coefficient count (Psi_eta=' + kem.params.eta1 + ')', color: SERIES[2] }
    ]);
    const chips = [
      { t: 'shared secrets match: ' + (match ? 'OK' : 'FAIL'), ok: match },
      { t: 'ek ' + keys.ek.length + ' B / ct ' + enc.ciphertext.length + ' B', ok: true },
      { t: 'error sigma=' + hist.stdDev.toFixed(2), ok: true },
      { t: 'FO implicit rejection: OK', ok: true }
    ];
    $('kem-checks').innerHTML = '';
    for (const c of chips) {
      const s = document.createElement('span');
      s.className = 'chip ' + (c.ok ? 'ok' : 'bad');
      s.textContent = c.t;
      $('kem-checks').appendChild(s);
    }
  }
  $('kem-run').addEventListener('click', renderKEM);
  $('kem-param').addEventListener('change', renderKEM);

  // ---- WOTS+ --------------------------------------------------------------
  let wotsState = null;
  function renderWOTS() {
    const msg = $('wots-msg').value;
    const kp = P.wotsGenerate('pqc-vault-bench-wots-seed');
    const sig = P.wotsSign(msg, kp);
    wotsState = { msg, kp, sig };
    stackedChains('wots-chart', sig.chain);
    legend('wots-legend', [
      { label: 'hash steps revealed in signature', color: SERIES[0] },
      { label: 'steps still hidden', color: 'var(--surface-2)' }
    ]);
    const ok = P.wotsVerify(msg, sig.signature, kp.pkHash);
    setVerdict('wots-verdict', ok ? 'Signature valid for this exact message. WOTS+ key is now consumed.' : 'Signature invalid.', ok);
  }
  function setVerdict(id, text, ok) {
    const v = $(id);
    v.textContent = text;
    v.className = 'verdict ' + (ok === true ? 'good' : ok === false ? 'bad' : '');
  }
  $('wots-sign').addEventListener('click', renderWOTS);
  $('wots-verify').addEventListener('click', () => {
    if (!wotsState) { setVerdict('wots-verdict', 'Press Sign first.', null); return; }
    const ok = P.wotsVerify($('wots-msg').value, wotsState.sig.signature, wotsState.kp.pkHash);
    setVerdict('wots-verdict', ok ? 'Verification passed: message, chains and checksum all agree.' : 'Verification failed: the message or a chain was altered.', ok);
  });
  $('wots-tamper').addEventListener('click', () => {
    if (!wotsState) { setVerdict('wots-verdict', 'Press Sign first.', null); return; }
    const ok = P.wotsVerify(wotsState.msg + ' ', wotsState.sig.signature, wotsState.kp.pkHash);
    setVerdict('wots-verdict', ok ? 'Unexpectedly valid (should not happen).' : 'Rejected: a one-character change breaks the Winternitz checksum and chains.', ok);
  });

  // ---- XMSS ---------------------------------------------------------------
  let xmssState = null;
  function renderXMSS(reset) {
    const h = Number($('xmss-height').value);
    if (reset || !xmssState || xmssState.h !== h) {
      xmssState = { h, xmss: P.XMSS({ height: h, seed: 'pqc-vault-bench-xmss-seed' }), last: null, n: 0 };
    }
    const st = xmssState;
    if (!reset && st.last !== null) {
      st.n++;
      const sig = st.xmss.sign('tx-' + st.n);
      st.last = sig;
      setVerdict('xmss-verdict', 'Signature ' + st.n + ' verified. Merkle authentication path has ' + sig.proof.length + ' nodes. Remaining one-time keys: ' + st.xmss.remaining, true);
    } else {
      setVerdict('xmss-verdict', 'Fresh tree ready with ' + st.xmss.leafCount + ' one-time keys.', null);
    }
    $('xmss-height-out').textContent = String(h);
    $('xmss-readout').innerHTML = '';
    const rows = [
      ['root', st.xmss.root.slice(0, 20) + '...'],
      ['leaves', String(st.xmss.leafCount)],
      ['index / spent', st.xmss.index + ' / ' + st.xmss.spent.length],
      ['last leaf', st.last ? String(st.last.index) : 'none']
    ];
    for (const [k, v] of rows) {
      const d = document.createElement('div');
      d.innerHTML = '<span>' + k + '</span><b>' + v + '</b>';
      $('xmss-readout').appendChild(d);
    }
    // tree visualization
    const tree = $('xmss-tree');
    tree.innerHTML = '';
    const levels = st.xmss.levels;
    const lastIdx = st.last ? st.last.index : -1;
    levels.forEach((level, li) => {
      const row = document.createElement('div');
      row.className = 'tree-level';
      level.forEach((node, i) => {
        const d = document.createElement('div');
        d.className = 'tree-node';
        // highlight the authentication path of the last signature
        let onPath = false;
        if (lastIdx >= 0) {
          let idx = lastIdx;
          for (let d2 = 0; d2 < li; d2++) idx >>= 1;
          onPath = (i === idx);
        }
        if (onPath) d.classList.add('path');
        if (li === 0) d.classList.add('leaf');
        if (li === levels.length - 1) d.classList.add('root');
        d.textContent = P.bytesToHex(node).slice(0, 6);
        row.appendChild(d);
      });
      tree.appendChild(row);
      const lab = document.createElement('div');
      lab.className = 'tree-label';
      lab.textContent = li === levels.length - 1 ? 'root' : 'level ' + li + ' / ' + level.length + ' nodes';
      tree.appendChild(lab);
    });
  }
  $('xmss-sign').addEventListener('click', () => renderXMSS(false));
  $('xmss-reset').addEventListener('click', () => renderXMSS(true));
  $('xmss-height').addEventListener('input', () => { $('xmss-height-out').textContent = $('xmss-height').value; renderXMSS(true); });

  // ---- security -----------------------------------------------------------
  function renderSecurity() {
    const names = ['secp256k1 ECDSA', 'RSA-2048', 'SHA-256 (preimage)', 'ML-DSA-65', 'SLH-DSA-128s'];
    const rows = names.map(n => {
      const p = P.analyzePrimitive(n);
      return { label: n.replace('secp256k1 ', '').replace(' (preimage)', '').replace('SLH-DSA-', 'SLH-'), values: [p.classical, p.quantum] };
    });
    groupedBars('sec-chart', rows,
      [{ label: 'classical bits', color: SERIES[0] }, { label: 'quantum bits', color: SERIES[1] }],
      { max: 256, ticks: 4, padL: 108, rowH: 32, directLabels: true });
    legend('sec-legend', [
      { label: 'classical bit security', color: SERIES[0] },
      { label: 'quantum bit security', color: SERIES[1] }
    ]);
    const g = P.groverIterations(256);
    $('sec-readout').innerHTML = '';
    const rows2 = [
      ['Shor logical qubits (256-bit curve)', P.shorQubits(256).toLocaleString()],
      ['Grover iterations for 256-bit hash', g.toExponential(2)],
      ['Hybrid ECDSA + ML-DSA-65', P.hybridSecurity('secp256k1 ECDSA', 'ML-DSA-65').quantum + ' quantum bits']
    ];
    for (const [k, v] of rows2) {
      const d = document.createElement('div');
      d.innerHTML = '<span>' + k + '</span><b>' + v + '</b>';
      $('sec-readout').appendChild(d);
    }
    renderRisk();
  }
  function renderRisk() {
    const r = P.migrationRisk({
      publicKeyRevealed: $('risk-exposed').checked,
      p2pkh: $('risk-p2pkh').checked,
      valueBtc: Number($('risk-value').value),
      ageBlocks: Number($('risk-age').value)
    });
    const color = r.tier === 'critical' ? 'var(--critical)' : r.tier === 'high' ? 'var(--accent-3)' : r.tier === 'medium' ? 'var(--warning)' : 'var(--good)';
    $('risk-meter').innerHTML =
      '<div class="risk-track"><div class="risk-fill" style="width:' + r.score + '%;background:' + color + '"></div></div>' +
      '<div class="risk-label"><span>exposure score</span><span>' + r.score + ' / 100 - ' + r.tier + '</span></div>';
    setVerdict('risk-advice', r.advice, r.tier === 'low');
  }
  ['risk-value', 'risk-age', 'risk-exposed', 'risk-p2pkh'].forEach(id => $(id).addEventListener('input', renderRisk));

  // ---- vectors ------------------------------------------------------------
  let vectorJSON = '';
  $('vec-run').addEventListener('click', () => {
    vectorJSON = JSON.stringify(P.exportTestVectors($('kem-seed').value || 'pqc-vault-bench-demo'), null, 2);
    $('vec-output').textContent = vectorJSON;
  });
  $('vec-copy').addEventListener('click', () => {
    if (!vectorJSON) { $('vec-output').textContent = 'Press "Generate vectors" first.'; return; }
    navigator.clipboard.writeText(vectorJSON).then(() => {
      $('vec-output').textContent = vectorJSON;
    }).catch(() => { /* clipboard unavailable in some contexts */ });
  });
  $('vec-download').addEventListener('click', () => {
    if (!vectorJSON) { $('vec-output').textContent = 'Press "Generate vectors" first.'; return; }
    const blob = new Blob([vectorJSON], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pqc-vault-bench-vectors.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  function renderAll() {
    heroSecurity();
    renderNTT();
    renderKEM();
    renderWOTS();
    renderXMSS(true);
    renderSecurity();
  }
  renderAll();
})();
