// Regenerate with: node scripts/generate-operation-work-snapshot.mjs [backend checkout]
// Add --check to compare with the committed snapshot without writing it.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repo = resolve(dirname(scriptPath), '..');
export const defaultWorkCatalogBackend = resolve(repo, '..', 'grbpwr-products-manager');
const snapshotPath = resolve(
  repo,
  'src/components/managers/tech-card/components/operation-work-snapshot.json',
);

const insertWorks =
  /^INSERT INTO operation_work \(token, verb, stage, label, machine_mode, default_machine, sort\) VALUES\s+([\s\S]+?)\s+ON DUPLICATE KEY UPDATE sort = sort$/;
const insertPairs =
  /^INSERT INTO operation_work_(machine|syn) \(work_token, (?:machine_type|syn)\) VALUES\s+([\s\S]+?)\s+ON DUPLICATE KEY UPDATE work_token = work_token$/;
const workTuple =
  /^\('([^']+)', '([^']+)', '([^']+)', '([^']+)', '(fixed|ask|none)', (?:'([^']+)'|NULL), (\d+)\),?$/;
const pairTuple = /^\('([^']+)', '([^']+)'\),?$/;
const retireWork =
  /^UPDATE operation_work SET retired_at = CURRENT_TIMESTAMP\s+WHERE token = '([^']+)'(?: AND retired_at IS NULL)?$/;
const relabelWork =
  /^UPDATE operation_work SET label = '([^']+)'\s+WHERE token = '([^']+)'(?: AND label = '[^']+')?$/;
const catalogWrite =
  /^(?:INSERT(?:\s+IGNORE)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+`?operation_work(?:_(?:machine|syn))?\b/i;

function tuples(file, body, pattern) {
  return body
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(pattern);
      if (!match) throw new Error(`${file}: unsupported work catalog tuple: ${line.trim()}`);
      return match;
    });
}

/** Reads the committed seed and its follow-up edits. Administrator defaults are separate live data. */
export function readSeededWorks(backend = defaultWorkCatalogBackend) {
  const dir = resolve(backend, 'internal/store/sql');
  if (!existsSync(dir)) return null;
  const works = new Map();
  for (const file of readdirSync(dir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort()) {
    const up = readFileSync(resolve(dir, file), 'utf8').split('-- +migrate Down')[0];
    const body = up
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const workFor = (token) => {
      const work = works.get(token);
      if (!work) throw new Error(`${file}: unknown work token ${token}`);
      return work;
    };
    for (const raw of body.split(';')) {
      const statement = raw.trim();
      if (!catalogWrite.test(statement)) continue;
      const seed = statement.match(insertWorks);
      const pairs = statement.match(insertPairs);
      const retirement = statement.match(retireWork);
      const relabel = statement.match(relabelWork);
      if (seed) {
        for (const [, token, verb, stage, label, machineMode, defaultMachine, sort] of tuples(
          file,
          seed[1],
          workTuple,
        )) {
          if (works.has(token)) throw new Error(`${file}: duplicate work token ${token}`);
          works.set(token, {
            token,
            verb,
            stage,
            label,
            machineMode,
            defaultMachine: defaultMachine ?? '',
            machines: [],
            syn: [],
            sort: Number(sort),
            retired: false,
          });
        }
      } else if (pairs) {
        const key = pairs[1] === 'machine' ? 'machines' : 'syn';
        for (const [, token, value] of tuples(file, pairs[2], pairTuple)) {
          const values = workFor(token)[key];
          if (values.includes(value))
            throw new Error(`${file}: duplicate ${key} entry for ${token}: ${value}`);
          values.push(value);
        }
      } else if (retirement) {
        workFor(retirement[1]).retired = true;
      } else if (relabel) {
        workFor(relabel[2]).label = relabel[1];
      } else {
        throw new Error(`${file}: unsupported work catalog statement: ${statement.split('\n')[0]}`);
      }
    }
  }
  if (!works.size) throw new Error(`No operation work seed found in ${dir}`);
  return [...works.values()].sort((a, b) => a.sort - b.sort || a.token.localeCompare(b.token));
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const args = process.argv.slice(2);
  const backend = args.find((arg) => arg !== '--check') ?? defaultWorkCatalogBackend;
  const works = readSeededWorks(backend);
  if (!works) throw new Error(`Backend migrations not found in ${backend}`);
  const { format, resolveConfig } = await import('prettier');
  const config = await resolveConfig(snapshotPath);
  const snapshot = await format(JSON.stringify(works), { ...config, filepath: snapshotPath });
  if (args.includes('--check')) {
    if (readFileSync(snapshotPath, 'utf8') !== snapshot) {
      throw new Error('Operation work snapshot is stale. Regenerate it from the paired backend.');
    }
  } else {
    writeFileSync(snapshotPath, snapshot);
  }
  console.log(`Operation work snapshot: ${works.length} works`);
}
