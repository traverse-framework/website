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
