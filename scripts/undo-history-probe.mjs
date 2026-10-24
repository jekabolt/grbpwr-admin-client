#!/usr/bin/env node
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `undo-history-${process.pid}.mjs`);
process.env.TZ = 'Europe/Warsaw';
await build({
  entryPoints: [resolve(here, 'undo-history-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  alias: Object.fromEntries(
    [
      'api',
      'components',
      'constants',
      'context',
      'hooks',
      'lib',
      'styles',
      'types',
      'ui',
      'utils',
    ].map((name) => [name, resolve(root, 'src', name)]),
  ),
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
        (token) =>
          typeof token === 'object' && token.key === 'historyKey' && token.value === 'op-b',
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

const restoredRow = {
  snapshotId: 51,
  reason: 'restore:23',
  createdAt: '2026-10-24T00:02:00Z',
  changes: ['restored 23.10 23:37'],
};
same(
  'restore labels use the loaded target time in the viewer timezone',
  history.restoredLabel(restoredRow, [
    restoredRow,
    { snapshotId: 23, createdAt: '2026-10-23T23:37:00Z' },
  ]),
  'restored 24/10 01:37',
);
same(
  'restore labels convert the server UTC fallback and cross the year boundary without an id',
  [
    history.restoredLabel(restoredRow, [restoredRow]),
    history.restoredLabel(
      {
        snapshotId: 52,
        reason: 'restore:22',
        createdAt: '2027-01-01T00:02:00Z',
        changes: ['restored 31.12 23:37'],
      },
      [],
    ),
    history.restoredLabel(
      { snapshotId: 53, reason: 'restore:987654', createdAt: '2026-10-24T00:02:00Z' },
      [],
    ),
  ],
  ['restored 24/10 01:37', 'restored 01/01 00:37', 'restored'],
);

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
const autosaveSource = await readFile(
  resolve(root, 'src/components/managers/tech-card/components/useTechCardAutosave.ts'),
  'utf8',
);
const patternsSource = await readFile(
  resolve(root, 'src/components/managers/tech-card/components/patterns-field.tsx'),
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
  'save reconciliation suppresses only synchronous form writes',
  hookSource.includes('reconciling.current > 0') &&
    !hookSource
      .slice(
        hookSource.indexOf('const beginServerReconciliation = useCallback'),
        hookSource.indexOf(
          'useEffect(() => {',
          hookSource.indexOf('const beginServerReconciliation'),
        ),
      )
      .includes('closeGesture') &&
    !formSource
      .slice(
        formSource.indexOf('async function writeTechCard('),
        formSource.indexOf('async function readInChain('),
      )
      .includes('beginServerReconciliation') &&
    formSource
      .slice(
        formSource.indexOf('function settleAfterBodySave('),
        formSource.indexOf('// NF-07 guided convert'),
      )
      .includes('settleFormAfterSave') &&
    formSource
      .slice(
        formSource.indexOf('function settleAfterBodySave('),
        formSource.indexOf('// NF-07 guided convert'),
      )
      .includes('finishHistoryReconciliation();'),
  true,
);
const settleBody = formSource.slice(
  formSource.indexOf('function settleAfterBodySave('),
  formSource.indexOf('// NF-07 guided convert'),
);
same(
  'a concurrent array edit is checked against the reconciled form, not the old server snapshot',
  settleBody.includes('const typed = cloneFormValues(form.getValues())') &&
    settleBody.includes('historyArrayIdentityChanged(typed, form.getValues())') &&
    !settleBody.includes('historyArrayIdentityChanged(typed, settled.values)'),
  true,
);
const waitBody = hookSource.slice(
  hookSource.indexOf('const waitThenCut = useCallback'),
  hookSource.indexOf('const flushThenCut = useCallback'),
);
const revisionDeleteBody = patternsSource.slice(
  patternsSource.indexOf('async function deleteRevision('),
  patternsSource.indexOf("// A removed sheet's restore"),
);
same(
  'the revision CAS waits behind a non-saving hold and reads the live autosave base afterwards',
  waitBody.includes('autosave.holdWrites()') &&
    waitBody.indexOf('await autosave.whenSettled()') < waitBody.indexOf('return await action()') &&
    waitBody.indexOf('return await action()') < waitBody.indexOf('release();') &&
    !waitBody.includes('autosave.flush') &&
    autosaveSource.includes('optsRef.current.paused || writeHolds.current > 0') &&
    autosaveSource.includes('if (deps.isPaused()) {\n      skippedWhilePaused = true;') &&
    autosaveSource.includes('getBaseLockVersion: () => optsRef.current.getBaseLockVersion()') &&
    formSource.includes('getBaseLockVersion: () => base.current.version') &&
    revisionDeleteBody.includes("undoHistory.waitThenCut('pattern-revision-delete'") &&
    revisionDeleteBody.includes('expectedLockVersion: autosave.getBaseLockVersion()') &&
    !revisionDeleteBody.includes('getQueryData<common_TechCard>'),
  true,
);
same(
  'the revision delete adopts its returned lock before every held write can resume',
  revisionDeleteBody.includes('const fresh = response.techCard;') &&
    revisionDeleteBody.indexOf('autosave.adoptBase(fresh)') <
      revisionDeleteBody.indexOf('queryClient.setQueryData') &&
    revisionDeleteBody.indexOf('queryClient.setQueryData') <
      revisionDeleteBody.indexOf('return true;') &&
    autosaveSource.includes('adoptBase: (card) => optsRef.current.adoptBase(card)') &&
    formSource.includes('adoptBase: adoptExternalBase') &&
    waitBody.includes('} finally {') &&
    waitBody.includes('heldWriteReleases.current.delete(release)') &&
    hookSource.includes('const releases = [...heldWriteReleases.current]') &&
    hookSource.includes('releases.forEach((release) => release())'),
  true,
);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
