import { test, expect } from '@playwright/test';

test('goal 1 (price a quote) auto-plans on load, then review + execute for real against the live registry', async ({ page }) => {
  test.slow(); // fetches the live catalog + prepares artifacts

  await page.goto('/discover.html');

  // Auto-run to the review gate. `price` loads first on purpose (discover.js):
  // it's the goal most reliably reaching a real success end to end, so a
  // first-time visitor's first execute isn't the one most likely to hit the
  // unrelated real capability-execution issue tracked below.
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });
  await expect(page.locator('#discover-plan-target')).toHaveText('core.calculate-price@1.2.0');
  await expect(page.locator('#discover-plan-mappings')).toContainText('unconfirmed');
  await expect(page.locator('#discover-stats')).toContainText('namespaces');

  // Explicit review gate → real composed execution.
  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Executed — real, offline, governed', { timeout: 45_000 });
  await expect(page.locator('#discover-result')).toHaveAttribute('data-outcome', 'executed');
  await expect(page.locator('#discover-trace')).toContainText('terminal: succeeded');
  await expect(page.locator('#discover-trace')).toContainText('core.calculate-price@1.2.0');
  await expect(page.locator('#discover-log')).toContainText('executed offline in your browser');
});

// KNOWN ISSUE (found 2026-09-18, tracked for a follow-up fix — see
// tests/discover-planning.test.mjs for the same issue reproduced without a
// browser): doc-approval.analyze currently traps with `execution_failed`
// ("wasm `unreachable` instruction executed") when run through the real
// nested runtime.wasm (Spec 1402) rather than the old browser-only WASI
// shim traverse-embedder-web <=0.10.x used. core.calculate-price succeeds
// through the same path, so this looks like a per-capability build/ABI
// compatibility gap, not a planning or execution-wiring bug on this site.
// Planning genuinely still derives the real two-node chain; only the
// execution outcome below is the current (failing) reality.
test('goal (doc-approval chain) plans a real two-node structural chain — execution currently fails at node 1 (known issue, see comment above)', async ({ page }) => {
  test.slow();
  await page.goto('/discover.html');
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });

  await page.locator('#discover-goal-select').selectOption('docapproval');
  await expect(page.locator('#discover-plan-target')).toHaveText('doc-approval.recommend@1.4.0', { timeout: 45_000 });
  await expect(page.locator('#discover-plan-mappings')).toContainText('unconfirmed');

  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Run failed at a node', { timeout: 45_000 });
  await expect(page.locator('#discover-trace')).toContainText('terminal: failed');
  await expect(page.locator('#discover-trace')).toContainText('doc-approval.analyze@1.4.0');
});

test('a single-capability goal (price a quote) plans and executes for real', async ({ page }) => {
  test.slow();
  await page.goto('/discover.html');
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });

  await page.locator('#discover-goal-select').selectOption('price');
  await expect(page.locator('#discover-plan-target')).toHaveText('core.calculate-price@1.2.0', { timeout: 45_000 });
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings');

  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Executed — real, offline, governed', { timeout: 45_000 });
  await expect(page.locator('#discover-trace')).toContainText('terminal: succeeded');
  await expect(page.locator('#discover-trace')).toContainText('core.calculate-price@1.2.0');
});

// KNOWN ISSUE (see the doc-approval test above): validation.validate-luhn
// hits the same real `unreachable` trap under the nested runtime.wasm.
test('a single-capability goal (card checksum) plans, then execution currently fails at the node (known issue, see comment above)', async ({ page }) => {
  test.slow();
  await page.goto('/discover.html');
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });

  await page.locator('#discover-goal-select').selectOption('luhn');
  await expect(page.locator('#discover-plan-target')).toHaveText('validation.validate-luhn@1.2.0', { timeout: 45_000 });
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings');

  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Run failed at a node', { timeout: 45_000 });
  await expect(page.locator('#discover-trace')).toContainText('terminal: failed');
  await expect(page.locator('#discover-trace')).toContainText('validation.validate-luhn@1.2.0');
});

test('the translate-fr-semantic goal plans, then the local runtime genuinely refuses to authorize a model_derived node', async ({ page }) => {
  test.slow(); // fetches a live ~17 MB WASM artifact
  await page.goto('/discover.html');
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });

  await page.locator('#discover-goal-select').selectOption('translate-denied');
  await expect(page.locator('#discover-plan-target')).toHaveText('report.translate-fr-semantic@1.0.0', { timeout: 60_000 });
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings');

  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Halted — fail closed', { timeout: 45_000 });
  await expect(page.locator('#discover-log')).toContainText('the local runtime declined to authorize a node');
  await expect(page.locator('#discover-log')).toContainText('real governance decision, not an error');
});

// KNOWN ISSUE (see the doc-approval test above): report.collect-fragments
// fails differently from the unreachable-trap capabilities — it fails to
// instantiate memory under the nested runtime.wasm's resource limiter
// ("a resource limiter denied to allocate or grow the linear memory").
// Planning still genuinely derives the real three-node chain.
test('the embedding-model goal chains three real report.* capabilities — execution currently fails at node 1 (known issue, see comment above)', async ({ page }) => {
  test.slow(); // fetches a live ~21 MB (compressed) WASM artifact and instantiates it
  await page.goto('/discover.html');
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });

  await page.locator('#discover-goal-select').selectOption('summarize-embedding');
  await expect(page.locator('#discover-plan-target')).toHaveText('report.summarize-semantic@1.0.0', { timeout: 60_000 });
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings');

  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Run failed at a node', { timeout: 60_000 });
  await expect(page.locator('#discover-trace')).toContainText('terminal: failed');
  await expect(page.locator('#discover-trace')).toContainText('report.collect-fragments@1.0.0');
});
