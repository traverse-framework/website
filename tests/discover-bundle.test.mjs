import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BundleEmbedder, NodeFsBundleLoader } from 'traverse-embedder-web';

const root = new URL('..', import.meta.url);
const bundle = new URL('public/bundles/discover-real/', root);

const PINNED_DIGEST =
  'sha256:a046e5d001ae78b8de339d40378e2c22f04384d601a1b801b52cf99a3e44f0b2';
const CAPABILITY_REF = 'core/core.calculate-price@1.1.0';
const EXPECTED_NET = 97.2;

const readText = (name) => readFile(new URL(name, bundle), 'utf8');
const readJson = async (name) => JSON.parse(await readText(name));

test('the vendored wasm matches the pinned digest everywhere it is declared', async () => {
  const bytes = new Uint8Array(
    await readFile(new URL('core-calculate-price.wasm', bundle)),
  );
  const actual = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, PINNED_DIGEST, 'core-calculate-price.wasm digest drifted from the pin');

  const appManifest = await readJson('app.manifest.json');
  assert.equal(appManifest.components[0].digest, PINNED_DIGEST);

  const componentManifest = await readJson('components/calculate-price/component.manifest.json');
  assert.equal(componentManifest.wasm_digest, PINNED_DIGEST);
  assert.equal(componentManifest.capability_id, 'core.calculate-price');
  assert.equal(componentManifest.capability_version, '1.1.0');
});

test('the bundle contract is the published core.calculate-price@1.1.0 contract', async () => {
  const contract = await readJson('contract.json');
  assert.equal(contract.namespace + '/' + contract.id + '@' + contract.version, CAPABILITY_REF);
  assert.equal(contract.execution.constraints.network_access, 'forbidden');
  assert.equal(contract.execution.constraints.host_api_access, 'none');
});

test('BundleEmbedder loads the bundle and executes the pinned wasm to the expected result', async () => {
  const input = await readJson('input.fixture.json');
  const events = [];

  const embedder = await BundleEmbedder.init({
    manifestPath: new URL('app.manifest.json', bundle).pathname,
    loader: new NodeFsBundleLoader(),
    platform: 'web',
  });
  embedder.subscribe((ev) => events.push(ev));

  const evidence = embedder.releaseEvidence();
  assert.equal(evidence.runtime.implementation, 'browser-webassembly');
  assert.equal(evidence.bundle.wasm_components[0].wasm_digest, PINNED_DIGEST);

  const outcome = embedder.submit('discover-real.calculate-price', input);
  assert.equal(outcome.status, 'accepted');
  assert.equal(outcome.error, null);

  await new Promise((r) => setTimeout(r, 750));
  try { embedder.shutdown(); } catch { /* idempotent */ }

  const errorEvent = events.find((e) => e.event_type === 'error');
  assert.equal(errorEvent, undefined, 'unexpected error event: ' + JSON.stringify(errorEvent?.data));

  const result = events.find((e) => e.event_type === 'capability_result');
  assert.ok(result, 'no capability_result event was emitted');
  assert.equal(result.data.status, 'completed');
  assert.equal(result.data.output.totals.net, EXPECTED_NET);
  assert.deepEqual(result.data.output.applied_rules.map((r) => r.rule_id), ['summer-10', 'us-standard']);
});

test('the pinned digest still matches the live registry catalog', { skip: !process.env.CHECK_REGISTRY && 'set CHECK_REGISTRY=1 to run the networked check' }, async () => {
  const res = await fetch('https://registry.traverse-framework.com/catalog.json', { cache: 'no-store' });
  assert.ok(res.ok, 'catalog fetch failed: HTTP ' + res.status);
  const catalog = await res.json();
  const entry = catalog.capabilities.find((e) => e.reference === CAPABILITY_REF);
  assert.ok(entry, CAPABILITY_REF + ' is no longer in the published catalog');
  assert.equal(entry.contract.artifact.digest, PINNED_DIGEST, 'registry digest changed — re-vendor the bundle');
});

/* ---- discover-real-pipeline: a pinned 3-capability governed pipeline ---- */

