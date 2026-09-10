/* /discover — one flow: pick a goal, discover it from the live Traverse
 * registry, plan it deterministically, review it, execute it for real.
 *
 *   goal -> fetch catalog -> digest-verified snapshot -> browserLocalPlan
 *        -> review gate (clear mapping_unconfirmed) -> executeBrowserComposedWorkflow
 *        -> redacted per-node trace
 *
 * The planner is structural only (Spec 1277): candidates come from Spec-113
 * schema-shape and declared-event relationships, never from capability names,
 * namespaces, natural language, or a model. The browser is an untrusted
 * proposer; the local governed runtime authorizes and executes. No backend.
 */

import { renderPlanGraph, setGraphPhase, resetGraph } from './discover-graph.js';

const CATALOG_URL = 'https://registry.traverse-framework.com/catalog.json';
const REGISTRY_BASE = 'https://registry.traverse-framework.com';
const CONTRACT_SCHEMA_VERSION = '1.0.0';

/* Three committed goals — a structured Spec-113 target + starting facts each.
   No natural language: the target is an exact capability identity. */
const GOALS = [
  {
    id: 'docapproval',
    label: 'Review a document for approval',
    blurb: 'From the document text alone the planner chains doc-approval.analyze (extract type, parties, amounts, a confidence) into doc-approval.recommend (approve or route, with a rationale).',
    kind: 'chain',
    target: { capability_id: 'doc-approval.recommend', capability_version: '1.4.0' },
    candidate_refs: [
      { namespace: 'doc-approval', id: 'doc-approval.analyze', versionRange: '1.4.0' },
      { namespace: 'doc-approval', id: 'doc-approval.recommend', versionRange: '1.4.0' },
    ],
    starting_facts: {
      document: 'INVOICE\nVendor: Acme Corp\nBill to: Globex Industries\nInvoice #: AC-20481\nTotal due: $4,200.00\nDue date: 2026-10-01\nTerms: Net 30',
    },
  },
  {
    id: 'price',
    label: 'Price a quote',
    blurb: 'One line item, two units at $50, a versioned pricing config with no discounts or tax — target core.calculate-price.',
    kind: 'single',
    target: { capability_id: 'core.calculate-price', capability_version: '1.2.0' },
    candidate_refs: [
      { namespace: 'core', id: 'core.calculate-price', versionRange: '1.2.0' },
    ],
    starting_facts: {
      currency: 'USD',
      lines: [{ id: 'line-1', sku: 'SKU-100', quantity: 2, unit_price: 50 }],
      pricing_config: {
        version: '1.0', currency: 'USD', rounding: 'half_up', decimal_places: 2,
        discount_rules: [], tax_rules: [],
      },
    },
  },
  {
    id: 'luhn',
    label: 'Check a card number',
    blurb: 'Does a 16-digit number pass the Luhn checksum? Facts: one number string — target validation.validate-luhn.',
    kind: 'single',
    target: { capability_id: 'validation.validate-luhn', capability_version: '1.2.0' },
    candidate_refs: [
      { namespace: 'validation', id: 'validation.validate-luhn', versionRange: '1.2.0' },
    ],
    starting_facts: { number: '4242424242424242' },
  },
];

/* Fail-closed copy. Asserted by tests/discover-truthfulness.test.mjs. */
const FAIL = {
  transport: '✗ the governed browser planner did not load. Nothing here is faked.',
  registry: '✗ could not retrieve the live registry catalog or a verified artifact (%s). Nothing here is faked.',
  snapshot: '✗ halted — the registry snapshot could not be verified (%s). Refusing to plan over unverified metadata.',
  plan: '✗ halted — the planner rejected the inputs (%s).',
  exec_identity: '✗ execution halted — a reviewed node no longer matches the verified snapshot or prepared artifact (%s). Refusing to run drifted content.',
  exec_authorization: '✗ execution halted — the local runtime declined to authorize a node (%s). This is a real governance decision, not an error.',
  exec_invalid: '✗ execution halted — the reviewed proposal failed structural validation (%s).',
  exec_failed: '✗ a node returned an error during real execution (%s). Later nodes were not started. Not reporting this as a success.',
};

