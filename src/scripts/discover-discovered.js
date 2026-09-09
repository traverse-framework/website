/* Opt-in RUNTIME-DISCOVERED planning for /discover (Spec 1277, Phase 1).
 *
 * This is the real thing the page was always aiming at, minus execution: the
 * browser fetches the live registry catalog, builds a digest-verified snapshot,
 * prepares the exact WASM + contracts it needs, and runs
 * `traverse-embedder-web`'s deterministic **browser-local planner** to derive a
 * workflow proposal from a stated goal -- structurally, with no name / namespace
 * / natural-language / model inference. The proposal is shown for review with
 * every mapping marked unconfirmed. Nothing is executed here.
 *
 * Composed execution is Phase 2, blocked on registry#418 (no published
 * capability is yet classified `pure_read` / `deterministic`, which
 * `executeBrowserComposedWorkflow` requires). Until then this path plans and
 * reviews only, and says so.
 */

const CATALOG_URL = 'https://registry.traverse-framework.com/catalog.json';
const REGISTRY_BASE = 'https://registry.traverse-framework.com';
const CONTRACT_SCHEMA_VERSION = '1.0.0';

/* Committed goal: a structured Spec-113 target + starting facts. No natural
   language -- the target is an exact capability identity. The candidates are
   the pure_read / deterministic (`is_automatic_eligible`) @1.1.0 releases;
   the planner and the composed-execution handoff both require that class. */
const GOAL = Object.freeze({
  target: { capability_id: 'uncertainty.score', capability_version: '1.1.0' },
  candidate_refs: [
    { namespace: 'period', id: 'period.finalize', versionRange: '1.1.0' },
    { namespace: 'summary', id: 'summary.aggregate', versionRange: '1.1.0' },
    { namespace: 'uncertainty', id: 'uncertainty.score', versionRange: '1.1.0' },
  ],
  starting_facts: {
    coverage_state: 'partial',
    included_reference_ids: ['obs-2', 'obs-1'],
    pending_reference_ids: ['unk-1'],
    period_key: '2026-08-17',
    scope_id: 'golden-bc',
    watermark: 'capture-watermark-001',
    policy: { version: 'policy-1' },
  },
});

const FAIL = {
  transport: { badge: 'Discovered: unavailable', line: '✗ discovered mode unavailable — the governed browser planner did not load. Simulation is still available.' },
  registry: { badge: 'Discovered: unavailable', line: '✗ discovered mode unavailable — could not retrieve the live registry catalog or a verified artifact (%s). Nothing here is faked.' },
  snapshot: { badge: 'Discovered: failed (snapshot)', line: '✗ discovered mode halted — the registry snapshot could not be verified (%s). Refusing to plan over unverified metadata.' },
  plan: { badge: 'Discovered: failed (plan)', line: '✗ discovered mode halted — the planner rejected the inputs (%s).' },
  empty: { badge: 'Discovered: no candidate', line: '✗ no structural candidate — the planner found no capability chain from the stated goal and facts. This is a real "no plan" outcome, not an error.' },
  exec_identity: { badge: 'Discovered: failed (identity)', line: '✗ execution halted — a reviewed node no longer matches the verified snapshot or prepared artifact (%s). Refusing to run drifted content.' },
  exec_authorization: { badge: 'Discovered: failed (authorization)', line: '✗ execution halted — the local runtime declined to authorize a node (%s). This is a real governance decision, not an error.' },
  exec_invalid: { badge: 'Discovered: failed (invalid)', line: '✗ execution halted — the reviewed proposal failed structural validation (%s).' },
  exec_failed: { badge: 'Discovered: run failed', line: '✗ a node returned an error during real execution (%s). Later nodes were not started. Not reporting this as a success.' },
};

/* BrowserPlanError codes -> which fail bucket. */
function classifyPlanError(code) {
  if (/snapshot/.test(code)) return 'snapshot';
  return 'plan';
}

/* ComposedWorkflowError codes -> which fail bucket. */
function classifyExecError(code) {
  if (code === 'composed_workflow_approval_required') return 'exec_authorization';
  if (code === 'composed_workflow_proposal_invalid') return 'exec_invalid';
  if (/snapshot|missing_capability|evidence_mismatch|digest_drift|contract_invalid|registry_rejected/.test(code)) return 'exec_identity';
  return 'exec_failed';
}

/* Set between the plan click and the execute click. */
let pending = null;

function el(id) { return document.getElementById(id); }
function setBadge(text, state) { const b = el('discover-disc-badge'); if (b) { b.textContent = text; b.dataset.state = state; } }
function line(text, cls) {
  const log = el('discover-disc-log');
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
  const failed = kind === 'snapshot' || kind === 'plan';
  setBadge(f.badge, failed ? 'failed' : (kind === 'empty' ? 'failed' : 'unavailable'));
  line(text, 'err');
  const panel = el('discover-disc-result');
  if (panel) panel.dataset.outcome = 'failed';
}

