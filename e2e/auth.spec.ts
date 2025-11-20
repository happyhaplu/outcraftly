import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Authentication', () => {
  test('sign-in page loads @regression', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveTitle(/Outcraftly/i);
  });

  test('sign-in is accessible', async ({ page }) => {
    await page.goto('/sign-in');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
