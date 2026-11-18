import type { Profile, Schema } from '@antv/ava/browser';

type Row = Record<string, unknown>;
export type ArtworkFilter = { field: string; equals: string | number | boolean } |
  { field: string; min?: number; max?: number; maxExclusive?: boolean };
type ColumnSummary = { min: number | null; max: number | null; mean: number | null; missing: number };
type ProfileRows = (rows: Row[], schema: Schema, options: {
  metrics: { id: 'row_count' | 'null_count' | 'min' | 'max' | 'mean' }[];
}) => Profile;

function matches(row: Row, filter: ArtworkFilter) {
  const value = row[filter.field];
  if ('equals' in filter) return value === filter.equals;
  return typeof value === 'number' && Number.isFinite(value) &&
    (filter.min === undefined || value >= filter.min) &&
    (filter.max === undefined || (filter.maxExclusive ? value < filter.max : value <= filter.max));
}

/** Filter published rows and calculate numeric summaries using AVA's JavaScript profiler. */
export function createArtworkExplorer(profileRows: ProfileRows) {
  return async function exploreArtworkRows<T extends Row>(
    rows: readonly T[],
    { filters = [], fields }: { filters?: readonly ArtworkFilter[]; fields: readonly string[] },
  ): Promise<{ rows: T[]; count: number; columns: Record<string, ColumnSummary> }> {
    const matching = rows.filter(row => filters.every(filter => matches(row, filter)));
    if (!matching.length) return { rows: [], count: 0, columns: {} };

    const data = matching.map(row => Object.fromEntries(fields.map(field => {
      const value = row[field];
      return [field, typeof value === 'number' && Number.isFinite(value) ? value : null];
    })));
    const schema: Schema = { models: [{
      name: 'data', tableReference: { table: 'data' }, columns: fields.map(name => ({ name, type: 'number' })),
    }] };
    const { models: [profile] } = profileRows(data, schema, { metrics: [
      { id: 'row_count' }, { id: 'null_count' }, { id: 'min' }, { id: 'max' }, { id: 'mean' },
    ] });
    const count = profile?.metrics?.row_count;
    if (typeof count !== 'number' || count !== matching.length) throw new Error('AVA returned an invalid row count.');
    const columns = Object.fromEntries(fields.map(field => {
      const metrics = profile.columns.find(column => column.name === field)?.metrics;
      const numeric = (name: 'min' | 'max' | 'mean') => {
        const value = metrics?.[name];
        return typeof value === 'number' ? value : null;
      };
      return [field, {
        min: numeric('min'), max: numeric('max'), mean: numeric('mean'),
        missing: typeof metrics?.null_count === 'number' ? metrics.null_count : count,
      }];
    }));
    return { rows: matching, count, columns };
  };
}
