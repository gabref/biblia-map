import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { VerseLink } from './VerseLink';

const john316 = { bookNumber: 43, chapterNumber: 3, verseNumber: 16 };

describe('VerseLink', () => {
   afterEach(() => window.history.replaceState({}, '', '/'));

   it('renders an href and a fallback label', () => {
      render(<VerseLink verse={john316} params={{ ds: 'nwtsty' }} className="x" />);
      const link = screen.getByRole('link', { name: 'John 3:16' });

      expect(link).toHaveAttribute('href', '/verse/john/3/16?ds=nwtsty');
      expect(link).toHaveClass('x');
   });

   it('prefers children, then label, then verse.label', () => {
      const { rerender } = render(<VerseLink verse={{ ...john316, label: 'Giovanni 3:16' }} />);

      expect(screen.getByRole('link')).toHaveTextContent('Giovanni 3:16');
      rerender(<VerseLink verse={john316} label="Jn 3:16" />);
      expect(screen.getByRole('link')).toHaveTextContent('Jn 3:16');
      rerender(<VerseLink verse={john316}><b>child</b></VerseLink>);
      expect(screen.getByRole('link')).toHaveTextContent('child');
   });

   it('navigates client-side on plain click only', () => {
      render(<VerseLink verse={john316} />);
      const link = screen.getByRole('link');

      let browserHandled = false;
      // Stop jsdom's (unimplemented) default navigation after our handler has declined it.
      const swallow = (event: Event): void => {
         browserHandled = !event.defaultPrevented;
         event.preventDefault();
      };

      window.addEventListener('click', swallow);
      fireEvent.click(link, { ctrlKey: true });
      window.removeEventListener('click', swallow);
      expect(browserHandled).toBe(true);
      expect(window.location.pathname).toBe('/');

      fireEvent.click(link);
      expect(window.location.pathname).toBe('/verse/john/3/16');
   });
});
