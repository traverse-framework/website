import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MemoryRegistryCacheStore, prepareRegistryDependency, resolveRegistryDependencyOffline,
  browserLocalPlan, BrowserPlanError, executeBrowserComposedWorkflow,
} from 'traverse-embedder-web';
import { buildSnapshot, snapshotIdentity } from '../src/scripts/discover.js';

const root = new URL('..', import.meta.url);

/* An offline planning fixture built from the checked-in
   public/bundles/discover-real-pipeline/ artifacts (kept only for this). */
const fx = new URL('public/bundles/discover-real-pipeline/', root);
const sha = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

const FIXTURE_NODES = [
  { ns: 'period', id: 'period.finalize', wasm: 'finalize.wasm', contract: 'contract.period-finalize.json',
    digest: 'sha256:01cb26718120619bed0f2a1c486c1e153e97bd0cdf7810351084cac47359649c' },
  { ns: 'summary', id: 'summary.aggregate', wasm: 'aggregate.wasm', contract: 'contract.summary-aggregate.json',
    digest: 'sha256:0464da7ebe4784a3b24717b08d26c168b5e901f4d8d5b6efc9693c3323d1d5dd' },
  { ns: 'uncertainty', id: 'uncertainty.score', wasm: 'score.wasm', contract: 'contract.uncertainty-score.json',
    digest: 'sha256:f218262588e8889eaacf371fc9df17454be40f901f88f379514fcc27365b1a9b' },
];

test('the offline planning-fixture artifacts still match their pinned digests', async () => {
  for (const n of FIXTURE_NODES) {
    const bytes = new Uint8Array(await readFile(new URL(n.wasm, fx)));
    assert.equal(sha(bytes), n.digest, n.wasm + ' drifted from its pin');
  }
});

async function planningFixture() {
  const bytesByUrl = new Map();
  const capabilities = [];
  for (const n of FIXTURE_NODES) {
    const wasmBytes = new Uint8Array(await readFile(new URL(n.wasm, fx)));
    const contractBytes = new Uint8Array(await readFile(new URL(n.contract, fx)));
    const artifactUrl = `https://x/artifacts/${n.ns}.${n.id}-1.0.0/${n.wasm}`;
    const contractUrl = `https://x/artifacts/${n.ns}.${n.id}-1.0.0/contract.json`;
    bytesByUrl.set(artifactUrl, wasmBytes);
    bytesByUrl.set(contractUrl, contractBytes);
    capabilities.push({
      namespace: n.ns, id: n.id, version: '1.0.0',
      digest: sha(wasmBytes), artifactUrl, contractUrl, contractDigest: sha(contractBytes), deprecated: false,
    });
  }
  const snapshot = { releaseTag: 'fixture-1', capabilities };
  const identity = await snapshotIdentity(snapshot);
  const fetcher = { async fetch(url) { const b = bytesByUrl.get(url); if (!b) throw new Error('404 ' + url); return b; } };
  const store = new MemoryRegistryCacheStore();
  const deps = [];
  for (const c of capabilities) {
    const ref = { namespace: c.namespace, id: c.id, versionRange: '1.0.0' };
    await prepareRegistryDependency(store, snapshot, ref, fetcher);
    deps.push(await resolveRegistryDependencyOffline(store, ref));
  }
  return { snapshot, identity, deps };
}

const TARGET = { capability_id: 'period.finalize', capability_version: '1.0.0' };
// Matches the bundle's own input.fixture.json (period.finalize's published
// use_cases[0].input_example + a shared policy — see PROVENANCE.md).
const FACTS = { scope_id: 'golden-bc', period_key: '2026-08-17', coverage_state: 'partial',
  watermark: 'capture-watermark-001', policy: { version: 'policy-1' } };
const MANIFEST = { app_id: 'discover', version: '1.0.0', schema_version: '1.0.0' };

test('browserLocalPlan derives a real structural proposal from a goal', async () => {
  const { snapshot, identity, deps } = await planningFixture();
  const res = await browserLocalPlan(identity, snapshot, deps, TARGET, FACTS, 'local-default', MANIFEST);
  assert.ok(res.proposals.length >= 1);
  const p = res.proposals[0];
  // period.finalize's own required inputs are fully covered by starting
  // facts, so this is a valid single-node proposal. summary.aggregate and
  // uncertainty.score are NOT valid predecessors for anything here: neither
  // echoes `policy` in its outputs (only `policy_version`), so under the
  // corrected planner (traverse-embedder-web >=0.10.2, issue #1338 — a
  // predecessor's outputs alone, never mixed with facts, must cover 100% of
  // a downstream node's required inputs) no multi-hop chain exists within
  // this fixture's capability set. A genuine multi-hop chain is covered by
  // the live-registry test below, against report.* capabilities that were
  // deliberately designed to echo fields for chain composition.
  assert.deepEqual(p.proposal.nodes.map((n) => n.capability_id), ['period.finalize']);
  assert.equal(p.mapping_unconfirmed, true);
  const m = p.proposal.mappings.filter((x) => x.to_node_id === 'node-1');
  assert.equal(m.length, 5);
  assert.ok(m.every((x) => x.source === 'starting_facts'));
});

test('browserLocalPlan fails closed on a tampered snapshot', async () => {
  const { snapshot, identity, deps } = await planningFixture();
  const tampered = { ...snapshot, capabilities: snapshot.capabilities.slice(0, 2) };
  await assert.rejects(
    () => browserLocalPlan(identity, tampered, deps, TARGET, FACTS, 'local-default', MANIFEST),
    (err) => err instanceof BrowserPlanError && /snapshot/.test(err.code),
  );
});

