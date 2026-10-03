#!/usr/bin/env node
// FLAT INPUT: ВИДЫ ИЛИ ДЕТАЛИ, НЕ ВМЕСТЕ (T07, волна moodboard-flats 03.10).
//
// Владелец: «при генерации детали вьюс должны анпикаться и что бы мы делали только скетч детали».
// Сервер смешанный прогон (`detail` + front/back/side) отклоняет, поэтому ряд не должен его собрать:
// галка детали снимает все виды, галка вида — все детали.
//
// Проверяется НАСТОЯЩИЙ модуль `design/flat-input.ts` (бандл esbuild), плюс провод: чипы ряда
// `flat-run-row.tsx` ходят именно в эти функции, а не в старый `setViews(prev => …)`.
//   node scripts/flat-ticks-probe.mjs           прогон
//   node scripts/flat-ticks-probe.mjs --mutate  в бандле `tickDetail` перестаёт снимать виды
//                                               (поведение до T07) — проба обязана покраснеть.

import { build as esbuild } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE = process.argv.includes('--mutate');
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DESIGN = resolve(REPO, 'src/components/managers/tech-card/components/design');

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const FIX_LINE = '  return { views: on ? {} : views, detailTicks: { ...details, [id]: on } };';
const plugins = MUTATE
  ? [
      {
        name: 'pre-t07-detail-tick',
        setup(b) {
          b.onLoad({ filter: /design\/flat-input\.ts$/ }, async (args) => {
            const src = await readFile(args.path, 'utf8');
            if (!src.includes(FIX_LINE)) throw new Error('mutation did not find its line');
            return {
              contents: src.replace(
                FIX_LINE,
                '  return { views, detailTicks: { ...details, [id]: on } };',
              ),
              loader: 'ts',
            };
          });
        },
      },
    ]
  : [];

const outfile = resolve(REPO, `scripts/.flat-ticks-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(DESIGN, 'flat-input.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
  external: ['react'],
});
const M = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

const on = (r) =>
  Object.entries(r)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(',');

console.log('\nдеталь снимает виды');
{
  const r = M.tickDetail({ front: true, back: true }, {}, 7);
  ck(on(r.views) === '', 'front+back → tick detail 7: no view left', `views=${on(r.views)}`);
  ck(on(r.detailTicks) === '7', 'detail 7 is ticked', `details=${on(r.detailTicks)}`);
  const r2 = M.tickDetail(r.views, r.detailTicks, 9);
  ck(on(r2.detailTicks) === '7,9', 'second detail joins the first (details-only run)');
  const r3 = M.tickDetail(r2.views, r2.detailTicks, 7);
  ck(on(r3.detailTicks) === '9' && on(r3.views) === '', 'un-ticking a detail touches nothing else');
}

console.log('\nвид снимает детали');
{
  const r = M.tickView({}, { 7: true, 9: true }, 'front');
  ck(on(r.views) === 'front', 'tick front', `views=${on(r.views)}`);
  ck(on(r.detailTicks) === '', 'all details dropped', `details=${on(r.detailTicks)}`);
  const r2 = M.tickView({ front: true, back: true }, {}, 'back');
  ck(on(r2.views) === 'front', 'un-ticking a view keeps the other views');
}

console.log('\nподнятый смешанный выбор');
{
  const r = M.exclusiveTicks({ front: true }, { 7: true });
  ck(on(r.views) === 'front' && on(r.detailTicks) === '', 'mixed restored ask → views win');
  const r2 = M.exclusiveTicks({ front: false }, { 7: true });
  ck(on(r2.detailTicks) === '7', 'details-only restored ask stays as is');
}

console.log('\nпровод: чипы ряда ходят в эти функции');
{
  const row = readFileSync(resolve(DESIGN, 'flat-run-row.tsx'), 'utf8');
  ck(row.includes('applyTicks(tickView(views, detailTicks, view))'), 'view chip → tickView');
  ck(row.includes('applyTicks(tickDetail(views, detailTicks, id))'), 'detail chip → tickDetail');
  ck(row.includes('flatDraftOf(techCardId)'), 'row seeds its draft from flatDraftOf');
}
{
  // The restored ask goes through exclusiveTicks — asked of the real `flatDraftOf` (W1 moved the
  // seeding there from the row).
  M.patchFlatInput(77, {
    ask: { views: { front: true }, detailTicks: { 5: true }, layout: 'per_view' },
  });
  const d = M.flatDraftOf(77);
  ck(
    !!d.views.front && Object.keys(d.detailTicks).length === 0 && d.layout === 'per_view',
    'restored mixed ask: views win, details dropped (exclusiveTicks)',
    JSON.stringify(d),
  );
  M.patchFlatInput(77, { ask: null });
}

console.log(`\n${total - bad} / ${total}, failures ${bad}${MUTATE ? '  (--mutate)' : ''}`);
process.exit(bad ? 1 : 0);
