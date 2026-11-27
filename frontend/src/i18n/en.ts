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
   'read.eyebrow': 'Read',
   'read.chapter.meta': '{verses} verses · {count} connections',
   'read.nav.label': 'Chapter navigation',
   'read.nav.footer': 'Previous and next chapter',
   'read.nav.prev': 'Previous chapter',
   'read.nav.next': 'Next chapter',
   'read.nav.book': 'Book',
   'read.nav.chapter': 'Chapter',
   'read.filter.kind': 'Reference type',
   'read.filter.kind.combined': 'All',
   'read.filter.kind.crossrefs': 'Cross references',
   'read.filter.kind.studyNotes': 'Study notes',
   'read.filter.dir': 'Direction',
   'read.filter.dir.all': 'Both ways',
   'read.filter.dir.outgoing': 'Refers to',
   'read.filter.dir.incoming': 'Referred by',
   'read.heat.toggle': 'Heatmap',
   'read.heat.legend': 'Fewer connections',
   'read.heat.legendMore': 'More',
   'read.text.label': 'Chapter text',
   'read.text.missing': 'Verse text is not included in this dataset. Counts and connections are still shown.',
   'read.verse.aria': 'Verse {verse}, {count} connections',
   'read.verse.count': '{count} connections',
   'read.verse.saved': 'Saved',
   'read.preview.more': '+{count} more · click to see all',
   'read.preview.none': 'No connections with the current filters.',
   'read.panel.label': 'Connections',
   'read.panel.verseTab': 'This verse',
   'read.panel.chapterTab': 'This chapter',
   'read.panel.empty.title': 'Pick a verse',
   'read.panel.empty.body': 'Click or tap a verse to see what it connects to. Use j and k to move between verses.',
   'read.panel.study': 'Study this verse',
   'read.panel.notes': 'Study notes',
   'read.panel.none': 'This verse has no connections with the current filters.',
   'read.panel.groupCount': '{count}',
   'read.panel.outgoing': 'Refers to',
   'read.panel.incoming': 'Referred to by',
   'read.panel.kind.crossref': 'Cross reference',
   'read.panel.kind.studyNote': 'Study note',
   'read.chapter.connectsTo': 'This chapter connects to',
   'read.chapter.summary': '{count} connections across {books} books',
   'read.chapter.topChapters': 'Most connected chapters',
   'read.chapter.none': 'No connections with the current filters.',
   'read.chapter.bookAria': '{book}: {count} connections. Show its chapters',
   'read.chapter.open': 'Read {label}',
   'read.chapter.self': 'Within this book',
   'read.chapter.more': 'Show {count} more books',
   'read.chapter.less': 'Show fewer books',
   'read.shortcuts.label': 'Keyboard shortcuts',
   'read.shortcuts.chapters': 'chapters',
   'read.shortcuts.verses': 'verses',
   'read.shortcuts.open': 'open',
   'read.error.title': 'This chapter could not be loaded',
   'read.empty.title': 'No verses found',
   'read.empty.body': 'This chapter has no verses in the selected edition.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
