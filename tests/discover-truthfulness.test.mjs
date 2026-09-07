import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('discover clearly separates live catalog, heuristic, and simulation modes', async () => {
  const page = await read('src/pages/discover.astro');
  const script = await read('public/assets/js/discover.js');

  assert.match(page, /Live catalog data\. Heuristic composition\. Simulated execution\./);
  assert.match(page, /does not invoke published WASM, call an MCP endpoint, run the Traverse runtime, or use an LLM/i);
  assert.match(page, /catalog\.json/);
  assert.match(script, /Live catalog/);
  assert.match(script, /Name heuristic/);
  assert.match(script, /simulation · visualizing derived pipeline states/);
  assert.doesNotMatch(page, /AI agent, its MCP connection, and the runtime/i);
  assert.doesNotMatch(script, /label: 'AI Agent'/);
  assert.doesNotMatch(script, /label: 'MCP'/);
  assert.doesNotMatch(script, /label: 'Runtime'/);
});

test('discover Real mode is opt-in, single-capability, and fails closed', async () => {
  const page = await read('src/pages/discover.astro');
  const real = await read('src/scripts/discover-real.js');

  // Opt-in, clearly labelled, single pinned capability -- not the pipeline.
  assert.match(page, /Run this one for real/);
  assert.match(page, /core\/core\.calculate-price@1\.1\.0/);
  assert.match(page, /composed multi-node pipeline is not executed/i);
  assert.match(page, /stays derived and simulated/i);
  assert.doesNotMatch(page, /composed (multi-node )?pipeline (is|runs|becomes) (now )?real/i);
  assert.doesNotMatch(page, /real agent|runtime authority|MCP loop (executes|runs)/i);

  // The simulated-path disclaimer stays present and is scoped to the pipeline.
  assert.match(page, /composed pipeline above does not invoke published WASM/i);

  // Real module: pinned digest is re-checked before it can report success.
  assert.match(real, /sha256:a046e5d001ae78b8de339d40378e2c22f04384d601a1b801b52cf99a3e44f0b2/);
  assert.match(real, /!==\s*PINNED_WASM_DIGEST/);
  assert.match(real, /capability_result/);
  assert.match(real, /releaseEvidence/);

  // "executed" / "real run complete" is only claimed in the success path, which
  // is guarded by the digest check and the capability_result event above.
  assert.match(real, /real run complete .* executed in your browser/);

  // All six fail-closed states are present with their distinct copy.
  assert.match(real, /real mode unavailable — the governed browser execution host did not load/);
  assert.match(real, /real mode unavailable — could not retrieve the verified registry artifact/);
  assert.match(real, /real mode halted — artifact identity did not match the pinned value/);
  assert.match(real, /real mode halted — the governed host rejected this input against the published contract/);
  assert.match(real, /real mode halted — the runtime declined to authorize this invocation/);
  assert.match(real, /real mode halted — execution did not return a verifiable receipt\. Not reporting this as a success/);

  // No fabricated success: no catch-all that renders ok.
  assert.doesNotMatch(real, /catch\s*\([^)]*\)\s*\{\s*renderSuccess/);
});

test('discover Real pipeline is authored, not runtime-discovered, and fails closed', async () => {
  const page = await read('src/pages/discover.astro');
  const pipe = await read('src/scripts/discover-real-pipeline.js');

  // It is a real multi-capability execution...
  assert.match(page, /three-capability pipeline for real/i);
  assert.match(page, /period\.finalize/);
  assert.match(page, /summary\.aggregate/);
  assert.match(page, /uncertainty\.score/);
  assert.match(pipe, /discover-real-pipeline\.coverage/);
  assert.match(pipe, /capability_invoked/);

  // ...but the page must NOT claim runtime discovery / selection / an agent.
  assert.match(page, /authored in the committed bundle/i);
  assert.match(page, /not discovered or selected at runtime/i);
  assert.doesNotMatch(page, /(agent|model|planner) (selects|chooses|discovers|picks) (the )?capabilit/i);
  assert.doesNotMatch(pipe, /label: '(AI Agent|Runtime|MCP|Planner)'/);

  // Three pinned digests, re-checked before success is reported.
  assert.match(pipe, /sha256:01cb26718120619bed0f2a1c486c1e153e97bd0cdf7810351084cac47359649c/);
  assert.match(pipe, /sha256:0464da7ebe4784a3b24717b08d26c168b5e901f4d8d5b6efc9693c3323d1d5dd/);
  assert.match(pipe, /sha256:f218262588e8889eaacf371fc9df17454be40f901f88f379514fcc27365b1a9b/);
  assert.match(pipe, /!==\s*n\.digest/);

  // Same six fail-closed strings.
  assert.match(pipe, /real mode unavailable — the governed browser execution host did not load/);
  assert.match(pipe, /real mode unavailable — could not retrieve the verified registry artifact/);
  assert.match(pipe, /real mode halted — artifact identity did not match the pinned value/);
  assert.match(pipe, /real mode halted — the governed host rejected this input against the published contract/);
  assert.match(pipe, /real mode halted — the runtime declined to authorize this invocation/);
  assert.match(pipe, /real mode halted — execution did not return a verifiable receipt\. Not reporting this as a success/);
});
