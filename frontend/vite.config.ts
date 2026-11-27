import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
   plugins: [ react(), tailwindcss() ],
   build: {
      rolldownOptions: {
         output: {
            // Long-lived vendor chunks: app deploys do not invalidate the cached React/d3 code.
            codeSplitting: {
               groups: [
                  { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
                  { name: 'd3-vendor', test: /node_modules[\\/](d3-[a-z]+|internmap)[\\/]/ },
               ],
            },
         },
      },
   },
   test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      // Playwright specs (npm run e2e) live in e2e/ and must not be collected by Vitest.
      exclude: [ '**/node_modules/**', 'e2e/**' ],
   },
});
