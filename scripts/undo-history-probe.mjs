#!/usr/bin/env node
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
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

const operationBefore = {
  operations: [
    { historyKey: 'op-a', operationNumber: 10, note: 'first' },
    { historyKey: 'op-b', operationNumber: 20, note: 'second' },
  ],
};
const operationAfter = {
  operations: [
    { historyKey: 'op-b', operationNumber: 20, note: 'changed' },
    { historyKey: 'op-a', operationNumber: 10, note: 'first' },
  ],
};
const operationPatches = history.diffHistoryValues(operationBefore, operationAfter);
same(
  'operations are patched by durable history key, never row index',
  operationPatches.some(
    (patch) =>
      patch.kind === 'value' &&
      patch.path.some(
        (token) => typeof token === 'object' && token.key === 'historyKey' && token.value === 'op-b',
      ),
  ),
  true,
);
same(
  'server row insertion or reorder cuts history',
  history.historyArrayIdentityChanged(operationBefore, {
    operations: [
      { historyKey: 'server-fuse', operationNumber: 10, note: 'generated' },
      { historyKey: 'op-a', operationNumber: 20, note: 'first' },
      { historyKey: 'op-b', operationNumber: 30, note: 'changed' },
    ],
  }),
  true,
);
same(
  'server id assignment cuts history before id zero can be replayed',
  history.historyArrayIdentityChanged(
    { bomItems: [{ lineKey: 'shell', id: 0, name: 'shell' }] },
    { bomItems: [{ lineKey: 'shell', id: 41, name: 'shell' }] },
  ),
  true,
);
const unkeyed = history.diffHistoryValues(
  { issues: [{ description: 'a' }, { description: 'b' }] },
  { issues: [{ description: 'a' }, { description: 'changed' }] },
);
same(
  'unkeyed row arrays are atomic instead of index patched',
  unkeyed.length === 1 &&
    unkeyed[0].kind === 'value' &&
    unkeyed[0].path.length === 1 &&
    unkeyed[0].path[0] === 'issues',
  true,
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

const hookSource = await readFile(
  resolve(root, 'src/components/managers/tech-card/components/undo-history.tsx'),
  'utf8',
);
const formSource = await readFile(
  resolve(root, 'src/components/managers/tech-card/components/index.tsx'),
  'utf8',
);
const cutBody = hookSource.slice(
  hookSource.indexOf('const cut = useCallback'),
  hookSource.indexOf('const flushThenCut = useCallback'),
);
same(
  'independent history cut never validates or flushes autosave',
  !cutBody.includes('autosave.flush') && cutBody.includes('historyBarrier'),
  true,
);
same(
  'save reconciliation closes gestures and suppresses watcher recording',
  hookSource.includes('reconciling.current > 0') &&
    formSource.includes('undoHistory.api.beginServerReconciliation()') &&
    formSource.includes('finishHistoryReconciliation();'),
  true,
);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
