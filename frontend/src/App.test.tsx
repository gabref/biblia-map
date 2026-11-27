/**
 * Shell routing integration: real router + App, stub pages (no lazy chunks, no JSON).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatasetRegistryEntry } from './types/generated';

vi.mock('./data/generated', async (importOriginal) => ({
   ...(await importOriginal<typeof import('./data/generated')>()),
   loadDatasets: vi.fn(async () =>
      [
         { datasetId: 'nwtsty', publicationSymbol: 'nwtsty', publicationYear: 2026, language: 'English' },
         { datasetId: 'nwtsty-i', publicationSymbol: 'nwtsty-I', publicationYear: 2026, language: 'Italian' },
      ] as DatasetRegistryEntry[],
   ),
}));

vi.mock('./search/useSearchData', async (importOriginal) => {
   const actual = await importOriginal<typeof import('./search/useSearchData')>();
   const { STATIC_SEARCH_DATA } = await import('./search/searchData');

   return { ...actual, useSearchData: () => STATIC_SEARCH_DATA };
});

vi.mock('./routing/pageRegistry', () => {
   const stub =
      (name: string) =>
      (props: Record<string, unknown>): React.ReactElement => {
         const { params, datasets: _datasets, onDatasetChange: _change, ...rest } = props;

         return (
            <h1 data-testid="page" data-params={JSON.stringify(params ?? {})}>
               {name} {JSON.stringify(rest)}
            </h1>
         );
      };
   const names = [ 'home', 'notFound', 'verse', 'read', 'insights', 'book', 'study', 'about', 'styleguide' ];

   return {
      pages: Object.fromEntries(names.map((name) => [ name, stub(name) ])),
      preloadPage: () => undefined,
   };
});

const { App } = await import('./App');
const { ToastProvider } = await import('./components/ui/Toast');
const { navigate } = await import('./routing/routes');
const { __resetStudyStoreForTests, recordVisit, toggleBookmark } = await import('./study/store');

async function renderAt(path: string): Promise<void> {
   window.history.replaceState({}, '', path);
   render(
      <ToastProvider>
         <App />
      </ToastProvider>,
   );
   await screen.findByTestId('page');
}

const page = (): HTMLElement => screen.getByTestId('page');
const url = (): string => `${window.location.pathname}${window.location.search}`;

describe('App routing', () => {
   beforeEach(() => {
      window.localStorage.clear();
      __resetStudyStoreForTests();
      window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
   });

   afterEach(() => {
      window.history.replaceState({}, '', '/');
   });

   it('renders the page for the current route with its params', async () => {
      await renderAt('/verse/john/3/16');

      expect(page()).toHaveTextContent('verse');
      expect(page()).toHaveTextContent('"book":43,"chapter":3,"verse":16');
      expect(page()).toHaveTextContent('"datasetId":"nwtsty"');
      expect(document.title).toBe('John 3:16 · BibliaMap');
   });

   it('follows pushState navigation, moves focus to the h1 and marks the active nav link', async () => {
      await renderAt('/');
      expect(page()).toHaveTextContent('home');
      expect(document.title).toBe('BibliaMap');

      await act(async () => navigate('/read/psalms/23'));

      expect(page()).toHaveTextContent('read');
      expect(page()).toHaveTextContent('"book":19,"chapter":23');
      expect(document.activeElement).toBe(page());
      expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('Read');
   });

   it('redirects legacy paths with replace', async () => {
      await renderAt('/chord');

      expect(url()).toBe('/insights?tab=chord');
      expect(page()).toHaveTextContent('"tab":"chord"');
   });

   it('sends bare /verse to John 3:16 without history', async () => {
      await renderAt('/verse');
      expect(url()).toBe('/verse/john/3/16');
   });

   it('sends bare /verse to the last visited verse when there is one', async () => {
      recordVisit({ bookNumber: 19, chapterNumber: 23, verseNumber: 1 });
      await renderAt('/verse');
      expect(url()).toBe('/verse/psalms/23/1');
   });

   it('renders not found for unknown paths', async () => {
      await renderAt('/nope/really');

      expect(page()).toHaveTextContent('notFound');
      expect(document.title).toBe('Page not found · BibliaMap');
   });

   it('?ds= wins over storage and is carried in nav links', async () => {
      window.localStorage.setItem('bibliamap-dataset', 'nwtsty');
      await renderAt('/?ds=nwtsty-i');

      expect(page()).toHaveTextContent('"datasetId":"nwtsty-i"');
      // The Italian edition also switches the UI to Italian, so match the nav link by its target.
      expect(document.querySelector('.nav-link[href^="/insights"]')).toHaveAttribute('href', '/insights?ds=nwtsty-i');
   });

   it('uses the stored dataset without adding ?ds=, and drops an unknown ?ds=', async () => {
      window.localStorage.setItem('bibliamap-dataset', 'nwtsty-i');
      await renderAt('/about?ds=bogus');

      expect(url()).toBe('/about?ds=nwtsty-i');
      expect(page()).toHaveTextContent('"datasetId":"nwtsty-i"');
   });

   it('drops an unknown ?ds= entirely when falling back to the default', async () => {
      await renderAt('/about?ds=bogus');

      expect(url()).toBe('/about');
      expect(page()).toHaveTextContent('"datasetId":"nwtsty"');
   });

   it('shows the saved-verse count on My study and keeps it live', async () => {
      toggleBookmark({ bookNumber: 43, chapterNumber: 3, verseNumber: 16 });
      await renderAt('/');

      await waitFor(() => expect(screen.getByLabelText('1 saved verses')).toHaveTextContent('1'));

      act(() => {
         toggleBookmark({ bookNumber: 19, chapterNumber: 23, verseNumber: 1 });
      });
      await waitFor(() => expect(screen.getByLabelText('2 saved verses')).toHaveTextContent('2'));
   });
});
