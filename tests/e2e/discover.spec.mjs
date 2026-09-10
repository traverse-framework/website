import { test, expect } from '@playwright/test';

test('goal 1 auto-plans on load, then review + execute for real against the live registry', async ({ page }) => {
  test.slow(); // fetches the live catalog + prepares artifacts

  await page.goto('/discover.html');

  // Auto-run to the review gate.
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });
  await expect(page.locator('#discover-plan-target')).toHaveText('uncertainty.score@1.1.0');
  await expect(page.locator('#discover-plan-mappings')).toContainText('unconfirmed');
  await expect(page.locator('#discover-stats')).toContainText('namespaces');

  // Explicit review gate → real composed execution.
  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Executed — real, offline, governed', { timeout: 45_000 });
  await expect(page.locator('#discover-result')).toHaveAttribute('data-outcome', 'executed');
  await expect(page.locator('#discover-trace')).toContainText('terminal: succeeded');
  await expect(page.locator('#discover-trace')).toContainText('uncertainty.score@1.1.0');
  await expect(page.locator('#discover-log')).toContainText('executed offline in your browser');
});

test('a single-capability goal (card checksum) plans and executes for real', async ({ page }) => {
  test.slow();
  await page.goto('/discover.html');
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings', { timeout: 45_000 });

  await page.locator('.discover-goal[data-goal="luhn"]').click();
  await expect(page.locator('#discover-plan-target')).toHaveText('validation.validate-luhn@1.2.0', { timeout: 45_000 });
  await expect(page.locator('#discover-badge')).toHaveText('Planned — review the mappings');

  await page.locator('#discover-exec').click();
  await expect(page.locator('#discover-badge')).toHaveText('Executed — real, offline, governed', { timeout: 45_000 });
  await expect(page.locator('#discover-trace')).toContainText('terminal: succeeded');
  await expect(page.locator('#discover-trace')).toContainText('validation.validate-luhn@1.2.0');
});
