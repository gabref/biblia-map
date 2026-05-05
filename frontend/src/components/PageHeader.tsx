interface PageHeaderProps {
   eyebrow: string;
   title: string;
   description: string;
   children?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, children }: PageHeaderProps): React.ReactElement {
   return (
      <header className="page-header">
         <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="page-description">{description}</p>
         </div>
         {children ? <div className="page-header-actions">{children}</div> : null}
      </header>
   );
}
