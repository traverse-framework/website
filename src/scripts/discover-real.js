/* Opt-in REAL execution for /discover.
 *
 * This is the only part of /discover that actually runs a governed Traverse
 * capability. It is separate from public/assets/js/discover.js (the Live +
 * Derived + Simulated code), loads only when the visitor clicks the button,
 * and executes ONE pinned, verified capability client-side via
 * traverse-embedder-web's BundleEmbedder -- no sidecar, no network execution,
 * no MCP loop, no LLM. The composed pipeline shown in the graph above stays
 * Derived + Simulated; nothing here makes it real.
 *
 * Bundle: /bundles/discover-real/  (see its PROVENANCE.md)
 * Capability: core/core.calculate-price@1.1.0
 */

const PINNED_WASM_DIGEST =
  'sha256:a046e5d001ae78b8de339d40378e2c22f04384d601a1b801b52cf99a3e44f0b2';
const CAPABILITY_REF = 'core/core.calculate-price@1.1.0';
const MANIFEST_PATH = '/bundles/discover-real/app.manifest.json';
const WORKFLOW_TARGET = 'discover-real.calculate-price';
const RESULT_TIMEOUT_MS = 12000;

/* The capability's own published use_cases[0].input_example -- a frozen copy of
   /bundles/discover-real/input.fixture.json. Both must stay in sync; the pinned
   bundle digest is guarded by tests/discover-bundle.test.mjs. */
const FIXTURE_INPUT = Object.freeze({
  currency: 'USD',
  lines: [
    { id: 'line-1', sku: 'SKU-100', quantity: 2, unit_price: 50, tax_code: 'STANDARD' },
  ],
  customer: { id: 'cust-42', attributes: { segment: 'retail' } },
  context: {},
  pricing_config: {
    version: '1.0',
    currency: 'USD',
    rounding: 'half_up',
    decimal_places: 2,
    discount_rules: [
      { id: 'summer-10', priority: 100, type: 'percentage', value: 10, stackable: false, applies_to: ['SKU-100'] },
    ],
    tax_rules: [
      { id: 'us-standard', tax_code: 'STANDARD', rate: 0.08, inclusive: false },
    ],
  },
});

/* Fail-closed states. Copy strings are asserted verbatim by
   tests/discover-truthfulness.test.mjs -- keep them in sync with the
   "Fail-closed UX copy" table on website#58. */
const FAIL = {
  transport: {
    badge: 'Real: unavailable',
    line: '✗ real mode unavailable — the governed browser execution host did not load. Simulation is still available.',
  },
  registry: {
    badge: 'Real: unavailable',
    line: '✗ real mode unavailable — could not retrieve the verified registry artifact (%s). Nothing here is faked.',
  },
  identity: {
    badge: 'Real: failed (identity)',
    line: '✗ real mode halted — artifact identity did not match the pinned value. Refusing to run an unverified binary.',
  },
  validation: {
    badge: 'Real: failed (validation)',
    line: '✗ real mode halted — the governed host rejected this input against the published contract (%s).',
  },
  authorization: {
    badge: 'Real: failed (authorization)',
    line: '✗ real mode halted — the runtime declined to authorize this invocation (%s). This is a real governance decision, not an error.',
  },
  receipt: {
    badge: 'Real: failed (no receipt)',
    line: '✗ real mode halted — execution did not return a verifiable receipt. Not reporting this as a success.',
  },
};

const VALIDATION_CODES = /schema|contract|invalid_input|deserial|validation|malformed/i;
const AUTHORIZATION_CODES = /authoriz|permission|policy|placement|risk|resource|denied|forbidden/i;

function el(id) { return document.getElementById(id); }

function setBadge(text, state) {
  const b = el('discover-real-badge');
  if (!b) return;
  b.textContent = text;
  b.dataset.state = state; // 'running' | 'ok' | 'failed' | 'unavailable'
}

