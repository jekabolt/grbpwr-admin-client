#!/usr/bin/env node
// Проверка перезалива DXF (L4a): ВЕСЬ путь загрузки — `reuploadSheet` из панели выкроек
// (nesting/dxf-reupload.ts: скачать старый лист → разобрать → reconcile → applyPlan → загрузить) —
// в node, на golden-листах против карточки формы card 69 (шаги 10/20 — перекрой BP_2 и FP_R,
// 30/40 — призрак CLR_3, разрез BP — join перед «back»). Печатает таблицу шагов с метками.
//
//   node scripts/dxf-reupload-check.mjs
//
// Сеть, форма и React не участвуют: download/upload — память, parse — тот же parseSheets, что у
// воркера, sha256 — WebCrypto (node 20+). Листы лежат в рабочем каталоге над репозиторием.

import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const workspace = resolve(root, '..');

const GOLDEN = 'tmp/plans/dxf-reupload-reconcile/golden';
const FILES = {
  base: 'tmp/plans/pdf-to-dxf/corpus/dxf-clo/allsizes-merged.dxf',
  gCombo: `${GOLDEN}/g-combo.dxf`,
  g4split: `${GOLDEN}/g4-split.dxf`,
  gSame: `${GOLDEN}/g-same.dxf`,
  gOther: `${GOLDEN}/g-other.dxf`,
};
const SIZES = ['xs', 's', 'm', 'l', 'xl'];
const MAIN = { bomLineKey: 'bom-main', fabricPurpose: 'MAIN' };
const SCOPE_KEY = 'bom-main';
const BASE_URL = 'mem://v6/allsizes-merged.dxf';

// ─── сборка и данные ─────────────────────────────────────────────────────────────────────────