function classifyExecError(code) {
  if (code === 'composed_workflow_approval_required') return 'exec_authorization';
  if (code === 'composed_workflow_proposal_invalid') return 'exec_invalid';
  if (/snapshot|missing_capability|evidence_mismatch|digest_drift|contract_invalid|registry_rejected/.test(code)) return 'exec_identity';
  return 'exec_failed';
}

function el(id) { return document.getElementById(id); }
function setBadge(text, s) { const b = el('discover-badge'); if (b) { b.textContent = text; b.dataset.state = s; } }
function logLine(text, cls) {
  const log = el('discover-log');
  if (!log) return;
  const d = document.createElement('div');
  d.className = 'discover-log-line' + (cls ? ' ' + cls : '');
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
function failLine(kind, detail) {
  const t = detail ? FAIL[kind].replace('%s', detail) : FAIL[kind].replace(' (%s)', '');
  logLine(t, 'err');
  setBadge('Halted — fail closed', 'failed');
  const p = el('discover-result');
  if (p) p.dataset.outcome = 'failed';
}

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
   self-consistent label; the real verification is the per-artifact digest
   check in prepareRegistryDependency. */
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
      namespace: c.namespace, id: c.id, version: c.version,
      digest: c.artifact.digest, artifactUrl: c.artifact.url,
      contractUrl: e.contract_url, contractDigest: e.contract_digest,
      deprecated: false,
    });
  }
  const releaseTag = 'catalog-' + (await sha256Hex(String(capabilities.length))).slice(0, 16);
  return { releaseTag, capabilities };
}
export async function snapshotIdentity(snapshot) {
  return {
    registry_snapshot_digest: 'sha256:' + await sha256Hex(stable(snapshot)),
    source_release: snapshot.releaseTag,
    contract_schema_version: CONTRACT_SCHEMA_VERSION,
  };
}

const artifactFetcher = {
  async fetch(url) {
    let u = url;
    const m = url.match(/\/artifacts\/([^/]+)\/([^/]+)$/);
    if (m && url.startsWith('https://github.com/')) u = REGISTRY_BASE + '/artifacts/' + m[1] + '/' + m[2];
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  },
};

let mod = null;
let snap = null; // { snapshot, identity, catalog }
let run = null;  // { goal, store, proposal }

async function ensureModule() {
  if (!mod) mod = await import('traverse-embedder-web');
  return mod;
}
async function ensureSnapshot() {
  if (snap) return snap;
  logLine('$ fetch ' + CATALOG_URL, 'cmd');
  const r = await fetch(CATALOG_URL, { cache: 'no-store' });
  if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { _kind: 'registry' });
  const catalog = await r.json();
  const snapshot = await buildSnapshot(catalog);
  const identity = await snapshotIdentity(snapshot);
  snap = { snapshot, identity, catalog };
  const c = catalog.capabilities || [];
  const nsCount = new Set(c.map((e) => e.contract.namespace)).size;
  const stats = el('discover-stats');
  if (stats) stats.textContent = c.length + ' published versions · '
    + new Set(c.filter((e) => !e.deprecated).map((e) => e.contract.namespace + '/' + e.contract.id)).size
    + ' capabilities · ' + nsCount + ' namespaces';
  logLine('✓ snapshot: ' + snapshot.capabilities.length + ' active capabilities · digest '
    + identity.registry_snapshot_digest.slice(0, 23) + '…', 'ok');
  return snap;
}

function markActiveCard(goalId) {
  document.querySelectorAll('.discover-goal').forEach((c) => {
    c.dataset.active = String(c.dataset.goal === goalId);
  });
}

