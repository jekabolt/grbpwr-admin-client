import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { gapReport } from './automatic-gap-report.mjs';

test('keeps repeated labels separate and distinguishes matching endpoints from nearby leak sites', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'automatic-gap-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'sample');
  mkdirSync(dir);
  const write = (name, object) => writeFileSync(join(dir, name), JSON.stringify(object));
  write('run.json', { id: 'sample', verdict: 'stopped' });
  const ends = [
    { x: 0, y: 3 },
    { x: 0, y: 7 },
  ];
  const cell = (size, x) => ({
    size,
    outcome: 'leak',
    leakAt: [x, 0],
    gap: {
      found: true,
      facing: true,
      mm: 4,
      predMm: 1,
      bracketed: true,
      ends,
      chains: [5, 7],
      candidateWalls: 0,
      legacyWallPair: false,
    },
  });
  const a = cell('0', 0);
  const b = cell('2', 0.4);
  b.gap.ends = ends.toReversed();
  b.gap.chains = [7, 5];
  b.gapChoices = 2;
  const c = cell('4', 0.8);
  c.gap.ends = [
    { x: 0, y: 12 },
    { x: 0, y: 16 },
  ];
  const older = { size: '6', outcome: 'leak', gap: { found: false } };
  const closed = { size: '8', outcome: 'closed', gapRecovery: { chains: [5, 7] } };
  write('cells.json', [
    { seed: 1, label: 'front', cells: [a, b, c, older, closed] },
    { seed: 2, label: 'front', cells: [a] },
  ]);
  const r = gapReport([root]);
  assert.equal(r.total.leaks, 5);
  assert.equal(r.total.shortlisted, 4);
  assert.equal(r.total.measuredLegacyWallLists, 4);
  assert.equal(r.total.repeatedSites, 1);
  assert.equal(r.total.repeatedSiteCells, 2);
  assert.equal(r.total.automaticClosures, 1);
  assert.equal(r.total.cellsWithContourChoices, 1);
  assert.deepEqual(r.families[0].strokePairs, [['0', '2']]);
  assert.deepEqual(r.families[0].sites, [['0', '2']]);
  assert.throws(() => gapReport([root, root]), /Repeated PDF/);
});
