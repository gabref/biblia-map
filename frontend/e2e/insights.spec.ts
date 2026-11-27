import { expect, test, type Page } from '@playwright/test';

import { gotoReady, isMobileProject } from './support';

const TABS = [
   { tab: 'overview', label: 'Overview' },
   { tab: 'chord', label: 'Books graph' },
   { tab: 'hubs', label: 'Hub verses' },
   { tab: 'heatmap', label: 'Chapter heatmap' },
   { tab: 'flows', label: 'Quotation flows' },
   { tab: 'clusters', label: 'Clusters' },
] as const;

function views(page: Page) {
   return page.getByRole('tablist', { name: 'Insights views' });
}

test.describe('insights', () => {
   test('every view opens from its tab and writes ?tab= to the URL', async ({ page }) => {
      await gotoReady(page, '/insights');
      await expect(page.locator('main h1')).toHaveText('Insights');
      await expect(views(page).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

      for (const { tab, label } of TABS.slice(1)) {
         await views(page).getByRole('tab', { name: label }).click();
         await expect(page).toHaveURL(new RegExp(`[?&]tab=${tab}(&|$)`));
         await expect(page.getByRole('tabpanel', { name: label })).toBeVisible();
      }

      await views(page).getByRole('tab', { name: 'Overview' }).click();
      await expect(page).not.toHaveURL(/[?&]tab=(?!overview)/);
      await expect(page.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();
   });

   for (const { tab, label } of TABS) {
      test(`deep link ?tab=${tab} selects "${label}"`, async ({ page }) => {
         await gotoReady(page, `/insights?tab=${tab}`);
         await expect(views(page).getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
         await expect(page.getByRole('tabpanel', { name: label })).toBeVisible();
      });
   }

   test('a hub verse row opens the verse study', async ({ page }) => {
      await gotoReady(page, '/insights?tab=hubs');

      const panel = page.getByRole('tabpanel', { name: 'Hub verses' });
      const first = panel.getByRole('link', { name: /^[1-3]?\s?[A-Z][a-z]+(?: [A-Z][a-z]+)* \d+:\d+$/ }).first();
      const href = await first.getAttribute('href');

      expect(href).toMatch(/^\/verse\/[a-z0-9-]+\/\d+\/\d+/);
      await first.click();
      await expect(page).toHaveURL(new RegExp(`${href?.split('?')[0]}(\\?|$)`));
      await expect(page.locator('main h1')).toContainText('verse study');
   });

   test('a heatmap chapter cell opens read mode', async ({ page }) => {
      await gotoReady(page, '/insights?tab=heatmap');

      const cell = page.getByRole('tabpanel', { name: 'Chapter heatmap' }).getByRole('link', { name: /^Genesis 3: \d+ references/ });

      await cell.click();
      await expect(page).toHaveURL(/\/read\/genesis\/3(\?|#|$)/);
      await expect(page.locator('main h1')).toHaveText('Genesis 3');
   });

   test('the books graph defaults to the matrix on phones', async ({ page }, testInfo) => {
      test.skip(!isMobileProject(testInfo), 'phone layout');

      await gotoReady(page, '/insights?tab=chord');
      await expect(page.getByRole('tablist', { name: 'Chart type' }).getByRole('tab', { name: 'Matrix' })).toHaveAttribute('aria-selected', 'true');
   });

   test('/book/psalms renders the book profile', async ({ page }) => {
      await gotoReady(page, '/book/psalms');
      await expect(page.locator('main h1')).toHaveText('Psalms');
      await expect(page.getByRole('link', { name: 'Read Psalms' })).toHaveAttribute('href', /^\/read\/psalms\/1/);
      await expect(page.getByRole('region', { name: 'Books Psalms cites' })).toBeVisible();
   });

   test('legacy /chord and /blocks redirect to their Insights tabs', async ({ page }) => {
      await page.goto('/chord');
      await expect(page).toHaveURL(/\/insights\?(.*&)?tab=chord/);
      await expect(views(page).getByRole('tab', { name: 'Books graph' })).toHaveAttribute('aria-selected', 'true');

      await page.goto('/blocks');
      await expect(page).toHaveURL(/\/insights\?(.*&)?tab=clusters/);
      await expect(views(page).getByRole('tab', { name: 'Clusters' })).toHaveAttribute('aria-selected', 'true');

      await page.goto('/overview');
      await expect(page).toHaveURL(/\/insights(\?|$)/);
   });
});
