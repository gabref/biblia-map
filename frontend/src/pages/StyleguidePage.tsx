import { BookOpen, Copy, Search, SearchX } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import {
   Button,
   Card,
   CardHeader,
   Chip,
   EmptyState,
   Field,
   IconButton,
   Kbd,
   ReferenceChip,
   Select,
   Sheet,
   Skeleton,
   TabPanel,
   Tabs,
   Tooltip,
   useToast,
   VerseCard,
} from '../components/ui';

type DemoTab = 'refs' | 'notes' | 'both';

const swatches = [
   'bg',
   'bg-sunken',
   'surface',
   'surface-raised',
   'ink',
   'ink-2',
   'ink-3',
   'accent',
   'gilt',
   'rubric',
   'outgoing',
   'incoming',
   'both',
   'canon-law',
   'canon-history',
   'canon-poetry',
   'canon-prophets',
   'canon-gospels',
   'canon-letters',
   'canon-revelation',
];

/**
 * Living reference for the design system at /styleguide (not linked from the nav).
 * Every primitive in components/ui is rendered here; check both themes when changing one.
 */
export function StyleguidePage(): React.ReactElement {
   const [ tab, setTab ] = useState<DemoTab>('refs');
   const [ pill, setPill ] = useState<DemoTab>('both');
   const [ sheetSide, setSheetSide ] = useState<'responsive' | 'center' | null>(null);
   const [ edition, setEdition ] = useState('nwtsty');
   const { toast } = useToast();

   return (
      <div className="page-stack">
         <PageHeader
            eyebrow="Design system"
            title="Styleguide"
            description="Tokens and primitives from docs/design/design-spec.md. Build pages from these; do not add one-off colours or sizes."
         />

         <Card as="section">
            <CardHeader title="Colour" description="Swatches read the live tokens, so they follow the theme." />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
               {swatches.map((name) => (
                  <div key={name} className="t-caption">
                     <div
                        className="mb-1 h-10 rounded-md border border-line"
                        style={{ background: `var(--${name})` }}
                     />
                     <span className="t-mono">--{name}</span>
                  </div>
               ))}
            </div>
         </Card>

         <Card as="section">
            <CardHeader title="Type" description="Literata for scripture and titles, Instrument Sans for interface." />
            <div className="grid gap-3">
               <p className="t-eyebrow">Eyebrow · t-eyebrow</p>
               <p className="t-display">In the beginning</p>
               <p className="t-title">Panel title in the serif · t-title</p>
               <p className="t-scripture">
                  “Your word is a lamp to my foot, and a light for my path.” Scripture is always set with t-scripture:
                  serif, reading size, bounded measure.
               </p>
               <p>
                  Body copy in the sans. <span className="t-ref">Psalm 119:105</span> is a citation (t-ref),{' '}
                  <span className="t-numeral">80,568</span> a numeral, and <span className="t-mono">nwtsty</span> a
                  technical value.
               </p>
               <p className="t-caption">Caption · t-caption</p>
            </div>
         </Card>

         <Card as="section">
            <CardHeader title="Buttons" />
            <div className="flex flex-wrap items-center gap-3">
               <Button variant="primary" leading={<BookOpen size={16} />}>
                  Open verse
               </Button>
               <Button>Secondary</Button>
               <Button variant="ghost">Ghost</Button>
               <Button variant="danger">Remove</Button>
               <Button size="sm">Small</Button>
               <Button size="lg">Large</Button>
               <Button loading>Loading</Button>
               <Button disabled>Disabled</Button>
               <Tooltip content="Copy link to this verse">
                  <IconButton label="Copy link" variant="secondary" onClick={() => toast('Link copied')}>
                     <Copy size={16} />
                  </IconButton>
               </Tooltip>
               <span>
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
               </span>
            </div>
         </Card>

         <Card as="section">
            <CardHeader title="Chips" description="ReferenceChip is the unit of navigation: hover previews the verse." />
            <div className="flex flex-wrap items-center gap-2">
               <Chip>Neutral</Chip>
               <Chip tone="accent" count={12}>
                  Cross refs
               </Chip>
               <Chip tone="gilt">Highlighted</Chip>
               <Chip tone="rubric">Selected</Chip>
               <Chip tone="accent" selected onClick={() => undefined}>
                  Pressed
               </Chip>
               <Chip onRemove={() => undefined}>Psalms</Chip>
               <Tooltip
                  variant="card"
                  side="bottom"
                  content={
                     <VerseCard
                        density="compact"
                        reference="Hebrews 10:25"
                        text="not forsaking our meeting together, as some have the custom, but encouraging one another."
                     />
                  }
               >
                  <ReferenceChip reference="Hebrews 10:25" direction="incoming" onClick={() => undefined} />
               </Tooltip>
               <ReferenceChip reference="1 Thessalonians 5:11" direction="outgoing" onClick={() => undefined} />
               <ReferenceChip reference="Romans 12:8" direction="both" onClick={() => undefined} />
               <ReferenceChip reference="Acts 28:15" size="sm" />
            </div>
         </Card>

         <Card as="section">
            <CardHeader
               title="Tabs & fields"
               action={
                  <Tabs
                     label="Demo pill tabs"
                     variant="pill"
                     size="sm"
                     value={pill}
                     onChange={setPill}
                     items={[
                        { value: 'both', label: 'Combined' },
                        { value: 'refs', label: 'Cross refs' },
                        { value: 'notes', label: 'Study notes' },
                     ]}
                  />
               }
            />
            <Tabs
               label="Demo tabs"
               idBase="styleguide"
               value={tab}
               onChange={setTab}
               items={[
                  { value: 'refs', label: 'Cross references', count: 13 },
                  { value: 'notes', label: 'Study notes', count: 1 },
                  { value: 'both', label: 'Reading', icon: <BookOpen size={15} /> },
               ]}
            />
            <TabPanel idBase="styleguide" value="refs" activeValue={tab} className="grid gap-1 pt-4">
               <VerseCard
                  tone="selected"
                  reference="Romans 1:12"
                  meta="Selected verse"
                  text="or, rather, that we may have an interchange of encouragement by one another’s faith, both yours and mine."
               />
               <VerseCard
                  tone="outgoing"
                  reference="1 Thessalonians 5:11"
                  meta="Cross reference"
                  text="Therefore, keep encouraging one another and building one another up, just as you are in fact doing."
                  onClick={() => undefined}
               />
               <VerseCard tone="incoming" reference="Hebrews 10:25" meta="Loading" />
               <VerseCard reference="Acts 28:15" text={null} density="compact" />
            </TabPanel>
            <TabPanel idBase="styleguide" value="notes" activeValue={tab} className="pt-4">
               <EmptyState
                  icon={<SearchX size={20} />}
                  title="No study notes cite this verse"
                  description="Switch to Combined to see cross references, or pick a neighbouring verse."
                  action={<Button size="sm">Show combined</Button>}
               />
            </TabPanel>
            <TabPanel idBase="styleguide" value="both" activeValue={tab} className="grid max-w-sm gap-4 pt-4">
               <Field label="Edition" hint="Each edition has its own reference graph.">
                  {(id) => (
                     <Select
                        id={id}
                        value={edition}
                        onChange={setEdition}
                        options={[
                           { value: 'nwtsty', label: 'Study Edition 2025' },
                           { value: 'nwt', label: 'New World Translation 2013' },
                        ]}
                     />
                  )}
               </Field>
               <Skeleton lines={3} />
               <Skeleton variant="block" height={64} />
            </TabPanel>
         </Card>

         <Card as="section">
            <CardHeader title="Overlays & feedback" />
            <div className="flex flex-wrap gap-3">
               <Button onClick={() => setSheetSide('responsive')}>Open drawer</Button>
               <Button onClick={() => setSheetSide('center')}>Open dialog</Button>
               <Button onClick={() => toast({ title: 'Verse pinned', description: 'Romans 1:12', tone: 'success' })}>
                  Success toast
               </Button>
               <Button
                  onClick={() =>
                     toast({ title: 'Could not load adjacency data', tone: 'danger', action: { label: 'Retry', onClick: () => undefined } })
                  }
               >
                  Error toast
               </Button>
            </div>
            <Sheet
               open={sheetSide !== null}
               side={sheetSide ?? 'responsive'}
               onClose={() => setSheetSide(null)}
               title="Romans 1:12"
               description="14 links across 11 verses"
               footer={
                  <>
                     <Button variant="ghost" onClick={() => setSheetSide(null)}>
                        Close
                     </Button>
                     <Button variant="primary" leading={<Search size={15} />}>
                        Explore
                     </Button>
                  </>
               }
            >
               <p className="t-scripture">
                  or, rather, that we may have an interchange of encouragement by one another’s faith, both yours and
                  mine.
               </p>
            </Sheet>
         </Card>
      </div>
   );
}
