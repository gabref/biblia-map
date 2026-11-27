/**
 * End-to-end tests (Sprint 3 QA). Runs the production build through `vite preview` on a free port.
 *
 *    npm run e2e                      # builds dist/ (locally), then runs every spec
 *    npm run e2e -- --project=desktop-chromium e2e/search.spec.ts
 *    E2E_SKIP_BUILD=1 npm run e2e     # reuse an existing dist/ (CI does this after `npm run build`)
 *
 * Chromium only. Install once with `npx playwright install --with-deps chromium`.
 */
import { execFileSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

/**
 * The config is evaluated by the runner and again by every worker: pick the port once (in the
 * runner) and hand it to the workers through the environment, which they inherit.
 */
function freePort(): number {
   const script = "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})";

   return Number(execFileSync(process.execPath, [ '-e', script ], { encoding: 'utf8' }));
}

process.env.E2E_PORT ??= String(freePort());

const port = Number(process.env.E2E_PORT);
const baseURL = `http://127.0.0.1:${port}`;
const ci = Boolean(process.env.CI);
const skipBuild = ci || process.env.E2E_SKIP_BUILD === '1';
const preview = `npx vite preview --host 127.0.0.1 --port ${port} --strictPort --bypass-lock`;

export default defineConfig({
   testDir: './e2e',
   outputDir: './test-results',
   fullyParallel: true,
   forbidOnly: ci,
   retries: ci ? 1 : 0,
   workers: ci ? 2 : undefined,
   timeout: 30_000,
   expect: { timeout: 7_500 },
   reporter: ci ? [ [ 'list' ], [ 'html', { open: 'never', outputFolder: 'playwright-report' } ] ] : [ [ 'list' ] ],
   use: {
      baseURL,
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      // The app is dark-first whatever the OS says; emulate a light OS so the default is really tested.
      colorScheme: 'light',
      locale: 'en-US',
   },
   projects: [
      {
         name: 'desktop-chromium',
         use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      },
      {
         name: 'mobile-chromium',
         use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } },
      },
   ],
   webServer: {
      command: skipBuild ? preview : `npx vite build --logLevel warn && ${preview}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
   },
});
