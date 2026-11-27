import { Flame, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
   Button,
   Card,
   CardHeader,
   Chip,
   EmptyState,
   Kbd,
   Sheet,
   Skeleton,
   TabPanel,
   Tabs,
} from '../../components/ui';
import {
   adjacentChapter,
   chapterSummary,
   loadChapterData,
   verseCount,
} from '../../data/chapterData';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { DEFAULT_VERSE, chapterHref, navigate, useRoute, type RouteParams } from '../../routing/routes';
import { recordVisit, useBookmarks, verseKey } from '../../study/store';
import type { DirectionMode, EdgeKindFilter } from '../../types/generated';
import { readStoredValue, writeStoredValue } from '../../utils/storage';
import { ChapterConnections } from './ChapterConnections';
import { ChapterNav, goToChapter } from './ChapterNav';
import { ChapterText, verseElementId } from './ChapterText';
import { VerseConnections } from './VerseConnections';
import './read.css';

export interface ReadPageProps {
   /** Active dataset id (e.g. `nwtsty`), as the shell passes to every page. */
   datasetId: string;
}

type PanelTab = 'verse' | 'chapter';

const HEAT_STORAGE_KEY = 'bibliamap.read.heat';
/** Side panel next to the text from here up; below, a sheet (drawer ≥760px, bottom sheet under). */
const WIDE_QUERY = '(min-width: 1200px)';

