import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'design-baseline.json');
const CONFIG_PATH = path.join(ROOT, 'design-lint.config.mjs');
const DEFAULT_TARGET = 'src/**/*.{ts,tsx}';

function usage(message) {
  if (message) console.error(`design-ratchet: ${message}`);
  console.error(
    'usage: node scripts/design-ratchet.mjs [--init | --update] [--files file.tsx ...]',
  );
  process.exitCode = 2;
}

function parseArguments(argv) {
  const init = argv.includes('--init');
  const update = argv.includes('--update');
  if (init && update) return usage('--init and --update are mutually exclusive');

  const filesAt = argv.indexOf('--files');
  const known = new Set(['--init', '--update', '--files']);
  const unknown = argv.filter((arg, index) => {
    if (known.has(arg)) return false;
    return filesAt === -1 || index < filesAt;
  });
  if (unknown.length > 0) return usage(`unknown argument: ${unknown[0]}`);

  const files = filesAt === -1 ? [] : argv.slice(filesAt + 1).filter((arg) => !known.has(arg));
  if (filesAt !== -1 && files.length === 0) return usage('--files needs at least one path');
  return { init, update, files };
}

function repoPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function sortedSnapshot(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot)
      .filter(([, rules]) => Object.values(rules).some((count) => count > 0))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, rules]) => [
        file,
        Object.fromEntries(
          Object.entries(rules)
            .filter(([, count]) => count > 0)
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      ]),
  );
}

async function readBaseline(required) {
  try {
    return JSON.parse(await fs.readFile(BASELINE_PATH, 'utf8'));
  } catch (error) {
    if (!required && error?.code === 'ENOENT') return {};
    if (error?.code === 'ENOENT') {
      throw new Error('design-baseline.json is missing; run yarn lint:design --init once');
    }
    throw error;
  }
}

async function writeBaseline(snapshot) {
  await fs.writeFile(BASELINE_PATH, `${JSON.stringify(sortedSnapshot(snapshot), null, 2)}\n`);
}

function collect(results) {
  const messagesByFile = new Map();
  const counts = {};
  const infrastructureErrors = [];

  for (const result of results) {
    const file = repoPath(result.filePath);
    const designMessages = result.messages.filter(
      (message) => message.severity > 0 && message.ruleId?.startsWith('design/'),
    );
    messagesByFile.set(file, designMessages);

    for (const message of result.messages) {
      if (message.severity === 2 && !message.ruleId?.startsWith('design/')) {
        infrastructureErrors.push({ file, message });
      }
    }

    for (const message of designMessages) {
      counts[file] ??= {};
      counts[file][message.ruleId] = (counts[file][message.ruleId] ?? 0) + 1;
    }
  }

  return { counts: sortedSnapshot(counts), infrastructureErrors, messagesByFile };
}

function messageLine(file, message) {
  return `${file}:${message.line ?? 1}:${message.column ?? 1} ${message.ruleId ?? 'eslint'} ${message.message}`;
}

function countAt(snapshot, file, rule) {
  return snapshot[file]?.[rule] ?? 0;
}

function comparisonFiles(baseline, current, scanned, isWholeRepository) {
  if (!isWholeRepository) return [...scanned].sort();
  return [...new Set([...Object.keys(baseline), ...Object.keys(current)])].sort();
}

function changes(baseline, current, files) {
  const raised = [];
  const lowered = [];
  for (const file of files) {
    const rules = new Set([
      ...Object.keys(baseline[file] ?? {}),
      ...Object.keys(current[file] ?? {}),
    ]);
    for (const rule of [...rules].sort()) {
      const before = countAt(baseline, file, rule);
      const after = countAt(current, file, rule);
      if (after > before) raised.push({ file, rule, before, after });
      if (after < before) lowered.push({ file, rule, before, after });
    }
  }
  return { lowered, raised };
}

function scopedSnapshot(baseline, current, scanned, isWholeRepository) {
  if (isWholeRepository) return current;
  const next = structuredClone(baseline);
  for (const file of scanned) {
    delete next[file];
    if (current[file]) next[file] = current[file];
  }
  return next;
}

function printViolations(change, messagesByFile) {
  console.error(
    `${change.file}: ${change.rule} has ${change.after} violation(s); baseline allows ${change.before}.`,
  );
  for (const message of messagesByFile.get(change.file) ?? []) {
    if (message.ruleId === change.rule) console.error(`  ${messageLine(change.file, message)}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;

  const isWholeRepository = options.files.length === 0;
  const targets = isWholeRepository ? [DEFAULT_TARGET] : options.files;
  const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: CONFIG_PATH });
  const results = await eslint.lintFiles(targets);
  const { counts, infrastructureErrors, messagesByFile } = collect(results);
  const scanned = new Set(results.map((result) => repoPath(result.filePath)));

  if (infrastructureErrors.length > 0) {
    console.error('Design lint could not complete:');
    for (const { file, message } of infrastructureErrors) {
      console.error(`  ${messageLine(file, message)}`);
    }
    process.exitCode = 1;
    return;
  }

  if (options.init) {
    if (!isWholeRepository) {
      usage('--init must scan the whole repository');
      return;
    }
    await writeBaseline(counts);
    const total = Object.values(counts).reduce(
      (sum, rules) => sum + Object.values(rules).reduce((ruleSum, count) => ruleSum + count, 0),
      0,
    );
    console.log(
      `Created design-baseline.json with ${total} violation(s) in ${Object.keys(counts).length} file(s).`,
    );
    return;
  }

  const baseline = await readBaseline(true);
  const files = comparisonFiles(baseline, counts, scanned, isWholeRepository);
  const delta = changes(baseline, counts, files);

  if (options.update) {
    if (delta.raised.length > 0 && process.env.DESIGN_BASELINE_RAISE !== '1') {
      console.error(
        'Refusing to raise the design baseline. Remove the new violations or set DESIGN_BASELINE_RAISE=1 with an approved [baseline-ok] commit.',
      );
      for (const change of delta.raised) printViolations(change, messagesByFile);
      process.exitCode = 1;
      return;
    }

    await writeBaseline(scopedSnapshot(baseline, counts, scanned, isWholeRepository));
    console.log(
      `Updated design-baseline.json: ${delta.lowered.length} lowered, ${delta.raised.length} raised.`,
    );
    return;
  }

  if (delta.raised.length > 0) {
    console.error('Design lint failed:');
    for (const change of delta.raised) printViolations(change, messagesByFile);
    process.exitCode = 1;
    return;
  }

  const total = Object.values(counts).reduce(
    (sum, rules) => sum + Object.values(rules).reduce((ruleSum, count) => ruleSum + count, 0),
    0,
  );
  console.log(
    `Design lint passed: ${total} existing violation(s) stayed at or below baseline across ${Object.keys(counts).length} file(s).`,
  );
  if (delta.lowered.length > 0) {
    console.log('Design debt decreased; run yarn lint:design --update to lock in the improvement.');
  }
}

main().catch((error) => {
  console.error(`design-ratchet: ${error.stack ?? error.message ?? error}`);
  process.exitCode = 1;
});
