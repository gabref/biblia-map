import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Copy, Crosshair, Search, SearchX, Waypoints, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { SaveVerseButton } from '../../components/SaveVerseButton';
import { Button, Chip, EmptyState, IconButton, Skeleton, Tabs, VerseCard, type TabItem } from '../../components/ui';
import { VerseLink } from '../../components/VerseLink';
import type { NeighborNode } from '../../graph/neighborhood';
import { useInView } from '../../hooks/useInView';
import { useT, type TranslateFn } from '../../i18n';
import { cx } from '../../lib/cx';
import { prefersReducedMotion } from '../../lib/motion';
import type { RouteParams } from '../../routing/routes';
import type { VerseKey } from '../../study/store';
import type { DirectionMode, EdgeKindFilter, Testament, VerseRef } from '../../types/generated';
import { isPlainClick } from './StudyTrail';
import type { DirectionCounts, ExtendedState } from './useNeighborhood';
import type { VerseFilters } from './urlState';

export interface ConnectionItem {
   node: NeighborNode;
   key: string;
   /** Full citation, ranges included ("Psalm 104:1-35"). */
   label: string;
   /** Passage text (range verses joined); `undefined` loading, `null` not in this dataset. */
   text: string | null | undefined;
   /** First verse of the passage; `undefined` when the dataset does not know the verse. */
   ref: VerseRef | undefined;
   testament: Testament | null;
   /** Canonical key of the last verse of a range, saved with the bookmark. */
   endKey: VerseKey | undefined;
}

export interface ConnectionListProps {
   centerLabel: string;
   items: readonly ConnectionItem[];
   /** Second-hop verses currently shown (depth 2), best ranked first. */
   farItems: readonly ConnectionItem[];
   farTotal: number;
   extended: ExtendedState | null;
   filters: VerseFilters;
   counts: DirectionCounts;
   /** False when the dataset has no study-note references at all. */
   studyNotesAvailable: boolean;
   /** Show the reference-type tabs here (desktop); on phones they live in the Filters sheet. */
   showKind: boolean;
   loading: boolean;
   stale: boolean;
   selectedKey: string | null;
   hoveredKey: string | null;
   /** Row that is morphing into the studied-verse header (View Transition). */
   morphKey: string | null;
   params: RouteParams;
   bookName: (bookNumber: number) => string;
   requestText: (bookNumber: number) => void;
   onFilters: (patch: Partial<VerseFilters>) => void;
   onSelect: (key: string | null) => void;
   onHover: (key: string | null) => void;
   onStudy: (key: string) => void;
   onCopy: (key: string) => void;
   onShowMore: () => void;
   onLoadDeferred: () => void;
   /** Expanded content of the selected row. */
   renderDetail: (item: ConnectionItem) => React.ReactNode;
   /** Suggestion shown when the verse has no connections at all. */
   emptyAction: React.ReactNode;
}

interface RowProps {
   item: ConnectionItem;
   selected: boolean;
   linked: boolean;
   morphing: boolean;
   params: RouteParams;
   t: TranslateFn;
   onSelect: (key: string | null) => void;
   onHover: (key: string | null) => void;
   onStudy: (key: string) => void;
   onCopy: (key: string) => void;
   detail: React.ReactNode;
}

