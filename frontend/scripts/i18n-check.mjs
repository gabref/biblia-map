#!/usr/bin/env node
/**
 * i18n parity check: every key in src/i18n/en.ts should exist in src/i18n/it.ts with the
 * same placeholders. Warn-only by default (exit 0); pass --strict to fail on problems.
 *
 *    npm run i18n:check
 *    npm run i18n:check -- --strict
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const strict = process.argv.includes('--strict');

/**
 * Parses `'key': 'value'` / `"key": "value"` / `` 'key': `value` `` entries. Values may span
 * lines (the key and the opening quote must be on one line). Concatenations are not supported.
 */
function parseMessages(source) {
   const messages = new Map();
   const entry = /^\s*(['"])([\w.-]+)\1\s*:\s*(?:\n\s*)?(['"`])((?:\\.|(?!\3)[\s\S])*)\3/gm;
   let match;

   while ((match = entry.exec(source)) !== null) {
      messages.set(match[2], match[4].replace(/\\(.)/g, '$1'));
   }

   return messages;
}

/** `{name}` and `{name, plural, ...}` variable names, sorted. */
function placeholders(value) {
   const names = new Set();
   const token = /\{\s*(\w+)\s*(?:,\s*plural\s*,|\})/g;
   let match;

   while ((match = token.exec(value)) !== null) {
      names.add(match[1]);
   }

   return [ ...names ].sort().join(',');
}

const en = parseMessages(readFileSync(join(root, 'en.ts'), 'utf8'));
const it = parseMessages(readFileSync(join(root, 'it.ts'), 'utf8'));

const missing = [ ...en.keys() ].filter((key) => !it.has(key));
const extra = [ ...it.keys() ].filter((key) => !en.has(key));
const mismatched = [ ...en.keys() ].filter((key) => it.has(key) && placeholders(en.get(key)) !== placeholders(it.get(key)));

console.log(`i18n: ${en.size} English keys, ${it.size} Italian keys.`);

function report(title, keys, describe = (key) => key) {
   if (keys.length === 0) {
      return;
   }

   console.warn(`\n${title} (${keys.length}):`);
   keys.forEach((key) => console.warn(`  - ${describe(key)}`));
}

report('Missing in it.ts (falls back to English)', missing, (key) => `${key}: "${en.get(key)}"`);
report('In it.ts but not in en.ts (unused)', extra);
report(
   'Placeholder mismatch',
   mismatched,
   (key) => `${key}: en {${placeholders(en.get(key))}} vs it {${placeholders(it.get(key))}}`,
);

const problems = missing.length + extra.length + mismatched.length;

if (problems === 0) {
   console.log('i18n: it.ts is complete.');
} else if (strict) {
   console.error(`\ni18n: ${problems} problem(s).`);
   process.exit(1);
} else {
   console.warn(`\ni18n: ${problems} problem(s) (warning only; use --strict to fail).`);
}
