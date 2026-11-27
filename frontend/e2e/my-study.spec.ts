import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { gotoReady, isMobileProject } from './support';

function studiedVerse(page: Page) {
   return page.getByRole('region', { name: /^Verse being studied:/ });
}

function savedCollectionLink(page: Page) {
   return page.getByRole('region', { name: 'Collections' }).getByRole('link', { name: /^Saved \d+ verses?$/ });
}

/** Save the studied verse with its Save button (quick save to "Saved", then close the picker). */
async function saveWithButton(page: Page): Promise<void> {
   await studiedVerse(page).getByRole('button', { name: /^Save( |$)/ }).click();
   await expect(studiedVerse(page).getByRole('button', { name: /is saved|^Saved/ })).toBeVisible();
   await page.keyboard.press('Escape');
}

test.describe('my study', () => {
   test('the Save button and the b shortcut save verses that then appear on /study', async ({ page }, testInfo) => {
      await gotoReady(page, '/verse/john/3/16');
      await saveWithButton(page);

      let expected = 1;

      if (!isMobileProject(testInfo)) {
         await gotoReady(page, '/verse/romans/8/28');
         // Focus is on the page (not a field) after a fresh load, so the shortcut applies.
         await page.keyboard.press('b');
         await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Romans 8:28');
         expected = 2;
      }

      await gotoReady(page, '/study');
      await expect(savedCollectionLink(page)).toHaveAccessibleName(`Saved ${expected} verse${expected === 1 ? '' : 's'}`);

      await savedCollectionLink(page).click();
      await expect(page).toHaveURL(/\/study\/saved(\?|$)/);
      await expect(page.locator('main')).toContainText('John 3:16');
      if (expected === 2) await expect(page.locator('main')).toContainText('Romans 8:28');
   });

   test('a new collection can be created', async ({ page }) => {
      await gotoReady(page, '/study');
      await page.getByRole('button', { name: 'New collection' }).click();
      await page.getByRole('textbox', { name: 'New collection name' }).fill('Talk: God’s love');
      await page.getByRole('textbox', { name: 'New collection name' }).press('Enter');

      const collections = page.getByRole('region', { name: 'Collections' });

      // Creating may open the new collection right away; either way it is listed on /study.
      await gotoReady(page, '/study');
      await expect(collections.getByRole('link', { name: /^Talk: God’s love 0 verses$/ })).toBeVisible();
      await page.reload();
      await expect(collections.getByRole('link', { name: /^Talk: God’s love/ })).toBeVisible();
   });

   test('a verse note autosaves and persists after reload', async ({ page }) => {
      const text = `E2E note ${Date.now()}`;

      await gotoReady(page, '/verse/john/3/16');
      await studiedVerse(page).getByRole('button', { name: 'Add a note' }).click();

      const note = page.getByRole('textbox', { name: /note/i }).first();

      await note.fill(text);
      // No blur: the debounce alone must save it.
      await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
      await page.reload();
      await expect(page.locator('main h1')).toContainText('John 3:16');
      await expect(page.locator('main')).toContainText(text);

      await gotoReady(page, '/study');
      await expect(page.getByRole('region', { name: 'Notes' })).toContainText(text);
   });

   test('export downloads a JSON backup and import merges it into another browser', async ({ page, browser }) => {
      // Two browser profiles and four page loads: allow more than the default budget.
      test.slow();
      await gotoReady(page, '/verse/john/3/16');
      await saveWithButton(page);
      await gotoReady(page, '/study');

      const [ download ] = await Promise.all([ page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click() ]);

      expect(download.suggestedFilename()).toMatch(/\.json$/);
      const file = test.info().outputPath('backup.json');

      await download.saveAs(file);
      const backup = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

      expect(JSON.stringify(backup)).toContain('43.3.16');

      // A second, empty browser profile with a different saved verse.
      const other = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
      const second = await other.newPage();

      try {
         await gotoReady(second, '/verse/genesis/1/1');
         await saveWithButton(second);
         await gotoReady(second, '/study');
         await expect(savedCollectionLink(second)).toHaveAccessibleName('Saved 1 verse');

         await second.locator('input[type="file"]').setInputFiles(file);
         const confirm = second.getByRole('dialog', { name: 'Merge this backup?' });

         await expect(confirm).toBeVisible();
         await confirm.getByRole('button', { name: 'Merge' }).click();
         await expect(confirm).toBeHidden();
         await expect(savedCollectionLink(second)).toHaveAccessibleName('Saved 2 verses');
      } finally {
         await other.close();
      }
   });
});
