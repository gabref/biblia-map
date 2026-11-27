/**
 * Verse search (owner: E-A): the ⌘K / `/` command palette, the shell trigger button and the
 * inline search box used on Home and the not-found page. All share one ARIA combobox panel.
 *
 * Typing "Gv 3:16", "rom 1 12", "Sal 23" or "1 Cor 13" lists matching verses (→ Study),
 * chapters (→ Read) and books (→ book profile). With an empty query the palette lists recent
 * verses from the study history.
 */
import { BookOpen, CornerDownLeft, History, Library, Quote, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useT } from '../i18n';
import { cx } from '../lib/cx';
import { DURATION, motionDuration } from '../lib/motion';
import { isApplePlatform } from '../hooks/useKeyboardShortcuts';
import { navigate, type RouteParams } from '../routing/routes';
import {
   bookDisplayName,
   resultHref,
   searchCitations,
   useSearchData,
   useVersePreview,
   type SearchData,
   type SearchResult,
   type VerseResult,
} from '../search';
import { parseVerseKey, useHistory } from '../study/store';
import { Kbd } from './ui';
import './VerseSearch.css';

const RECENT_LIMIT = 6;

interface PanelProps {
   datasetId: string;
   /** BCP-47 language of the dataset, set on scripture previews. */
   lang?: string;
   params?: RouteParams;
   /** palette — inside the ⌘K dialog (recents when empty). inline — a page's search box. */
   variant: 'palette' | 'inline';
   autoFocus?: boolean;
   /** Called after a result was opened (palette closes itself here). */
   onNavigate?: () => void;
   /** Escape: closes the palette; inline, fires on an empty box. */
   onEscape?: () => void;
   inputRef?: React.Ref<HTMLInputElement>;
   size?: 'md' | 'lg';
}

function recentResults(data: SearchData, keys: readonly string[]): VerseResult[] {
   const results: VerseResult[] = [];

   for (const key of keys) {
      const ref = parseVerseKey(key);

      if (!ref) continue;

      const name = bookDisplayName(data, ref.bookNumber);

      results.push({
         kind: 'verse',
         id: `r:${key}`,
         bookNumber: ref.bookNumber,
         bookName: name,
         label: `${name} ${ref.chapterNumber}:${ref.verseNumber}`,
         chapter: ref.chapterNumber,
         verse: ref.verseNumber,
         score: 0,
      });

      if (results.length >= RECENT_LIMIT) break;
   }

   return results;
}

function ResultIcon({ result, recent }: { result: SearchResult; recent: boolean }): React.ReactElement {
   if (recent) return <History size={16} aria-hidden="true" />;
   if (result.kind === 'chapter') return <BookOpen size={16} aria-hidden="true" />;
   if (result.kind === 'book') return <Library size={16} aria-hidden="true" />;

   return <Quote size={16} aria-hidden="true" />;
}

