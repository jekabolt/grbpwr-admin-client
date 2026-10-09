#!/usr/bin/env node
// THE CHAIN WITHOUT ITS LOCKED BAR — onboarding wave S2 (П6). The owner: «не должно быть блока
// снизу LOCKED step 4 · fabric render … мы просто в THE CHAIN показываем следующие блоки
// неактивными». Q3: on GUIDED cards the later links are dimmed AND not doors; on every other card
// they stay doors.
//
// Real modules, bundled by esbuild for node: `stepState` / `nextUp` (core/chain.ts) and the
// `ChainRail` itself, drawn by React into a string, so «not a door» is measured in the markup
// (a `<div data-step>` instead of a `<button data-step>`), and «no bar» by the absence of the word.
//
// Negative control: in `stepState` return 'ready' instead of 'later' — the first assertion goes red.
//
//   node scripts/chain-state-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `chain-state-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from 'react-dom/server';
      import { ChainRail } from 'components/managers/tech-card/components/design/chain-rail';
      export { stepState, nextUp, railSteps } from 'components/managers/tech-card/components/design/core/chain';
      export const railMarkup = (ctx) =>
        renderToStaticMarkup(<ChainRail ctx={ctx} onStepChange={() => {}} />);
    `,
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' },
});
const M = await import(pathToFileURL(outfile).href);

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

// --- fixtures ----------------------------------------------------------------------------------
// A server that lists its playground workflows: the five-link rail (no STEP 5).
const band = (over = {}) => ({ playgroundWorkflows: [], runs: [], bench: [], ...over });
const plate = (kind, viewKey, id) => ({
  id,
  kind,
  viewKey,
  colorwayId: 0,
  picture: { id: 800 + id, media: { id: 800 + id } },
});
const ctxOf = ({ now, b = band(), pictures = 1, concept = 'a coat', categoryId = 3, guided }) => ({
  band: b,
  bandless: false,
  now,
  card: { name: 'coat', styleNumber: 'SS26-001', categoryId, baseSampleSizeId: 0, pastIdea: true },
  moodPictures: pictures,
  moodConcept: concept,
  counts: { pattern: 0, bindings: 0, render: 0, threed: 0, onmodel: 0, playground: 0 },
  colorway: { id: 0, label: '', archived: false },
  guided,
});
const states = (ctx) =>
  Object.fromEntries(M.railSteps(ctx).map((s) => [s.id, M.stepState(s.id, ctx)]));
const cells = (markup) =>
  Object.fromEntries(
    [...markup.matchAll(/<(button|div)[^>]*data-step="([a-z]+)"[^>]*data-state="([a-z]+)"/g)].map(
      (m) => [m[2], `${m[1]}:${m[3]}`],
    ),
  );

console.log('\n1 · fresh guided card on the moodboard, minimum met, no flats yet');
const fresh = ctxOf({ now: 'mood', guided: true });
const s1 = states(fresh);
is('render is later', s1.render, 'later');
is('flat is next', s1.flat, 'next');
is('nothing is blocked', Object.values(s1).includes('blocked'), false);
const r1 = cells(M.railMarkup(fresh));
is('later render is not a door (div)', r1.render, 'div:later');
is('next flat is a door (button)', r1.flat, 'button:next');
is(
  'no LOCKED bar under the rail',
  /\blocked\b/i.test(M.railMarkup(fresh).replace(/data-locked="[^"]*"/g, '')),
  false,
);

console.log('\n2 · weak minimum (no picture, no description), card details on screen');
const weak = ctxOf({ now: 'card', pictures: 0, concept: '', guided: true });
const s2 = states(weak);
is('moodboard is next', s2.mood, 'next');
is('flat is later, not blocked', s2.flat, 'later');
is('render is later', s2.render, 'later');
// Review M2: MATERIALS is optional, but on a guided card `later` outranks it — no live door that
// skips the moodboard and the flats.
is('materials is later on a guided card', s2.pattern, 'later');
is('later materials is not a door (div)', cells(M.railMarkup(weak)).pattern, 'div:later');
is(
  'the flat keeps its reason on the cell',
  /data-step="flat"[^>]*data-locked="[^"]+"/.test(M.railMarkup(weak)),
  true,
);

console.log('\n3 · legacy card (guided=false): the same states, every cell still a door');
const legacy = { ...fresh, guided: false };
is('same states as the guided card, MATERIALS aside', { ...states(legacy), pattern: 'later' }, s1);
const r3 = cells(M.railMarkup(legacy));
is('later render opens (button)', r3.render, 'button:later');
is('legacy MATERIALS keeps its optional door', r3.pattern, 'button:optional');

console.log('\n4 · flats done, render next: nothing after it on the five-link rail');
const flats = ctxOf({
  now: 'card',
  guided: true,
  b: band({ bench: [plate('flat', 'front', 1), plate('flat', 'back', 2)] }),
});
const s4 = states(flats);
is('flat done, render next', [s4.flat, s4.render], ['done', 'next']);

console.log(`\n${checks - bad}/${checks} checks green`);
process.exit(bad ? 1 : 0);