async function renderProposal(goal, proposal) {
  const panel = el('discover-result');
  if (panel) { panel.hidden = false; panel.dataset.outcome = 'planned'; }
  el('discover-plan-target').textContent = goal.target.capability_id + '@' + goal.target.capability_version;

  const mapEl = el('discover-plan-mappings');
  mapEl.innerHTML = proposal.proposal.mappings.map((m) =>
    '<li><code>' + (m.from_node_id || 'facts') + '.' + m.from_field + '</code> → <code>'
    + m.to_node_id + '.' + m.to_field + '</code> <span class="badge">'
    + (m.source === 'starting_facts' ? 'from facts' : 'from output')
    + '</span> <span class="badge discover-unconfirmed">unconfirmed</span></li>').join('');

  await renderPlanGraph(el('discover-graph'), proposal);
  setGraphPhase('planned');

  el('discover-exec').hidden = false;
  el('discover-exec').disabled = false;
  el('discover-trace').innerHTML = '';
  setBadge('Planned — review the mappings', 'planned');
  logLine('✓ plan derived structurally: '
    + proposal.proposal.nodes.map((n) => n.capability_id).join(' → ') + ' — review, then execute', 'ok');
}

function renderNoPlan(goal) {
  const panel = el('discover-result');
  if (panel) { panel.hidden = false; panel.dataset.outcome = 'noplan'; }
  el('discover-plan-target').textContent = goal.target.capability_id + '@' + goal.target.capability_version;
  el('discover-plan-mappings').innerHTML =
    '<li class="discover-noplan">No structural candidate. The planner found no capability whose declared '
    + 'outputs can supply this target’s required inputs from the given facts. It does not guess from names — '
    + 'so it returns nothing. This is a real outcome, not an error.</li>';
  resetGraph(el('discover-graph'));
  el('discover-exec').hidden = true;
  el('discover-trace').innerHTML = '';
  setBadge('No plan — the goal has no structural path', 'noplan');
  logLine('✓ planner returned 0 candidates for this goal + facts', 'ok');
}

function renderTrace(trace, proposal) {
  const panel = el('discover-result');
  const ok = trace.terminal_state === 'succeeded';
  if (panel) panel.dataset.outcome = ok ? 'executed' : 'failed';
  setBadge(ok ? 'Executed — real, offline, governed' : 'Run failed at a node', ok ? 'executed' : 'failed');

  const cards = (proposal.proposal.nodes || []).map((n) => {
    const oc = trace.node_outcomes.find((o) => o.node_id === n.node_id) || {};
    return '<a class="discover-cap-card" href="' + REGISTRY_BASE + '/#/capability/'
      + encodeURIComponent(n.capability_id.split('.')[0] + '/' + n.capability_id + '@' + n.capability_version)
      + '" target="_blank" rel="noopener"><span class="discover-cap-id">' + n.capability_id + '@' + n.capability_version
      + '</span><span class="badge badge-' + (oc.status === 'succeeded' ? 'success' : 'err') + '">' + (oc.status || '—')
      + (oc.failure_class ? ' · ' + oc.failure_class : '') + '</span></a>';
  }).join('');

  el('discover-trace').innerHTML =
    '<div class="discover-sub-h">Redacted per-node trace · terminal: ' + trace.terminal_state + '</div>'
    + '<div class="discover-cap-cards">' + cards + '</div>'
    + '<p class="discover-note">Governed execution returns only per-node status and failure class — no raw '
    + 'inputs, outputs, or payload bytes (Spec 1277 FR-007). Each card links to the real published contract.</p>';

  logLine(ok
    ? '✓ real composed run complete — ' + trace.node_outcomes.map((o) => o.capability_id).join(' → ') + ' executed offline in your browser'
    : '✗ real composed run failed at ' + (trace.node_outcomes.find((o) => o.status === 'failed') || {}).capability_id,
    ok ? 'ok' : 'err');
}

