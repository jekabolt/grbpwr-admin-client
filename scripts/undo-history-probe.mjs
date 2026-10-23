#!/usr/bin/env node
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `undo-history-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'undo-history-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  logLevel: 'silent',
});

const history = await import(pathToFileURL(outfile).href);
let checks = 0;
let failures = 0;
const same = (name, got, want) => {
  checks += 1;
  const actual = JSON.stringify(got);
  const expected = JSON.stringify(want);
  if (actual === expected) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}\n     ${actual}\n  != ${expected}`);
};

let state = history.emptyUndoHistory();
state = history.recordUndoStep(state, { note: '' }, { note: 'a' }, 'note', 'text:note');
state = history.recordUndoStep(state, { note: '' }, { note: 'abc' }, 'note', 'text:note');
same('a text burst merges into one step', state.undo.length, 1);
let moved = history.undoHistoryStep(state, { note: 'abc' });
same('merged undo restores the burst start', moved.value, { note: '' });
moved = history.redoHistoryStep(moved.state, moved.value);
same('merged redo restores the burst end', moved.value, { note: 'abc' });

const beforeRows = {
  bomItems: [
    { lineKey: 'shell', name: 'shell' },
    { lineKey: 'lining', name: 'lining' },
  ],
};
const afterRows = {
  bomItems: [
    { lineKey: 'lining', name: 'body lining' },
    { lineKey: 'shell', name: 'shell' },
  ],
};
const patches = history.diffHistoryValues(beforeRows, afterRows);
same(
  'keyed arrays use row selectors and order patches',
  patches.some((patch) => patch.kind === 'order') &&
    patches.some(
      (patch) =>
        patch.kind === 'value' &&
        patch.path.some((token) => typeof token === 'object' && token.value === 'lining'),
    ),
  true,
);
same(
  'keyed row undo ignores its current position',
  history.applyHistoryPatches(afterRows, patches, 'before'),
  beforeRows,
);

state = history.emptyUndoHistory();
let value = { count: 0 };
for (let count = 1; count <= 60; count += 1) {
  const next = { count };
  state = history.recordUndoStep(state, value, next, 'count');
  value = next;
}
same('history keeps fifty steps', state.undo.length, history.UNDO_HISTORY_LIMIT);
for (let i = 0; i < history.UNDO_HISTORY_LIMIT; i += 1) {
  const result = history.undoHistoryStep(state, value);
  state = result.state;
  value = result.value;
}
same('the cap drops the oldest ten steps', value, { count: 10 });

state = history.emptyUndoHistory();
state = history.recordUndoStep(state, { count: 0 }, { count: 1 }, 'count');
let undone = history.undoHistoryStep(state, { count: 1 });
state = history.recordUndoStep(undone.state, undone.value, { count: 2 }, 'count');
same('a new human edit clears redo', state.redo.length, 0);

state = history.recordUndoStep(state, { count: 2 }, { count: 3 }, 'count');
state = history.historyBarrier(state);
same('a barrier clears both stacks', [state.undo.length, state.redo.length], [0, 0]);

state = history.recordUndoStep(
  history.emptyUndoHistory(),
  { note: '' },
  { note: 'x'.repeat(1024) },
  'note',
  undefined,
  { bytes: 64 },
);
same('an oversized step becomes a barrier', [state.undo.length, state.redo.length], [0, 0]);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
