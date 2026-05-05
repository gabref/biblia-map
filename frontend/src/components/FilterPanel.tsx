interface FilterPanelProps {
   title: string;
   children: React.ReactNode;
}

export function FilterPanel({ title, children }: FilterPanelProps): React.ReactElement {
   return (
      <section className="filter-panel" aria-label={title}>
         <div className="filter-panel-title">{title}</div>
         <div className="filter-panel-body">{children}</div>
      </section>
   );
}