async function doGoal(goal) {
  markActiveCard(goal.id);
  run = null;
  el('discover-log').innerHTML = '';
  el('discover-exec').hidden = true;
  setBadge('Discovering…', 'running');
  const panel = el('discover-result');
  if (panel) { panel.hidden = false; panel.dataset.outcome = 'running'; }

  let m;
  try { m = await ensureModule(); }
  catch (e) { failLine('transport'); console.error('[discover] embedder import', e); return; }
  const { MemoryRegistryCacheStore, prepareRegistryDependency, resolveRegistryDependencyOffline, browserLocalPlan, BrowserPlanError } = m;

  let s;
  try { s = await ensureSnapshot(); }
  catch (e) { failLine('registry', String(e.message || e).slice(0, 80)); return; }

  logLine('$ prepare + digest-verify the candidate artifacts', 'cmd');
  const store = new MemoryRegistryCacheStore();
  const deps = [];
  for (const ref of goal.candidate_refs) {
    try {
      await prepareRegistryDependency(store, s.snapshot, ref, artifactFetcher);
      deps.push(await resolveRegistryDependencyOffline(store, ref));
      logLine('  ✓ ' + ref.id + '@' + ref.versionRange, 'ok');
    } catch (e) {
      failLine('registry', ref.id + ': ' + String(e.code || e.message || e).slice(0, 60));
      return;
    }
  }

  logLine('$ browserLocalPlan — deterministic, structural, no name/NL/model inference', 'cmd');
  let res;
  try {
    res = await browserLocalPlan(
      s.identity, s.snapshot, deps, goal.target, goal.starting_facts,
      'local-default', { app_id: 'discover', version: '1.0.0', schema_version: '1.0.0' },
    );
  } catch (e) {
    const code = e instanceof BrowserPlanError ? e.code : String(e && e.name || 'error');
    failLine(/snapshot/.test(code) ? 'snapshot' : 'plan', code);
    console.error('[discover] plan rejected', e);
    return;
  }

  if (!res.proposals.length) { renderNoPlan(goal); return; }
  run = { goal, store, proposal: res.proposals[0] };
  await renderProposal(goal, res.proposals[0]);
}

async function doExecute() {
  if (!run) return;
  const btn = el('discover-exec');
  btn.disabled = true;
  setBadge('Confirming & executing…', 'running');
  logLine('$ confirm mappings → hand the reviewed proposal to executeBrowserComposedWorkflow (offline, governed)', 'cmd');
  setGraphPhase('reviewed');

  const { executeBrowserComposedWorkflow } = mod;
  const reviewed = { ...run.proposal, mapping_unconfirmed: false };
  let trace;
  try {
    trace = await executeBrowserComposedWorkflow(reviewed, run.store, snap.snapshot);
  } catch (e) {
    const code = e && e.code ? e.code : String(e && e.name || 'error');
    setGraphPhase('failed');
    failLine(classifyExecError(code), (code + (e && e.node_id ? ' @ ' + e.node_id : '')).slice(0, 80));
    console.error('[discover] execution refused', e);
    return;
  }

  // Staggered reveal of the real trace (the SDK returns it whole).
  for (let i = 0; i < trace.node_outcomes.length; i++) {
    const o = trace.node_outcomes[i];
    setGraphPhase(o.status === 'succeeded' ? 'succeeded' : (o.status === 'failed' ? 'failed' : 'reviewed'), o.node_id);
    await new Promise((r) => setTimeout(r, 320));
  }
  renderTrace(trace, run.proposal);
}

function buildGallery() {
  const wrap = el('discover-goals');
  if (!wrap) return;
  wrap.innerHTML = GOALS.map((g) =>
    '<button class="discover-goal card card-accent-hover" type="button" data-goal="' + g.id + '">'
    + '<span class="discover-goal-label">' + g.label + '</span>'
    + '<span class="discover-goal-blurb t-body-sm t-muted">' + g.blurb + '</span></button>').join('');
  wrap.querySelectorAll('.discover-goal').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = GOALS.find((x) => x.id === btn.dataset.goal);
      doGoal(g).catch((e) => { console.error('[discover]', e); failLine('transport'); });
    });
  });
}

export function initDiscover() {
  if (!el('discover-goals')) return;
  buildGallery();
  const exec = el('discover-exec');
  if (exec) exec.addEventListener('click', () => { doExecute().catch((e) => { console.error('[discover]', e); failLine('exec_failed', 'unexpected'); }); });
  // Auto-run the first goal to the review gate so the page is alive on arrival.
  doGoal(GOALS[0]).catch((e) => { console.error('[discover]', e); failLine('transport'); });
}