const pipeline = new URL('public/bundles/discover-real-pipeline/', root);
const PIPELINE_NODES = [
  { slug: 'period-finalize', wasm: 'finalize.wasm', capId: 'period.finalize', ref: 'period/period.finalize@1.0.0', digest: 'sha256:01cb26718120619bed0f2a1c486c1e153e97bd0cdf7810351084cac47359649c' },
  { slug: 'summary-aggregate', wasm: 'aggregate.wasm', capId: 'summary.aggregate', ref: 'summary/summary.aggregate@1.0.0', digest: 'sha256:0464da7ebe4784a3b24717b08d26c168b5e901f4d8d5b6efc9693c3323d1d5dd' },
  { slug: 'uncertainty-score', wasm: 'score.wasm', capId: 'uncertainty.score', ref: 'uncertainty/uncertainty.score@1.0.0', digest: 'sha256:f218262588e8889eaacf371fc9df17454be40f901f88f379514fcc27365b1a9b' },
];

test('every pipeline component wasm matches its pinned digest in all three places', async () => {
  const appManifest = JSON.parse(await readFile(new URL('app.manifest.json', pipeline), 'utf8'));
  for (const node of PIPELINE_NODES) {
    const bytes = new Uint8Array(await readFile(new URL(node.wasm, pipeline)));
    const actual = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, node.digest, node.wasm + ' digest drifted from the pin');

    const comp = appManifest.components.find((c) => c.component_id === 'discover-real-pipeline.' + node.slug);
    assert.ok(comp, 'missing component ' + node.slug + ' in app.manifest.json');
    assert.equal(comp.digest, node.digest);

    const componentManifest = JSON.parse(
      await readFile(new URL('components/' + node.slug + '/component.manifest.json', pipeline), 'utf8'),
    );
    assert.equal(componentManifest.wasm_digest, node.digest);
    assert.equal(componentManifest.capability_id, node.capId);
  }
});

test('BundleEmbedder runs the pinned 3-node pipeline, each node consuming the previous output', async () => {
  const input = JSON.parse(await readFile(new URL('input.fixture.json', pipeline), 'utf8'));
  const events = [];

  const embedder = await BundleEmbedder.init({
    manifestPath: new URL('app.manifest.json', pipeline).pathname,
    loader: new NodeFsBundleLoader(),
    platform: 'web',
  });
  embedder.subscribe((ev) => events.push(ev));

  const evidence = embedder.releaseEvidence();
  const shown = new Map(evidence.bundle.wasm_components.map((c) => [c.capability_id, c.wasm_digest]));
  for (const node of PIPELINE_NODES) {
    assert.equal(shown.get(node.capId), node.digest, 'released digest mismatch for ' + node.capId);
  }

  const outcome = embedder.submit('discover-real-pipeline.coverage', input);
  assert.equal(outcome.status, 'accepted');

  await new Promise((r) => setTimeout(r, 1500));
  try { embedder.shutdown(); } catch { /* idempotent */ }

  assert.equal(events.find((e) => e.event_type === 'error'), undefined, 'unexpected error event');

  const invoked = events.filter((e) => e.event_type === 'capability_invoked' && e.data.node_id);
  assert.deepEqual(
    invoked.map((e) => e.data.node_id),
    ['period_finalize', 'summary_aggregate', 'uncertainty_score'],
    'nodes did not run in the authored order',
  );
  assert.ok(invoked.every((e) => e.data.status === 'completed'));

  const result = events.find((e) => e.event_type === 'capability_result' && e.data.workflow_id);
  assert.ok(result, 'no workflow capability_result');
  assert.equal(result.data.status, 'completed');
  const out = result.data.output;
  // period.finalize -> summary.aggregate: the 2 included refs become included_count
  assert.equal(out.summary.included_count, 2);
  assert.equal(out.summary.pending_count, 1);
  // summary.aggregate -> uncertainty.score: counts drive the score
  assert.equal(out.uncertainty.reason_code, 'pending_fraction');
});

/* ---- discover-discovered: browser-local planning (Spec 1277 Phase 1) ---- */

import {
  MemoryRegistryCacheStore, prepareRegistryDependency, resolveRegistryDependencyOffline,
  browserLocalPlan, BrowserPlanError,
} from 'traverse-embedder-web';
import { snapshotIdentity, buildSnapshot } from '../src/scripts/discover-discovered.js';

