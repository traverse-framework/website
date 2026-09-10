import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('/discover states the mechanism honestly and cannot drift back into over-claiming', async () => {
  const page = await read('src/pages/discover.astro');
  const flow = await read('src/scripts/discover.js');
  const graph = await read('src/scripts/discover-graph.js');

  // --- What the page claims it does ---
  assert.match(page, /Watch a goal get planned and executed — for real\./);
  assert.match(page, /deterministic structural planner/i);
  assert.match(page, /no capability-name matching, no natural language, and no model/i);
  assert.match(page, /no backend, no simulation/i);
  assert.match(page, /The browser proposes\. The runtime decides\./);
  assert.match(page, /untrusted/i);
  assert.match(page, /it never fabricates a success/i);
  assert.match(page, /Spec 1277|1277-browser-local-workflow-composition/);

  // --- What it must NOT claim ---
  assert.doesNotMatch(page, /\bAI agent\b/i);
  assert.doesNotMatch(page, /heuristic composition/i);
  assert.doesNotMatch(page, /simulated (execution|active|complete)/i);
  assert.doesNotMatch(page, /the browser (executes|runs|is) the (runtime|authority)/i);
  assert.doesNotMatch(page, /(AI|LLM|model|agent) (plans|selects|chooses|writes) the workflow/i);

  // --- The flow module actually does what the copy says ---
  assert.match(flow, /browserLocalPlan/);
  assert.match(flow, /executeBrowserComposedWorkflow/);
  assert.match(flow, /prepareRegistryDependency/);
  assert.match(flow, /registry_snapshot_digest/);
  // review gate: mapping_unconfirmed is only cleared in the confirm/execute step
  const clears = [...flow.matchAll(/mapping_unconfirmed:\s*false/g)];
  assert.equal(clears.length, 1, 'mapping_unconfirmed must be cleared in exactly one place — the execute step');
  assert.match(flow.slice(flow.indexOf('async function doExecute')), /mapping_unconfirmed:\s*false/);
  // no model / prompt / NL parsing anywhere in the flow or the graph
  assert.doesNotMatch(flow, /\bprompt\b|openai|anthropic|\bllm\b|\bgpt-|chat\.completions/i);
  assert.doesNotMatch(graph, /\bprompt\b|openai|anthropic|\bllm\b/i);

  // --- Fail-closed strings present ---
  assert.match(flow, /could not retrieve the live registry catalog or a verified artifact/);
  assert.match(flow, /the registry snapshot could not be verified/);
  assert.match(flow, /the planner rejected the inputs/);
  assert.match(flow, /the local runtime declined to authorize a node/);
  assert.match(flow, /a node returned an error during real execution/);
  assert.match(flow, /No structural candidate/);
  assert.doesNotMatch(flow, /catch\s*\([^)]*\)\s*\{\s*renderTrace/); // no catch-all that paints success
});