const ConnectionRow = memo(function ConnectionRow({
   item,
   selected,
   linked,
   morphing,
   params,
   t,
   onSelect,
   onHover,
   onStudy,
   onCopy,
   detail,
}: RowProps): React.ReactElement {
   const { node, key, label, ref } = item;
   const directionIcon =
      node.direction === 'outgoing' ? (
         <ArrowUpRight size={12} strokeWidth={2.4} />
      ) : node.direction === 'incoming' ? (
         <ArrowDownLeft size={12} strokeWidth={2.4} />
      ) : (
         <ArrowLeftRight size={12} strokeWidth={2.4} />
      );
   const meta = (
      <span className="vs-row__meta">
         <span className={`vs-row__dir vs-row__dir--${node.direction}`} title={t(`verse.direction.${node.direction}`)}>
            {directionIcon}
            <span className="visually-hidden">{t(`verse.direction.${node.direction}`)}</span>
         </span>
         {node.depth === 2 ? <Chip size="sm">{t('verse.list.via', { count: node.score })}</Chip> : null}
         {node.crossRefCount > 0 ? <Chip size="sm">{t('verse.kind.crossRefShort')}</Chip> : null}
         {node.studyNoteCount > 0 ? (
            <Chip size="sm" tone="accent">
               {t('verse.kind.studyNote')}
            </Chip>
         ) : null}
      </span>
   );

   return (
      <li
         className={cx('vs-row', `vs-row--${node.direction}`, node.depth === 2 && 'vs-row--far', selected && 'is-open', linked && 'is-linked')}
         data-row={key}
         onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') {
               onHover(key);
            }
         }}
         onPointerLeave={() => onHover(null)}
         onDoubleClick={() => onStudy(key)}
      >
         <VerseCard
            reference={label}
            text={item.text}
            tone={node.direction === 'both' ? 'default' : node.direction}
            density="compact"
            meta={meta}
            transitionName={morphing ? 'studied-verse' : undefined}
            onClick={() => onSelect(selected ? null : key)}
            actions={
               <>
                  {ref ? (
                     <VerseLink
                        verse={ref}
                        params={params}
                        className="ui-button ui-button--icon ui-button--ghost ui-button--sm"
                        aria-label={t('verse.action.study', { verse: label })}
                        title={t('verse.action.study', { verse: label })}
                        onClick={(event) => {
                           if (isPlainClick(event)) {
                              event.preventDefault();
                              onStudy(key);
                           }
                        }}
                     >
                        <Crosshair size={15} aria-hidden="true" />
                     </VerseLink>
                  ) : null}
                  {ref ? <SaveVerseButton verse={ref} label={label} appearance="icon" size="sm" endKey={item.endKey} /> : null}
                  <IconButton label={t('verse.action.copy', { verse: label })} size="sm" onClick={() => onCopy(key)}>
                     <Copy size={15} />
                  </IconButton>
               </>
            }
         />
         {detail}
      </li>
   );
});

interface BookGroupProps {
   bookNumber: number;
   name: string;
   count: number;
   requestText: (bookNumber: number) => void;
   children: React.ReactNode;
}

/** One book's rows. Its verse text is only requested once the group scrolls into view. */
function BookGroup({ bookNumber, name, count, requestText, children }: BookGroupProps): React.ReactElement {
   const [ ref, inView ] = useInView<HTMLLIElement>('200px 0px 200px 0px');

   useEffect(() => {
      if (inView) {
         requestText(bookNumber);
      }
   }, [ bookNumber, inView, requestText ]);

   return (
      <li ref={ref} className="vs-group">
         <h4 className="vs-group__title">
            {name}
            <span className="vs-group__count">{count}</span>
         </h4>
         <ul className="vs-group__rows">{children}</ul>
      </li>
   );
}

type TestamentFilter = 'all' | Testament;

/** Rows by book in canonical order (items arrive in canonical order; unknown verses go under 0). */
function groupItems(items: readonly ConnectionItem[]): Array<{ bookNumber: number; items: ConnectionItem[] }> {
   const groups = new Map<number, ConnectionItem[]>();

   for (const item of items) {
      const bookNumber = item.ref?.bookNumber ?? 0;
      const group = groups.get(bookNumber);

      if (group) {
         group.push(item);
      } else {
         groups.set(bookNumber, [ item ]);
      }
   }

   return Array.from(groups.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([ bookNumber, groupItems ]) => ({ bookNumber, items: groupItems }));
}

/**
 * The reference column: every connected verse as readable text, grouped by direction and
 * book. It is the same selection as the graph — hovering or opening a row lights its node —
 * and the first-class view on phones.
 */
