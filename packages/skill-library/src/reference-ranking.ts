export interface ReferenceEntry {
  id: string;
  title: string;
  author: string;
  kind: 'artwork' | 'technique';
  url: string;
  observation: string;
  terms: string;
  license?: string | null;
}

function terms(text: string) {
  const normalized = text.normalize('NFKC').toLowerCase();
  const words: string[] = normalized.replace(/\p{Script=Han}+/gu, ' ').match(/[\p{Letter}\p{Number}]+/gu) ?? [];
  for (const run of normalized.match(/\p{Script=Han}+/gu) ?? []) {
    if (run.length === 1) words.push(run);
    else for (let i = 0; i < run.length - 1; i++) words.push(run.slice(i, i + 2));
  }
  return words;
}

export function rankReferences<T extends ReferenceEntry>(records: T[], value: string) {
  const query = [...new Set(terms(value))];
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase();
  return records.map(record => {
    const title = normalize(`${record.title} ${record.id} ${record.author}`);
    const keywords = normalize(record.terms ?? '');
    const observation = normalize(record.observation ?? '');
    const score = query.reduce((total, term) => {
      return total + (title.includes(term) ? 5 : keywords.includes(term) ? 3 : observation.includes(term) ? 1 : 0);
    }, 0);
    return { record, score };
  }).filter(match => match.score > 0).sort((a, b) => b.score - a.score);
}
