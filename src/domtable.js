/*
 * Accessible data-table renderer.
 *
 * Rebuilds only the thead and tbody of a table on every render so an
 * existing <caption> node stays intact in the DOM. Zero dependencies. UMD.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory();
  if (isNode) module.exports = api;
  else root.PQCDomTable = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Replaces the thead and tbody of `table` while leaving every other
  // child, including the accessible <caption>, untouched.
  function renderDataTable(table, headers, rows) {
    if (!table) return;
    const head = '<thead><tr>' + headers.map(h => '<th scope="col">' + escHtml(h) + '</th>').join('') + '</tr></thead>';
    const body = '<tbody>' + rows.map(r => '<tr>' + r.map(v =>
      '<td' + (typeof v === 'number' ? ' class="num"' : '') + '>' + escHtml(v) + '</td>').join('') + '</tr>').join('') + '</tbody>';
    const caption = table.querySelector('caption');
    for (const child of Array.from(table.children)) {
      if (child !== caption) child.remove();
    }
    table.insertAdjacentHTML('beforeend', head + body);
  }

  return { escHtml, renderDataTable };
}));
