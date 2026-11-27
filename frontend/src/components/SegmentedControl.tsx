import { useId } from 'react';

import { useSlidingIndicator } from '../hooks/useSlidingIndicator';

interface SegmentedOption<TValue extends string> {
   value: TValue;
   label: string;
}

interface SegmentedControlProps<TValue extends string> {
   label: string;
   options: SegmentedOption<TValue>[];
   value: TValue;
   onChange: (value: TValue) => void;
}

/** A small set of mutually exclusive choices that filter the current view. */
export function SegmentedControl<TValue extends string>({
   label,
   options,
   value,
   onChange,
}: SegmentedControlProps<TValue>): React.ReactElement {
   const labelId = useId();
   const trackRef = useSlidingIndicator<HTMLDivElement>(`${value}:${options.length}`);

   return (
      <div className="control-group">
         <span className="control-label" id={labelId}>
            {label}
         </span>
         <div ref={trackRef} className="segmented-control" role="group" aria-labelledby={labelId}>
            {options.map((option) => {
               const active = option.value === value;

               return (
                  <button
                     key={option.value}
                     type="button"
                     className={active ? 'active' : ''}
                     aria-pressed={active}
                     data-active={active}
                     onClick={() => onChange(option.value)}
                  >
                     {option.label}
                  </button>
               );
            })}
         </div>
      </div>
   );
}