function line(text, cls) {
  const log = el('discover-real-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'discover-real-log-line' + (cls ? ' ' + cls : '');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function fail(kind, detail) {
  const f = FAIL[kind];
  const text = detail ? f.line.replace('%s', detail) : f.line.replace(' (%s)', '');
  setBadge(f.badge, kind === 'identity' || kind.startsWith('valid') || kind === 'authorization' || kind === 'receipt' ? 'failed' : 'unavailable');
  line(text, 'err');
  const panel = el('discover-real-result');
  if (panel) panel.dataset.outcome = 'failed';
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function renderSuccess({ evidence, invoked, result, outputHash, trace }) {
  const panel = el('discover-real-result');
  if (panel) panel.dataset.outcome = 'ok';
  setBadge('Real: executed', 'ok');

  const identity = el('discover-real-identity');
  if (identity) identity.textContent = CAPABILITY_REF;

  const digestRow = el('discover-real-digest');
  const shown = evidence?.bundle?.wasm_components?.[0]?.wasm_digest || '(none)';
  const match = shown === PINNED_WASM_DIGEST;
  if (digestRow) {
    digestRow.textContent = shown + (match ? '  — verified match ✓' : '  — MISMATCH ✗');
    digestRow.dataset.match = String(match);
  }

  const val = el('discover-real-validation');
  if (val) val.textContent = (invoked?.status === 'completed' && result?.status === 'completed')
    ? 'passed — input and output validated against the published contract'
    : 'see trace';

  const outcome = el('discover-real-outcome');
  if (outcome) outcome.textContent = result?.status || '(unknown)';

  const hashEl = el('discover-real-output-hash');
  if (hashEl) hashEl.textContent = 'sha256:' + outputHash;

  const out = result?.output || {};
  const totals = out.totals || {};
  const quote = el('discover-real-quote');
  if (quote) {
    const fmt = (n) => (typeof n === 'number' ? n.toFixed(2) : n);
    quote.innerHTML =
      '<div class="discover-real-quote-total">' + (out.currency || '') + ' ' + fmt(totals.net) + '</div>' +
      '<dl class="discover-real-quote-lines">' +
      '<div><dt>gross</dt><dd>' + fmt(totals.gross) + '</dd></div>' +
      '<div><dt>discount</dt><dd>−' + fmt(totals.discount_total) + '</dd></div>' +
      '<div><dt>tax</dt><dd>+' + fmt(totals.tax_total) + '</dd></div>' +
      '<div><dt>net</dt><dd>' + fmt(totals.net) + '</dd></div>' +
      '</dl>' +
      '<p class="discover-real-quote-note">Result of the capability’s own documented example input above — not something you entered.</p>';
  }

  const traceEl = el('discover-real-trace');
  if (traceEl && trace) traceEl.textContent = JSON.stringify(trace, null, 2);

  line('✓ real run complete — ' + CAPABILITY_REF + ' executed in your browser; receipt above', 'ok');
}

async function runReal(btn) {
  btn.disabled = true;
  const panel = el('discover-real-result');
  if (panel) { panel.hidden = false; panel.dataset.outcome = 'running'; }
  const log = el('discover-real-log');
  if (log) log.innerHTML = '';
  setBadge('Real: running…', 'running');
  line('$ load governed browser execution host (traverse-embedder-web)', 'cmd');

  let mod;
  try {
    mod = await import('traverse-embedder-web');
  } catch (err) {
    fail('transport');
    console.error('[discover-real] embedder import failed', err);
    btn.disabled = false;
    return;
  }
  const { BundleEmbedder, FetchBundleLoader } = mod;

  line('$ init BundleEmbedder — fetch + digest-verify + host-ABI-validate ' + MANIFEST_PATH, 'cmd');
  let embedder;
  try {
    embedder = await BundleEmbedder.init({
      manifestPath: MANIFEST_PATH,
      loader: new FetchBundleLoader(),
      platform: 'web',
    });
  } catch (err) {
    // BundleEmbedder throws BundleRejectedError { embedderError: { code, message } };
    // FetchBundleLoader failures surface as "failed to fetch ... HTTP nnn" or a
    // raw TypeError. Classify into the fail-closed buckets -- never a success.
    const ee = err && err.embedderError ? err.embedderError : null;
    const emsg = String((ee && ee.message) || (err && err.message) || err || '');
    if (/digest mismatch|artifact identity|invalid digest metadata/i.test(emsg)) {
      fail('identity');
    } else if (err instanceof TypeError || /failed to fetch|HTTP [45]\d\d|networkerror|load failed/i.test(emsg)) {
      fail('registry', emsg.slice(0, 90));
    } else {
      // schema / host-ABI / other bundle rejection -- still fail closed
      fail('transport');
    }
    console.error('[discover-real] init rejected', err);
    btn.disabled = false;
    return;
  }

  const evidence = embedder.releaseEvidence();
  const shownDigest = evidence?.bundle?.wasm_components?.[0]?.wasm_digest;
  if (shownDigest !== PINNED_WASM_DIGEST) {
    fail('identity');
    line('  expected ' + PINNED_WASM_DIGEST, 'err');
    line('  got      ' + (shownDigest || '(none)'), 'err');
    try { embedder.shutdown(); } catch (e) { void e; }
    btn.disabled = false;
    return;
  }
  line('✓ artifact digest verified: ' + PINNED_WASM_DIGEST, 'ok');

  const events = [];
  embedder.subscribe((ev) => events.push(ev));

  line('$ submit ' + WORKFLOW_TARGET + ' (the capability’s own published example input)', 'cmd');
  let outcome;
  try {
    outcome = embedder.submit(WORKFLOW_TARGET, structuredClone(FIXTURE_INPUT));
  } catch (err) {
    fail('validation', String(err && err.message || 'submit rejected').slice(0, 80));
    try { embedder.shutdown(); } catch (e) { void e; }
    btn.disabled = false;
    return;
  }
  if (!outcome || outcome.status !== 'accepted') {
    fail('validation', outcome && outcome.error ? String(outcome.error) : 'not accepted');
    try { embedder.shutdown(); } catch (e) { void e; }
    btn.disabled = false;
    return;
  }

  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  let result = null;
  let errorEvent = null;
  while (Date.now() < deadline) {
    result = events.find((e) => e.event_type === 'capability_result');
    errorEvent = events.find((e) => e.event_type === 'error');
    if (result || errorEvent) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  if (errorEvent && !result) {
    const code = String(errorEvent.data && (errorEvent.data.code || errorEvent.data.error_code || errorEvent.data.reason) || 'error');
    if (AUTHORIZATION_CODES.test(code)) fail('authorization', code);
    else if (VALIDATION_CODES.test(code)) fail('validation', code);
    else fail('receipt');
    try { embedder.shutdown(); } catch (e) { void e; }
    btn.disabled = false;
    return;
  }
  if (!result) {
    fail('receipt');
    try { embedder.shutdown(); } catch (e) { void e; }
    btn.disabled = false;
    return;
  }

  const invoked = events.find((e) => e.event_type === 'capability_invoked');
  const output = result.data && result.data.output ? result.data.output : {};
  const outputHash = await sha256Hex(JSON.stringify(output));

  let trace = null;
  try {
    const page = embedder.traceList('1.0.0', 1);
    const id = page && page.summaries && page.summaries[0] && page.summaries[0].traceId;
    if (id) {
      const detail = embedder.traceGet('1.0.0', id);
      if (detail && detail.summary) trace = detail;
    }
  } catch (e) { void e; }

  renderSuccess({ evidence, invoked: invoked && invoked.data, result: result.data, outputHash, trace });
  try { embedder.shutdown(); } catch (e) { void e; }
  btn.disabled = false;
}

let wired = false;
export function initDiscoverReal() {
  if (wired) return;
  const btn = el('discover-real-run');
  if (!btn) return;
  wired = true;
  btn.addEventListener('click', () => { runReal(btn).catch((err) => {
    console.error('[discover-real] unexpected', err);
    fail('transport');
    btn.disabled = false;
  }); });
}
