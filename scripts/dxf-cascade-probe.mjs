#!/usr/bin/env node
// Проба каскада удаления листа (L6a, src/lib/dxf-reconcile/cascade.ts) на карточке card 69:
// лист MAIN (allsizes-merged.dxf) + лист LINING (две свои детали, одна деталь MAIN делит блок с
// LINING), швы, дефекты, строка рецепта. Гейты: удаление листа целиком, общая деталь остаётся,
// транзитивный снос ниже по течению, перенумерация дефектов, два листа в одном scope, сторож сборки.
//
//   node scripts/dxf-cascade-probe.mjs

import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const workspace = resolve(root, '..');
const BASE = 'tmp/plans/pdf-to-dxf/corpus/dxf-clo/allsizes-merged.dxf';
const SIZES = ['xs', 's', 'm', 'l', 'xl'];
const MAIN = { bomLineKey: 'bom-main', fabricPurpose: 'MAIN' };
const LINING = { bomLineKey: 'bom-lining', fabricPurpose: 'LINING' };

async function bundle() {
  const outfile = resolve(tmpdir(), `dxf-cascade-probe-${process.pid}.mjs`);
  await build({
    entryPoints: [resolve(here, 'dxf-cascade-probe-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    absWorkingDir: root,
  });
  return import(pathToFileURL(outfile).href);
}

let failed = 0;
let total = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function is(tag, got, want, what) {
  total++;
  if (eq(got, want)) return;
  failed++;
  console.log(
    `  ✗ ${tag}: ${what}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`,
  );
}
function yes(tag, ok, what) {
  total++;
  if (ok) return;
  failed++;
  console.log(`  ✗ ${tag}: ${what}`);
}

// ─── карточка ────────────────────────────────────────────────────────────────────────────────

function card69(M, base) {
  const K = M.pieceKey;
  // SL_L — общая: её блок есть и на листе LINING (алиас другого scope).
  const c = M.cardFromSheet(base, {
    scope: MAIN,
    sizeTokens: SIZES,
    extra: ['LIN_A', 'LIN_B'],
    otherScope: [{ identity: 'SL_L', scope: LINING }],
  });
  // LIN_A / LIN_B — детали листа LINING: их алиасы MAIN, которые завёл cardFromSheet, — в LINING.
  for (const a of c.aliases)
    if (a.pieceLineKey === K('LIN_A') || a.pieceLineKey === K('LIN_B')) Object.assign(a, LINING);
  const step = (title, inputKeys, unit = '', media) => ({
    title,
    inputKeys,
    outputUnitKey: unit,
    outputUnitName: unit,
    review: '',
    ...(media ? { media } : {}),
  });
  c.operations = [
    step('yoke', [K('BP_1'), K('BP_2')], 'YOKE'), // 0 · 10
    step('front', [K('FP_L'), K('FP_R')], 'FRONT'), // 1 · 20
    step('edge collar', [K('CLR_3')], '', [{ annotations: [{ pieceLineKeys: [K('LIN_B')] }] }]), // 2 · 30 — аннотация на LIN_B
    step('collar', [K('CLR_3'), K('CLR_4')], 'COLLAR'), // 3 · 40
    step('back', [K('BP'), 'YOKE'], 'BACK'), // 4 · 50
    step('shoulders', ['BACK', 'FRONT'], 'BODY'), // 5 · 60
    step('sleeve L', ['BODY', K('SL_L')], 'BODY_L'), // 6 · 70
    step('sleeve R', ['BODY_L', K('SL_R')], 'BODY_LR'), // 7 · 80
    step('attach collar', ['BODY_LR', 'COLLAR'], 'SHIRT'), // 8 · 90
    step('lining', [K('LIN_A'), K('LIN_B')], 'LINING_U'), // 9 · 100
    step('attach lining', ['SHIRT', 'LINING_U'], 'DONE'), // 10 · 110
  ];
  c.issues = [
    { id: 'i10', operationNumber: 10 },
    { id: 'i30', operationNumber: 30 },
    { id: 'i50', operationNumber: 50 },
    { id: 'i100', operationNumber: 100 },
    { id: 'i110', operationNumber: 110 },
    { id: 'i15', operationNumber: 15 }, // уже висит — не трогается
    { id: 'i0', operationNumber: 0 }, // карточка целиком
    { id: 'i500', operationNumber: 500 }, // вне ряда — не трогается
  ];
  c.seams = [
    {
      seamKey: 's-front',
      sideA: { parts: [{ pieceLineKey: K('FP_L') }] },
      sideB: { parts: [{ pieceLineKey: K('FP_R') }] },
    },
    { seamKey: 's-lining', sideA: [{ piece: K('LIN_A') }], sideB: [{ piece: K('LIN_B') }] },
    {
      seamKey: 's-sleeve',
      sideA: { parts: [{ pieceLineKey: K('SL_L') }] },
      sideB: { parts: [{ pieceLineKey: K('BP') }] },
    },
  ];
  c.refs = [
    { kind: 'colourway', pieceLineKey: K('LIN_A') },
    { kind: 'colourway', pieceLineKey: K('LIN_A').toUpperCase() },
    { kind: 'area', pieceLineKey: K('BP') },
    { kind: 'colourway', pieceLineKey: K('SL_L') },
  ];
  return c;
}

const titles = (ops) => ops.map((o) => o.title);
const inputOf = (c, sheets) => ({
  pieces: c.pieces,
  aliases: c.aliases,
  operations: c.operations,
  issues: c.issues,
  seams: c.seams,
  refs: c.refs,
  sheets,
  sizeTokens: SIZES,
});

/** Ничего не висит: ни ключа ушедшей детали в шаге/шве/алиасе, ни узла ушедшего шага на входе. */
function dangling(M, card, res) {
  const out = [];
  const gone = new Set(res.removedPieceKeys);
  const deadUnits = new Set(
    res.removedStepIndexes.map((i) => card.operations[i].outputUnitKey).filter(Boolean),
  );
  for (const o of res.operations) {
    for (const k of o.inputKeys ?? [])
      if (gone.has(k) || deadUnits.has(k)) out.push(`${o.title}:${k}`);
    for (const m of o.media ?? [])
      for (const a of m.annotations ?? [])
        for (const k of [a.pieceLineKey, ...(a.pieceLineKeys ?? [])])
          if (gone.has(k)) out.push(`${o.title}:@${k}`);
  }
  for (const a of res.aliases) if (gone.has(a.pieceLineKey)) out.push(`alias:${a.blockName}`);
  for (const s of res.seams)
    for (const side of [s.sideA, s.sideB]) {
      const ks = Array.isArray(side)
        ? side.map((x) => x.piece)
        : (side?.parts ?? []).map((x) => x.pieceLineKey);
      for (const k of ks) if (gone.has(k)) out.push(`seam:${s.seamKey}`);
    }
  out.push(
    ...M.sweepOf({ pieces: res.pieces, operations: res.operations }).map(
      (v) => `sweep:${v.message}`,
    ),
  );
  return out;
}

async function main() {
  const M = await bundle();
  const K = M.pieceKey;
  const abs = resolve(workspace, BASE);
  if (!existsSync(abs)) throw new Error(`нет листа: ${BASE}`);
  const bytes = new Uint8Array(readFileSync(abs));
  const base = await M.parseSheets(
    [{ name: 'allsizes-merged.dxf', open: async () => bytes.slice().buffer }],
    { ...M.RECONCILE_PARSE },
  );
  const card = card69(M, { pieces: base.pieces, blockNames: base.blockNames });
  is('fixture', M.sweepOf(card), [], 'card 69 + LINING собирается без нарушений');
  const frozen = JSON.stringify(card);

  const mainPieces = card.pieces
    .filter((p) =>
      card.aliases.some((a) => a.pieceLineKey === p.lineKey && a.fabricPurpose === 'MAIN'),
    )
    .map((p) => p.lineKey);
  const sheets = [
    { key: 'sheet-main', scope: MAIN, blockNames: null },
    { key: 'sheet-lining', scope: LINING, blockNames: ['LIN_A', 'LIN_B', 'SL_L'] },
  ];

  // ── 1. удалить MAIN: все его шаги уходят, ничего не висит, общая SL_L остаётся ───────────────
  {
    const tag = 'delete-main';
    const r = M.removeSheetCascade(inputOf(card, sheets), 'sheet-main');
    is(tag, r.found, true, 'лист найден');
    is(tag, titles(r.operations), ['lining'], 'остался только шаг LINING');
    is(
      tag,
      r.removedStepIndexes,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 10],
      'ушедшие шаги (attach lining — транзитивно)',
    );
    is(
      tag,
      r.removedPieceKeys,
      mainPieces.filter((k) => k !== K('SL_L')),
      'ушли детали только с MAIN',
    );
    yes(
      tag,
      r.pieces.some((p) => p.lineKey === K('SL_L')),
      'SL_L (есть на LINING) осталась',
    );
    is(
      tag,
      r.aliases.map((a) => `${a.fabricPurpose}:${a.blockName}`).sort(),
      ['LINING:LIN_A', 'LINING:LIN_B', 'LINING:SL_L'],
      'остались только алиасы LINING (алиас SL_L в MAIN ушёл)',
    );
    is(tag, r.counts, { pieces: mainPieces.length - 1, steps: 10 }, 'счётчики');
    is(tag, dangling(M, card, r), [], 'ничего не висит, assemblySweep чист');
    is(tag, r.violations, [], 'нет новых нарушений');
    is(tag, r.removedSeamIds, ['s-front', 's-sleeve'], 'швы на деталях MAIN ушли');
    is(
      tag,
      r.blockedBy,
      [{ kind: 'area', pieceLineKey: K('BP'), count: 1 }],
      'blockedBy: площадь BP',
    );
    is(
      tag,
      r.issues.map((i) => `${i.id}=${i.operationNumber}`),
      ['i100=10', 'i15=15', 'i0=0', 'i500=500'],
      'дефекты: 100 → 10, ушедших шагов — нет, висящие не тронуты',
    );
  }

  // ── 2. удалить LINING: общая SL_L остаётся, шаг по аннотации и attach lining уходят ──────────
  {
    const tag = 'delete-lining';
    const r = M.removeSheetCascade(inputOf(card, sheets), 'sheet-lining');
    is(tag, r.removedPieceKeys, [K('LIN_A'), K('LIN_B')], 'ушли LIN_A, LIN_B; SL_L — нет');
    is(
      tag,
      r.removedStepIndexes,
      [2, 9, 10],
      'аннотация (30), lining (100), attach lining (110, по узлу)',
    );
    is(
      tag,
      titles(r.operations),
      ['yoke', 'front', 'collar', 'back', 'shoulders', 'sleeve L', 'sleeve R', 'attach collar'],
      'шаги MAIN на месте',
    );
    is(
      tag,
      r.aliases.filter((a) => a.pieceLineKey === K('SL_L')).map((a) => a.fabricPurpose),
      ['MAIN'],
      'у SL_L ушёл только алиас LINING',
    );
    is(tag, r.opIndexOf, [0, 1, null, 2, 3, 4, 5, 6, 7, null, null], 'opIndexOf');
    is(
      tag,
      r.issues.map((i) => `${i.id}=${i.operationNumber}`),
      ['i10=10', 'i50=40', 'i15=15', 'i0=0', 'i500=500'],
      'дефекты: 50 → 40; 30/100/110 ушли вместе с шагами',
    );
    is(tag, r.removedIssueIndexes, [1, 3, 4], 'индексы ушедших дефектов');
    is(tag, r.removedSeamIds, ['s-lining'], 'шов LIN_A–LIN_B ушёл');
    is(
      tag,
      r.blockedBy,
      [{ kind: 'colourway', pieceLineKey: K('LIN_A'), count: 2 }],
      'blockedBy: рецепт LIN_A (регистр ссылки любой)',
    );
    is(tag, dangling(M, card, r), [], 'ничего не висит, assemblySweep чист');
    is(tag, r.counts, { pieces: 2, steps: 3 }, 'счётчики');
  }

  // ── 3. два листа в одном scope: уходит только то, что держит удаляемый ───────────────────────
  {
    const tag = 'two-sheets-one-scope';
    const front = base.blockNames.filter((b) => /^(BP|FP)/i.test(b));
    const rest = base.blockNames.filter((b) => !/^(BP|FP)/i.test(b));
    yes(tag, front.length > 0 && rest.length > 0, 'лист делится на два файла');
    const two = [
      { key: 'main-a', scope: MAIN, blockNames: front },
      { key: 'main-b', scope: MAIN, blockNames: rest },
      sheets[1],
    ];
    const r = M.removeSheetCascade(inputOf(card, two), 'main-a');
    is(
      tag,
      [...r.removedPieceKeys].sort(),
      [K('BP'), K('BP_1'), K('BP_2'), K('FP_L'), K('FP_R')].sort(),
      'ушли только детали файла A (по идентичности блоков с размерами)',
    );
    is(
      tag,
      titles(r.operations),
      ['edge collar', 'collar', 'lining'],
      'выжили шаги без BP/FP и не ниже них',
    );
    is(tag, dangling(M, card, r), [], 'ничего не висит');
    // лист B с неизвестными блоками держит всё → ничего не уходит
    const unknown = [{ ...two[0] }, { key: 'main-b', scope: MAIN, blockNames: null }, sheets[1]];
    const u = M.removeSheetCascade(inputOf(card, unknown), 'main-a');
    is(tag, u.counts, { pieces: 0, steps: 0 }, 'сосед с неразобранными блоками держит всё');
  }

  // ── 4. транзитивность не зависит от порядка: потребитель выше производителя ──────────────────
  {
    const tag = 'transitive';
    const ops = card.operations;
    const swapped = { ...card, operations: [ops[10], ...ops.slice(0, 10)] };
    const r = M.removeSheetCascade(inputOf(swapped, sheets), 'sheet-lining');
    is(tag, r.removedStepIndexes, [0, 3, 10], 'attach lining снят, даже стоя первым');
  }

  // ── 5. чистота ───────────────────────────────────────────────────────────────────────────────
  {
    const tag = 'pure';
    const miss = M.removeSheetCascade(inputOf(card, sheets), 'nope');
    is(tag, [miss.found, miss.counts], [false, { pieces: 0, steps: 0 }], 'чужой ключ — ничего');
    const a = M.removeSheetCascade(inputOf(card, sheets), 'sheet-main');
    const b = M.removeSheetCascade(inputOf(card, sheets), 'sheet-main');
    is(tag, JSON.stringify(a), JSON.stringify(b), 'детерминизм');
    is(tag, JSON.stringify(card), frozen, 'вход не мутирован');
  }

  console.log(`\ncascade probe: ${total - failed}/${total} ${failed ? 'FAIL' : 'ok'}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
