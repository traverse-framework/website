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

const TARGET = { capability_id: 'uncertainty.score', capability_version: '1.0.0' };
const FACTS = { coverage_state: 'partial', period_key: '2026-08-17', scope_id: 'golden-bc', policy: { version: 'p1' },
  included_reference_ids: ['a', 'b'], pending_reference_ids: ['c'] };
const MANIFEST = { app_id: 'discover', version: '1.0.0', schema_version: '1.0.0' };

test('browserLocalPlan derives a real structural proposal from a goal', async () => {
  const { snapshot, identity, deps } = await planningFixture();
  const res = await browserLocalPlan(identity, snapshot, deps, TARGET, FACTS, 'local-default', MANIFEST);
  assert.ok(res.proposals.length >= 1);
  const p = res.proposals[0];
  assert.deepEqual(p.proposal.nodes.map((n) => n.capability_id), ['summary.aggregate', 'uncertainty.score']);
  assert.equal(p.mapping_unconfirmed, true);
  const m = p.proposal.mappings.filter((x) => x.to_node_id === 'node-2');
  assert.ok(m.some((x) => x.from_field === 'included_count' && x.source === 'capability_output'));
  assert.ok(m.some((x) => x.from_field === 'policy' && x.source === 'starting_facts'));
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

test('end to end against the LIVE registry: plan a goal, review, composed-execute', { skip: !process.env.CHECK_REGISTRY && 'set CHECK_REGISTRY=1 for the networked check' }, async () => {
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
  for (const r of [['summary', 'summary.aggregate'], ['uncertainty', 'uncertainty.score']]) {
    const ref = { namespace: r[0], id: r[1], versionRange: '1.1.0' };
    await prepareRegistryDependency(store, snapshot, ref, fetcher);
    deps.push(await resolveRegistryDependencyOffline(store, ref));
  }
  const res = await browserLocalPlan(
    identity, snapshot, deps,
    { capability_id: 'uncertainty.score', capability_version: '1.1.0' },
    { coverage_state: 'partial', period_key: '2026-08-17', scope_id: 'golden-bc', policy: { version: 'p1' } },
    'local-default', MANIFEST,
  );
  assert.ok(res.proposals.length >= 1);
  const reviewed = { ...res.proposals[0], mapping_unconfirmed: false };
  const trace = await executeBrowserComposedWorkflow(reviewed, store, snapshot);
  assert.equal(trace.terminal_state, 'succeeded', JSON.stringify(trace));
  assert.ok(trace.node_outcomes.every((o) => o.status === 'succeeded'));
});