function isTypingTarget(target: EventTarget | null): boolean {
   return target instanceof HTMLElement
      && (target.isContentEditable || [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes(target.tagName) || target.closest('[role="tablist"]') !== null);
}

function verseFromHash(): number | null {
   const match = /^#v(\d{1,3})$/.exec(window.location.hash);

   return match ? Number(match[1]) : null;
}

function setVerseHash(verseNumber: number | null): void {
   const { pathname, search } = window.location;
   const hash = verseNumber === null ? '' : `#${verseElementId(verseNumber)}`;

   window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`);
}

/**
 * Read mode (`/read/<book>/<chapter>`): the chapter's text with a per-verse reference heatmap,
 * hover previews, a connections panel (side panel on wide screens, sheet otherwise) and the
 * "This chapter connects to" summary. Reads the chapter from `useRoute()`.
 */
export function ReadPage({ datasetId }: ReadPageProps): React.ReactElement {
   const t = useT();
   const { route, params } = useRoute();
   const bookNumber = route.name === 'read' ? route.book : DEFAULT_VERSE.bookNumber;
   const chapterNumber = route.name === 'read' ? route.chapter : DEFAULT_VERSE.chapterNumber;
   const kind: EdgeKindFilter = params.kind ?? 'combined';
   const direction: DirectionMode = params.dir ?? 'all';
   const linkParams: RouteParams = useMemo(() => ({ ...params }), [ params ]);
   const wide = useMediaQuery(WIDE_QUERY);
   const [ attempt, setAttempt ] = useState(0);
   const state = useAsyncData(
      () => loadChapterData(datasetId, bookNumber, chapterNumber),
      [ datasetId, bookNumber, chapterNumber, attempt ],
      { keepPreviousData: true },
   );
   const data = state.data;
   const [ selected, setSelected ] = useState<number | null>(null);
   const [ panelTab, setPanelTab ] = useState<PanelTab>('chapter');
   const [ sheetOpen, setSheetOpen ] = useState(false);
   const [ showHeat, setShowHeat ] = useState(() => readStoredValue(HEAT_STORAGE_KEY) !== 'off');
   const focusedRef = useRef<number | null>(null);
   const bookmarks = useBookmarks();
   const ready = data !== null && !state.isStale;

   const counts = useMemo(
      () => data?.verses.map((verse) => verseCount(verse, kind, direction)) ?? [],
      [ data, kind, direction ],
   );
   const maxCount = useMemo(() => counts.reduce((max, count) => Math.max(max, count), 0), [ counts ]);
   const totalCount = useMemo(() => counts.reduce((sum, count) => sum + count, 0), [ counts ]);
   const summary = useMemo(() => (data ? chapterSummary(data, kind, direction) : null), [ data, kind, direction ]);
   const bookmarked = useMemo(() => {
      const keys = new Set(bookmarks.bookmarks.map((item) => item.key));

      return new Set((data?.verses ?? []).filter((verse) => keys.has(verseKey(verse.ref))).map((verse) => verse.ref.verseNumber));
   }, [ bookmarks, data ]);
   const selectedVerse = data?.verses.find((verse) => verse.ref.verseNumber === selected) ?? null;

   // New chapter: honour a `#v<N>` deep link, else start at the top with nothing selected.
   useEffect(() => {
      if (!ready || !data) return;
      const target = verseFromHash();

      focusedRef.current = null;

      if (target !== null && data.verses.some((verse) => verse.ref.verseNumber === target)) {
         setSelected(target);
         setPanelTab('verse');
         const scroll = (): void => document.getElementById(verseElementId(target))?.scrollIntoView({ block: 'center', behavior: 'instant' });

         scroll();
         // Web fonts change line heights; settle the position once they are in.
         document.fonts?.ready.then(() => window.requestAnimationFrame(scroll));
      } else {
         setSelected(null);
         setPanelTab('chapter');
         setSheetOpen(false);
         window.scrollTo({ top: 0, behavior: 'instant' });
      }
      // Only on chapter / dataset change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [ ready, datasetId, bookNumber, chapterNumber ]);

   const select = useCallback((verseNumber: number | null, opts?: { open?: boolean; record?: boolean }) => {
      setSelected(verseNumber);
      setVerseHash(verseNumber);

      if (verseNumber === null) {
         setSheetOpen(false);
         return;
      }

      setPanelTab('verse');

      if (opts?.open) setSheetOpen(true);
      if (opts?.record) {
         recordVisit({ bookNumber, chapterNumber, verseNumber }, { datasetId });
      }
   }, [ bookNumber, chapterNumber, datasetId ]);

   const openVerse = useCallback((verseNumber: number) => select(verseNumber, { open: true, record: true }), [ select ]);
   const focusVerse = useCallback((verseNumber: number) => {
      focusedRef.current = verseNumber;
   }, []);

   const setFilter = (next: Partial<Pick<RouteParams, 'kind' | 'dir'>>): void => {
      const merged: RouteParams = { ...params, ...next };

      if (merged.kind === 'combined') delete merged.kind;
      if (merged.dir === 'all') delete merged.dir;
      navigate(`${chapterHref({ bookNumber, chapterNumber }, merged)}${window.location.hash}`, { replace: true });
   };

   const toggleHeat = (): void => {
      setShowHeat((value) => {
         writeStoredValue(HEAT_STORAGE_KEY, value ? 'off' : 'on');
         return !value;
      });
   };

   // Keyboard: ←/→ chapters, j/k verses, Escape clears the selection.
   useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent): void => {
         if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
         if (sheetOpen && !wide) return;

         if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const pointer = adjacentChapter(bookNumber, chapterNumber, event.key === 'ArrowLeft' ? -1 : 1);

            if (pointer) {
               event.preventDefault();
               setVerseHash(null);
               goToChapter(pointer.bookNumber, pointer.chapterNumber, params);
            }
            return;
         }

         if ((event.key === 'j' || event.key === 'k') && !event.shiftKey && data) {
            const numbers = data.verses.map((verse) => verse.ref.verseNumber);
            const current = focusedRef.current ?? selected;
            const index = current === null ? -1 : numbers.indexOf(current);
            const nextIndex = event.key === 'j'
               ? Math.min(numbers.length - 1, index + 1)
               : Math.max(0, index === -1 ? 0 : index - 1);
            const next = numbers[nextIndex];

            if (next === undefined) return;
            event.preventDefault();
            const element = document.getElementById(verseElementId(next));

            element?.scrollIntoView({ block: 'nearest' });
            element?.focus({ preventScroll: true });
            focusedRef.current = next;
            if (wide) select(next);
            return;
         }

         if (event.key === 'Escape' && selected !== null && wide) {
            select(null);
         }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => window.removeEventListener('keydown', handleKeyDown);
   }, [ bookNumber, chapterNumber, data, params, select, selected, sheetOpen, wide ]);

   if (state.error && !data) {
      return (
         <div className="page-stack read-page">
            <EmptyState
               size="page"
               title={t('read.error.title')}
               description={state.error.message}
               action={(
                  <Button leading={<RotateCcw size={14} />} onClick={() => setAttempt((value) => value + 1)}>
                     {t('shell.error.retry')}
                  </Button>
               )}
            />
         </div>
      );
   }

   // Title follows the loaded data, so a stale chapter never shows the next chapter's title.
   const title = data ? t('read.chapter.title', { book: data.book.name, chapter: data.chapterNumber }) : '';

   const verseTabs = [
      { value: 'verse' as const, label: t('read.panel.verseTab') },
      { value: 'chapter' as const, label: t('read.panel.chapterTab') },
   ];
   const kindTabs: Array<{ value: EdgeKindFilter; label: string; disabled?: boolean }> = [
      { value: 'combined', label: t('read.filter.kind.combined') },
      { value: 'crossrefs', label: t('read.filter.kind.crossrefs') },
      { value: 'study-notes', label: t('read.filter.kind.studyNotes'), disabled: data ? !data.hasStudyNoteRefs : false },
   ];
   const dirTabs: Array<{ value: DirectionMode; label: string }> = [
      { value: 'all', label: t('read.filter.dir.all') },
      { value: 'outgoing', label: t('read.filter.dir.outgoing') },
      { value: 'incoming', label: t('read.filter.dir.incoming') },
   ];

   const verseContent = data && selectedVerse ? (
      <VerseConnections
         datasetId={datasetId}
         books={data.books}
         verse={selectedVerse}
         verseIndex={data.verseIndex}
         kind={kind}
         direction={direction}
         params={linkParams}
         notes={data.studyNotes?.get(selectedVerse.ref.jwpubVerseId) ?? null}
         lang={data.lang}
      />
   ) : (
      <EmptyState title={t('read.panel.empty.title')} description={t('read.panel.empty.body')} />
   );
   const chapterContent = data && summary ? (
      <ChapterConnections
         summary={summary}
         books={data.books}
         currentBook={bookNumber}
         verses={data.verses}
         verseIndex={data.verseIndex}
         kind={kind}
         direction={direction}
         params={linkParams}
      />
   ) : null;

   return (
      <div className="page-stack read-page">
         <header className="read-header">
            <div className="read-header__titles">
               <p className="t-eyebrow">{t('read.eyebrow')}</p>
               {data ? <h1 className="read-header__title">{title}</h1> : <Skeleton width="12ch" height="2.5rem" variant="block" />}
               {data ? (
                  <p className="t-caption read-header__meta">
                     {t('read.chapter.meta', { verses: data.verses.length, count: totalCount })}
                  </p>
               ) : null}
            </div>
            <ChapterNav books={data?.books ?? []} bookNumber={bookNumber} chapterNumber={chapterNumber} params={params} />
         </header>

         <div className="read-toolbar" role="group" aria-label={t('read.panel.label')}>
            <Tabs label={t('read.filter.kind')} items={kindTabs} value={kind} onChange={(value) => setFilter({ kind: value })} variant="pill" size="sm" />
            <Tabs label={t('read.filter.dir')} items={dirTabs} value={direction} onChange={(value) => setFilter({ dir: value })} variant="pill" size="sm" />
            <Chip tone="accent" size="sm" selected={showHeat} onClick={toggleHeat} leading={<Flame size={12} />}>
               {t('read.heat.toggle')}
            </Chip>
            {showHeat ? (
               <span className="read-legend t-caption" aria-hidden="true">
                  {t('read.heat.legend')}
                  <span className="read-legend__scale">
                     {[ 1, 2, 3, 4, 5 ].map((step) => <span key={step} data-heat={step} />)}
                  </span>
                  {t('read.heat.legendMore')}
               </span>
            ) : null}
            <span className="read-shortcuts t-caption" aria-label={t('read.shortcuts.label')}>
               <Kbd>←</Kbd><Kbd>→</Kbd> {t('read.shortcuts.chapters')} · <Kbd>j</Kbd><Kbd>k</Kbd> {t('read.shortcuts.verses')} · <Kbd>↵</Kbd> {t('read.shortcuts.open')}
            </span>
         </div>

         <div className={cx('read-layout', wide && 'read-layout--wide', state.isStale && 'is-stale')} aria-busy={!ready}>
            <article className="read-column" aria-label={title || undefined}>
               {!data ? (
                  <div className="read-loading t-scripture" aria-hidden="true">
                     <Skeleton lines={14} />
                  </div>
               ) : data.verses.length === 0 ? (
                  <EmptyState title={t('read.empty.title')} description={t('read.empty.body')} />
               ) : (
                  <ChapterText
                     key={`${datasetId}:${bookNumber}:${chapterNumber}`}
                     datasetId={datasetId}
                     books={data.books}
                     verses={data.verses}
                     counts={counts}
                     maxCount={maxCount}
                     verseIndex={data.verseIndex}
                     kind={kind}
                     direction={direction}
                     verseDegree={data.verseDegree}
                     showHeat={showHeat}
                     selectedVerse={selected}
                     bookmarked={bookmarked}
                     lang={data.lang}
                     onOpen={openVerse}
                     onFocusVerse={focusVerse}
                  />
               )}
               {data ? <ChapterFooter bookNumber={bookNumber} chapterNumber={chapterNumber} params={params} books={data.books} /> : null}
            </article>

            {wide ? (
               <aside className="read-aside" aria-labelledby="read-aside-title">
                  <h2 id="read-aside-title" className="visually-hidden">{t('read.panel.label')}</h2>
                  <Card padding="none" className="read-aside__card">
                     <div className="read-aside__tabs">
                        <Tabs label={t('read.panel.label')} items={verseTabs} value={panelTab} onChange={setPanelTab} idBase="read-panel" variant="underline" size="sm" block />
                     </div>
                     <div className="read-aside__body">
                        <TabPanel idBase="read-panel" value="verse" activeValue={panelTab}>{verseContent}</TabPanel>
                        <TabPanel idBase="read-panel" value="chapter" activeValue={panelTab}>{chapterContent}</TabPanel>
                     </div>
                  </Card>
               </aside>
            ) : (
               <Card as="section" className="read-summary" aria-labelledby="read-summary-title">
                  <CardHeader title={<span id="read-summary-title">{t('read.chapter.connectsTo')}</span>} level={2} />
                  {chapterContent ?? <Skeleton lines={6} />}
               </Card>
            )}
         </div>

         {!wide ? (
            <Sheet
               open={sheetOpen && selectedVerse !== null}
               onClose={() => setSheetOpen(false)}
               title={selectedVerse?.ref.label ?? ''}
               hideTitle
               className="read-sheet"
            >
               {verseContent}
            </Sheet>
         ) : null}
      </div>
   );
}

