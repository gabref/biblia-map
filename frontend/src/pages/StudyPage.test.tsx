import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ToastProvider } from '../components/ui';
import { __resetStudyStoreForTests, addBookmark, getStudyData, recordVisit } from '../study/store';
import { StudyPage } from './StudyPage';

function renderAt(path: string): void {
   window.history.pushState({}, '', path);
   render(<ToastProvider><StudyPage /></ToastProvider>);
}

describe('StudyPage', () => {
   beforeEach(() => {
      window.localStorage.clear();
      __resetStudyStoreForTests();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
   });

   afterEach(() => {
      vi.unstubAllGlobals();
      window.history.pushState({}, '', '/');
   });

   it('teaches with empty states on a fresh device', () => {
      renderAt('/study');

      expect(screen.getByRole('heading', { level: 1, name: 'My study' })).toBeInTheDocument();
      expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
      expect(screen.getByText('No verses visited yet')).toBeInTheDocument();
      expect(screen.getByText('No notes yet')).toBeInTheDocument();
   });

   it('lists history and creates a collection inline', () => {
      recordVisit({ bookNumber: 43, chapterNumber: 3, verseNumber: 16 }, { datasetId: 'nwtsty' });
      addBookmark('43.3.16');
      renderAt('/study');

      expect(screen.getByRole('link', { name: 'John 3:16' })).toHaveAttribute('href', '/verse/john/3/16?ds=nwtsty');

      fireEvent.click(screen.getByRole('button', { name: 'New collection' }));
      fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Faith' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(screen.getByRole('link', { name: /Faith/ })).toBeInTheDocument();
      expect(getStudyData().collections.map((item) => item.name)).toEqual([ 'Saved', 'Faith' ]);

      act(() => {
         fireEvent.click(screen.getByRole('button', { name: 'Move Faith up' }));
      });
      expect(getStudyData().collections.map((item) => item.name)).toEqual([ 'Faith', 'Saved' ]);
   });

   it('shows a helpful state for an unknown collection', () => {
      renderAt('/study/nope');

      expect(screen.getByText('Collection not found')).toBeInTheDocument();
   });

   it('warns when storage is unavailable', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
         throw new DOMException('blocked', 'SecurityError');
      });
      renderAt('/study');

      expect(screen.getByRole('alert')).toHaveTextContent('Your study is not being saved');
      vi.restoreAllMocks();
   });
});
