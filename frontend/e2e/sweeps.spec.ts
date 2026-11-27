/**
 * Route sweeps: every route is loaded once per project and checked for console errors /
 * failed requests, accessibility (axe: dark + light on desktop, dark on phones) and, on phones,
 * horizontal overflow.
 * One page load per route keeps the sweep fast enough for CI.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { gotoReady, isMobileProject, ROUTES, trackIssues } from './support';

/**
 * Known open violations, owned by another stream. Each entry is excluded from axe only for
 * its own selector; remove it once fixed so the sweep guards it again.
 */
const KNOWN_ISSUES: readonly string[] = [];

/**
 * `label-content-name-mismatch` (WCAG 2.5.3) is an *experimental* axe rule. It still flags
 * deliberate patterns: "EN"/"IT" buttons named "English"/"Italiano", map nodes with
 * abbreviated labels ("Gen. 22:2" named "Genesis 22:2, …"), verse cards and Insights bars with
 * a descriptive aria-label. Tracked as an open item in the Sprint 3 QA report, not a gate.
 */
const DISABLED_RULES: readonly string[] = [ 'label-content-name-mismatch' ];

async function seriousViolations(page: Page): Promise<unknown[]> {
   let axe = new AxeBuilder({ page })
      .withTags([ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice' ])
      .disableRules([ ...DISABLED_RULES ]);

   for (const selector of KNOWN_ISSUES) axe = axe.exclude(selector);

   const results = await axe.analyze();

   return results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
         id: violation.id,
         impact: violation.impact,
         help: violation.help,
         nodes: violation.nodes.slice(0, 5).map((node) => `${node.target.join(' ')} — ${node.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
      }));
}

for (const route of ROUTES) {
   test(`sweep ${route.name} (${route.path})`, async ({ page }, testInfo) => {
      // axe on the largest pages (the verse map, 1,189 heatmap cells) takes several seconds per theme.
      test.setTimeout(120_000);

      const issues = trackIssues(page);

      await gotoReady(page, route.path);

      await test.step('no console errors or failed requests', () => {
         expect(issues.console, 'console errors').toEqual([]);
         expect(issues.requests, 'failed requests').toEqual([]);
      });

      // Colours are the same tokens at every width: phones check the default (dark) theme only.
      const themes = isMobileProject(testInfo) ? ([ 'dark' ] as const) : ([ 'dark', 'light' ] as const);

      for (const theme of themes) {
         await test.step(`a11y: no serious or critical axe violations (${theme})`, async () => {
            // Themes are pure CSS tokens on <html data-theme>: switch in place, no reload.
            await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
            // Let entrance animations and colour transitions settle so contrast is measured at rest.
            await page.waitForTimeout(600);

            const blocking = await seriousViolations(page);

            expect.soft(blocking, `${theme}: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
         });
      }

      if (isMobileProject(testInfo)) {
         await test.step('no horizontal overflow on phones', async () => {
            const overflow = await page.evaluate(() => {
               const root = document.documentElement;
               const offenders = [ ...document.querySelectorAll<HTMLElement>('body *') ]
                  .filter((element) => {
                     const rect = element.getBoundingClientRect();

                     return rect.width > 0 && rect.right > root.clientWidth + 1 && getComputedStyle(element).position !== 'fixed';
                  })
                  .slice(0, 5)
                  .map((element) => `${element.tagName.toLowerCase()}.${[ ...element.classList ].join('.')} right=${Math.round(element.getBoundingClientRect().right)}`);

               return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders };
            });

            expect.soft(overflow.scrollWidth, overflow.offenders.join('\n')).toBeLessThanOrEqual(overflow.clientWidth);
         });
      }

      // Anything logged while the checks ran (idle prefetches included) counts too.
      expect(issues.console, 'console errors (after checks)').toEqual([]);
      expect(issues.requests, 'failed requests (after checks)').toEqual([]);
   });
}