function ChapterFooter({ bookNumber, chapterNumber, params, books }: {
   bookNumber: number;
   chapterNumber: number;
   params: RouteParams;
   books: Array<{ bookNumber: number; name: string }>;
}): React.ReactElement {
   const t = useT();
   const prev = adjacentChapter(bookNumber, chapterNumber, -1);
   const next = adjacentChapter(bookNumber, chapterNumber, 1);
   const name = (pointer: { bookNumber: number; chapterNumber: number }): string =>
      `${books.find((book) => book.bookNumber === pointer.bookNumber)?.name ?? ''} ${pointer.chapterNumber}`;

   return (
      <nav className="read-footer" aria-label={t('read.nav.footer')}>
         {prev ? (
            <a
               className="read-footer__link read-footer__link--prev"
               href={chapterHref(prev, params)}
               onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  navigate(chapterHref(prev, params));
               }}
            >
               <span className="t-caption">{t('read.nav.prev')}</span>
               <span className="read-footer__name">← {name(prev)}</span>
            </a>
         ) : <span />}
         {next ? (
            <a
               className="read-footer__link read-footer__link--next"
               href={chapterHref(next, params)}
               onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  navigate(chapterHref(next, params));
               }}
            >
               <span className="t-caption">{t('read.nav.next')}</span>
               <span className="read-footer__name">{name(next)} →</span>
            </a>
         ) : <span />}
      </nav>
   );
}
