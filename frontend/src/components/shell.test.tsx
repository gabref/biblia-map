import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_STORAGE_KEY } from '../i18n';
import { resetLocaleForTests } from '../i18n/locale';
import type { DatasetRegistryEntry } from '../types/generated';
import { DatasetBadge, datasetDisplayName } from './DatasetBadge';
import { ErrorState } from './ErrorState';
import { FilterPanel } from './FilterPanel';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LoadingShimmer } from './LoadingShimmer';

afterEach(() => {
   vi.restoreAllMocks();
   vi.unstubAllGlobals();
   window.localStorage.clear();
   window.history.replaceState({}, '', '/');
   act(() => resetLocaleForTests());
});

const datasets: DatasetRegistryEntry[] = [
   { datasetId: 'nwtsty', publicationSymbol: 'nwtsty', publicationTitle: 'Study', publicationYear: 2026, language: 'English', hasVerseText: true },
   { datasetId: 'nwtsty-i', publicationSymbol: 'nwtsty', publicationTitle: 'Studio', publicationYear: 2026, language: 'Italian', hasVerseText: true },
   { datasetId: 'x', publicationSymbol: 'Xyz', publicationTitle: 'X', language: 'English', hasVerseText: false },
];

describe('LanguageSwitcher', () => {
   it('is a labelled group of pressed toggles that switches and persists the language', () => {
      render(<LanguageSwitcher />);

      expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
      const italian = screen.getByRole('button', { name: 'Italiano' });

      expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
      expect(italian).toHaveAttribute('aria-pressed', 'false');
      expect(italian).toHaveAttribute('lang', 'it');

      fireEvent.click(italian);
      expect(italian).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('group', { name: 'Lingua' })).toBeInTheDocument();
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('it');
      expect(document.documentElement.lang).toBe('it');
   });
});

describe('DatasetBadge', () => {
   it('shows plain edition names without trailing spaces', () => {
      expect(datasetDisplayName(datasets[0], 'en')).toBe('Study Bible (English, 2026)');
      expect(datasetDisplayName(datasets[1], 'it')).toBe('Edizione per lo studio (Italiano, 2026)');
      expect(datasetDisplayName(datasets[2], 'en')).toBe('Xyz (English)');

      render(<DatasetBadge datasets={datasets} selectedDatasetId="nwtsty" onChange={() => undefined} />);
      expect(screen.getByLabelText('Bible edition')).toHaveValue('nwtsty');
      for (const option of screen.getAllByRole('option')) {
         expect(option.textContent).toBe(option.textContent?.trim());
      }
   });
});

describe('DatasetBadge locale hint', () => {
   it('switches the UI to Italian for the Italian edition until a language is chosen', () => {
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([ 'en-US' ]);
      act(() => resetLocaleForTests());
      render(<DatasetBadge datasets={datasets} selectedDatasetId="nwtsty-i" onChange={() => undefined} />);
      expect(document.documentElement.lang).toBe('it');
      expect(screen.getByLabelText('Edizione della Bibbia')).toBeInTheDocument();
   });
});

describe('LoadingShimmer / ErrorState', () => {
   it('announces loading with text, not a div aria-label', () => {
      render(<LoadingShimmer rows={2} />);
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
   });

   it('retries with the handler, else offers a reload', () => {
      const onRetry = vi.fn();
      const { rerender } = render(<ErrorState title="Oops" error={new Error('boom')} onRetry={onRetry} />);

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledOnce();
      rerender(<ErrorState title="Oops" error={new Error('boom')} />);
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
   });
});

describe('FilterPanel', () => {
   function mockPhone(matches: boolean): void {
      vi.stubGlobal('matchMedia', (query: string) => ({
         matches,
         media: query,
         onchange: null,
         addEventListener: () => undefined,
         removeEventListener: () => undefined,
         addListener: () => undefined,
         removeListener: () => undefined,
         dispatchEvent: () => false,
      }));
      window.matchMedia = globalThis.matchMedia;
   }

   it('stays inline on wide screens', () => {
      mockPhone(false);
      render(
         <FilterPanel title="Filters" collapsible activeCount={2}>
            <span>controls</span>
         </FilterPanel>,
      );
      expect(screen.getByRole('region', { name: 'Filters' })).toHaveTextContent('controls');
   });

   it('collapses to a "Filters (n)" button on phones', () => {
      mockPhone(true);
      render(
         <FilterPanel title="Verse filters" collapsible activeCount={2}>
            <span>controls</span>
         </FilterPanel>,
      );
      const trigger = screen.getByRole('button', { name: 'Filters (2)' });

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('controls')).not.toBeInTheDocument();
      fireEvent.click(trigger);
      expect(screen.getByText('controls')).toBeInTheDocument();
   });
});
