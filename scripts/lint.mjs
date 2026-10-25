import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const baseline = JSON.parse(readFileSync(resolve(root, 'scripts/eslint-baseline.json'), 'utf8'));
const fix = process.argv.includes('--fix');
const prettierBin = require.resolve('prettier/bin/prettier.cjs');

function runPrettier(mode) {
  return new Promise((complete) => {
    execFile(
      process.execPath,
      [prettierBin, mode, './src/**/*.{js,ts,tsx,json}'],
      { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        complete({ status: error?.code ?? 0, stderr, stdout });
      },
    );
  });
}

// eslint-plugin-prettier starts a synchronous worker for every file under Prettier 3. On this
// tree that pass alone exceeds nine minutes. The one-process Prettier CLI enforces the same
// formatting contract below while the flat config retains the migrated rule at warning level.
const eslint = new ESLint({
  cwd: root,
  fix,
  overrideConfig: { rules: { 'prettier/prettier': 'off' } },
});
// In check mode both tools only read files, so overlap them to keep the paid CI gate short. In
// fix mode Prettier waits for ESLint's edits and then formats their result deterministically.
const prettierCheck = fix ? null : runPrettier('--check');
const results = await eslint.lintFiles(['src/**/*.{js,ts,tsx,json}']);
if (fix) await ESLint.outputFixes(results);

const counts = new Map();
const messagesByRule = new Map();
let fatal = false;
for (const result of results) {
  for (const message of result.messages) {
    const rule = message.ruleId ?? '(configuration)';
    counts.set(rule, (counts.get(rule) ?? 0) + 1);
    const rows = messagesByRule.get(rule) ?? [];
    rows.push({ filePath: result.filePath, ...message });
    messagesByRule.set(rule, rows);
    if (message.fatal || message.severity === 2) fatal = true;
  }
}

const rules = new Set([...Object.keys(baseline.rules), ...counts.keys()]);
const increases = [];
for (const rule of [...rules].sort()) {
  const allowed = baseline.rules[rule] ?? 0;
  const current = counts.get(rule) ?? 0;
  console.log(`${rule}: ${current} warning(s), baseline ${allowed}`);
  if (current > allowed) increases.push(rule);
}

if (increases.length || fatal) {
  console.error('\nNew ESLint violations:');
  for (const rule of increases) {
    for (const message of messagesByRule.get(rule) ?? []) {
      console.error(
        `${relative(root, message.filePath)}:${message.line}:${message.column} error ${message.message} ${rule}`,
      );
    }
  }
  process.exitCode = 1;
}

const prettier = fix ? await runPrettier('--write') : await prettierCheck;
const prettierOutput = `${prettier.stdout ?? ''}\n${prettier.stderr ?? ''}`;
if (fix) {
  if (prettier.status !== 0) {
    console.error(prettierOutput.trim());
    process.exitCode = 1;
  }
} else {
  const match = prettierOutput.match(/Code style issues found in (\d+) files?/);
  const differingFiles = match ? Number(match[1]) : prettier.status === 0 ? 0 : null;
  console.log(
    `prettier/prettier: ${differingFiles ?? 'unknown'} file warning(s), baseline ${baseline.prettierDifferingFiles}`,
  );
  if (prettier.status !== 0 && prettier.status !== 1) {
    console.error(prettierOutput.trim());
    process.exitCode = 1;
  } else if (differingFiles === null || differingFiles > baseline.prettierDifferingFiles) {
    console.error(prettierOutput.trim());
    process.exitCode = 1;
  }
}
