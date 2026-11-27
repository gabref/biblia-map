import { expect, test, type Page } from '@playwright/test';

import { gotoReady, isMobileProject } from './support';

function palette(page: Page) {
   // The palette is the only modal <dialog> the shell opens from the search shortcuts.
   return page.getByRole('dialog');
}

async function searchFor(page: Page, query: string): Promise<void> {
   const dialog = palette(page);

   await expect(dialog).toBeVisible();
   const input = dialog.getByRole('combobox');

   await input.fill(query);
   // Results are computed from the lazily loaded search data: wait for the first option.
   await expect(dialog.getByRole('option').first()).toBeVisible();
   await input.press('Enter');
   await expect(dialog).toBeHidden();
}

test.describe('verse search palette', () => {
   test.beforeEach(({}, testInfo) => {
      test.skip(isMobileProject(testInfo), 'keyboard shortcuts are a desktop feature');
   });

   test('⌘K and Ctrl+K open the palette, Escape closes it', async ({ page }) => {
      await gotoReady(page, '/about');

      await page.keyboard.press('Meta+k');
      await expect(palette(page)).toBeVisible();
      await expect(palette(page).getByRole('combobox')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden();

      await page.keyboard.press('Control+k');
      await expect(palette(page)).toBeVisible();
   });

   test('/ opens the palette', async ({ page }) => {
      await gotoReady(page, '/study');
      await page.keyboard.press('/');
      await expect(palette(page)).toBeVisible();
   });

   test('"Gv 3:16" in Italian opens John 3:16', async ({ page }) => {
      await gotoReady(page, '/about?lang=it&ds=nwtsty-i');
      await page.keyboard.press('/');
      await searchFor(page, 'Gv 3:16');
      await expect(page).toHaveURL(/\/verse\/john\/3\/16(\?|$)/);
      await expect(page).toHaveURL(/ds=nwtsty-i/);
      await expect(page.locator('main h1')).toContainText('3:16');
   });

   test('"1 Cor 13" opens the chapter in read mode', async ({ page }) => {
      await gotoReady(page, '/');
      await page.keyboard.press('Control+k');
      await searchFor(page, '1 Cor 13');
      await expect(page).toHaveURL(/\/read\/1-corinthians\/13(\?|#|$)/);
      await expect(page.locator('main h1')).toHaveText('1 Corinthians 13');
   });

   test('"rom 1 12" (no colon) opens Romans 1:12', async ({ page }) => {
      await gotoReady(page, '/');
      await page.keyboard.press('Control+k');
      await searchFor(page, 'rom 1 12');
      await expect(page).toHaveURL(/\/verse\/romans\/1\/12(\?|$)/);
   });
});

test('the shell search button opens the palette (touch and mouse)', async ({ page }) => {
   await gotoReady(page, '/');
   await page.getByRole('button', { name: /search verses/i }).first().click();
   await searchFor(page, 'John 3:16');
   await expect(page).toHaveURL(/\/verse\/john\/3\/16/);
});
