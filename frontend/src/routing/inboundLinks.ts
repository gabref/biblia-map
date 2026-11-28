/**
 * Links coming from JW Library into BibliaMap. JW Library shares verses as
 * `https://www.jw.org/finder?…&bible=BBCCCVVV[-BBCCCVVV]&pub=…&wtlocale=…`; the
 * legacy app also understands `jwlibrary:///finder?…`, and wol.jw.org chapter pages
 * look like `/en/wol/b/r1/lp-e/nwtsty/43/3`. `bible=` uses the same encoding as
 * `canonicalVerseId`. Pure and dependency-free: the router and search both use it.
 */

export type InboundTarget =
   | { kind: 'verse'; book: number; chapter: number; verse: number; endVerse?: number; datasetId?: string }
   | { kind: 'chapter'; book: number; chapter: number; datasetId?: string };

const LINK_PATTERN = /(?:https?:\/\/(?:www\.|wol\.)?jw\.org|jwlibrary:\/\/)\/[^\s<>"']*/i;
const BIBLE_KEY = /^(\d{7,8})(?:-(\d{7,8}))?$/;
const WOL_CHAPTER = /\/wol\/b\/r\d+\/lp-([a-z]+)\/([a-z0-9]+)\/(\d{1,2})\/(\d{1,3})\/?$/i;

/** Datasets BibliaMap ships, by jw.org `wtlocale`. Unknown pairs leave the choice to the shell. */
function datasetFor(wtlocale: string | undefined, pub: string | undefined): string | undefined {
   const locale = wtlocale?.toUpperCase();
   const symbol = pub?.toLowerCase();

   if (locale === 'I') return 'nwtsty-i';
   if (locale === undefined || locale === 'E') {
      if (symbol === 'nwt' || symbol === 'nwtsty' || symbol === 'rbi8') return symbol;
   }

   return undefined;
}

function decodeKey(key: string): { book: number; chapter: number; verse: number } | null {
   const id = Number(key);
   const book = Math.floor(id / 1_000_000);
   const chapter = Math.floor(id / 1_000) % 1_000;
   const verse = id % 1_000;

   if (book < 1 || book > 66 || chapter < 1) {
      return null;
   }

   return { book, chapter, verse };
}

function positive(value: string | null): number | null {
   if (value === null || !/^\d{1,3}$/.test(value)) return null;

   const parsed = Number(value);

   return parsed > 0 ? parsed : null;
}

/** Reads finder-style query params (`bible=`, or `book=` + `chapter=`). */
export function targetFromFinderParams(params: URLSearchParams): InboundTarget | null {
   const datasetId = datasetFor(params.get('wtlocale') ?? params.get('lang') ?? undefined, params.get('pub') ?? undefined);
   const withDataset = <T extends InboundTarget>(target: T): T => (datasetId ? { ...target, datasetId } : target);
   const bible = BIBLE_KEY.exec(params.get('bible')?.trim() ?? '');

   if (bible) {
      const start = decodeKey(bible[1]);
      const end = bible[2] ? decodeKey(bible[2]) : null;

      if (!start) return null;

      // `43003000` (verse 0) or `43003000-43003999` is the whole chapter.
      if (start.verse === 0) {
         return withDataset({ kind: 'chapter', book: start.book, chapter: start.chapter });
      }

      const sameChapter = end && end.book === start.book && end.chapter === start.chapter && end.verse > start.verse;

      return withDataset({
         kind: 'verse',
         book: start.book,
         chapter: start.chapter,
         verse: start.verse,
         ...(sameChapter ? { endVerse: end.verse } : {}),
      });
   }

   const book = positive(params.get('book'));
   const chapter = positive(params.get('chapter'));

   if (book !== null && book <= 66 && chapter !== null) {
      return withDataset({ kind: 'chapter', book, chapter });
   }

   return null;
}

/** Finds a jw.org / wol.jw.org / jwlibrary link anywhere in `text` (a paste or a share) and decodes it. */
export function targetFromText(text: string | null | undefined): InboundTarget | null {
   const match = text ? LINK_PATTERN.exec(text) : null;

   if (!match) return null;

   let url: URL;

   try {
      url = new URL(match[0].replace(/^jwlibrary:\/\/\//i, 'https://www.jw.org/').replace(/[).,;]+$/, ''));
   } catch {
      return null;
   }

   const wol = WOL_CHAPTER.exec(url.pathname);

   if (wol) {
      const book = Number(wol[3]);
      const chapter = Number(wol[4]);

      if (book < 1 || book > 66 || chapter < 1) return null;

      // `lp-e` / `lp-i` carry the same MEPS symbol as `wtlocale`.
      const datasetId = datasetFor(wol[1], wol[2]);

      return { kind: 'chapter', book, chapter, ...(datasetId ? { datasetId } : {}) };
   }

   return targetFromFinderParams(url.searchParams);
}

/** `/open` (deep link or Web Share Target): finder params first, then any link inside `url`, `text`, `title`. */
export function targetFromOpenParams(params: URLSearchParams): InboundTarget | null {
   return (
      targetFromFinderParams(params) ??
      targetFromText(params.get('url')) ??
      targetFromText(params.get('text')) ??
      targetFromText(params.get('title'))
   );
}
