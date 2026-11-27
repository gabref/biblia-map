import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTheme } from '../../hooks/useTheme';
import { Chip, ReferenceChip, Sheet, TabPanel, Tabs, ThemeToggle, ToastProvider, useToast, VerseCard } from './index';

type Kind = 'refs' | 'notes' | 'all';

function TabsHarness(): React.ReactElement {
   const [ value, setValue ] = useState<Kind>('refs');

   return (
      <>
         <Tabs
            label="Reference type"
            idBase="t"
            value={value}
            onChange={setValue}
            items={[
               { value: 'refs', label: 'Cross refs' },
               { value: 'notes', label: 'Study notes', disabled: true },
               { value: 'all', label: 'All' },
            ]}
         />
         <TabPanel idBase="t" value="refs" activeValue={value}>
            refs panel
         </TabPanel>
         <TabPanel idBase="t" value="all" activeValue={value}>
            all panel
         </TabPanel>
      </>
   );
}

describe('Tabs', () => {
   it('moves selection with arrow keys, skipping disabled tabs, and links the panel', () => {
      render(<TabsHarness />);

      const first = screen.getByRole('tab', { name: 'Cross refs' });

      expect(first).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel')).toHaveTextContent('refs panel');

      fireEvent.keyDown(first, { key: 'ArrowRight' });

      const last = screen.getByRole('tab', { name: 'All' });

      expect(last).toHaveAttribute('aria-selected', 'true');
      expect(last).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toHaveAccessibleName('All');
   });
});

describe('Chip', () => {
   it('is static text by default and a toggle button when clickable', () => {
      const onClick = vi.fn();
      const { rerender } = render(<Chip>Psalms</Chip>);

      expect(screen.queryByRole('button')).toBeNull();

      rerender(
         <Chip selected onClick={onClick}>
            Psalms
         </Chip>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Psalms' }));

      expect(onClick).toHaveBeenCalledOnce();
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
   });

   it('states reference direction in text, not colour alone', () => {
      render(<ReferenceChip reference="Hebrews 10:25" direction="incoming" />);

      expect(screen.getByText(/It points to this verse/)).toBeInTheDocument();
   });
});

describe('VerseCard', () => {
   it('distinguishes loading, missing and present text', () => {
      const { rerender, container } = render(<VerseCard reference="Romans 1:12" />);

      expect(container.querySelector('.ui-skeleton')).not.toBeNull();

      rerender(<VerseCard reference="Romans 1:12" text={null} />);
      expect(screen.getByText(/not included in this edition/)).toBeInTheDocument();

      rerender(<VerseCard reference="Romans 1:12" text="an interchange of encouragement" />);
      expect(screen.getByText('an interchange of encouragement')).toBeInTheDocument();
   });
});

describe('Sheet', () => {
   it('renders its content only while open and closes from the close button', () => {
      const onClose = vi.fn();
      const { rerender } = render(
         <Sheet open={false} onClose={onClose} title="Romans 1:12">
            body
         </Sheet>,
      );

      expect(screen.queryByText('body')).toBeNull();

      rerender(
         <Sheet open onClose={onClose} title="Romans 1:12">
            body
         </Sheet>,
      );

      expect(screen.getByText('body')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close', hidden: true }));
      expect(onClose).toHaveBeenCalledOnce();
   });
});

function ToastHarness(): React.ReactElement {
   const { toast } = useToast();

   return (
      <button type="button" onClick={() => toast({ title: 'Link copied', duration: 1000 })}>
         fire
      </button>
   );
}

describe('Toast', () => {
   it('announces a toast and removes it after its duration', () => {
      vi.useFakeTimers();
      render(
         <ToastProvider>
            <ToastHarness />
         </ToastProvider>,
      );

      fireEvent.click(screen.getByText('fire'));
      expect(screen.getByRole('status')).toHaveTextContent('Link copied');

      act(() => {
         vi.advanceTimersByTime(1100);
      });
      expect(screen.queryByRole('status')).toBeNull();
      vi.useRealTimers();
   });
});

function ThemeHarness(): React.ReactElement {
   return <ThemeToggle theme={useTheme()} />;
}

describe('theme', () => {
   it('is dark until changed, then stores and applies each choice', () => {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      render(<ThemeHarness />);

      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
      expect(window.localStorage.getItem('bibliamap-theme')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));

      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
      expect(window.localStorage.getItem('bibliamap-theme')).toBe('light');

      fireEvent.click(screen.getByRole('button', { name: 'Match the device theme' }));

      expect(document.documentElement).not.toHaveAttribute('data-theme');
      expect(window.localStorage.getItem('bibliamap-theme')).toBe('system');

      fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
   });
});
