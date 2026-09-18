import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runResponderDemo } from '../src/scripts/discover-generate.js';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('runResponderDemo genuinely executes the checked-in bridge fixture, not a canned string', async () => {
  const hit = await runResponderDemo('hi there, how are you?');
  assert.equal(hit.response, 'hi there');
  assert.equal(hit.placement, 'wasm-cpu');
  assert.match(hit.digest, /^[0-9a-f]{64}$/);
  assert.equal(hit.evidence.status, 'ok');
  assert.equal(hit.evidence.placement, 'wasm-cpu');
  assert.equal(hit.evidence.has_output_ref, true);

  const miss = await runResponderDemo('what is the weather today');
  assert.equal(miss.response, 'hmm');
  // same digest both times: it's the same verified package, different input
  assert.equal(miss.digest, hit.digest);
});

test('the fixture digest matches the real checked-in traverse-framework/traverse conformance fixture', async () => {
  // fixtures/models/fixture-responder-1.0.0/model.manifest.json in
  // traverse-framework/traverse pins this exact wasm_digest for the same
  // 491-byte file — this embeds the real bytes, not a stripped variant.
  const { digest } = await runResponderDemo('hi');
  assert.equal(digest, 'bf04760b1937c2f2b813b6e28f2fdc6e334833c2dfadc1f7c872f3f28c341294');
});

test('/discover states the generation panel honestly and does not overclaim', async () => {
  const page = await read('src/pages/discover.astro');
  const gen = await read('src/scripts/discover-generate.js');

  assert.match(page, /not a trained language model/i);
  assert.match(page, /Decision 95/);
  assert.match(page, /no daemon|no network call/i);
  assert.doesNotMatch(page.slice(page.indexOf('discover-generate-section')), /\bAI agent\b/i);

  assert.match(gen, /ExactModelBrowserHost/);
  assert.match(gen, /normalizeModelExecuteEvidence/);
  // real digest verification, not a hardcoded/asserted-true string
  assert.match(gen, /crypto\.subtle\.digest/);
  assert.doesNotMatch(gen, /\bopenai\b|\banthropic\b|\bllm\b|\bgpt-|chat\.completions/i);
});
