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

export function SegmentedControl<TValue extends string>({
   label,
   options,
   value,
   onChange,
}: SegmentedControlProps<TValue>): React.ReactElement {
   return (
      <div className="control-group">
         <span className="control-label">{label}</span>
         <div className="segmented-control">
            {options.map((option) => (
               <button
                  key={option.value}
                  type="button"
                  className={option.value === value ? 'active' : ''}
                  onClick={() => onChange(option.value)}
               >
                  {option.label}
               </button>
            ))}
         </div>
      </div>
   );
}
