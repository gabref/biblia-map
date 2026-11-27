import { expect, test } from '@playwright/test';

import { gotoReady, isMobileProject } from './support';

test.describe('app shell', () => {
   test('dark by default with no stored choice; switching to light persists', async ({ page }) => {
      // The context emulates a light OS (playwright.config.ts): dark must still win.
      await gotoReady(page, '/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await page.evaluate(() => localStorage.getItem('bibliamap-theme'))).toBeNull();

      await page.getByRole('button', { name: 'Switch to light theme' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      // The toggle steps dark → light → system: from light, the next step is "match the device".
      await expect(page.getByRole('button', { name: 'Match the device theme' })).toBeVisible();
   });

   test('the language switch changes the navigation text EN ↔ IT and persists', async ({ page }) => {
      await gotoReady(page, '/');

      const nav = page.locator('nav.nav-list');

      await expect(nav.getByRole('link', { name: 'Read', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Italiano' }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'it');
      await expect(nav.getByRole('link', { name: 'Leggi', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Il mio studio', exact: true })).toBeVisible();

      await page.reload();
      await expect(nav.getByRole('link', { name: 'Leggi', exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'English' }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(nav.getByRole('link', { name: 'My study', exact: true })).toBeVisible();
   });

   test('the bottom navigation is visible on phones and pinned to the bottom', async ({ page }, testInfo) => {
      test.skip(!isMobileProject(testInfo), 'phone layout');

      await gotoReady(page, '/verse/john/3/16');

      const nav = page.getByRole('navigation', { name: 'Pages' });

      await expect(nav).toBeVisible();
      for (const name of [ 'Home', 'Study', 'Read', 'Insights', 'My study' ]) {
         await expect(nav.getByRole('link', { name, exact: true })).toBeInViewport();
      }

      const box = await nav.boundingBox();
      const height = page.viewportSize()?.height ?? 0;

      expect(box).not.toBeNull();
      expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBeGreaterThanOrEqual(height - 2);

      await nav.getByRole('link', { name: 'Read', exact: true }).click();
      await expect(page).toHaveURL(/\/read\/john\/3/);
      await expect(nav.getByRole('link', { name: 'Read', exact: true })).toHaveAttribute('aria-current', 'page');
   });
});
