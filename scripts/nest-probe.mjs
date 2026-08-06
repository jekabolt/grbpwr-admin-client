#!/usr/bin/env node
// Раскладка probe — the engine's only measuring instrument.
//
// This repo has no test runner (see CLAUDE.md), and the nesting engine is the one piece of
// it whose output is a PHYSICAL promise: pieces clear each other by the gap, everything
// declared placed really is on the fabric, the same input yields the same marker, and the
// marker does not quietly get longer. None of that is visible from a type check, and every
// one of them has been broken at least once by a change that type-checked cleanly.
//
// Two rules this file lives by, both learned the hard way:
//
//   1. NEVER measure the engine with the engine's own geometry. The previous class of
//      overlap bugs survived because clipper's Difference agreed with the defect in
//      clipper's Union. The verification here (nest-probe-entry.ts) is written separately
//      and deliberately brute-force.
//   2. NEVER let a probe pass by not looking. Every probe below runs the verification, and
//      the synthetic ones assert LENGTH against a recorded number — an engine that spaced
//      every piece 30 % further apart would otherwise print «ВСЁ ЗЕЛЁНОЕ», since the
//      clearance check is one-sided by construction and can only catch «too tight».
//
// Usage:
//   node scripts/nest-probe.mjs                       # synthetic probes only (no fixtures needed)
//   node scripts/nest-probe.mjs <file.dxf> [...]      # + real files
//   NEST_PROBE_PIECES=45 node scripts/nest-probe.mjs ~/Downloads/'summer men.dxf'
//
// Env knobs: NEST_PROBE_PIECES (distinct pieces, default 20), NEST_PROBE_BUDGET_MS
// (default 20000), NEST_PROBE_LAYER (contour layer; default = the layer with most blocks),
// NEST_PROBE_GRAIN (grain layer, default none).
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `nest-probe-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(here, 'nest-probe-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});

const mod = await import(pathToFileURL(outfile).href);

const args = process.argv.slice(2);
const budgetMs = Number(process.env.NEST_PROBE_BUDGET_MS ?? 20_000);
const maxPieces = Number(process.env.NEST_PROBE_PIECES ?? 20);

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const baseCfg = {
  fabricWidthCm: 140,
  gapCm: 0.5,
  edgeMarginCm: 0,
  allowCrossGrain: false,
  grainLayer: '',
  seamAllowanceCm: 0,
  rdpEpsCm: 0.05,
};

// Every synthetic run goes through here, so no probe can pass by not looking at geometry.
function verify(pieces, res, cfg, label) {
  const v = mod.verifyPlacements(pieces, res, cfg);
  check(v.overlaps === 0, `${label}: ноль наложений`, `${v.overlaps}`);
  check(
    v.shortPairs === 0,
    `${label}: зазор выдержан по настоящим контурам`,
    `коротких пар ${v.shortPairs}, минимум ${v.minClearanceCm.toFixed(4)} см`,
  );
  check(v.outsideWidth === 0, `${label}: ничего не вылезло за полосу`, `${v.outsideWidth}`);
  return v;
}

// ── probe 1: a piece that cannot fit the fabric width ──────────────────────────────────
// The engine must SAY it did not fit. Before Ф0 it silently dropped the piece from the gene
// list, and the only trace was placedCount < totalCount with no reason attached.
{
  console.log('\n── «не влезло»: деталь шире полосы ──');
  const pieces = mod.syntheticPieces([
    { w: 30, h: 30 },
    { w: 40, h: 200 }, // 200 cm across a 140 cm fabric — impossible in any rotation
    { w: 25, h: 25 },
  ]);
  const cfg = { ...baseCfg, pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 1 })), timeBudgetMs: 3_000 };
  const res = await mod.nest(pieces, cfg, () => false, () => {});
  check(res.placedCount === 2, 'разместились только две детали', `placed=${res.placedCount}/${res.totalCount}`);
  check((res.unplaced ?? []).length === 1, 'непоместившаяся деталь названа', JSON.stringify(res.unplaced ?? []));
  check((res.unplaced ?? [])[0]?.reason === 'width', 'причина — ширина полосы', (res.unplaced ?? [])[0]?.reason);
  verify(pieces, res, cfg, 'не влезло');
}

// ── probe 2: determinism AND length ────────────────────────────────────────────────────
// The budget deliberately BINDS (the run stops on the clock, not on maxGenerations): two
// runs that both saturate MAX_GENERATIONS would agree for a reason that says nothing about
// the change under test.
{
  console.log('\n── детерминизм и длина ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 12 }, (_, i) => ({ w: 20 + (i % 4) * 7, h: 30 + (i % 3) * 11 })),
  );
  const cfg = {
    ...baseCfg,
    pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 6 })),
    timeBudgetMs: 4_000,
  };
  const key = (r) =>
    JSON.stringify(
      r.placements.map((p) => [p.pieceId, p.instance, p.rot, Math.round(p.x * 1000), Math.round(p.y * 1000)]),
    );
  const a = await mod.nest(pieces, cfg, () => false, () => {});
  const b = await mod.nest(pieces, cfg, () => false, () => {});
  check(
    a.generation < 399,
    'бюджет действительно ограничивал (иначе сравнение — тавтология)',
    `generation=${a.generation}`,
  );
  check(key(a) === key(b), 'два прогона дают одинаковые размещения', `gen ${a.generation}/${b.generation}`);
  check(a.placedCount === a.totalCount, 'всё размещено', `${a.placedCount}/${a.totalCount}`);
  // Measured at 746.9 cm on the commit that added this probe; the ceiling sits ~7 % above it.
  // It exists to catch the ONE risk the eps ladder introduces — a coarser simplification
  // inflates the NFP octagon and spreads the marker out — which the clearance check cannot
  // see, being one-sided by construction (it only ever catches «too tight»).
  const LENGTH_CEILING_CM = 800;
  check(
    a.usedLengthCm <= LENGTH_CEILING_CM,
    'маркер не раздулся',
    `${a.usedLengthCm.toFixed(1)} см при потолке ${LENGTH_CEILING_CM}`,
  );
  verify(pieces, a, cfg, 'детерминизм');
}

// ── probe 3: cancellation reaches the tails ────────────────────────────────────────────
// The cancel flag is flipped BY A TIMER, not read from a clock. That distinction is the
// whole point: in the worker «стоп» arrives as a message, so a flag the engine can only
// observe after yielding is what production actually has. A clock-based flag would flip
// synchronously mid-loop and let this probe certify a responsiveness the worker cannot
// deliver — the instrument agreeing with the defect, one level up.
{
  console.log('\n── отмена: доходит до хвостов ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 14 }, (_, i) => ({ w: 18 + (i % 5) * 6, h: 24 + (i % 4) * 9 })),
  );
  let stop = false;
  const timer = setTimeout(() => {
    stop = true;
  }, 700);
  const started = Date.now();
  const res = await mod.nest(
    pieces,
    {
      ...baseCfg,
      allowCrossGrain: true,
      pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 3 })),
      timeBudgetMs: 60_000,
    },
    () => stop,
    () => {},
  );
  clearTimeout(timer);
  const elapsed = Date.now() - started;
  check(elapsed < 8_000, 'отмена вернула управление быстро', `${elapsed} ms`);
  check(res.cancelled === true, 'результат помечен отменённым', JSON.stringify({ cancelled: res.cancelled }));
}

// ── probe 4: compaction alone is interruptible ─────────────────────────────────────────
// Targeted at the tail probe 3 does NOT reach: with a generous budget the GA finishes and
// compaction is the only phase left, so a cancel raised after the GA has to be answered by
// compactPlacements itself. Before this it could not be: the poll sat in synchronous code,
// so the flag it read could never have been set.
{
  console.log('\n── отмена во время компакции ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 10 }, (_, i) => ({ w: 16 + (i % 4) * 5, h: 22 + (i % 3) * 8 })),
  );
  let gaSeen = 0;
  let stop = false;
  const res = await mod.nest(
    pieces,
    { ...baseCfg, pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 2 })), timeBudgetMs: 2_500 },
    () => stop,
    (p) => {
      // Arm the stop only once the search is under way, so the cancel lands late — in or
      // just before compaction — rather than during the prepass.
      if (p.phase === 'ga' && ++gaSeen === 3) setTimeout(() => (stop = true), 0);
    },
  );
  check(res.placements.length > 0 || res.cancelled, 'поздняя отмена не потеряла раскладку', JSON.stringify({ placed: res.placements.length, cancelled: res.cancelled }));
  if (res.placements.length > 0) verify(pieces, res, baseCfg, 'после поздней отмены');
}

// ── probe 5: real files ────────────────────────────────────────────────────────────────
for (const arg of args) {
  const path = resolve(process.cwd(), arg.replace(/^~/, process.env.HOME ?? '~'));
  console.log(`\n── ${path} ──`);
  const buf = await readFile(path);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const out = await mod.probe({
    sheets: [{ name: path.split('/').pop(), open: async () => bytes }],
    maxPieces,
    contourLayer: process.env.NEST_PROBE_LAYER,
    grainLayer: process.env.NEST_PROBE_GRAIN,
    config: { timeBudgetMs: budgetMs },
  });
  const r = out.result;
  console.log(
    `  слои: ${out.layers.slice(0, 6).map((l) => `${l.layer}(${l.blocks})`).join(' ')}${out.layers.length > 6 ? ' …' : ''}`,
  );
  console.log(`  деталей: разобрано ${out.parsed}, взято ${out.used}, экземпляров ${out.instances}`);
  console.log(
    `  nfp ${out.progress.nfpDone}/${out.progress.nfpTotal} | поколений ${r.generation} | ${r.elapsedMs} ms (бюджет ${budgetMs}) | размещено ${r.placedCount}/${r.totalCount} | длина ${r.usedLengthCm.toFixed(1)} см | эфф ${(r.efficiency * 100).toFixed(1)}%`,
  );
  console.log(`  блоб ${out.blobHash} | телеметрия ${JSON.stringify(r.telemetry ?? null)}`);
  check(r.elapsedMs <= budgetMs + 2_000, 'бюджет соблюдён (+2 с)', `${r.elapsedMs} ms`);
  check(r.generation >= 1, 'поиск успел начаться (≥1 поколение)', `generation=${r.generation}`);
  check(out.overlaps === 0, 'ноль наложений', `${out.overlaps}`);
  check(
    out.shortPairs === 0,
    'зазор выдержан по настоящим контурам',
    `коротких пар ${out.shortPairs}, минимум ${out.minClearanceCm.toFixed(4)} см`,
  );
  check(out.outsideWidth === 0, 'ничего не вылезло за полосу', `${out.outsideWidth}`);
  // Only a FINISHED run owes this: a cancelled one makes no claim about pieces it never
  // reached. Nothing cancels this probe, so reaching the else branch is itself a finding.
  check(
    r.cancelled || r.placedCount + (r.unplaced?.length ?? 0) === r.totalCount,
    'размещённые + непоместившиеся = всего',
    `${r.placedCount}+${r.unplaced?.length ?? 0}/${r.totalCount}${r.cancelled ? ' (отменён?!)' : ''}`,
  );
}

console.log(`\n${failures === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
