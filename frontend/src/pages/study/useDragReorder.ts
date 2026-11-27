import { useState } from 'react';

/**
 * Minimal HTML5 drag-to-reorder for a vertical list. Only the grip handle is draggable (the
 * whole row is used as the drag image), so text selection and links inside rows keep working.
 * Keyboard and touch users get up/down buttons instead.
 */
export function useDragReorder(onMove: (id: string, toIndex: number) => void): {
   itemProps: (index: number) => React.HTMLAttributes<HTMLElement>;
   handleProps: (id: string) => React.HTMLAttributes<HTMLElement> & { draggable: boolean };
   isOver: (index: number) => boolean;
   isDragging: (id: string) => boolean;
} {
   const [ draggingId, setDraggingId ] = useState<string | null>(null);
   const [ overIndex, setOverIndex ] = useState<number | null>(null);

   const reset = (): void => {
      setDraggingId(null);
      setOverIndex(null);
   };

   return {
      isOver: (index) => draggingId !== null && overIndex === index,
      isDragging: (id) => draggingId === id,
      handleProps: (id) => ({
         draggable: true,
         'aria-hidden': true,
         onDragStart: (event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);
            const row = (event.currentTarget as HTMLElement).closest('li');

            if (row) {
               event.dataTransfer.setDragImage(row, 16, 16);
            }

            setDraggingId(id);
         },
         onDragEnd: reset,
      }),
      itemProps: (index) => ({
         onDragOver: (event) => {
            if (draggingId === null) {
               return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';

            if (overIndex !== index) {
               setOverIndex(index);
            }
         },
         onDrop: (event) => {
            event.preventDefault();

            if (draggingId !== null) {
               onMove(draggingId, index);
            }

            reset();
         },
      }),
   };
}
