/* Opt-in REAL multi-capability pipeline for /discover.
 *
 * Sibling of discover-real.js. Where that runs ONE pinned capability, this runs
 * a pinned THREE-capability linear pipeline
 *   period.finalize -> summary.aggregate -> uncertainty.score
 * as one governed `direct`-triggered workflow, executed client-side via
 * traverse-embedder-web's BundleEmbedder -- real published WASM, one execution
 * event per node, no sidecar, no network execution, no LLM.
 *
 * The capabilities and their order are AUTHORED in the committed bundle
 * (public/bundles/discover-real-pipeline/), not discovered or selected at
 * runtime. Runtime discovery + capability selection is tracked upstream
 * (traverse#1150, registry contract-verification issue) and is NOT delivered
 * here -- this only proves real multi-capability governed execution + traces.
 */

const MANIFEST_PATH = '/bundles/discover-real-pipeline/app.manifest.json';
const WORKFLOW_TARGET = 'discover-real-pipeline.coverage';
const RESULT_TIMEOUT_MS = 15000;

/* nodeId -> { capability, pinnedDigest }. Digests are re-checked against
   releaseEvidence() before the run is allowed to report success. */
const NODES = [
  { nodeId: 'period_finalize', capability: 'period/period.finalize@1.0.0', digest: 'sha256:01cb26718120619bed0f2a1c486c1e153e97bd0cdf7810351084cac47359649c', projects: 'period' },
  { nodeId: 'summary_aggregate', capability: 'summary/summary.aggregate@1.0.0', digest: 'sha256:0464da7ebe4784a3b24717b08d26c168b5e901f4d8d5b6efc9693c3323d1d5dd', projects: 'summary' },
  { nodeId: 'uncertainty_score', capability: 'uncertainty/uncertainty.score@1.0.0', digest: 'sha256:f218262588e8889eaacf371fc9df17454be40f901f88f379514fcc27365b1a9b', projects: 'uncertainty' },
];

/* period.finalize's own published use_cases[0].input_example + a shared policy.
   Mirrors public/bundles/discover-real-pipeline/input.fixture.json. */
const FIXTURE_INPUT = Object.freeze({
  coverage_state: 'partial',
  included_reference_ids: ['obs-2', 'obs-1'],
  pending_reference_ids: ['unk-1'],
  period_key: '2026-08-17',
  scope_id: 'golden-bc',
  watermark: 'capture-watermark-001',
  policy: { version: 'policy-1' },
});

/* Same fail-closed copy as discover-real.js -- asserted verbatim by
   tests/discover-truthfulness.test.mjs. */
const FAIL = {
  transport: { badge: 'Real: unavailable', line: '✗ real mode unavailable — the governed browser execution host did not load. Simulation is still available.' },
  registry: { badge: 'Real: unavailable', line: '✗ real mode unavailable — could not retrieve the verified registry artifact (%s). Nothing here is faked.' },
  identity: { badge: 'Real: failed (identity)', line: '✗ real mode halted — artifact identity did not match the pinned value. Refusing to run an unverified binary.' },
  validation: { badge: 'Real: failed (validation)', line: '✗ real mode halted — the governed host rejected this input against the published contract (%s).' },
  authorization: { badge: 'Real: failed (authorization)', line: '✗ real mode halted — the runtime declined to authorize this invocation (%s). This is a real governance decision, not an error.' },
  receipt: { badge: 'Real: failed (no receipt)', line: '✗ real mode halted — execution did not return a verifiable receipt. Not reporting this as a success.' },
};
const VALIDATION_CODES = /schema|contract|invalid_input|deserial|validation|malformed/i;
const AUTHORIZATION_CODES = /authoriz|permission|policy|placement|risk|resource|denied|forbidden/i;

function el(id) { return document.getElementById(id); }

function setBadge(text, state) {
  const b = el('discover-pipeline-badge');
  if (b) { b.textContent = text; b.dataset.state = state; }
}

