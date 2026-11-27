import { expect, type Page, type TestInfo } from '@playwright/test';

/** One URL per route (and per interim Insights tab). Used by the a11y, overflow and console sweeps. */
export const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
   { name: 'home', path: '/' },
   { name: 'verse', path: '/verse/john/3/16' },
   { name: 'verse (nwt)', path: '/verse/genesis/1/1?ds=nwt' },
   { name: 'read', path: '/read/john/3' },
   { name: 'read (it)', path: '/read/john/3?ds=nwtsty-i&lang=it' },
   { name: 'insights', path: '/insights' },
   { name: 'insights chord', path: '/insights?tab=chord' },
   { name: 'insights clusters', path: '/insights?tab=clusters' },
   { name: 'book', path: '/book/john' },
   { name: 'study', path: '/study' },
   { name: 'study collection', path: '/study/saved' },
   { name: 'study print', path: '/study/saved/print' },
   { name: 'about', path: '/about' },
   { name: 'not found', path: '/no-such-page' },
];

/** Navigate and wait until the routed page has rendered its <h1> and settled its data requests. */
export async function gotoReady(page: Page, path: string): Promise<void> {
   await page.goto(path);
   await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
   await page.waitForLoadState('networkidle');
}

export interface PageIssues {
   console: string[];
   requests: string[];
}

/** Collect console errors, uncaught exceptions and failed / 4xx-5xx same-origin requests. */
export function trackIssues(page: Page): PageIssues {
   const issues: PageIssues = { console: [], requests: [] };
   const sameOrigin = (url: string): boolean => url.startsWith(new URL(page.url() || 'http://127.0.0.1').origin) || url.startsWith('http://127.0.0.1');

   page.on('console', (message) => {
      if (message.type() === 'error') issues.console.push(message.text());
   });
   page.on('pageerror', (error) => issues.console.push(`pageerror: ${error.message}`));
   page.on('requestfailed', (request) => {
      // Aborted prefetches on navigation are not failures.
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') issues.requests.push(`${request.failure()?.errorText} ${request.url()}`);
   });
   page.on('response', (response) => {
      if (response.status() >= 400 && sameOrigin(response.url())) issues.requests.push(`${response.status()} ${response.url()}`);
   });

   return issues;
}

/** Desktop-only / mobile-only guards, used as `test.skip(...isMobileProject(testInfo))`. */
export function isMobileProject(testInfo: TestInfo): boolean {
   return testInfo.project.name.startsWith('mobile');
}
