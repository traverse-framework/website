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