export function ConnectionList({
   centerLabel,
   items,
   farItems,
   farTotal,
   extended,
   filters,
   counts,
   studyNotesAvailable,
   showKind,
   loading,
   stale,
   selectedKey,
   hoveredKey,
   morphKey,
   params,
   bookName,
   requestText,
   onFilters,
   onSelect,
   onHover,
   onStudy,
   onCopy,
   onShowMore,
   onLoadDeferred,
   renderDetail,
   emptyAction,
}: ConnectionListProps): React.ReactElement {
   const t = useT();
   const listRef = useRef<HTMLDivElement | null>(null);
   const [ query, setQuery ] = useState('');
   const [ testament, setTestament ] = useState<TestamentFilter>('all');
   const needle = query.trim().toLocaleLowerCase();
   const matches = useMemo(() => {
      const test = (item: ConnectionItem): boolean =>
         (testament === 'all' || item.testament === testament) &&
         (needle === '' || item.label.toLocaleLowerCase().includes(needle) || (item.text ?? '').toLocaleLowerCase().includes(needle));

      return { near: items.filter(test), far: farItems.filter(test) };
   }, [ farItems, items, needle, testament ]);
   const sections = useMemo(() => {
      const byDirection = (direction: NeighborNode['direction']): ConnectionItem[] =>
         matches.near.filter((item) => item.node.direction === direction);

      return [
         { id: 'both', title: t('verse.list.both', { verse: centerLabel }), rows: byDirection('both') },
         { id: 'outgoing', title: t('verse.list.outgoing', { verse: centerLabel }), rows: byDirection('outgoing') },
         { id: 'incoming', title: t('verse.list.incoming', { verse: centerLabel }), rows: byDirection('incoming') },
      ].filter((section) => section.rows.length > 0);
   }, [ centerLabel, matches.near, t ]);
   const directionTabs: Array<TabItem<DirectionMode>> = [
      { value: 'all', label: t('verse.filter.dir.all'), count: counts.all },
      { value: 'outgoing', label: t('verse.filter.dir.outgoing'), icon: <ArrowUpRight size={14} />, count: counts.outgoing },
      { value: 'incoming', label: t('verse.filter.dir.incoming'), icon: <ArrowDownLeft size={14} />, count: counts.incoming },
   ];
   const kindTabs: Array<TabItem<EdgeKindFilter>> = [
      { value: 'combined', label: t('verse.filter.kind.all') },
      { value: 'crossrefs', label: t('verse.filter.kind.crossrefs') },
      { value: 'study-notes', label: t('verse.filter.kind.studyNotes'), disabled: !studyNotesAvailable },
   ];
   const localFilterActive = needle !== '' || testament !== 'all';
   const hasAny = items.length + farItems.length > 0;
   const hasMatches = matches.near.length + matches.far.length > 0;

   // Selecting a node in the graph brings its row into view.
   useEffect(() => {
      if (!selectedKey) {
         return;
      }

      const row = listRef.current?.querySelector<HTMLElement>(`[data-row="${selectedKey}"]`);

      if (row && typeof row.scrollIntoView === 'function') {
         row.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
   }, [ selectedKey ]);

   // Second-hop rows are ranked, not grouped by book: ask for their text when they are shown.
   const [ farRef, farInView ] = useInView<HTMLElement>('200px 0px 200px 0px');
   const farBooks = useMemo(
      () => Array.from(new Set(farItems.map((item) => item.ref?.bookNumber).filter((book): book is number => book !== undefined))),
      [ farItems ],
   );

   useEffect(() => {
      if (farInView) {
         farBooks.forEach(requestText);
      }
   }, [ farBooks, farInView, requestText ]);

   const row = (item: ConnectionItem): React.ReactElement => (
      <ConnectionRow
         key={item.key}
         item={item}
         selected={item.key === selectedKey}
         linked={item.key === hoveredKey}
         morphing={item.key === morphKey}
         params={params}
         t={t}
         onSelect={onSelect}
         onHover={onHover}
         onStudy={onStudy}
         onCopy={onCopy}
         detail={item.key === selectedKey ? renderDetail(item) : null}
      />
   );

   return (
      <section className="vs-refs" aria-label={t('verse.connections.title')}>
         <header className="vs-refs__head">
            <div className="vs-refs__titleRow">
               <h2 className="vs-refs__title">{t('verse.connections.title')}</h2>
               <span className="t-caption" role="status">
                  {loading ? t('verse.list.loading') : t('verse.connections.count', { count: items.length })}
               </span>
            </div>
            <Tabs
               label={t('verse.filter.dir.label')}
               items={directionTabs}
               value={filters.dir}
               onChange={(dir) => onFilters({ dir })}
               size="sm"
               block
            />
            <div className="vs-refs__filters">
               {showKind ? (
                  <Tabs
                     label={t('verse.filter.kind.label')}
                     items={kindTabs}
                     value={filters.kind}
                     onChange={(kind) => onFilters({ kind })}
                     variant="pill"
                     size="sm"
                  />
               ) : null}
               <div className="vs-refs__chips" role="group" aria-label={t('verse.filter.testament.label')}>
                  {([ 'OT', 'NT' ] as const).map((value) => (
                     <Chip
                        key={value}
                        size="sm"
                        selected={testament === value}
                        title={t(value === 'OT' ? 'verse.testament.ot' : 'verse.testament.nt')}
                        onClick={() => setTestament(testament === value ? 'all' : value)}
                     >
                        {t(value === 'OT' ? 'verse.testament.otShort' : 'verse.testament.ntShort')}
                     </Chip>
                  ))}
               </div>
            </div>
            {showKind && !studyNotesAvailable ? <p className="t-caption">{t('verse.filter.kind.noStudyNotes')}</p> : null}
            <label className="vs-refs__search">
               <Search size={14} aria-hidden="true" />
               <span className="visually-hidden">{t('verse.list.search')}</span>
               <input
                  type="search"
                  value={query}
                  placeholder={t('verse.list.search')}
                  onChange={(event) => setQuery(event.target.value)}
               />
               {query ? (
                  <IconButton label={t('verse.list.clearSearch')} size="sm" onClick={() => setQuery('')}>
                     <X size={14} />
                  </IconButton>
               ) : null}
            </label>
         </header>

         <div ref={listRef} className={cx('vs-refs__body', stale && 'is-stale')} aria-busy={loading || stale}>
            {loading ? (
               <div className="vs-refs__skeleton" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                     <div key={index} className="vs-refs__skeletonRow">
                        <Skeleton width="38%" />
                        <Skeleton lines={2} />
                     </div>
                  ))}
               </div>
            ) : !hasAny ? (
               <EmptyState
                  icon={<Waypoints size={22} />}
                  title={t('verse.empty.title', { verse: centerLabel })}
                  description={
                     filters.kind !== 'combined'
                        ? t('verse.empty.kind')
                        : filters.dir !== 'all'
                           ? t('verse.empty.direction')
                           : t('verse.empty.none')
                  }
                  action={
                     filters.kind !== 'combined' ? (
                        <Button size="sm" onClick={() => onFilters({ kind: 'combined' })}>
                           {t('verse.empty.showAllTypes')}
                        </Button>
                     ) : filters.dir !== 'all' ? (
                        <Button size="sm" onClick={() => onFilters({ dir: 'all' })}>
                           {t('verse.empty.showBothDirections')}
                        </Button>
                     ) : (
                        emptyAction
                     )
                  }
               />
            ) : !hasMatches ? (
               <EmptyState
                  icon={<SearchX size={22} />}
                  title={t('verse.empty.filtered')}
                  description={t('verse.empty.filteredHint')}
                  action={
                     <Button
                        size="sm"
                        onClick={() => {
                           setQuery('');
                           setTestament('all');
                        }}
                     >
                        {t('verse.empty.clearFilters')}
                     </Button>
                  }
               />
            ) : (
               <>
                  {sections.map((section) => (
                     <section key={section.id} className={`vs-section vs-section--${section.id}`}>
                        <h3 className="vs-section__title">
                           <span className="vs-section__mark" aria-hidden="true" />
                           {section.title}
                           <span className="vs-section__count">{section.rows.length}</span>
                        </h3>
                        <ul className="vs-section__groups">
                           {groupItems(section.rows).map((group) => (
                              <BookGroup
                                 key={group.bookNumber}
                                 bookNumber={group.bookNumber}
                                 name={group.bookNumber === 0 ? t('verse.list.unknownBook') : bookName(group.bookNumber)}
                                 count={group.items.length}
                                 requestText={requestText}
                              >
                                 {group.items.map(row)}
                              </BookGroup>
                           ))}
                        </ul>
                     </section>
                  ))}

                  {filters.depth === 2 ? (
                     <section ref={farRef} className="vs-section vs-section--far">
                        <h3 className="vs-section__title">
                           <span className="vs-section__mark" aria-hidden="true" />
                           {t('verse.list.far')}
                           <span className="vs-section__count">
                              {localFilterActive ? matches.far.length : t('verse.list.farCount', { shown: farItems.length, total: farTotal })}
                           </span>
                        </h3>
                        <p className="t-caption vs-section__hint">{t('verse.list.farHint', { verse: centerLabel })}</p>
                        {extended?.loading ? (
                           <p className="vs-progress" role="status">
                              <span className="ui-spinner" aria-hidden="true" />
                              {t('verse.extended.loading', { loaded: extended.loadedFiles, total: extended.totalFiles })}
                           </p>
                        ) : null}
                        <ul className="vs-group__rows">{matches.far.map(row)}</ul>
                        {!extended?.loading && farItems.length === 0 ? (
                           <p className="t-caption vs-section__hint">{t('verse.extended.none')}</p>
                        ) : null}
                        <div className="vs-section__more">
                           {farItems.length < farTotal && !localFilterActive ? (
                              <Button size="sm" onClick={onShowMore}>
                                 {t('verse.extended.showMore', { count: Math.min(40, farTotal - farItems.length) })}
                              </Button>
                           ) : null}
                           {extended && !extended.loading && extended.deferredFiles > 0 ? (
                              <div className="vs-section__deferred">
                                 <p className="t-caption">
                                    {t('verse.extended.partial', { covered: extended.coveredNodes, total: extended.totalNodes })}
                                 </p>
                                 <Button size="sm" variant="ghost" onClick={onLoadDeferred}>
                                    {t('verse.extended.loadRest')}
                                 </Button>
                              </div>
                           ) : null}
                        </div>
                     </section>
                  ) : null}
               </>
            )}
         </div>
      </section>
   );
}