async function bundle() {
  const outfile = resolve(tmpdir(), `dxf-reupload-check-${process.pid}.mjs`);
  await build({
    entryPoints: [resolve(here, 'dxf-reupload-check-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    absWorkingDir: root,
  });
  return import(pathToFileURL(outfile).href);
}

function bytesOf(rel) {
  const abs = resolve(workspace, rel);
  if (!existsSync(abs)) throw new Error(`нет листа: ${rel}`);
  return new Uint8Array(readFileSync(abs));
}

// ─── карточка формы card 69 ──────────────────────────────────────────────────────────────────

function card69(M, base) {
  const K = M.pieceKey;
  const c = M.cardFromSheet(base, { scope: MAIN, sizeTokens: SIZES });
  const step = (title, inputKeys, unit = '') => ({
    title,
    inputKeys,
    outputUnitKey: unit,
    outputUnitName: unit,
    review: '',
  });
  c.operations = [
    step('yoke', [K('BP_1'), K('BP_2')], 'YOKE'), // 10 — перекрой BP_2
    step('front', [K('FP_L'), K('FP_R')], 'FRONT'), // 20 — перекрой FP_R
    step('edge collar', [K('CLR_3')]), // 30 — призрак CLR_3 (обработка, без выхода)
    step('collar', [K('CLR_3'), K('CLR_4')], 'COLLAR'), // 40 — призрак CLR_3
    step('back', [K('BP'), 'YOKE'], 'BACK'), // 50 — BP: разрез ставит join перед ним
    step('shoulders', ['BACK', 'FRONT'], 'BODY'),
    step('sleeve L', ['BODY', K('SL_L')], 'BODY_L'),
    step('sleeve R', ['BODY_L', K('SL_R')], 'BODY_LR'),
    step('attach collar', ['BODY_LR', 'COLLAR'], 'SHIRT'),
  ];
  return c;
}

const formCard = (c, patterns, extra = {}) => ({
  patterns,
  pieces: c.pieces,
  aliases: c.aliases,
  operations: c.operations,
  scopeKey: SCOPE_KEY,
  scope: MAIN,
  scopeOf: (b) => (b.bomLineKey ?? '').trim(),
  isDxf: (u) => /\.dxf$/i.test(u),
  sizeTokens: SIZES,
  externalRefs: {},
  ...extra,
});

// Зависимости, как у panels: download/upload — память, parse — parseSheets на RECONCILE_PARSE.
let minted = 0; // общий на все прогоны: ключ новой детали уникален, как ulid в форме
let uploaded = 0;
function makeDeps(M, store, log, faults = {}) {
  const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return {
    download: async (url) => {
      log.downloads++;
      if (faults.download) throw new Error('offline');
      const b = store.get(url);
      if (!b) throw new Error(`404 ${url}`);
      return b;
    },
    parse: async (files) => {
      const r = await M.parseSheets(
        files.map((f) => ({ name: f.name, open: async () => ab(f.bytes) })),
        { ...M.RECONCILE_PARSE },
      );
      const out = { pieces: r.pieces, blockNames: r.blockNames, failedFiles: r.failedFiles };
      log.parses.push(out);
      return out;
    },
    sha256: (bytes) => M.sha256Hex(bytes),
    upload: async (file) => {
      if (faults.upload) throw new Error('503');
      const url = `mem://up-${++uploaded}/${file.name}`;
      store.set(url, file.bytes);
      log.uploads.push({ url, bytes: file.bytes });
      return {
        url,
        filename: file.name,
        sizeBytes: file.bytes.byteLength,
        sha256: await M.sha256Hex(file.bytes),
      };
    },
    otherSheets: async () => {
      if (faults.other) throw new Error('other sheet offline');
      return [];
    },
    mintKey: () => `new-${++minted}`,
    // `from` — деталь карточки, от которой новая родилась (L5 п.6): форма переносит с неё крой.
    makePiece: (s, from) => ({
      lineKey: s.lineKey,
      name: s.name,
      piecesPerGarment: s.piecesPerGarment,
      cutSymmetry: s.cutSymmetry,
      bornFrom: from?.lineKey ?? '',
      // тот же перенос кроя, что у формы (patterns-field → inheritedCut)
      ...M.inheritedCut(from),
    }),
    makeAlias: (s) => ({
      id: `al-new-${s.blockName}`,
      bomLineKey: s.bomLineKey,
      fabricPurpose: s.fabricPurpose,
      blockName: s.blockName,
      pieceLineKey: s.pieceLineKey,
    }),
    makeJoin: (s) => ({
      title: `join ${s.outputUnitName}`,
      inputKeys: s.inputKeys,
      outputUnitKey: s.outputUnitKey,
      outputUnitName: s.outputUnitName,
      review: '',
    }),
  };
}

const freshLog = () => ({ downloads: 0, parses: [], uploads: [] });

// ─── проверки ────────────────────────────────────────────────────────────────────────────────

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

// ─── таблица ─────────────────────────────────────────────────────────────────────────────────

function table(title, res) {
  const pieceName = new Map(res.pieces.map((p) => [p.lineKey, p.name]));
  const ghosts = new Set(res.result.ghostPieceKeys);
  const units = new Set(res.operations.map((o) => o.outputUnitKey).filter(Boolean));
  const label = (k) =>
    units.has(k) && !pieceName.has(k)
      ? `▣ ${k}`
      : `${pieceName.get(k) ?? k}${ghosts.has(k) ? ' (ghost)' : ''}`;
  const rows = res.operations.map((o, i) => [
    String((i + 1) * 10),
    o.title,
    (o.inputKeys ?? []).map(label).join(' + '),
    o.outputUnitKey ? `▣ ${o.outputUnitName || o.outputUnitKey}` : '',
    o.review || '',
  ]);
  const head = ['step', 'op', 'inputs', 'out', 'review'];
  const w = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
  const line = (r) =>
    r
      .map((v, c) => v.padEnd(w[c]))
      .join('  ')
      .trimEnd();
  console.log(`\n${title}`);
  console.log(line(head));
  for (const r of rows) console.log(line(r));
  const marks = res.operations.filter((o) => o.review).length;
  console.log(`marks: ! ${marks}`);
}

const reviewsOf = (ops) => ops.map((o) => o.review || '');

// ─── прогон ──────────────────────────────────────────────────────────────────────────────────

async function main() {
  const M = await bundle();
  const B = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, bytesOf(rel)]));
  const K = M.pieceKey;
  const baseSha = await M.sha256Hex(B.base);

  const baseParse = await M.parseSheets(
    [{ name: 'allsizes-merged.dxf', open: async () => B.base.slice().buffer }],
    { ...M.RECONCILE_PARSE },
  );
  const card = card69(M, { pieces: baseParse.pieces, blockNames: baseParse.blockNames });
  is('fixture', M.sweepOf(card), [], 'карточка card 69 собирается без нарушений');

  // Строка листа без записанного дайджеста (до 0423) — sha считается по скачанным байтам.
  const sheetRow = (sha256 = '') => ({
    lineKey: 'sheet-main',
    url: BASE_URL,
    filename: 'allsizes-merged.dxf',
    sha256,
    ...MAIN,
  });
  const run = async (file, opts = {}) => {
    const store = new Map([[BASE_URL, B.base], ...(opts.store ?? [])]);
    const log = freshLog();
    const c = opts.card ?? card;
    const out = await M.reuploadSheet(
      formCard(c, opts.patterns ?? [sheetRow(opts.sha ?? '')], opts.extra),
      file,
      makeDeps(M, store, log, opts.faults),
    );
    return { out, log, store };
  };

  // ── g-combo: 2 перекроя, призрак на двух шагах, переименования молчат, PKT — новая ─────────
  {
    const tag = 'g-combo';
    const { out, log } = await run({ name: 'g-combo.dxf', bytes: B.gCombo });
    is(tag, out.kind, 'applied', 'исход');
    if (out.kind === 'applied') {
      table('g-combo · base → g-combo.dxf (card 69 shape)', out);
      is(
        tag,
        reviewsOf(out.operations),
        ['reshaped', 'reshaped', 'orphan', 'orphan', '', '', '', '', ''],
        'метки по шагам',
      );
      is(tag, out.result.reshapedPieceKeys, [K('BP_2'), K('FP_R')], 'перекрой');
      is(tag, out.result.ghostPieceKeys, [K('CLR_3')], 'призрак');
      is(
        tag,
        out.result.renamed.map((x) => `${x.from}>${x.to}`),
        ['CLR_4>COLLAR_UNDER', 'FP_L>FRONT_L'],
        'переименования (без меток)',
      );
      const pkt = out.pieces.find((p) => out.result.addedPieceKeys.includes(p.lineKey));
      is(tag, [out.result.addedPieceKeys.length, pkt?.name], [1, 'PKT'], 'новая PKT');
      is(
        tag,
        M.unplacedPieceKeys(out.result.addedPieceKeys, out.operations),
        out.result.addedPieceKeys,
        'PKT ни в одном шаге: дверь «+ to assembly»',
      );
      is(tag, [log.downloads, log.uploads.length], [1, 1], 'скачан 1, загружен 1');
      is(tag, [out.rowIndex, out.replacedUrl], [0, BASE_URL], 'заменяется строка 0');
      is(
        tag,
        [out.row.sha256, out.row.version, out.row.uploadedAt],
        [await M.sha256Hex(B.gCombo), 0, ''],
        'строка листа: sha256, версия от сервера',
      );
      yes(
        tag,
        M.sweepOf({ pieces: out.pieces, operations: out.operations }).length === 0,
        'сборка чистая',
      );

      // переход: вкладка сборки, первый помеченный шаг; без меток — остаёмся
      const jump = M.markJumpParams(
        new URLSearchParams('tab=patterns&op=3&unit=x'),
        out.operations,
      );
      is(
        tag,
        jump && [jump.get('tab'), jump.get('opi'), jump.has('op'), jump.has('unit')],
        ['construction', '0', false, false],
        'переход на сборку, opi=0',
      );
      is(tag, M.markJumpParams(new URLSearchParams(), card.operations), null, 'без меток — null');

      // ok → метка снята, открывается следующая
      const okd = out.operations.map((o, i) => (i === 0 ? M.clearReview(o) : o));
      is(tag, [okd[0].review, M.nextMarkedOperation(okd, 0)], ['', 1], 'ok на 10 → открыть 20');

      // кандидаты призрака: только детали карточки, ближе — раньше, ≤ 3
      const [oldParse, newParse] = [log.parses[0], log.parses.at(-1)];
      const ghostShapes = M.shapesOfIdentity(oldParse, 'CLR_3', SIZES);
      const shaped = M.shapesByPiece(
        newParse,
        out.aliases,
        SIZES,
        (a) => a.bomLineKey === SCOPE_KEY,
      );
      const nameOf = new Map(out.pieces.map((p) => [p.lineKey, p.name]));
      const assembly = { pieces: out.pieces, operations: out.operations };
      const pick = (i, withAssembly = true) =>
        M.ghostCandidates(
          {
            pieceLineKey: K('CLR_3'),
            shapes: ghostShapes,
            step: out.operations[i],
            ...(withAssembly ? { assembly } : {}),
          },
          shaped,
          3,
          SIZES,
        );
      const raw30 = pick(2, false);
      const c30 = pick(2);
      const c40 = pick(3);
      const show = (cs) =>
        cs.map((c) => `${nameOf.get(c.pieceLineKey)} ${c.cost.toFixed(3)}`).join(', ') || '—';
      console.log(`ghost CLR_3 · step 30 by shape only:  ${show(raw30)}`);
      console.log(`ghost CLR_3 · step 30 offered:        ${show(c30)}`);
      console.log(`ghost CLR_3 · step 40 offered:        ${show(c40)}`);
      yes(tag, ghostShapes.length > 0, 'контур призрака со старого листа');
      is(
        tag,
        nameOf.get(raw30[0]?.pieceLineKey),
        'COLLAR_UNDER',
        'по форме ближе всех к CLR_3 — COLLAR_UNDER',
      );
      for (const [at, cs] of [
        [30, c30],
        [40, c40],
      ]) {
        yes(
          tag,
          cs.length > 0 && cs.length <= 3 && cs.every((c) => nameOf.has(c.pieceLineKey)),
          `кандидаты ${at}: 1..3, только детали карточки`,
        );
        yes(
          tag,
          cs.every((c, i) => i === 0 || cs[i - 1].cost <= c.cost),
          `кандидаты ${at}: ближе — раньше`,
        );
        yes(
          tag,
          cs.every(
            (c) =>
              !M.ghostSwapBreaksAssembly(out.pieces, out.operations, K('CLR_3'), c.pieceLineKey),
          ),
          `кандидаты ${at}: замена не ломает сборку`,
        );
      }
      // COLLAR_UNDER стоит с CLR_3 в джойне 40: замена по всей карте свела бы его к одному входу
      yes(
        tag,
        M.ghostSwapBreaksAssembly(out.pieces, out.operations, K('CLR_3'), K('CLR_4')) &&
          !c30.some((c) => c.pieceLineKey === K('CLR_4')),
        'COLLAR_UNDER не предлагается: ломает джойн 40',
      );

      // выбор кандидата: CLR_3 меняется по всей карте, 30 и 40 чистые, открывается следующий
      if (c30[0]) {
        const swapped = M.replaceGhost(out.operations, K('CLR_3'), c30[0].pieceLineKey, {
          ghosts: out.result.ghostPieceKeys,
        });
        console.log(
          `pick ${nameOf.get(c30[0].pieceLineKey)}: steps 30/40 → ${swapped
            .slice(2, 4)
            .map(
              (o) =>
                `[${o.inputKeys.map((k) => nameOf.get(k) ?? k).join(' + ')}] ${o.review || 'clean'}`,
            )
            .join(
              ', ',
            )}; ! ${out.operations.filter((o) => o.review).length} → ! ${swapped.filter((o) => o.review).length}`,
        );
        is(
          tag,
          reviewsOf(swapped),
          ['reshaped', 'reshaped', '', '', '', '', '', '', ''],
          'замена призрака снимает 30 и 40',
        );
        yes(
          tag,
          !swapped.some((o) => (o.inputKeys ?? []).includes(K('CLR_3'))),
          'CLR_3 не осталось ни в одном шаге',
        );
        is(
          tag,
          M.sweepOf({ pieces: out.pieces, operations: swapped }),
          [],
          'сборка после выбора чистая',
        );
        is(tag, M.nextMarkedOperation(swapped, 2), 0, 'после выбора → следующий помеченный (10)');
      }
      // × на призраке в шаге 30: только этот шаг
      const dropped = out.operations.map((o, i) =>
        i === 2 ? M.removeGhostFromStep(o, K('CLR_3'), { ghosts: out.result.ghostPieceKeys }) : o,
      );
      is(
        tag,
        [dropped[2].inputKeys, dropped[2].review, dropped[3].review],
        [[], '', 'orphan'],
        '× снимает призрак только с 30',
      );
      // правка шага снимает метку, кроме orphan, пока призрак в шаге
      is(
        tag,
        [
          M.reviewAfterEdit(out.operations[0], out.result.ghostPieceKeys),
          M.reviewAfterEdit(out.operations[3], out.result.ghostPieceKeys),
        ],
        ['', 'orphan'],
        'правка: reshaped снят, orphan стоит',
      );

      // восстановление версии: одна точка входа, только снимок (snapshotId > 0), без перезаливки
      const calls = [];
      const unsubscribe = M.provideSheetRestorer(async (rev) => {
        calls.push(rev.snapshotId ?? 0);
        return (rev.snapshotId ?? 0) > 0 ? 'applied' : 'unavailable';
      });
      const restored = await M.restoreSheetVersion({
        sheetLineKey: 'sheet-main',
        url: BASE_URL,
        fileName: 'allsizes-merged.dxf',
        revision: 6,
        sha256: baseSha,
        snapshotId: 41,
      });
      const bare = await M.restoreSheetVersion({ sheetLineKey: 'sheet-main', url: BASE_URL });
      unsubscribe();
      is(
        tag,
        [restored, bare, calls],
        ['applied', 'unavailable', [41, 0]],
        'restore: только снимок',
      );
      is(
        tag,
        await M.restoreSheetVersion({ sheetLineKey: 'sheet-main', url: BASE_URL }),
        'unavailable',
        'без панели выкроек — unavailable',
      );
    }
  }

  // Library handoff with the seams the app lane passes: both changed pieces keep matching sewn
  // edges, so card 69 is left with only its two ghost marks.
  {
    const tag = 'g-combo-seams';
    const parsed = await M.parseSheets(
      [{ name: 'g-combo.dxf', open: async () => B.gCombo.slice().buffer }],
      { ...M.RECONCILE_PARSE },
    );
    const old = { pieces: baseParse.pieces, blockNames: baseParse.blockNames };
    const neu = { pieces: parsed.pieces, blockNames: parsed.blockNames };
    const baseInput = {
      scope: MAIN,
      pieces: card.pieces,
      aliases: card.aliases,
      operations: card.operations,
      oldSheet: { parse: old },
      newSheet: { parse: neu },
      sizeTokens: SIZES,
      externalRefs: {},
    };
    const quietSeam = (identity, partner) => {
      for (let a = 0; a < 12; a++)
        for (let b = 0; b < 12; b++) {
          try {
            const raw = M.probeSeam(old, identity, partner, SIZES, a, b);
            for (const seam of [raw, M.balanceProbeSeam(neu, raw, SIZES)].filter(Boolean)) {
              const plan = M.reconcile({ ...baseInput, seams: [seam] });
              const row = plan.rows.find((r) =>
                r.old.some((o) => o.identity.toLowerCase() === identity.toLowerCase()),
              );
              if (!row?.reviews.some((r) => r.review === 'reshaped')) return seam;
            }
          } catch {
            // The piece has fewer runs; keep the bounded deterministic search.
          }
        }
      return null;
    };
    const seams = [quietSeam('BP_2', 'BP_1'), quietSeam('FP_R', 'FP_L')].filter(Boolean);
    is(tag, seams.length, 2, 'both changed pieces have a resolvable matching seam');
    const input = { ...baseInput, seams };
    const plan = M.reconcile(input);
    const helpers = makeDeps(M, new Map(), freshLog());
    const result = M.applyPlan(input, plan, {
      mintKey: helpers.mintKey,
      makePiece: helpers.makePiece,
      makeAlias: helpers.makeAlias,
      makeJoin: helpers.makeJoin,
      setReview: (op, review) => ({ ...op, review }),
    });
    table('g-combo · library with card seams', { ...result, result });
    is(
      tag,
      reviewsOf(result.operations),
      ['', '', 'orphan', 'orphan', '', '', '', '', ''],
      'only the two CLR_3 ghost steps remain marked',
    );
    is(tag, result.reviews.length, 2, 'marks ≤ 2');
  }

  // ── g4-split: BP → BP_U + BP_D; clean join before «back», no mark ─────────────────────────
  {
    const tag = 'g4-split';
    // дефекты: 50 («back») и 60 едут за join, 15 — не позиционный, стоит
    const issues = [{ operationNumber: 50 }, { operationNumber: 60 }, { operationNumber: 15 }];
    const { out } = await run({ name: 'g4-split.dxf', bytes: B.g4split }, { extra: { issues } });
    if (out.kind === 'applied') is(tag, out.issueNumbers, [60, 70, 15], 'issues за join');
    is(tag, out.kind, 'applied', 'исход');
    if (out.kind === 'applied') {
      table('g4-split · base → g4-split.dxf (card 69 shape)', out);
      is(tag, out.operations.length, card.operations.length + 1, 'шагов +1');
      is(
        tag,
        out.result.joins.map((j) => [j.opIndex, j.parentKey, j.unitName]),
        [[4, K('BP'), 'BP']],
        'join перед «back» (50), ▣ BP',
      );
      is(
        tag,
        reviewsOf(out.operations),
        ['', '', '', '', '', '', '', '', '', ''],
        'join без метки',
      );
      const j = out.result.joins[0];
      is(tag, out.operations[5].inputKeys, [j?.unitKey, 'YOKE'], '«back» берёт ▣ BP');
      is(
        tag,
        M.markJumpParams(new URLSearchParams(), out.operations),
        null,
        'нет перехода к метке',
      );
      is(tag, out.operations[4].smv ?? '', '', 'нет других SMV — join пустой');
      is(tag, out.result.opIndexOf, [0, 1, 2, 3, 5, 6, 7, 8, 9], 'старый индекс → новый');
      const parts = new Set(j?.partKeys ?? []);
      is(
        tag,
        out.pieces.filter((p) => parts.has(p.lineKey)).map((p) => p.bornFrom),
        [...parts].map(() => K('BP')),
        'части разреза рождены от BP (крой переносится)',
      );
      yes(
        tag,
        out.pieces.filter((p) => !parts.has(p.lineKey) && p.bornFrom).length === 0,
        'прочие детали ни от кого не рождены',
      );
      yes(
        tag,
        M.sweepOf({ pieces: out.pieces, operations: out.operations }).length === 0,
        'сборка чистая',
      );
    }
  }

  // ── g-combo: новая деталь (PKT) — новая по-настоящему, крой ни от кого ─────────────────────
  {
    const tag = 'carry';
    const { out } = await run({ name: 'g-combo.dxf', bytes: B.gCombo });
    if (out.kind === 'applied')
      yes(
        tag,
        out.result.addedPieceKeys.every((k) => !out.pieces.find((p) => p.lineKey === k)?.bornFrom),
        'добавленные детали без источника',
      );
  }

  // ── чужой файл: признак плана 'foreign' (L5a) → лист ДОПОЛНИТЕЛЬНЫЙ, карточка не меняется ────
  {
    const tag = 'foreign';
    is(
      tag,
      [
        M.isForeignPlan({ status: 'ready', refused: 'foreign' }),
        M.isForeignPlan({ status: 'foreign' }),
        M.isForeignPlan({ status: 'ready' }, { refused: { reason: 'foreign' } }),
        M.isForeignPlan({ status: 'ready' }, { refused: { reason: 'sweep' } }),
        M.isForeignPlan({ status: 'ready', refused: null }),
      ],
      [true, true, true, false, false],
      'признак читается структурно',
    );
    const { out, log } = await run({ name: 'g-other.dxf', bytes: B.gOther });
    if (out.kind === 'foreign') {
      is(tag, [out.rowIndex, log.uploads.length], [0, 1], 'загружен один файл, размер от строки 0');
      is(tag, out.row.filename, 'g-other.dxf', 'это сам файл');
    } else {
      // До L5a сверка «другой файл» только выключает матч по форме — исход ещё не 'foreign'.
      console.log(`  · g-other: ${out.kind} (foreign arrives with L5a)`);
    }
  }

  // ── тот же файл: noop без скачивания (записанный sha) и со скачиванием (без sha) ────────────
  {
    const tag = 'noop';
    const a = await run({ name: 'copy.dxf', bytes: B.gSame }, { sha: baseSha });
    is(tag, [a.out.kind, a.log.downloads, a.log.uploads.length], ['noop', 0, 0], 'записанный sha');
    const b = await run({ name: 'copy.dxf', bytes: B.gSame });
    is(tag, [b.out.kind, b.log.downloads, b.log.uploads.length], ['noop', 1, 0], 'sha по байтам');
  }

  // ── файл без $INSUNITS получает единицы заменяемого листа, без вопроса ─────────────────────
  {
    const tag = 'units';
    const text = M.bytesToLatin1(B.gCombo).replace(/\$INSUNITS\r?\n\s*70\r?\n\s*4/, (m) =>
      m.replace(/4$/, '0'),
    );
    const bytes = Uint8Array.from(text, (ch) => ch.charCodeAt(0));
    is(tag, M.readInsunits(M.bytesToLatin1(bytes)), 0, 'фикстура без единиц');
    const { out, log } = await run({ name: 'g-combo-nounits.dxf', bytes });
    is(tag, out.kind, 'applied', 'исход');
    is(
      tag,
      M.readInsunits(M.bytesToLatin1(log.uploads[0]?.bytes ?? new Uint8Array())),
      4,
      'загружен с мм',
    );
    if (out.kind === 'applied')
      is(
        tag,
        reviewsOf(out.operations),
        ['reshaped', 'reshaped', 'orphan', 'orphan', '', '', '', '', ''],
        'метки как у g-combo',
      );
  }

  // ── отказ — старый лист остаётся, на сервер ничего не ушло ──────────────────────────────────
  {
    const tag = 'refused';
    const utf16 = new Uint8Array([0xff, 0xfe, 0x30, 0x00]);
    const f = await run({ name: 'u16.dxf', bytes: utf16 });
    is(tag, [f.out.kind, f.out.why, f.log.uploads.length], ['refused', 'file', 0], 'UTF-16');
    const d = await run({ name: 'g-combo.dxf', bytes: B.gCombo }, { faults: { download: true } });
    is(
      tag,
      [d.out.kind, d.out.why, d.log.uploads.length],
      ['refused', 'download', 0],
      'скачивание',
    );
    const u = await run({ name: 'g-combo.dxf', bytes: B.gCombo }, { faults: { upload: true } });
    is(tag, [u.out.kind, u.out.why], ['refused', 'upload'], 'загрузка');
    const empty = await run({ name: 'g-combo.dxf', bytes: B.gCombo }, { patterns: [] });
    is(tag, empty.out.kind, 'first', 'пустой слот — первая заливка');
    const o = await run({ name: 'g-combo.dxf', bytes: B.gCombo }, { faults: { other: true } });
    is(
      tag,
      [o.out.kind, o.out.why, o.log.uploads.length],
      ['refused', 'parse', 0],
      'листы других слотов не прочитаны',
    );
  }

  // ── занятый слот: строка явная, никогда не «первая заливка» (L4c) ─────────────────────────
  {
    const tag = 'target';
    // тот же лист с переименованными блоками: ни одного общего с base
    const renamed = (prefix) => {
      let text = M.bytesToLatin1(B.base);
      for (const b of [...new Set(baseParse.blockNames)].sort((x, y) => y.length - x.length))
        text = text.replace(
          new RegExp(`(\\n)${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\r?\\n)`, 'g'),
          `$1${prefix}${b}$2`,
        );
      return Uint8Array.from(text, (ch) => ch.charCodeAt(0));
    };
    const zz = renamed('ZZ');
    const qq = renamed('QQ');
    const zzParse = await M.parseSheets([{ name: 'zz.dxf', open: async () => zz.slice().buffer }], {
      ...M.RECONCILE_PARSE,
    });
    const shared = zzParse.blockNames.filter((b) => baseParse.blockNames.includes(b));
    yes(tag, zzParse.pieces.length > 0 && shared.length === 0, 'фикстура: лист без общих блоков');
    const ZZ_URL = 'mem://v2/zz.dxf';
    const two = [
      { lineKey: 'sheet-zz', url: ZZ_URL, filename: 'zz.dxf', sha256: '', ...MAIN },
      sheetRow(),
    ];
    const store = [[ZZ_URL, zz]];
    const none = await run({ name: 'qq.dxf', bytes: qq }, { patterns: two, store });
    is(
      tag,
      [none.out.kind, none.out.why, none.log.uploads.length],
      ['refused', 'target', 0],
      'два листа, общих блоков нет — отказ, не first',
    );
    const ghost = await run(
      { name: 'g-combo.dxf', bytes: B.gCombo },
      { extra: { target: 'sheet-gone' } },
    );
    is(tag, [ghost.out.kind, ghost.out.why], ['refused', 'target'], 'строки нет в слоте');
    const pinned = await run(
      { name: 'g-combo.dxf', bytes: B.gCombo },
      { patterns: two, store, extra: { target: 'sheet-zz' } },
    );
    is(
      tag,
      pinned.out.kind === 'applied'
        ? [pinned.out.rowIndex, pinned.out.rowId, pinned.out.replacedUrl]
        : pinned.out.kind,
      [0, 'sheet-zz', ZZ_URL],
      'явная строка побеждает совпадение блоков',
    );
    const byBlocks = await run({ name: 'g-combo.dxf', bytes: B.gCombo }, { patterns: two, store });
    is(
      tag,
      byBlocks.out.kind === 'applied'
        ? [byBlocks.out.rowIndex, byBlocks.out.rowId]
        : byBlocks.out.kind,
      [1, 'sheet-main'],
      'без явной — лист с общими блоками',
    );
    is(tag, M.sheetRowId({ url: 'mem://x.dxf' }), 'mem://x.dxf', 'строка без lineKey — по url');
  }

  // ── якорь шва держит деталь: призрак, не удаление (L4c) ───────────────────────────────────
  {
    const tag = 'seam-ref';
    const inputs = ['BP', 'BP_1', 'BP_2', 'CLR_4', 'FP_L', 'FP_R', 'SL_L', 'SL_R'];
    const c = M.cardFromSheet(
      { pieces: baseParse.pieces, blockNames: baseParse.blockNames },
      { scope: MAIN, sizeTokens: SIZES, inputs },
    );
    const refs = (seams) => M.externalPieceRefs(c.pieces, [], [], M.seamAnchorKeys(seams));
    const bare = await run({ name: 'g-combo.dxf', bytes: B.gCombo }, { card: c });
    const saved = await run(
      { name: 'g-combo.dxf', bytes: B.gCombo },
      {
        card: c,
        extra: {
          externalRefs: refs([{ sideA: { parts: [{ pieceLineKey: K('CLR_3') }] }, sideB: {} }]),
        },
      },
    );
    const live = await run(
      { name: 'g-combo.dxf', bytes: B.gCombo },
      { card: c, extra: { externalRefs: refs([{ sideA: [{ piece: K('CLR_3') }], sideB: [] }]) } },
    );
    const fate = (r) =>
      r.out.kind !== 'applied'
        ? r.out.kind
        : r.out.result.removedPieceKeys.includes(K('CLR_3'))
          ? 'removed'
          : r.out.result.ghostPieceKeys.includes(K('CLR_3'))
            ? 'ghost'
            : 'kept';
    is(tag, [fate(bare), fate(saved), fate(live)], ['removed', 'ghost', 'ghost'], 'CLR_3 под швом');
  }

  // ── метки не слабеют: стоящая тяжелее плана остаётся (L4c) ────────────────────────────────
  {
    const tag = 'marks';
    const c = card69(M, { pieces: baseParse.pieces, blockNames: baseParse.blockNames });
    c.operations = c.operations.map((o, i) =>
      i === 0 ? { ...o, review: 'orphan' } : i === 1 ? { ...o, review: 'split' } : o,
    );
    const { out } = await run({ name: 'g-combo.dxf', bytes: B.gCombo }, { card: c });
    is(
      tag,
      out.kind === 'applied' ? reviewsOf(out.operations) : out.kind,
      ['orphan', 'split', 'orphan', 'orphan', '', '', '', '', ''],
      'orphan и split поверх reshaped стоят',
    );
  }

  // ── L5 fix 1: «чужой» считается по заменяемому листу, а не по всему слоту ────────────────
  // Слот из двух листов: base (все детали карточки) и ZZ — тот же лист с другими именами блоков,
  // тоже привязанный. Карманы чужого изделия, брошенные на ZZ: base по-прежнему совпадает целиком,
  // но к ZZ файл отношения не имеет — он ложится дополнительным листом, ZZ не перезаписывается.
  {
    const tag = 'foreign-by-sheet';
    let text = M.bytesToLatin1(B.base);
    for (const b of [...new Set(baseParse.blockNames)].sort((x, y) => y.length - x.length))
      text = text.replace(
        new RegExp(`(\\n)${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\r?\\n)`, 'g'),
        `$1ZZ${b}$2`,
      );
    const zz = Uint8Array.from(text, (ch) => ch.charCodeAt(0));
    const ZZ_URL = 'mem://v3/zz.dxf';
    const both = await M.parseSheets(
      [
        { name: 'allsizes-merged.dxf', open: async () => B.base.slice().buffer },
        { name: 'zz.dxf', open: async () => zz.slice().buffer },
      ],
      { ...M.RECONCILE_PARSE },
    );
    const c = M.cardFromSheet(
      { pieces: both.pieces, blockNames: both.blockNames },
      { scope: MAIN, sizeTokens: SIZES },
    );
    const patterns = [
      sheetRow(),
      { lineKey: 'sheet-zz', url: ZZ_URL, filename: 'zz.dxf', sha256: '', ...MAIN },
    ];
    const store = [[ZZ_URL, zz]];
    const pinned = await run(
      { name: 'g-other.dxf', bytes: B.gOther },
      { card: c, patterns, store, extra: { target: 'sheet-zz' } },
    );
    is(
      tag,
      pinned.out.kind === 'foreign' ? [pinned.out.kind, pinned.out.rowIndex] : pinned.out.kind,
      ['foreign', 1],
      'карманы на ZZ — чужой файл, хотя base совпадает целиком',
    );
    // Свой файл на base — не чужой (доля по base полная).
    const own = await run(
      { name: 'g-combo.dxf', bytes: B.gCombo },
      { card: c, patterns, store, extra: { target: 'sheet-main' } },
    );
    yes(tag, own.out.kind === 'applied', `свой лист base — применён (${own.out.kind})`);
  }

  // ── L5 fix 4: часть разреза наследует примечание родителя ─────────────────────────────────
  {
    const tag = 'split-note';
    const c = card69(M, { pieces: baseParse.pieces, blockNames: baseParse.blockNames });
    c.pieces = c.pieces.map((p) => (p.lineKey === K('BP') ? { ...p, note: 'cut on fold' } : p));
    const { out } = await run({ name: 'g4-split.dxf', bytes: B.g4split }, { card: c });
    is(tag, out.kind, 'applied', 'исход');
    if (out.kind === 'applied') {
      const born = out.result.addedPieceKeys.map(
        (k) => out.pieces.find((p) => p.lineKey === k)?.note ?? '',
      );
      is(tag, born, ['cut on fold'], 'рождённая часть — с примечанием BP');
    }
    is(
      tag,
      M.inheritedCut({ note: 'n', grainline: 'g', materials: [{ a: 1 }], name: 'X' }),
      { grainline: 'g', materials: [{ a: 1 }], note: 'n' },
      'крой и примечание, не имя',
    );
  }

  // ── L5 fix 5: раскладку старит только заменённый привязанный лист, не чужой добавленный ──
  {
    const tag = 'marker-stale';
    const at = (d) => `2026-10-${d}T10:00:00Z`;
    const cardWith = (patterns) => ({
      techCard: {
        bomItems: [{ lineKey: 'bom-main', section: 'TECH_CARD_BOM_SECTION_FABRIC', purpose: '' }],
        patterns,
      },
      markers: [{ id: 7, bomLineKey: 'bom-main', updatedAt: at(10) }],
    });
    const main = (extra = {}) => ({
      url: 'https://cdn.test/a.dxf',
      bomLineKey: 'bom-main',
      uploadedAt: at(5),
      history: [],
      ...extra,
    });
    const foreignRow = {
      url: 'https://cdn.test/b.dxf',
      bomLineKey: 'bom-main',
      uploadedAt: at(12),
    };
    is(
      tag,
      [
        [...M.markersBehindSheets(cardWith([main()]))],
        [...M.markersBehindSheets(cardWith([main(), foreignRow]))],
        [
          ...M.markersBehindSheets(
            cardWith([main({ uploadedAt: at(12), history: [{ url: 'https://cdn.test/a0.dxf' }] })]),
          ),
        ],
        [...M.markersBehindSheets(cardWith([main({ uploadedAt: at(12) })]))],
      ],
      [[], [], [7], [7]],
      'чужой лист не старит; заменённый и единственный — старят',
    );
  }

  // ── причина снимка: привязана к пейлоаду с новым листом, снимается его успешным сейвом ────
  {
    const tag = 'snapshot';
    const [u1, u2] = ['mem://up-a/g.dxf', 'mem://up-b/g.dxf'];
    const early = M.peekReuploadSnapshot(69, [BASE_URL]); // сейв начат до перезалива
    M.armReuploadSnapshot(69, u1, BASE_URL);
    const stale = M.peekReuploadSnapshot(69, [BASE_URL]); // его пейлоад — старый лист
    const first = M.peekReuploadSnapshot(69, [u1]);
    M.armReuploadSnapshot(69, u2, u1); // второй перезалив той же строки до ответа сейва 1
    M.consumeReuploadSnapshot(69, first);
    const second = M.peekReuploadSnapshot(69, [u2]);
    M.consumeReuploadSnapshot(69, second);
    is(
      tag,
      [early, stale, first?.reason, second?.reason, M.peekReuploadSnapshot(69, [u1, u2])],
      [null, null, M.REUPLOAD_SNAPSHOT_REASON, 'dxf-reupload', null],
      'сейв без нового листа не берёт причину; сейв 1 не снимает причину сейва 2',
    );
  }

  console.log(`\n${total - failed}/${total} checks ${failed ? `· ${failed} FAILED` : 'green'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
