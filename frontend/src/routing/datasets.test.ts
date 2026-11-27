import { describe, expect, it } from 'vitest';

import type { DatasetRegistryEntry } from '../types/generated';
import { datasetName } from './datasetNames';
import { DEFAULT_DATASET_ID, datasetLang, resolveDatasetId } from './datasets';

const available = [ { datasetId: 'nwtsty' }, { datasetId: 'nwtsty-i' }, { datasetId: 'rbi8' } ];

describe('resolveDatasetId', () => {
   it('prefers a known ?ds= over storage and the default', () => {
      expect(resolveDatasetId('rbi8', 'nwtsty-i', available)).toEqual({ datasetId: 'rbi8', source: 'url', invalidUrlValue: false });
   });

   it('falls back to storage, then the default, when ?ds= is absent', () => {
      expect(resolveDatasetId(undefined, 'nwtsty-i', available)).toEqual({ datasetId: 'nwtsty-i', source: 'storage', invalidUrlValue: false });
      expect(resolveDatasetId(undefined, null, available)).toEqual({ datasetId: DEFAULT_DATASET_ID, source: 'default', invalidUrlValue: false });
   });

   it('flags an unknown ?ds= and keeps going down the chain', () => {
      expect(resolveDatasetId('bogus', 'nwtsty-i', available)).toEqual({ datasetId: 'nwtsty-i', source: 'storage', invalidUrlValue: true });
      expect(resolveDatasetId('', null, available)).toEqual({ datasetId: DEFAULT_DATASET_ID, source: 'default', invalidUrlValue: true });
   });

   it('ignores an unknown stored value', () => {
      expect(resolveDatasetId(undefined, 'gone', available).source).toBe('default');
   });

   it('uses the first dataset when the default is missing from the registry', () => {
      expect(resolveDatasetId(undefined, null, [ { datasetId: 'rbi8' } ])).toEqual({ datasetId: 'rbi8', source: 'first', invalidUrlValue: false });
      expect(resolveDatasetId(undefined, null, []).datasetId).toBe(DEFAULT_DATASET_ID);
   });
});

describe('dataset names', () => {
   const entry = (overrides: Partial<DatasetRegistryEntry>): DatasetRegistryEntry =>
      ({ datasetId: 'x', publicationSymbol: 'abc', publicationYear: 2001, language: 'English', ...overrides }) as DatasetRegistryEntry;

   it('uses friendly names for known editions', () => {
      expect(datasetName(entry({ datasetId: 'nwtsty-i' }))).toBe('Bibbia per lo studio (IT) 2026');
   });

   it('builds symbol + year (+ language) for unknown ones', () => {
      expect(datasetName(entry({}))).toBe('abc 2001');
      expect(datasetName(entry({ language: 'Spanish', publicationYear: undefined }))).toBe('abc (Spanish)');
   });

   it('maps languages to BCP-47', () => {
      expect(datasetLang({ language: 'English' })).toBe('en');
      expect(datasetLang({ language: 'Italiano' })).toBe('it');
      expect(datasetLang({ language: 'Spanish' })).toBeUndefined();
      expect(datasetLang(null)).toBeUndefined();
   });
});
