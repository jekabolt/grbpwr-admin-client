#!/usr/bin/env node
// THE GUIDED FACE OF THE MOODBOARD STEP — onboarding wave S5. The owner: «когда мы в первый раз
// заходим на экран мудборд у нас не должно быть блоков … нас встречает просто мудборд», then ASK ME
// after one picture, `ask more / next` after the answers, DESCRIPTION, its `next`, then every block.
//
// Real module, bundled by esbuild for node: `moodStage` / `moodBuilt` / `guideShow` / `latchOf`
// (design/core/mood-stage.ts) — the one derivation the composer, the board, the quiz and the draft
// all read.
//
// Negative control: in `moodStage` swap the `concept` and `answered` lines (answers win over a
// description) — case 4 goes red.
//
//   node scripts/mood-stage-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `mood-stage-${process.pid}.mjs`);
await build({
  entryPoints: [
    resolve(root, 'src/components/managers/tech-card/components/design/core/mood-stage.ts'),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
});
const M = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let checks = 0;
let bad = 0;
const is = (name, got, want) => {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`,
  );
};

const none = { pictures: 0, concept: '', answered: 0, built: false };
console.log('\nmoodStage — the six faces of the owner’s sequence');
is('1 · a fresh guided card: the board alone', M.moodStage(none), 'empty');
is(
  '2 · one picture on the board: ASK ME is live',
  M.moodStage({ ...none, pictures: 1 }),
  'unasked',
);
is(
  '3 · answers, no description: the batch-end pair',
  M.moodStage({ ...none, pictures: 2, answered: 3 }),
  'asked',
);
is(
  '4 · the description written: DESCRIPTION with `next ✦` (answers do not hold it back)',
  M.moodStage({ ...none, pictures: 2, answered: 3, concept: 'a boxy wool coat' }),
  'described',
);
is(
  '5 · the draft wrote the blocks: the whole step',
  M.moodStage({ pictures: 2, answered: 3, concept: 'a boxy wool coat', built: true }),
  'full',
);
is(
  '6 · whitespace is not a description; built wins over an empty board',
  [M.moodStage({ ...none, pictures: 1, concept: '  \n ' }), M.moodStage({ ...none, built: true })],
  ['unasked', 'full'],
);

console.log('\nmoodBuilt — what counts as «the blocks hold something»');
is('nothing anywhere', M.moodBuilt({ details: 0, bomItems: 0, colourways: 0, fills: 0 }), false);
is(
  'any one of aspects / slots / colourways / journal',
  [
    M.moodBuilt({ details: 1, bomItems: 0, colourways: 0, fills: 0 }),
    M.moodBuilt({ details: 0, bomItems: 1, colourways: 0, fills: 0 }),
    M.moodBuilt({ details: 0, bomItems: 0, colourways: 1, fills: 0 }),
    M.moodBuilt({ details: 0, bomItems: 0, colourways: 0, fills: 1 }),
  ],
  [true, true, true, true],
);

console.log('\nguideShow — what each face draws, and the latch that never steps back');
const S = (stage, latch) => {
  const s = M.guideShow(stage, latch);
  return [s.callouts, s.description, s.blocks].map((b) => (b ? 1 : 0)).join('');
};
is(
  'empty → unasked → asked → described → full',
  ['empty', 'unasked', 'asked', 'described', 'full'].map((x) => S(x)),
  ['000', '100', '100', '110', '111'],
);
is(
  'a description emptied for a retype keeps its block (latch `description`)',
  S('asked', M.latchOf('described')),
  '110',
);
is('a door to `bomItems.*` opened the blocks (latch `blocks`)', S('empty', 'blocks'), '111');

console.log(`\n${checks - bad} / ${checks}, failures ${bad}`);
process.exit(bad ? 1 : 0);
