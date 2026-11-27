import { expect, test, type Page } from '@playwright/test';

import { gotoReady, isMobileProject } from './support';

const JOHN_3_16 = '/verse/john/3/16';

function connections(page: Page) {
   return page.getByRole('region', { name: 'Connections', exact: true });
}

/** Study a connection from the list: a "Study …" link on desktop, expand the row then "Study this verse" on mobile. */
async function studyConnection(page: Page, ref: string, mobile: boolean): Promise<void> {
   const list = connections(page);

   if (!mobile) {
      await list.getByRole('link', { name: `Study ${ref}` }).click();
      return;
   }

   const row = list.getByRole('listitem').filter({ has: page.getByRole('article', { name: ref, exact: true }) });

   await row.getByRole('button', { name: new RegExp(`^${ref} `) }).click();
   await row.getByRole('button', { name: 'Study this verse' }).click();
}

/** Reference-type and depth controls: inline on desktop, in the "Filters" sheet on mobile. */
async function filterControls(page: Page, mobile: boolean) {
   if (!mobile) return page.locator('main');

   await page.getByRole('button', { name: /^Filters/ }).click();
   const sheet = page.getByRole('dialog', { name: 'Filters' });

   await expect(sheet).toBeVisible();
   return sheet;
}

function graph(page: Page) {
   return page.getByRole('group', { name: /^Map of the connections of/ });
}

test.describe('verse study', () => {
   test('John 3:16 renders its text and the connections list', async ({ page }) => {
      await gotoReady(page, JOHN_3_16);

      await expect(page.locator('main h1')).toContainText('John 3:16');
      await expect(page.getByRole('article', { name: 'John 3:16' }).first()).toContainText('For God loved the world so much');

      const list = connections(page);

      await expect(list.getByRole('status')).toHaveText(/\d+ connections/);
      await expect(list.getByRole('article').first()).toBeVisible();
      expect(await list.getByRole('article').count()).toBeGreaterThan(10);

      const jwLibrary = page.locator('.vs-studied__bar a[href^="https://www.jw.org/finder"]');

      await expect(jwLibrary).toHaveAttribute('href', /[?&]bible=43003016(&|$)/);
      await expect(jwLibrary).toHaveAttribute('target', '_blank');
   });

   test('a JW Library hand-off on /open lands on the verse in the matching edition', async ({ page }) => {
      await page.goto('/open?srcid=jwlshare&wtlocale=I&prefer=lang&bible=43003016&pub=nwtsty');

      await expect(page).toHaveURL(/\/verse\/john\/3\/16\?ds=nwtsty-i$/);
      await expect(page.locator('main h1')).toContainText('3:16');
   });

   test('studying a connection updates the URL and the trail; Back restores', async ({ page }, testInfo) => {
      await gotoReady(page, JOHN_3_16);

      await studyConnection(page, 'Genesis 22:2', isMobileProject(testInfo));
      await expect(page).toHaveURL(/\/verse\/genesis\/22\/2(\?|$)/);
      await expect(page.locator('main h1')).toContainText('Genesis 22:2');

      const trail = page.getByRole('navigation', { name: 'Study trail' });

      await expect(trail.getByRole('link', { name: 'John 3:16' })).toBeVisible();
      await expect(trail.getByRole('link', { name: 'Genesis 22:2' })).toHaveAttribute('aria-current', 'page');

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${JOHN_3_16}(\\?|$)`));
      await expect(page.locator('main h1')).toContainText('John 3:16');
   });

   test('Extended depth loads the second hop and writes depth=2', async ({ page }, testInfo) => {
      const mobile = isMobileProject(testInfo);

      await gotoReady(page, JOHN_3_16);

      const controls = await filterControls(page, mobile);

      await controls.getByRole('tab', { name: 'Extended' }).click();
      await expect(page).toHaveURL(/[?&]depth=2/);
      await expect(controls.getByRole('tab', { name: 'Extended' })).toHaveAttribute('aria-selected', 'true');

      if (mobile) {
         await controls.getByRole('button', { name: 'Show connections' }).click();
         await page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'Map' }).click();
      }

      const map = page.getByRole('region', { name: 'Map', exact: true });

      await expect(map.getByRole('status')).toHaveText(/one step further/, { timeout: 15_000 });
   });

   test('filters replace the URL (no new history entry) and survive a reload', async ({ page }, testInfo) => {
      const mobile = isMobileProject(testInfo);

      await gotoReady(page, JOHN_3_16);

      const historyLength = await page.evaluate(() => history.length);

      await connections(page).getByRole('tab', { name: /^Cites/ }).click();
      await expect(page).toHaveURL(/[?&]dir=outgoing/);

      const controls = await filterControls(page, mobile);

      await controls.getByRole('tab', { name: 'Study notes' }).click();
      await expect(page).toHaveURL(/[?&]kind=study-notes/);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);

      await page.reload();
      await expect(page.locator('main h1')).toContainText('John 3:16');
      await expect(connections(page).getByRole('tab', { name: /^Cites/ })).toHaveAttribute('aria-selected', 'true');

      const reloaded = await filterControls(page, mobile);

      await expect(reloaded.getByRole('tab', { name: 'Study notes' })).toHaveAttribute('aria-selected', 'true');
   });

   test('owner requirement: wheel over the graph zooms without scrolling the page; outside it scrolls', async ({ page }, testInfo) => {
      test.skip(isMobileProject(testInfo), 'mouse wheel: desktop only');

      await gotoReady(page, JOHN_3_16);

      const svg = graph(page);
      const viewport = page.getByTestId('graph-viewport');
      const scrollTop = (): Promise<number> => page.evaluate(() => Math.round(document.scrollingElement?.scrollTop ?? 0));

      await svg.scrollIntoViewIfNeeded();
      // Let the fit-to-frame transition settle before reading the transform.
      await expect.poll(() => viewport.getAttribute('transform')).toMatch(/scale\(/);
      await page.waitForTimeout(800);

      const before = { transform: await viewport.getAttribute('transform'), scroll: await scrollTop() };
      const box = await svg.boundingBox();

      if (!box) throw new Error('graph has no box');

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -400);
      await expect.poll(() => viewport.getAttribute('transform')).not.toBe(before.transform);
      await page.waitForTimeout(300);
      expect(await scrollTop()).toBe(before.scroll);

      // Outside the graph (over the connections list) the wheel scrolls the page as usual.
      const outside = await connections(page).getByRole('heading', { name: 'Connections' }).boundingBox();

      if (!outside) throw new Error('connections heading has no box');

      await page.mouse.move(outside.x + 10, outside.y + outside.height / 2);
      await page.mouse.wheel(0, 400);
      await expect.poll(scrollTop).toBeGreaterThan(before.scroll);
   });
});