const pipe = new URL('public/bundles/discover-real-pipeline/', root);
const readBytes = async (name) => new Uint8Array(await readFile(new URL(name, pipe)));
const sha = async (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

async function planningFixture() {
  // Build a small SyncedPublicRegistryState from the vendored pipeline artifacts.
  const files = [
    { ns: 'period', id: 'period.finalize', wasm: 'finalize.wasm', contract: 'contract.period-finalize.json' },
    { ns: 'summary', id: 'summary.aggregate', wasm: 'aggregate.wasm', contract: 'contract.summary-aggregate.json' },
    { ns: 'uncertainty', id: 'uncertainty.score', wasm: 'score.wasm', contract: 'contract.uncertainty-score.json' },
  ];
  const bytesByUrl = new Map();
  const capabilities = [];
  for (const f of files) {
    const wasmBytes = await readBytes(f.wasm);
    const contractBytes = new Uint8Array(await readFile(new URL(f.contract, pipe)));
    const artifactUrl = `https://x/artifacts/${f.ns}.${f.id}-1.0.0/${f.wasm}`;
    const contractUrl = `https://x/artifacts/${f.ns}.${f.id}-1.0.0/contract.json`;
    bytesByUrl.set(artifactUrl, wasmBytes);
    bytesByUrl.set(contractUrl, contractBytes);
    capabilities.push({
      namespace: f.ns, id: f.id, version: '1.0.0',
      digest: await sha(wasmBytes), artifactUrl,
      contractUrl, contractDigest: await sha(contractBytes),
      deprecated: false,
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

const DISC_TARGET = { capability_id: 'uncertainty.score', capability_version: '1.0.0' };
const DISC_FACTS = {
  coverage_state: 'partial', included_reference_ids: ['obs-2', 'obs-1'], pending_reference_ids: ['unk-1'],
  period_key: '2026-08-17', scope_id: 'golden-bc', watermark: 'capture-watermark-001', policy: { version: 'policy-1' },
};
const DISC_MANIFEST = { app_id: 'discover-discovered', version: '1.0.0', schema_version: '1.0.0' };

test('browserLocalPlan derives a real structural proposal from a goal (Phase 1)', async () => {
  const { snapshot, identity, deps } = await planningFixture();
  const res = await browserLocalPlan(identity, snapshot, deps, DISC_TARGET, DISC_FACTS, 'local-default', DISC_MANIFEST);
  assert.equal(res.proposals.length >= 1, true, 'expected at least one proposal');
  const p = res.proposals[0];
  assert.deepEqual(p.proposal.nodes.map((n) => n.capability_id), ['summary.aggregate', 'uncertainty.score']);
  assert.equal(p.mapping_unconfirmed, true, 'mappings must be unconfirmed');
  // node-2 gets included_count / pending_count from node-1's output, policy from facts
  const m = p.proposal.mappings.filter((x) => x.to_node_id === 'node-2');
  assert.ok(m.some((x) => x.from_field === 'included_count' && x.source === 'capability_output'));
  assert.ok(m.some((x) => x.from_field === 'policy' && x.source === 'starting_facts'));
});

test('browserLocalPlan fails closed on a tampered snapshot', async () => {
  const { snapshot, identity, deps } = await planningFixture();
  const tampered = { ...snapshot, capabilities: snapshot.capabilities.slice(0, 2) }; // digest no longer matches identity
  await assert.rejects(
    () => browserLocalPlan(identity, tampered, deps, DISC_TARGET, DISC_FACTS, 'local-default', DISC_MANIFEST),
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

test('discovered mode plans AND composed-executes against the live registry (@1.1.0 pure_read)', { skip: !process.env.CHECK_REGISTRY && 'set CHECK_REGISTRY=1 for the networked end-to-end check' }, async () => {
  const { executeBrowserComposedWorkflow } = await import('traverse-embedder-web');
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
  for (const r of [['period', 'period.finalize'], ['summary', 'summary.aggregate'], ['uncertainty', 'uncertainty.score']]) {
    const ref = { namespace: r[0], id: r[1], versionRange: '1.1.0' };
    await prepareRegistryDependency(store, snapshot, ref, fetcher);
    deps.push(await resolveRegistryDependencyOffline(store, ref));
  }
  const res = await browserLocalPlan(
    identity, snapshot, deps,
    { capability_id: 'uncertainty.score', capability_version: '1.1.0' },
    { coverage_state: 'partial', period_key: '2026-08-17', scope_id: 'golden-bc', watermark: 'w', policy: { version: 'p1' }, included_reference_ids: ['a', 'b'], pending_reference_ids: ['c'] },
    'local-default', { app_id: 'discover-discovered', version: '1.0.0', schema_version: '1.0.0' },
  );
  assert.ok(res.proposals.length >= 1);
  const reviewed = { ...res.proposals[0], mapping_unconfirmed: false };
  const trace = await executeBrowserComposedWorkflow(reviewed, store, snapshot);
  assert.equal(trace.terminal_state, 'succeeded', JSON.stringify(trace));
  assert.ok(trace.node_outcomes.every((o) => o.status === 'succeeded'));
});