/** The combobox: input + listbox. */
export function VerseSearchPanel({
   datasetId,
   lang,
   params,
   variant,
   autoFocus = false,
   onNavigate,
   onEscape,
   inputRef,
   size = 'md',
}: PanelProps): React.ReactElement {
   const t = useT();
   const data = useSearchData(datasetId);
   const history = useHistory();
   const [ query, setQuery ] = useState('');
   const [ activeIndex, setActiveIndex ] = useState(0);
   const [ focused, setFocused ] = useState(false);
   const listId = useId();
   const hintId = useId();
   const trimmed = query.trim();
   const results = useMemo(() => (trimmed ? searchCitations(trimmed, data) : []), [ trimmed, data ]);
   const recents = useMemo(
      () => (variant === 'palette' && !trimmed ? recentResults(data, history.entries.map((entry) => entry.key)) : []),
      [ variant, trimmed, data, history.entries ],
   );
   const showingRecents = !trimmed && recents.length > 0;
   const options = trimmed ? results : recents;
   const active = options[Math.min(activeIndex, options.length - 1)] as SearchResult | undefined;
   const previewTarget = active?.kind === 'verse' ? { bookNumber: active.bookNumber, chapter: active.chapter, verse: active.verse } : null;
   const preview = useVersePreview(datasetId, data, previewTarget);
   const expanded = variant === 'palette' ? options.length > 0 || trimmed.length > 0 : focused && trimmed.length > 0;

   useEffect(() => setActiveIndex(0), [ trimmed ]);

   const open = (result: SearchResult, newTab = false): void => {
      const href = resultHref(result, params);

      if (newTab) {
         window.open(href, '_blank', 'noopener');
         return;
      }

      navigate(href);
      setQuery('');
      onNavigate?.();
   };

   const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
         if (options.length === 0) return;
         event.preventDefault();
         const delta = event.key === 'ArrowDown' ? 1 : -1;
         setActiveIndex((index) => (Math.min(index, options.length - 1) + delta + options.length) % options.length);
      } else if (event.key === 'Enter') {
         if (active) {
            event.preventDefault();
            open(active, event.metaKey || event.ctrlKey);
         }
      } else if (event.key === 'Escape') {
         if (variant === 'palette') {
            // Handle here: a search input would otherwise swallow Esc to clear itself.
            event.preventDefault();
            onEscape?.();
         } else if (query) {
            event.preventDefault();
            setQuery('');
         } else {
            onEscape?.();
         }
      }
   };

   const activeId = active ? `${listId}-${active.id}` : undefined;

   return (
      <div className={cx('verse-search', `verse-search--${variant}`, `verse-search--${size}`)}>
         <div className="verse-search__field">
            <Search className="verse-search__icon" size={size === 'lg' ? 20 : 18} aria-hidden="true" />
            <input
               ref={inputRef}
               className="verse-search__input"
               type="search"
               role="combobox"
               aria-label={t('home.search.label')}
               aria-expanded={expanded}
               aria-controls={listId}
               aria-autocomplete="list"
               aria-activedescendant={expanded ? activeId : undefined}
               aria-describedby={hintId}
               placeholder={t('home.search.placeholder')}
               autoComplete="off"
               autoCorrect="off"
               autoCapitalize="off"
               spellCheck={false}
               enterKeyHint="go"
               autoFocus={autoFocus}
               value={query}
               onChange={(event) => setQuery(event.target.value)}
               onKeyDown={handleKeyDown}
               onFocus={() => setFocused(true)}
               onBlur={() => setFocused(false)}
            />
            {query && variant === 'inline' ? (
               <button type="button" className="verse-search__clear" aria-label={t('home.search.clear')} onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery('')}>
                  <X size={16} aria-hidden="true" />
               </button>
            ) : null}
            {variant === 'palette' ? <Kbd className="verse-search__esc">Esc</Kbd> : null}
         </div>
         <p id={hintId} className="visually-hidden">
            {t('home.search.hint')}
         </p>

         <div className={cx('verse-search__popup', expanded && 'is-open')}>
            {showingRecents ? <p className="verse-search__group">{t('home.search.recent')}</p> : null}
            <ul id={listId} role="listbox" aria-label={showingRecents ? t('home.search.recent') : t('home.search.results')} className="verse-search__list">
               {options.map((result, index) => {
                  const isActive = active?.id === result.id;
                  const recent = result.id.startsWith('r:');

                  return (
                     <li
                        key={result.id}
                        id={`${listId}-${result.id}`}
                        role="option"
                        aria-selected={isActive}
                        className={cx('verse-search__option', isActive && 'is-active')}
                        style={{ '--i': index } as React.CSSProperties}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => !isActive && setActiveIndex(index)}
                        onClick={(event) => open(result, event.metaKey || event.ctrlKey)}
                        onAuxClick={(event) => event.button === 1 && open(result, true)}
                     >
                        <span className="verse-search__option-icon">
                           <ResultIcon result={result} recent={recent} />
                        </span>
                        <span className="verse-search__option-body">
                           <span className="verse-search__option-label t-ref">{result.label}</span>
                           {isActive && result.kind === 'verse' ? (
                              <span className="verse-search__preview t-scripture" lang={lang}>
                                 {preview === undefined ? t('home.search.loadingPreview') : preview === null ? t('home.search.noVerse') : preview.text}
                              </span>
                           ) : null}
                        </span>
                        <span className="verse-search__option-kind">
                           {result.kind === 'verse'
                              ? t('home.search.kindVerse')
                              : result.kind === 'chapter'
                                 ? t('home.search.kindChapter')
                                 : t('home.search.kindBook')}
                           {isActive ? <CornerDownLeft size={14} aria-hidden="true" /> : null}
                        </span>
                     </li>
                  );
               })}
            </ul>
            {trimmed && options.length === 0 ? (
               <p className="verse-search__empty" role="status">
                  {t('home.search.noResults', { query: trimmed })}
               </p>
            ) : null}
            {variant === 'palette' && !trimmed && options.length === 0 ? (
               <p className="verse-search__empty">{t('home.search.emptyHelp')}</p>
            ) : null}
         </div>
         <p className="visually-hidden" role="status" aria-live="polite">
            {trimmed ? t('home.search.count', { count: options.length }) : ''}
         </p>
      </div>
   );
}