test('buildSnapshot skips deprecated and pins a self-consistent releaseTag', async () => {
  const catalog = {
    capabilities: [
      { deprecated: false, contract: { namespace: 'a', id: 'a.one', version: '1.0.0', artifact: { digest: 'sha256:aa', url: 'u1' } }, contract_url: 'c1', contract_digest: 'sha256:cc' },
      { deprecated: true, contract: { namespace: 'a', id: 'a.two', version: '1.0.0', artifact: { digest: 'sha256:bb', url: 'u2' } }, contract_url: 'c2', contract_digest: 'sha256:dd' },
    ],
  };
  const snap = await buildSnapshot(catalog);
  assert.equal(snap.capabilities.length, 1);
  assert.equal(snap.capabilities[0].id, 'a.one');
  assert.match(snap.releaseTag, /^catalog-[0-9a-f]{16}$/);
});

test('end to end against the LIVE registry: plan a real 3-node goal, review, composed-execute (fetches the ~21MB compressed embedding-model WASM)', { skip: !process.env.CHECK_REGISTRY && 'set CHECK_REGISTRY=1 for the networked check' }, async () => {
  const raw = await (await fetch('https://registry.traverse-framework.com/catalog.json', { cache: 'no-store' })).json();
  const snapshot = await buildSnapshot(raw);
  const identity = await snapshotIdentity(snapshot);
  const MIRROR = 'https://registry.traverse-framework.com';
  const fetcher = { async fetch(url) {
    let u = url; const m = url.match(/\/artifacts\/([^/]+)\/([^/]+)$/);
    if (m && url.startsWith('https://github.com/')) u = `${MIRROR}/artifacts/${m[1]}/${m[2]}`;
    const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return new Uint8Array(await r.arrayBuffer());
  } };
  const store = new MemoryRegistryCacheStore();
  const deps = [];
  for (const r of [
    ['report', 'report.collect-fragments', '1.0.0'],
    ['report', 'report.enrich-insights', '1.1.0'],
    ['report', 'report.summarize-semantic', '1.0.0'],
  ]) {
    const ref = { namespace: r[0], id: r[1], versionRange: r[2] };
    await prepareRegistryDependency(store, snapshot, ref, fetcher);
    deps.push(await resolveRegistryDependencyOffline(store, ref));
  }
  const res = await browserLocalPlan(
    identity, snapshot, deps,
    { capability_id: 'report.summarize-semantic', capability_version: '1.0.0' },
    { fragments: ['Browser adoption rose.', 'Edge cache is warm.'] },
    'local-default', MANIFEST,
  );
  assert.ok(res.proposals.length >= 1);
  const p = res.proposals.find((x) => x.proposal.nodes.length === 3) ?? res.proposals[0];
  assert.deepEqual(p.proposal.nodes.map((n) => n.capability_id),
    ['report.collect-fragments', 'report.enrich-insights', 'report.summarize-semantic']);
  const reviewed = { ...p, mapping_unconfirmed: false };
  const trace = await executeBrowserComposedWorkflow(reviewed, store, snapshot);
  assert.equal(trace.terminal_state, 'succeeded', JSON.stringify(trace));
  assert.ok(trace.node_outcomes.every((o) => o.status === 'succeeded'));
});

async function liveSnapshotAndFetcher() {
  const raw = await (await fetch('https://registry.traverse-framework.com/catalog.json', { cache: 'no-store' })).json();
  const snapshot = await buildSnapshot(raw);
  const identity = await snapshotIdentity(snapshot);
  const MIRROR = 'https://registry.traverse-framework.com';
  const fetcher = { async fetch(url) {
    let u = url; const m = url.match(/\/artifacts\/([^/]+)\/([^/]+)$/);
    if (m && url.startsWith('https://github.com/')) u = `${MIRROR}/artifacts/${m[1]}/${m[2]}`;
    const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return new Uint8Array(await r.arrayBuffer());
  } };
  return { snapshot, identity, fetcher };
}

test('LIVE: the translate-fr-semantic goal plans but the runtime declines to authorize it (model_derived, not is_automatic_eligible)',
  { skip: !process.env.CHECK_REGISTRY && 'set CHECK_REGISTRY=1 for the networked check' },
  async () => {
    const { snapshot, identity, fetcher } = await liveSnapshotAndFetcher();
    const store = new MemoryRegistryCacheStore();
    const ref = { namespace: 'report', id: 'report.translate-fr-semantic', versionRange: '1.0.0' };
    await prepareRegistryDependency(store, snapshot, ref, fetcher);
    const deps = [await resolveRegistryDependencyOffline(store, ref)];
    const res = await browserLocalPlan(
      identity, snapshot, deps,
      { capability_id: 'report.translate-fr-semantic', capability_version: '1.0.0' },
      { summary: 'Two validated insights.', structured_facts: ['Fact: browser — adoption rose'] },
      'local-default', MANIFEST,
    );
    assert.ok(res.proposals.length >= 1);
    const reviewed = { ...res.proposals[0], mapping_unconfirmed: false };
    await assert.rejects(
      () => executeBrowserComposedWorkflow(reviewed, store, snapshot),
      (err) => err.code === 'composed_workflow_approval_required',
    );
  });
