import { expect, test, type Page } from '@playwright/test';

import { gotoReady, isMobileProject } from './support';

function verseButton(page: Page, verse: number) {
   return page.getByRole('button', { name: new RegExp(`^Verse ${verse}, \\d+ connections?$`) });
}

/** The verse panel: a side column on wide screens, a bottom sheet on small ones. */
function versePanel(page: Page, mobile: boolean) {
   return mobile ? page.getByRole('dialog') : page.getByRole('complementary', { name: 'Connections' });
}

test.describe('read mode', () => {
   test('/read/john/3#v16 selects verse 16 and shows its panel with study notes', async ({ page }, testInfo) => {
      const mobile = isMobileProject(testInfo);

      await gotoReady(page, '/read/john/3#v16');
      await expect(page.locator('main h1')).toHaveText('John 3');
      await expect(verseButton(page, 16)).toHaveAttribute('aria-pressed', 'true');

      if (mobile) {
         // The sheet opens on tap; a deep link only marks the verse.
         await verseButton(page, 16).click();
      }

      const panel = versePanel(page, mobile);

      await expect(panel.getByRole('link', { name: 'John 3:16', exact: true }).first()).toBeVisible();
      const notes = panel.getByRole('region', { name: 'Study notes' });

      await expect(notes).toBeVisible();
      await expect(notes).toContainText('only-begotten Son');
   });

   test('j/k move between verses, ←/→ between chapters', async ({ page }, testInfo) => {
      test.skip(isMobileProject(testInfo), 'keyboard: desktop only');

      await gotoReady(page, '/read/john/3#v16');
      await expect(verseButton(page, 16)).toHaveAttribute('aria-pressed', 'true');
      // Shortcuts are ignored while focus is in a field; start from the page itself.
      await page.locator('main h1').click();

      await page.keyboard.press('j');
      await expect(verseButton(page, 17)).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/#v17$/);
      await page.keyboard.press('k');
      await page.keyboard.press('k');
      await expect(verseButton(page, 15)).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/#v15$/);

      await page.keyboard.press('ArrowRight');
      await expect(page).toHaveURL(/\/read\/john\/4(\?|#|$)/);
      await expect(page.locator('main h1')).toHaveText('John 4');
      await page.keyboard.press('ArrowLeft');
      await expect(page).toHaveURL(/\/read\/john\/3(\?|#|$)/);
      await expect(page.locator('main h1')).toHaveText('John 3');
   });

   test('clicking a verse opens the panel', async ({ page }, testInfo) => {
      const mobile = isMobileProject(testInfo);

      await gotoReady(page, '/read/john/3');
      await verseButton(page, 3).click();
      await expect(verseButton(page, 3)).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/#v3$/);
      await expect(versePanel(page, mobile).getByRole('link', { name: 'John 3:3', exact: true }).first()).toBeVisible();
   });

   test('NWT (no study notes): the panel works and simply has no study notes', async ({ page }, testInfo) => {
      const mobile = isMobileProject(testInfo);

      await gotoReady(page, '/read/john/3?ds=nwt#v16');
      await expect(verseButton(page, 16)).toHaveAttribute('aria-pressed', 'true');

      if (mobile) await verseButton(page, 16).click();

      const panel = versePanel(page, mobile);

      await expect(panel.getByRole('link', { name: 'John 3:16', exact: true }).first()).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Study this verse' })).toBeVisible();
      await expect(panel.getByRole('region', { name: 'Study notes' })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
   });
});