function line(text, cls) {
  const log = el('discover-pipeline-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'discover-real-log-line' + (cls ? ' ' + cls : '');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function setNodeState(nodeId, state) {
  const row = el('discover-pipeline-node-' + nodeId);
  if (row) row.dataset.state = state; // idle | running | complete
}

function fail(kind, detail) {
  const f = FAIL[kind];
  const text = detail ? f.line.replace('%s', detail) : f.line.replace(' (%s)', '');
  const failedBucket = kind === 'identity' || kind === 'validation' || kind === 'authorization' || kind === 'receipt';
  setBadge(f.badge, failedBucket ? 'failed' : 'unavailable');
  line(text, 'err');
  const panel = el('discover-pipeline-result');
  if (panel) panel.dataset.outcome = 'failed';
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function runPipeline(btn) {
  btn.disabled = true;
  const panel = el('discover-pipeline-result');
  if (panel) { panel.hidden = false; panel.dataset.outcome = 'running'; }
  const log = el('discover-pipeline-log');
  if (log) log.innerHTML = '';
  NODES.forEach((n) => setNodeState(n.nodeId, 'idle'));
  setBadge('Real: running…', 'running');
  line('$ load governed browser execution host (traverse-embedder-web)', 'cmd');

  let mod;
  try {
    mod = await import('traverse-embedder-web');
  } catch (err) {
    fail('transport');
    console.error('[discover-pipeline] embedder import failed', err);
    btn.disabled = false;
    return;
  }
  const { BundleEmbedder, FetchBundleLoader } = mod;

  line('$ init BundleEmbedder — fetch + digest-verify + host-ABI-validate ' + MANIFEST_PATH, 'cmd');
  let embedder;
  try {
    embedder = await BundleEmbedder.init({ manifestPath: MANIFEST_PATH, loader: new FetchBundleLoader(), platform: 'web' });
  } catch (err) {
    const ee = err && err.embedderError ? err.embedderError : null;
    const emsg = String((ee && ee.message) || (err && err.message) || err || '');
    if (/digest mismatch|artifact identity|invalid digest metadata/i.test(emsg)) fail('identity');
    else if (err instanceof TypeError || /failed to fetch|HTTP [45]\d\d|networkerror|load failed/i.test(emsg)) fail('registry', emsg.slice(0, 90));
    else fail('transport');
    console.error('[discover-pipeline] init rejected', err);
    btn.disabled = false;
    return;
  }

  // Re-check every bundled component digest against its pinned value.
  const evidence = embedder.releaseEvidence();
  const shown = new Map((evidence?.bundle?.wasm_components || []).map((c) => [c.capability_id, c.wasm_digest]));
  for (const n of NODES) {
    const capId = n.capability.split('/')[1].split('@')[0];
    if (shown.get(capId) !== n.digest) {
      fail('identity');
      line('  ' + n.capability + ': expected ' + n.digest, 'err');
      line('  ' + n.capability + ': got      ' + (shown.get(capId) || '(none)'), 'err');
      try { embedder.shutdown(); } catch (e) { void e; }
      btn.disabled = false;
      return;
    }
  }
  line('✓ all three artifact digests verified against the pinned values', 'ok');

  const events = [];
  embedder.subscribe((ev) => {
    events.push(ev);
    if (ev.event_type === 'capability_invoked' && ev.data && ev.data.node_id) {
      setNodeState(ev.data.node_id, ev.data.status === 'completed' ? 'complete' : 'running');
      line('→ node ' + (ev.data.step_index + 1) + '/3  ' + ev.data.node_id + ' (' + ev.data.capability_id + ')  ' + ev.data.status, 'ok');
    }
  });

  line('$ submit ' + WORKFLOW_TARGET + ' — period.finalize → summary.aggregate → uncertainty.score', 'cmd');
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
    result = events.find((e) => e.event_type === 'capability_result' && e.data && e.data.workflow_id);
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

  NODES.forEach((n) => setNodeState(n.nodeId, 'complete'));
  const output = (result.data && result.data.output) || {};
  const outputHash = await sha256Hex(JSON.stringify(output));

  if (panel) panel.dataset.outcome = 'ok';
  setBadge('Real: executed (3 capabilities)', 'ok');

  const idEl = el('discover-pipeline-identity');
  if (idEl) idEl.textContent = NODES.map((n) => n.capability).join('  →  ');
  const outcomeEl = el('discover-pipeline-outcome');
  if (outcomeEl) outcomeEl.textContent = result.data.status || '(unknown)';
  const hashEl = el('discover-pipeline-output-hash');
  if (hashEl) hashEl.textContent = 'sha256:' + outputHash;

  const outEl = el('discover-pipeline-outputs');
  if (outEl) {
    outEl.innerHTML = NODES.map((n) => {
      const block = output[n.projects];
      return '<div class="discover-pipeline-out"><div class="discover-pipeline-out-cap">' + n.capability +
        '</div><pre>' + JSON.stringify(block, null, 2) + '</pre></div>';
    }).join('');
  }

  let trace = null;
  try {
    const page = embedder.traceList('1.0.0', 1);
    const tid = page && page.summaries && page.summaries[0] && page.summaries[0].traceId;
    if (tid) {
      const detail = embedder.traceGet('1.0.0', tid);
      if (detail && detail.summary) trace = detail;
    }
  } catch (e) { void e; }
  const traceEl = el('discover-pipeline-trace');
  if (traceEl && trace) traceEl.textContent = JSON.stringify(trace, null, 2);

  line('✓ pipeline complete — 3 published capabilities executed in order in your browser; each node’s output above', 'ok');
  try { embedder.shutdown(); } catch (e) { void e; }
  btn.disabled = false;
}

let wired = false;
export function initDiscoverRealPipeline() {
  if (wired) return;
  const btn = el('discover-pipeline-run');
  if (!btn) return;
  wired = true;
  btn.addEventListener('click', () => { runPipeline(btn).catch((err) => {
    console.error('[discover-pipeline] unexpected', err);
    fail('transport');
    btn.disabled = false;
  }); });
}
