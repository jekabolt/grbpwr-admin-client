#!/usr/bin/env node
// Раскладка probe — the engine's only measuring instrument.
//
// This repo has no test runner (see CLAUDE.md), and the nesting engine is the one piece of
// it whose output is a PHYSICAL promise: pieces clear each other by the gap, everything
// declared placed really is on the fabric, the same input yields the same marker. None of
// that is visible from a type check, and every one of them has been broken at least once
// by a change that type-checked cleanly.
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

// ── probe 1: a piece that cannot fit the fabric width ──────────────────────────────────
// The engine must SAY it did not fit. Before Ф0 it silently dropped the piece from the
// gene list, and the only trace was placedCount < totalCount with no reason attached.
{
  console.log('\n── «не влезло»: деталь шире полосы ──');
  const pieces = mod.syntheticPieces([
    { w: 30, h: 30 },
    { w: 40, h: 200 }, // 200 cm across a 140 cm fabric — impossible in any rotation
    { w: 25, h: 25 },
  ]);
  const res = await mod.nest(
    pieces,
    {
      pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 1 })),
      fabricWidthCm: 140,
      gapCm: 0.5,
      edgeMarginCm: 0,
      allowCrossGrain: false,
      grainLayer: '',
      seamAllowanceCm: 0,
      timeBudgetMs: 3_000,
      rdpEpsCm: 0.05,
    },
    () => false,
    () => {},
  );
  check(res.placedCount === 2, 'разместились только две детали', `placed=${res.placedCount}/${res.totalCount}`);
  check((res.unplaced ?? []).length === 1, 'непоместившаяся деталь названа', JSON.stringify(res.unplaced ?? []));
  check(
    (res.unplaced ?? [])[0]?.reason === 'width',
    'причина — ширина полосы',
    (res.unplaced ?? [])[0]?.reason,
  );
}

// ── probe 2: determinism ───────────────────────────────────────────────────────────────
{
  console.log('\n── детерминизм: одинаковый вход ⇒ одинаковый блоб ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 8 }, (_, i) => ({ w: 20 + (i % 4) * 7, h: 30 + (i % 3) * 11 })),
  );
  const cfg = {
    pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 2 })),
    fabricWidthCm: 140,
    gapCm: 0.5,
    edgeMarginCm: 0,
    allowCrossGrain: false,
    grainLayer: '',
    seamAllowanceCm: 0,
    timeBudgetMs: 6_000,
    rdpEpsCm: 0.05,
  };
  const key = (r) =>
    JSON.stringify(
      r.placements.map((p) => [p.pieceId, p.instance, p.rot, Math.round(p.x * 1000), Math.round(p.y * 1000)]),
    );
  const a = await mod.nest(pieces, cfg, () => false, () => {});
  const b = await mod.nest(pieces, cfg, () => false, () => {});
  check(key(a) === key(b), 'два прогона дают одинаковые размещения', `gen ${a.generation}/${b.generation}`);
  check(a.placedCount === a.totalCount, 'всё размещено', `${a.placedCount}/${a.totalCount}`);
}

// ── probe 3: cancellation lands ────────────────────────────────────────────────────────
// Cancel is asserted from the very first poll: the run must come back promptly instead of
// finishing the compaction tail, and it must not claim a marker it never verified.
{
  console.log('\n── отмена: возврат без хвостов ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 14 }, (_, i) => ({ w: 18 + (i % 5) * 6, h: 24 + (i % 4) * 9 })),
  );
  const started = Date.now();
  const res = await mod.nest(
    pieces,
    {
      pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 3 })),
      fabricWidthCm: 140,
      gapCm: 0.5,
      edgeMarginCm: 0,
      allowCrossGrain: true,
      grainLayer: '',
      seamAllowanceCm: 0,
      timeBudgetMs: 60_000,
      rdpEpsCm: 0.05,
    },
    () => Date.now() - started > 800,
    () => {},
  );
  const elapsed = Date.now() - started;
  check(elapsed < 8_000, 'отмена вернула управление быстро', `${elapsed} ms`);
  check(res.cancelled === true, 'результат помечен отменённым', JSON.stringify({ cancelled: res.cancelled }));
}

// ── probe 4: real files ────────────────────────────────────────────────────────────────
for (const arg of args) {
  const path = resolve(process.cwd(), arg.replace(/^~/, process.env.HOME ?? '~'));
  console.log(`\n── ${path} ──`);
  const buf = await readFile(path);
  const out = await mod.probe({
    sheets: [{ name: path.split('/').pop(), buf: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }],
    maxPieces,
    contourLayer: process.env.NEST_PROBE_LAYER,
    grainLayer: process.env.NEST_PROBE_GRAIN,
    config: { timeBudgetMs: budgetMs },
  });
  const r = out.result;
  console.log(
    `  слои: ${out.layers.slice(0, 6).map((l) => `${l.layer}(${l.blocks})`).join(' ')}${out.layers.length > 6 ? ' …' : ''}`,
  );
  console.log(
    `  деталей: разобрано ${out.parsed}, взято ${out.used}, экземпляров ${out.instances}`,
  );
  console.log(
    `  nfp ${out.progress.nfpDone}/${out.progress.nfpTotal} | поколений ${r.generation} | ${r.elapsedMs} ms (бюджет ${budgetMs}) | размещено ${r.placedCount}/${r.totalCount} | длина ${r.usedLengthCm.toFixed(1)} см | эфф ${(r.efficiency * 100).toFixed(1)}%`,
  );
  console.log(`  блоб ${out.blobHash} | телеметрия ${JSON.stringify(r.telemetry ?? null)}`);
  check(r.elapsedMs <= budgetMs + 2_000, 'бюджет соблюдён (+2 с)', `${r.elapsedMs} ms`);
  check(r.generation >= 1, 'поиск успел начаться (≥1 поколение)', `generation=${r.generation}`);
  check(out.overlaps === 0, 'ноль наложений', `${out.overlaps}`);
  check(out.shortPairs === 0, 'зазор выдержан по настоящим контурам', `коротких пар ${out.shortPairs}, минимум ${out.minClearanceCm.toFixed(4)} см`);
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