/* Canonical JSON + sha-256, matching browserLocalPlan's internal stable()/digest(). */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
async function sha256Hex(text) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Build a SyncedPublicRegistryState from the live catalog. releaseTag is a
   self-consistent label (the registry publishes no release marker); the real
   verification is the per-artifact digest check in prepareRegistryDependency. */
export async function buildSnapshot(catalog) {
  const seen = new Set();
  const capabilities = [];
  for (const e of catalog.capabilities || []) {
    if (e.deprecated) continue;
    const c = e.contract;
    const key = c.namespace + '/' + c.id + '@' + c.version;
    if (seen.has(key)) continue;
    seen.add(key);
    capabilities.push({
      namespace: c.namespace,
      id: c.id,
      version: c.version,
      digest: c.artifact.digest,
      artifactUrl: c.artifact.url,
      contractUrl: e.contract_url,
      contractDigest: e.contract_digest,
      deprecated: false,
    });
  }
  const releaseTag = 'catalog-' + (await sha256Hex(String(capabilities.length))).slice(0, 16);
  return { releaseTag, capabilities };
}

/* The identity browserLocalPlan checks: source_release must equal
   snapshot.releaseTag, and registry_snapshot_digest must equal its own
   canonical sha-256 of the snapshot. */
export async function snapshotIdentity(snapshot) {
  return {
    registry_snapshot_digest: 'sha256:' + await sha256Hex(stable(snapshot)),
    source_release: snapshot.releaseTag,
    contract_schema_version: CONTRACT_SCHEMA_VERSION,
  };
}

/* Fetcher: the catalog's artifact URLs point at GitHub Releases (no CORS);
   the registry mirrors the same bytes CORS-open at /artifacts/<x>/<file>. */
const artifactFetcher = {
  async fetch(url) {
    let u = url;
    const m = url.match(/\/artifacts\/([^/]+)\/([^/]+)$/);
    if (m && url.startsWith('https://github.com/')) u = REGISTRY_BASE + '/artifacts/' + m[1] + '/' + m[2];
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + u);
    return new Uint8Array(await r.arrayBuffer());
  },
};

function renderProposal(proposal, truncated) {
  const panel = el('discover-disc-result');
  if (panel) panel.dataset.outcome = 'ok';
  setBadge('Discovered: planned (review only)', 'ok');

  const idEl = el('discover-disc-target');
  if (idEl) idEl.textContent = GOAL.target.capability_id + '@' + GOAL.target.capability_version;

  const chainEl = el('discover-disc-chain');
  if (chainEl) {
    chainEl.innerHTML = proposal.proposal.nodes.map((n, i) =>
      '<li><span class="discover-disc-step">' + (i + 1) + '</span><code>' + n.capability_id + '@' + n.capability_version +
      '</code><span class="discover-disc-digest">' + n.artifact_digest.slice(0, 19) + '…</span></li>').join('');
  }

  const mapEl = el('discover-disc-mappings');
  if (mapEl) {
    mapEl.innerHTML = proposal.proposal.mappings.map((m) =>
      '<li><code>' + (m.from_node_id || 'starting_facts') + '.' + m.from_field + '</code> → <code>' +
      m.to_node_id + '.' + m.to_field + '</code> <span class="badge">' +
      (m.source === 'starting_facts' ? 'from facts' : 'from output') + '</span> <span class="badge discover-disc-unconfirmed">mapping_unconfirmed</span></li>').join('');
  }

  const noteEl = el('discover-disc-note');
  if (noteEl) {
    noteEl.textContent = (truncated ? 'Candidate search hit the plan bound; showing the first proposal. ' : '') +
      'Every mapping is unconfirmed. Executing clears them for this run and hands the reviewed proposal to the local ' +
      'governed runtime — it runs only exact, prepared, digest-verified pure_read components, offline, and fails closed.';
  }

  const execBtn = el('discover-disc-exec');
  if (execBtn) execBtn.hidden = false;

  line('✓ proposal derived structurally: ' + proposal.proposal.nodes.map((n) => n.capability_id).join(' → ') + ' — review, then execute', 'ok');
}

function renderTrace(trace) {
  const panel = el('discover-disc-result');
  if (panel) panel.dataset.outcome = trace.terminal_state === 'succeeded' ? 'executed' : 'failed';
  setBadge(trace.terminal_state === 'succeeded' ? 'Discovered: executed' : 'Discovered: run failed', trace.terminal_state === 'succeeded' ? 'ok' : 'failed');

  const traceEl = el('discover-disc-trace');
  if (traceEl) {
    traceEl.innerHTML =
      '<div class="discover-disc-sub-h">Redacted per-node trace · terminal: ' + trace.terminal_state + '</div>' +
      '<ol class="discover-disc-chain">' + trace.node_outcomes.map((o) =>
        '<li data-state="' + (o.status === 'succeeded' ? 'complete' : (o.status === 'failed' ? 'failed' : 'idle')) + '">' +
        '<code>' + o.capability_id + '@' + o.capability_version + '</code> — ' + o.status +
        (o.failure_class ? ' (' + o.failure_class + ')' : '') + '</li>').join('') + '</ol>' +
      '<p class="discover-real-quote-note">Governed execution returns only per-node status + failure class — no raw inputs, outputs, or payload bytes (Spec 1277 FR-007).</p>';
  }
  line(trace.terminal_state === 'succeeded'
    ? '✓ real composed run complete — ' + trace.node_outcomes.map((o) => o.capability_id).join(' → ') + ' executed offline in your browser'
    : '✗ real composed run failed at ' + (trace.node_outcomes.find((o) => o.status === 'failed') || {}).capability_id,
    trace.terminal_state === 'succeeded' ? 'ok' : 'err');
}

