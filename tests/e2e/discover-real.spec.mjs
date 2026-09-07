import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const WASM_FILE = new URL(
  '../../public/bundles/discover-real/core-calculate-price.wasm',
  import.meta.url,
);

test('Real mode executes the pinned capability and shows a verifiable receipt', async ({ page }) => {
  await page.goto('/discover.html');
  await page.locator('#discover-real-run').click();

  const result = page.locator('#discover-real-result');
  await expect(result).toBeVisible();
  await expect(page.locator('#discover-real-badge')).toHaveText('Real: executed', { timeout: 25_000 });
  await expect(result).toHaveAttribute('data-outcome', 'ok');

  await expect(page.locator('#discover-real-identity')).toHaveText('core/core.calculate-price@1.1.0');
  await expect(page.locator('#discover-real-digest')).toContainText('verified match');
  await expect(page.locator('#discover-real-validation')).toContainText('passed');
  await expect(page.locator('#discover-real-outcome')).toHaveText('completed');
  await expect(page.locator('#discover-real-output-hash')).toContainText('sha256:');
  await expect(page.locator('#discover-real-quote')).toContainText('97.20');
  await expect(page.locator('#discover-real-log')).toContainText('executed in your browser');
});

test('Real mode fails closed when the artifact digest does not match the pin', async ({ page }) => {
  const bytes = new Uint8Array(await readFile(WASM_FILE));
  bytes[Math.floor(bytes.length / 2)] ^= 0xff; // corrupt one byte -> digest no longer matches

  await page.route('**/core-calculate-price.wasm', (route) =>
    route.fulfill({ status: 200, contentType: 'application/wasm', body: Buffer.from(bytes) }),
  );

  await page.goto('/discover.html');
  await page.locator('#discover-real-run').click();

  const result = page.locator('#discover-real-result');
  await expect(result).toBeVisible();
  await expect(page.locator('#discover-real-badge')).toHaveText('Real: failed (identity)', { timeout: 25_000 });
  await expect(result).toHaveAttribute('data-outcome', 'failed');
  await expect(page.locator('#discover-real-log')).toContainText('Refusing to run an unverified binary');

  // It must never render as a success.
  await expect(result).not.toHaveAttribute('data-outcome', 'ok');
  await expect(page.locator('#discover-real-badge')).not.toHaveText('Real: executed');
  await expect(page.locator('#discover-real-outcome')).not.toHaveText('completed');
});

test('Real pipeline executes three published capabilities in order, in the browser', async ({ page }) => {
  await page.goto('/discover.html');
  await page.locator('#discover-pipeline-run').click();

  const result = page.locator('#discover-pipeline-result');
  await expect(result).toBeVisible();
  await expect(page.locator('#discover-pipeline-badge')).toHaveText('Real: executed (3 capabilities)', { timeout: 30_000 });
  await expect(result).toHaveAttribute('data-outcome', 'ok');

  for (const nodeId of ['period_finalize', 'summary_aggregate', 'uncertainty_score']) {
    await expect(page.locator(`#discover-pipeline-node-${nodeId}`)).toHaveAttribute('data-state', 'complete');
  }
  await expect(page.locator('#discover-pipeline-outcome')).toHaveText('completed');
  await expect(page.locator('#discover-pipeline-output-hash')).toContainText('sha256:');
  await expect(page.locator('#discover-pipeline-log')).toContainText('node 3/3');
  await expect(page.locator('#discover-pipeline-outputs')).toContainText('uncertainty.score');
});
