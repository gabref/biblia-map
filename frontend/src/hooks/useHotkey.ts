import { useEffect, useRef } from 'react';

interface HotkeyOptions {
   /** Require Cmd (macOS) or Ctrl (elsewhere). */
   mod?: boolean;
   shift?: boolean;
   /** Fire even while the user is typing in a field. Defaults to true for `mod` combos, false otherwise. */
   allowInInputs?: boolean;
   enabled?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
   if (!(target instanceof HTMLElement)) {
      return false;
   }

   return target.isContentEditable || [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes(target.tagName);
}

/** Global keyboard shortcut, e.g. useHotkey('k', openPalette, { mod: true }) or useHotkey('/', focusSearch). */
export function useHotkey(key: string, handler: (event: KeyboardEvent) => void, options: HotkeyOptions = {}): void {
   const { mod = false, shift = false, allowInInputs = mod, enabled = true } = options;
   const handlerRef = useRef(handler);

   useEffect(() => {
      handlerRef.current = handler;
   });

   useEffect(() => {
      if (!enabled) {
         return undefined;
      }

      const handleKeyDown = (event: KeyboardEvent): void => {
         const hasMod = event.metaKey || event.ctrlKey;

         if (event.key.toLowerCase() !== key.toLowerCase() || hasMod !== mod || (shift && !event.shiftKey)) {
            return;
         }

         if (!allowInInputs && isTypingTarget(event.target)) {
            return;
         }

         event.preventDefault();
         handlerRef.current(event);
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => window.removeEventListener('keydown', handleKeyDown);
   }, [ allowInInputs, enabled, key, mod, shift ]);
}
