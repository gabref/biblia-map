import '@testing-library/jest-dom/vitest';

import { loadLocale } from '../i18n';

// Dictionaries are lazy chunks in the app (main.tsx awaits initI18n()); tests get both up
// front so components translate synchronously. Lazy loading itself is covered in i18n tests.
await Promise.all([ loadLocale('en'), loadLocale('it') ]);