export interface VerseSearchPaletteProps {
   open: boolean;
   onClose: () => void;
   datasetId: string;
   lang?: string;
   params?: RouteParams;
}

/**
 * The command palette: a modal <dialog> (focus trap, Esc, backdrop click) that animates in
 * from slightly above and fades out; under reduced motion both are a short fade.
 */
export function VerseSearchPalette({ open, onClose, datasetId, lang, params }: VerseSearchPaletteProps): React.ReactElement {
   const t = useT();
   const dialogRef = useRef<HTMLDialogElement | null>(null);
   const [ mounted, setMounted ] = useState(open);
   const [ closing, setClosing ] = useState(false);

   useEffect(() => {
      const dialog = dialogRef.current;

      if (open) {
         setMounted(true);
         setClosing(false);
         return undefined;
      }

      if (!dialog?.open) {
         setMounted(false);
         return undefined;
      }

      setClosing(true);
      const timer = window.setTimeout(() => {
         dialog.close();
         setClosing(false);
         setMounted(false);
      }, motionDuration(Math.round(DURATION.base * 0.7)));

      return () => window.clearTimeout(timer);
   }, [ open ]);

   useEffect(() => {
      const dialog = dialogRef.current;

      if (open && mounted && dialog && !dialog.open) {
         if (typeof dialog.showModal === 'function') {
            dialog.showModal();
         } else {
            dialog.setAttribute('open', '');
         }
      }
   }, [ open, mounted ]);

   return (
      <dialog
         ref={dialogRef}
         className={cx('verse-palette', closing && 'is-closing')}
         aria-label={t('home.search.dialog')}
         onCancel={(event) => {
            event.preventDefault();
            onClose();
         }}
         onClick={(event) => {
            if (event.target === dialogRef.current) onClose();
         }}
      >
         {mounted ? (
            <div className="verse-palette__surface">
               <VerseSearchPanel variant="palette" datasetId={datasetId} lang={lang} params={params} autoFocus onNavigate={onClose} onEscape={onClose} />
               <footer className="verse-palette__footer" aria-hidden="true">
                  <span>
                     <Kbd>↑</Kbd>
                     <Kbd>↓</Kbd> {t('home.search.footerMove')}
                  </span>
                  <span>
                     <Kbd>↵</Kbd> {t('home.search.footerOpen')}
                  </span>
                  <span>
                     <Kbd>{isApplePlatform() ? '⌘' : 'Ctrl'}</Kbd>
                     <Kbd>↵</Kbd> {t('home.search.footerNewTab')}
                  </span>
               </footer>
            </div>
         ) : null}
      </dialog>
   );
}