async function runExecute(btn) {
  if (!pending) return;
  btn.disabled = true;
  setBadge('Discovered: executing…', 'running');
  line('$ confirm mappings & hand the reviewed proposal to executeBrowserComposedWorkflow (offline, governed)', 'cmd');

  const reviewed = { ...pending.proposal, mapping_unconfirmed: false };
  try {
    const trace = await pending.exec(reviewed, pending.store, pending.snapshot);
    renderTrace(trace);
  } catch (err) {
    const code = err && err.code ? err.code : String(err && err.name || 'error');
    fail(classifyExecError(code), (code + (err && err.node_id ? ' @ ' + err.node_id : '')).slice(0, 80));
    console.error('[discover-discovered] execution refused', err);
  }
  btn.disabled = true; // one run per plan
}

async function runDiscovered(btn) {
  btn.disabled = true;
  const panel = el('discover-disc-result');
  if (panel) { panel.hidden = false; panel.dataset.outcome = 'running'; }
  const log = el('discover-disc-log');
  if (log) log.innerHTML = '';
  setBadge('Discovered: running…', 'running');

  line('$ load governed browser planner (traverse-embedder-web)', 'cmd');
  let mod;
  try {
    mod = await import('traverse-embedder-web');
  } catch (err) {
    fail('transport');
    console.error('[discover-discovered] embedder import failed', err);
    btn.disabled = false;
    return;
  }
  const { MemoryRegistryCacheStore, prepareRegistryDependency, resolveRegistryDependencyOffline, browserLocalPlan, BrowserPlanError, executeBrowserComposedWorkflow } = mod;
  pending = null;
  const execBtn = el('discover-disc-exec');
  if (execBtn) { execBtn.hidden = true; execBtn.disabled = false; }
  const traceEl = el('discover-disc-trace');
  if (traceEl) traceEl.innerHTML = '';

  line('$ fetch ' + CATALOG_URL, 'cmd');
  let catalog;
  try {
    const r = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    catalog = await r.json();
  } catch (err) {
    fail('registry', String(err.message || err).slice(0, 80));
    btn.disabled = false;
    return;
  }

  const snapshot = await buildSnapshot(catalog);
  const identity = await snapshotIdentity(snapshot);
  line('✓ snapshot: ' + snapshot.capabilities.length + ' active capabilities · digest ' + identity.registry_snapshot_digest.slice(0, 23) + '…', 'ok');

  line('$ prepare + digest-verify the candidate artifacts', 'cmd');
  const store = new MemoryRegistryCacheStore();
  const deps = [];
  for (const ref of GOAL.candidate_refs) {
    try {
      await prepareRegistryDependency(store, snapshot, ref, artifactFetcher);
      deps.push(await resolveRegistryDependencyOffline(store, ref));
      line('  ✓ ' + ref.id + '@' + ref.versionRange, 'ok');
    } catch (err) {
      fail('registry', ref.id + ': ' + String(err.code || err.message || err).slice(0, 60));
      btn.disabled = false;
      return;
    }
  }

  line('$ browserLocalPlan — deterministic, structural, no name/NL/model inference', 'cmd');
  let res;
  try {
    res = await browserLocalPlan(
      identity, snapshot, deps, GOAL.target,
      GOAL.starting_facts, 'local-default',
      { app_id: 'discover-discovered', version: '1.0.0', schema_version: '1.0.0' },
    );
  } catch (err) {
    const code = err instanceof BrowserPlanError ? err.code : String(err && err.name || 'error');
    fail(classifyPlanError(code), code);
    console.error('[discover-discovered] plan rejected', err);
    btn.disabled = false;
    return;
  }

  if (!res.proposals.length) {
    fail('empty');
    btn.disabled = false;
    return;
  }
  pending = { store, snapshot, proposal: res.proposals[0], exec: executeBrowserComposedWorkflow };
  renderProposal(res.proposals[0], res.plan_search_truncated);
  btn.disabled = false;
}

let wired = false;
export function initDiscoverDiscovered() {
  if (wired) return;
  const btn = el('discover-disc-run');
  if (!btn) return;
  wired = true;
  btn.addEventListener('click', () => {
    runDiscovered(btn).catch((err) => {
      console.error('[discover-discovered] unexpected', err);
      fail('transport');
      btn.disabled = false;
    });
  });
  const execBtn = el('discover-disc-exec');
  if (execBtn) {
    execBtn.addEventListener('click', () => {
      runExecute(execBtn).catch((err) => {
        console.error('[discover-discovered] unexpected (exec)', err);
        fail('exec_failed', 'unexpected');
      });
    });
  }
}
