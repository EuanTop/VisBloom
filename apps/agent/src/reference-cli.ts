import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { CLIError } from './cli-support.ts';
import publicReferences from '../../../packages/skill-library/src/public-references.json';
import { rankReferences, type ReferenceEntry } from '../../../packages/skill-library/src/reference-ranking.ts';

const root = fileURLToPath(new URL('../../../reference-library/', import.meta.url));
const help = `Visloom artwork references

references find --query "quiet repetition waiting" [--limit 6]
references find --query "光随曲面变化"
references show --id electronic-sheep

Searches local artist, work, technique and intent notes. Results link to the original and to the licensed local implementation when one is available.`;

interface Reference extends ReferenceEntry {
  code?: string;
}

export async function runReferences(args: string[]) {
  if (!args.length || args[0] === '--help' || args[1] === '--help') {
    console.log(help);
    return;
  }
  const [command, flag, value, limitFlag, limitValue, ...extra] = args;
  const limit = limitFlag === undefined ? 6 : Number(limitValue);
  const show = command === 'show' && flag === '--id' && limitFlag === undefined;
  const find = command === 'find' && flag === '--query' && (limitFlag === undefined || limitFlag === '--limit');
  if ((!show && !find) || !value?.trim() || extra.length || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new CLIError('usage', help, 2);
  }
  let records: Reference[] = publicReferences as Reference[];
  try {
    records = JSON.parse(await readFile(path.join(root, 'art-index.json'), 'utf8')) as Reference[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  function describe({ terms: _terms, code, license, ...record }: Reference) {
    return { ...record, ...(code ? { code: path.join(root, code), license, attribution: path.join(root, 'SOURCES.md') } : {}) };
  }
  if (show) {
    const match = records.find(record => record.id === value);
    if (!match) throw new CLIError('reference_missing', `Unknown reference: ${value}`, 1);
    console.log(JSON.stringify(describe(match), null, 2));
    return;
  }
  const matches = rankReferences(records, value);
  console.log(JSON.stringify({ total: matches.length, items: matches.slice(0, limit).map(match => describe(match.record)) }, null, 2));
}
