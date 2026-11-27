/**
 * English source strings (§6.1). Flat dotted keys, grouped by namespace; each epic adds keys
 * ONLY inside its own block to keep merges conflict-free:
 *
 * - `shell.*`    E-F  shell, nav, shared components
 * - `home.*`     E-A  home, search, not-found, shortcuts
 * - `verse.*`    E-B  verse study workspace
 * - `study.*`    E-C  bookmarks, collections, notes, history, export
 * - `insights.*` E-D  insights, book profile
 * - `read.*`     E-E  read mode
 *
 * Interpolation: `{name}` placeholders, filled by `t(key, { name })`.
 * E-F adds `it.ts` typed as `Partial<Messages>`; missing keys fall back to English.
 */
export const en = {
   // ---- shell.* (E-F) ----
   'shell.brand.title': 'BibliaMap',
   'shell.brand.subtitle': 'Reference graph',
   'shell.nav.primary': 'Primary navigation',
   'shell.nav.home': 'Home',
   'shell.nav.verse': 'Verse Explorer',
   'shell.nav.read': 'Read',
   'shell.nav.insights': 'Insights',
   'shell.nav.study': 'My study',
   'shell.nav.about': 'About',
   'shell.loading': 'Loading…',
   'shell.error.retry': 'Try again',

   // ---- home.* (E-A) ----
   'home.search.placeholder': 'Search a verse, e.g. John 3:16',
   'home.notFound.title': 'Page not found',
   'home.notFound.body': 'The page {path} does not exist. Try searching for a verse.',

   // ---- verse.* (E-B) ----
   'verse.connections.title': 'Connections',
   'verse.connections.count': '{count} connections',

   // ---- study.* (E-C) ----
   'study.bookmark.add': 'Save verse',
   'study.bookmark.remove': 'Remove from saved',
   'study.history.continue': 'Continue where you left off',

   // ---- insights.* (E-D) ----
   'insights.title': 'Insights',

   // ---- read.* (E-E) ----
   'read.chapter.title': '{book} {chapter}',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
