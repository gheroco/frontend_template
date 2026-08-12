import { expect, test } from '@playwright/test';

test.describe('runtime portal lifecycle', () => {
  test('viewer receives only permitted tabs and deep links survive refresh', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Viewer/i }).click();
    await expect(page.getByRole('tab', { name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Audit' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Inventory' }).click();
    await expect(page.getByRole('heading', { name: 'Inventory overview' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByRole('heading', { name: 'Inventory overview' })).toBeVisible();
  });

  test('operator sees independent protected services', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Operator/i }).click();
    await expect(page.getByRole('tab', { name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Audit' })).toBeVisible();
    await page.getByRole('tab', { name: 'Audit' }).click();
    await expect(page.getByRole('heading', { name: 'Audit activity' })).toBeVisible();
  });

  test('an unknown or removed extension route fails safely', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Viewer/i }).click();
    await page.goto('/removed-service/deep-link');
    await expect(page.getByRole('heading', { name: 'This tab is no longer available' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to overview' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
