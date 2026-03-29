import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Whatszor/);
});

test('get started link', async ({ page }) => {
  await page.goto('/');

  // Check if the page is rendered (e.g. by looking for a specific text or element)
  // This is a placeholder for actual login flow
  const body = await page.locator('body');
  await expect(body).toBeVisible();
});
