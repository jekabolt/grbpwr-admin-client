// Record the actual Meaning output before the replay discards its session.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [runtime, manifest, output] = process.argv.slice(2);
const entry = JSON.parse(readFileSync(manifest)).find((x) => x.id.includes('MDF502-Harrington'));
assert(entry);
const hook = '  rec.blocked = (s.semantics?.blocked ?? [])';
const code = readFileSync(runtime, 'utf8');
assert.equal(code.split(hook).length, 2);
const observer = resolve('.harrington-observer-' + process.pid + '.mjs');
writeFileSync(
  observer,
  code.replace(hook, '  rec.pocket = s.semantics?.pieces.filter(p => p.seed === 6);\n' + hook),
  { flag: 'wx' },
);
try {
  globalThis.captureGapSession = () => {};
  const { runCase } = await import(pathToFileURL(observer));
  const { verdict, stop, trace, pocket, blocked, operatorAnswers } = await runCase(
    { id: entry.id, group: 'pdf', files: [entry.path], card: entry.card },
    null,
  );
  writeFileSync(
    output,
    JSON.stringify(
      { verdict, stop, trace, pocket, blocked, operatorAnswers: operatorAnswers ?? 0 },
      null,
      2,
    ),
  );
} finally {
  unlinkSync(observer);
}
