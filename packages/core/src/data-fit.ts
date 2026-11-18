import { dataColumnKinds, type DataBinding, type DataColumnKind, type DataFit, type DataResult } from '@art/contracts';

export function validDataBindings(bindings: DataBinding[]): boolean {
  return Array.isArray(bindings) && bindings.length <= 80 && bindings.every(binding => {
    if (!binding || typeof binding.field !== 'string' || !binding.field.trim() || binding.field.length > 120 ||
        typeof binding.channel !== 'string' || !binding.channel.trim() || binding.channel.length > 240) return false;
    const requirements = binding.requires;
    if (requirements === undefined) return true;
    if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) return false;
    const columns = Object.entries(requirements);
    return columns.length <= 16 && columns.every(([field, kind]) =>
      field.trim() && field.length <= 120 && dataColumnKinds.includes(kind));
  });
}

export function checkDataFit(
  bindings: readonly DataBinding[],
  result: Pick<DataResult, 'columns' | 'rows'>,
  currentColumns: readonly string[],
): DataFit {
  const expectedByField = new Map<string, Set<DataColumnKind>>();
  for (const binding of bindings) {
    for (const [field, kind] of Object.entries(binding.requires ?? {})) {
      const kinds = expectedByField.get(field) ?? new Set<DataColumnKind>();
      kinds.add(kind);
      expectedByField.set(field, kinds);
    }
  }
  const available = new Set(result.columns);
  const current = new Set(currentColumns);
  const fit: DataFit = { required: [...expectedByField.keys()], missing: [], incompatible: [], unchecked: [], advisoryMissing: [] };
  for (const [field, kinds] of expectedByField) {
    if (!available.has(field)) {
      fit.missing.push(field);
      continue;
    }
    const values = result.rows.map(row => row[field]).filter(value => value !== null && value !== undefined);
    for (const kind of kinds) {
      if (kind === 'any') continue;
      if (!values.length) {
        if (!fit.unchecked.includes(field)) fit.unchecked.push(field);
      } else if (values.some(value => typeof value !== kind || (kind === 'number' && !Number.isFinite(value)))) {
        fit.incompatible.push({ field, expected: kind });
      }
    }
  }
  const descriptions = bindings.flatMap(binding => current.has(binding.field) ? [binding.field] : binding.field.split('/').map(field => field.trim()));
  fit.advisoryMissing = [...new Set(descriptions)].filter(field =>
    current.has(field) && !available.has(field) && !expectedByField.has(field));
  return fit;
}
