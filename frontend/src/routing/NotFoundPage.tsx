import { Home } from 'lucide-react';

import { VerseSearchPanel } from '../components/VerseSearch';
import { useT } from '../i18n';
import '../pages/HomePage.css';
import { AppLink } from './AppLink';
import { routeHref, type RouteParams } from './routes';

/** Unknown paths and invalid refs: say so, and offer the search right here. */
export interface NotFoundPageProps {
   path: string;
   datasetId: string;
   params: RouteParams;
   lang?: string;
}

export function NotFoundPage({ path, datasetId, params, lang }: NotFoundPageProps): React.ReactElement {
   const t = useT();
   const [ before, after = '' ] = t('home.notFound.body').split('{path}');

   return (
      <div className="page-stack">
         <section className="not-found" aria-labelledby="not-found-title">
            <p className="eyebrow">404</p>
            <h1 id="not-found-title">{t('home.notFound.title')}</h1>
            <p>
               {before}
               <span className="not-found__path">{path}</span>
               {after}
            </p>
            <VerseSearchPanel variant="inline" size="lg" datasetId={datasetId} lang={lang} params={params} autoFocus />
            <div>
               <AppLink href={routeHref({ name: 'home' }, params)} className="ui-button ui-button--secondary ui-button--md">
                  <Home size={16} aria-hidden="true" />
                  {t('home.notFound.home')}
               </AppLink>
            </div>
         </section>
      </div>
   );
}
