#!/usr/bin/env node
// Проба сверки перезалитого DXF (src/lib/dxf-reconcile) — автоматический исход, без вопросов.
//
// Гейты: golden g*.dxf (tmp/plans/dxf-reupload-reconcile/golden — главный набор; ожидание
// «строка квиза» из манифеста читается как «метка review на шаге»), реальный корпус с
// мутированными копиями, шум экспорта, детерминизм под перестановкой входа и сторож сборки.
//
//   node scripts/dxf-reconcile-probe.mjs             — гейты
//   node scripts/dxf-reconcile-probe.mjs --mutants   — плюс мутанты кода: каждый обязан
//                                                     покраснить свой гейт, и каждый гейт обязан
//                                                     покраснеть хотя бы под одним мутантом
//
// Файлы корпуса лежат в рабочем каталоге над репозиторием (tmp/plans/…), как у assembly-*-probe.

import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const workspace = resolve(root, '..');
const entry = resolve(here, 'dxf-reconcile-probe-entry.ts');
const libDir = resolve(root, 'src/lib/dxf-reconcile');

const GOLDEN = 'tmp/plans/dxf-reupload-reconcile/golden';
const FILES = {
  base: 'tmp/plans/pdf-to-dxf/corpus/dxf-clo/allsizes-merged.dxf',
  pairLR: 'tmp/plans/pdf-to-dxf/k1-work/fixtures/c-pair-LR.dxf',
  card8main:
    'tmp/plans/assembly-3d-doll/prod-data/dxf/card8-MAIN-20261006174819762ee5e-7010515910ad3bd55667c08d2ebce490.dxf',
  card8lining:
    'tmp/plans/assembly-3d-doll/prod-data/dxf/card8-LINING-202610061748593424429-7d450a54f50f14a88302982723f0a003.dxf',
  card8pocketing:
    'tmp/plans/assembly-3d-doll/prod-data/dxf/card8-POCKETING-20260817144154981929b-e8f48d0aea6f08fe885ffafaa841fe1e.dxf',
  card11main:
    'tmp/plans/assembly-3d-doll/prod-data/dxf/card11-MAIN-20260904162434087ed79-ecf7631b8767d96b4768ad400755dd2b.dxf',
  gCombo: `${GOLDEN}/g-combo.dxf`,
  gSame: `${GOLDEN}/g-same.dxf`,
  gOther: `${GOLDEN}/g-other.dxf`,
  g4split: `${GOLDEN}/g4-split.dxf`,
  g4merge: `${GOLDEN}/g4-merge.dxf`,
  gUnits: `${GOLDEN}/g-units.dxf`,
  gSizetail: `${GOLDEN}/g-sizetail.dxf`,
  gPairLR: `${GOLDEN}/g-pair-LR.dxf`,
};
const SIZES = ['xs', 's', 'm', 'l', 'xl'];
const MAIN = { bomLineKey: 'bom-main', fabricPurpose: 'MAIN' };
const LINING = { bomLineKey: 'bom-lining', fabricPurpose: 'LINING' };

// ─── мутанты кода ────────────────────────────────────────────────────────────────────────────
// Каждая правка обязана найтись в файле ровно один раз: мутант, переставший что-либо менять
// после правки кода, — ошибка пробы, а не «зелёный гейт».
const MUTANTS = [
  {
    id: 'no-phase-refine',
    file: 'shape-sig.ts',
    edits: [['for (let k = 1; k < PHASES; k++)', 'for (let k = 1; k < 1; k++)']],
    kills: ['noise'],
  },
  {
    id: 'no-mirror-frames',
    file: 'shape-sig.ts',
    edits: [['for (const frame of FRAMES)', "for (const frame of ['asis' as Frame])"]],
    kills: ['g-pair-LR', 'noise'],
  },
  {
    id: 'notches-ignored',
    file: 'shape-sig.ts',
    edits: [['const dNotches = b.notches - a.notches;', 'const dNotches = 0;']],
    kills: ['g-combo'],
  },
  {
    id: 'no-place-tiebreak',
    file: 'match.ts',
    edits: [['a.pos - b.pos ||', '']],
    kills: ['twin-shapes'],
  },
  {
    id: 'no-units',
    file: 'match.ts',
    edits: [['if (ratios.length < 2) return 1;', 'return 1;']],
    kills: ['g-units'],
  },
  {
    id: 'no-exact-name',
    file: 'diff.ts',
    edits: [["if (n) pair(u, n, 'exact', u.entry ? 'high' : 'low');", '']],
    kills: ['g-same'],
  },
  {
    id: 'no-size-tail',
    file: 'diff.ts',
    edits: [
      ["if (n && !usedN.has(n.key)) pair(u, n, 'tail', 'high');", ''],
      ["if (u && !links.has(u.key)) pair(u, n, 'tail', 'high');", ''],
    ],
    kills: ['g-sizetail'],
  },
  {
    id: 'no-split',
    file: 'diff.ts',
    edits: [["if (c.kind === 'split')", "if (c.kind === 'split' && false)"]],
    kills: ['g4-split'],
  },
  {
    id: 'no-merge',
    file: 'diff.ts',
    edits: [['else\n        merges.push({', 'else if (false)\n        merges.push({']],
    kills: ['g4-merge'],
  },
  {
    id: 'no-other-file',
    file: 'diff.ts',
    edits: [
      [
        'const otherFile = linked.length > 0 && matchedShare < THRESH.otherFileShare;',
        'const otherFile = false as boolean;',
      ],
    ],
    kills: ['g-other'],
  },
  {
    id: 'no-lr-collapse',
    file: 'diff.ts',
    edits: [['if (c && c.cmp.cost <= THRESH.pairCost) collapsed.set', 'if (false) collapsed.set']],
    kills: ['g-pair-LR'],
  },
  {
    id: 'no-sha-noop',
    file: 'diff.ts',
    edits: [['if (oldSha && oldSha === newSha)', 'if (false)']],
    kills: ['noop'],
  },
  {
    id: 'order-leak',
    file: 'diff.ts',
    edits: [
      ['  scoped.sort(', '  [...scoped].sort('],
      [
        'const unitList = [...units.values()].sort((a, b) => byName(a.key, b.key));',
        'const unitList = [...units.values()];',
      ],
      ['[...unitsOf.values()].sort((a, b) => byName(a[0].key, b[0].key))', '[...unitsOf.values()]'],
      ['rows.sort((a, b) => byName(a.id, b.id));', ''],
    ],
    kills: ['determinism'],
  },
  {
    id: 'no-reshape-mark',
    file: 'diff.ts',
    edits: [
      [
        "if (outsideAutoAccept) pushReview(reviews, 'reshaped', [piece.lineKey]);",
        "if (false) pushReview(reviews, 'reshaped', [piece.lineKey]);",
      ],
    ],
    kills: ['g-combo', 'corpus'],
  },
  {
    id: 'elsewhere-ignored',
    file: 'diff.ts',
    edits: [["elsewhere.has(pk(p)) ? 'keep' : ", '']],
    kills: ['keep-other-scope'],
  },
  {
    id: 'unreferenced-kept',
    file: 'diff.ts',
    edits: [["> 0 ? 'ghost' : 'delete'", "> -1 ? 'ghost' : 'delete'"]],
    kills: ['delete-unreferenced'],
  },
  {
    id: 'no-moved',
    file: 'diff.ts',
    edits: [
      ['const piece = pieceForIdentity(n.identity);', 'const piece = null as P | null;'],
      ['if (otherIndexes.length)', 'if (false)'],
    ],
    kills: ['moved'],
  },
  {
    id: 'annotations-ignored',
    file: 'defaults.ts',
    edits: [['if (t) annotations.push(t);', '']],
    kills: ['ghost-by-annotation'],
  },
  {
    id: 'tight-unchanged',
    file: 'defaults.ts',
    edits: [['unchangedForm: 0.012,', 'unchangedForm: 0.0005,']],
    kills: ['noise'],
  },
  {
    id: 'seam-unit-mark-dropped',
    file: 'seams.ts',
    edits: [
      [
        "else reviews.push({ review: 'reshaped', pieceKeys: [pieceKey.trim()], operationIndexes: [] });",
        '',
      ],
    ],
    kills: ['seam-unit-fallback'],
  },
  {
    id: 'split-always-sure',
    file: 'diff.ts',
    edits: [['const sure = rival - c.err >= THRESH.splitMargin;', 'const sure = true;']],
    kills: ['split-ambiguous'],
  },
  {
    id: 'no-auto-accept-reshape',
    file: 'defaults.ts',
    edits: [['autoAcceptRel: 0.02,', 'autoAcceptRel: 0,']],
    kills: ['auto-accept-reshape'],
  },
  {
    id: 'ignore-seam-mismatch',
    file: 'defaults.ts',
    edits: [['seamMismatchRel: 0.01,', 'seamMismatchRel: 1,']],
    kills: ['seam-reshape'],
  },
  {
    id: 'no-rename-by-shape',
    file: 'defaults.ts',
    edits: [
      ['renameMax: 0.25,', 'renameMax: -1,'],
      ['renameMaxNoCommonSize: 0.08,', 'renameMaxNoCommonSize: -1,'],
    ],
    kills: ['corpus', 'g-combo'],
  },
  // No 7c mutant: its mode-aware cap matches step 5, which consumes every eligible pair first.
  {
    id: 'no-mirror-pair-place',
    file: 'diff.ts',
    edits: [
      [
        "(c.cmp.frame === 'mirrorU' || c.cmp.frame === 'mirrorV')",
        "(c.cmp.frame === 'mirrorU' && false)",
      ],
    ],
    kills: ['mirror-pair-place'],
  },
  {
    id: 'review-rank-inverted',
    file: 'rewrite.ts',
    edits: [
      [
        'if (REVIEW_RANK[marks.get(k)!] > REVIEW_RANK[review])',
        'if (REVIEW_RANK[marks.get(k)!] < REVIEW_RANK[review])',
      ],
    ],
    kills: ['review-rank'],
  },
  {
    id: 'marks-weaken',
    file: 'rewrite.ts',
    edits: [
      [
        'if (rankOf(had) > REVIEW_RANK[review]) review = had as Review;',
        'if (false) review = had as Review;',
      ],
    ],
    kills: ['marks-never-weaken'],
  },
  {
    id: 'ghost-step-not-orphan',
    file: 'rewrite.ts',
    edits: [["if (ghostHit.length && review !== 'orphan') {", 'if (false) {']],
    kills: ['g4-merge', 'g-pair-LR', 'marks-never-weaken'],
  },
  {
    id: 'no-sweep-guard',
    file: 'rewrite.ts',
    edits: [['if (fresh.length) return untouched', 'if (false) return untouched']],
    kills: ['sweep-guard'],
  },
  {
    id: 'ghost-deleted',
    file: 'rewrite.ts',
    edits: [
      [
        "if (o.fate === 'delete') deleted.add(o.pieceLineKey);",
        "if (o.fate !== 'keep') deleted.add(o.pieceLineKey);",
      ],
      ["if (o.fate === 'ghost') ghosts.add(o.pieceLineKey);", ''],
    ],
    kills: ['g-combo'],
  },
  {
    id: 'split-no-inherit',
    file: 'rewrite.ts',
    edits: [["r.tier === 'split' ? byKey.get", "r.tier === 'none' ? byKey.get"]],
    kills: ['g4-split'],
  },
  {
    id: 'clean-split-marked',
    file: 'rewrite.ts',
    edits: [['mark: rv.mark !== false', 'mark: true']],
    kills: ['g4-split', 'split-join'],
  },
  {
    id: 'split-no-median-smv',
    file: 'rewrite.ts',
    edits: [['const joinSmv = medianJoinSmv(input.operations);', "const joinSmv = '';"]],
    kills: ['split-join'],
  },
  {
    id: 'foreign-aliases-dropped',
    file: 'rewrite.ts',
    edits: [
      [
        'const aliases: A[] = input.aliases.filter((a) => !inScope(a));',
        'const aliases: A[] = [];',
      ],
    ],
    kills: ['apply-invariants'],
  },
  {
    id: 'split-marks-steps',
    file: 'rewrite.ts',
    edits: [["if (rv.review === 'split') {", "if (rv.review === 'split' && false) {"]],
    kills: ['g4-split', 'split-join'],
  },
  {
    id: 'join-after-first-use',
    file: 'rewrite.ts',
    edits: [
      [
        'slots.splice(at, 0, { op: join, src: -1 });',
        'slots.splice(at + 1, 0, { op: join, src: -1 });',
      ],
    ],
    kills: ['g4-split', 'split-join'],
  },
  {
    id: 'join-no-downstream-swap',
    file: 'rewrite.ts',
    edits: [
      ['slots = slots.map((x, i) => (i < at ? x :', 'slots = slots.map((x, i) => (true ? x :'],
    ],
    kills: ['g4-split', 'split-join'],
  },
  {
    id: 'join-shifts-old-violations',
    file: 'rewrite.ts',
    edits: [
      [
        '(i) => (slots[i] && slots[i].src >= 0 ? String(slots[i].src) : `join${i}`)',
        '(i) => String(i)',
      ],
    ],
    kills: ['split-join'],
  },
  {
    id: 'step-dropped',
    file: 'rewrite.ts',
    edits: [
      [
        'const operations: O[] = withPlacements.map(',
        'const operations: O[] = withPlacements.slice(0, -1).map(',
      ],
    ],
    kills: ['apply-invariants'],
  },
];

function mutantPlugin(m) {
  return {
    name: 'dxf-reconcile-mutant',
    setup(b) {
      if (!m) return;
      const target = resolve(libDir, m.file);
      b.onLoad({ filter: /dxf-reconcile[\\/][a-z-]+\.ts$/ }, (args) => {
        if (args.path !== target) return undefined;
        let src = readFileSync(args.path, 'utf8');
        for (const [find, repl] of m.edits) {
          const n = src.split(find).length - 1;
          if (n !== 1) throw new Error(`mutant ${m.id}: «${find}» found ${n}× in ${m.file}`);
          src = src.replace(find, repl);
        }
        return { contents: src, loader: 'ts' };
      });
    },
  };
}

async function bundle(m) {
  const outfile = resolve(tmpdir(), `dxf-reconcile-probe-${process.pid}-${m?.id ?? 'base'}.mjs`);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    absWorkingDir: root,
    plugins: [mutantPlugin(m)],
  });
  return import(pathToFileURL(outfile).href);
}

// ─── данные ──────────────────────────────────────────────────────────────────────────────────

async function loadAll(M) {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) {
    const abs = resolve(workspace, rel);
    if (!existsSync(abs)) throw new Error(`нет файла корпуса: ${rel}`);
    const buf = readFileSync(abs);
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await M.parseSheets([{ name: rel.split('/').pop(), open: async () => bytes }], {
      unit: 'auto',
      tol: 0.05,
      tolChain: 0.05,
    });
    out[k] = { pieces: parsed.pieces, blockNames: parsed.blockNames };
  }
  const manifests = {};
  for (const g of [
    'g-combo',
    'g-same',
    'g-other',
    'g4-split',
    'g4-merge',
    'g-units',
    'g-sizetail',
    'g-pair-LR',
  ]) {
    manifests[g] = JSON.parse(
      readFileSync(resolve(workspace, GOLDEN, `${g}.manifest.json`), 'utf8'),
    );
  }
  return { sheets: out, manifests };
}

// Мутации листа: те же PieceDTO, другие имена / геометрия / порядок.
const ci = (s) => s.toLowerCase();
function blocksOf(M, parse, identity) {
  const card = M.cardFromSheet(parse, { scope: MAIN, sizeTokens: SIZES });
  if (!card.pieces.some((p) => ci(p.name) === ci(identity)))
    throw new Error(`нет идентичности ${identity}`);
  return (p) => {
    const b = p.blockName ?? '';
    if (!ci(b).startsWith(ci(identity))) return false;
    const rest = b.slice(identity.length);
    return rest === '' || (/^[\s_.-]/.test(rest) && SIZES.includes(ci(rest.slice(1))));
  };
}
function renameIdentity(M, parse, from, to) {
  const is = blocksOf(M, parse, from);
  const pieces = parse.pieces.map((p) =>
    is(p) ? { ...p, blockName: to + p.blockName.slice(from.length) } : p,
  );
  return { pieces, blockNames: [...new Set(pieces.map((p) => p.blockName))] };
}
function dropIdentity(M, parse, identity) {
  const is = blocksOf(M, parse, identity);
  const pieces = parse.pieces.filter((p) => !is(p));
  return { pieces, blockNames: [...new Set(pieces.map((p) => p.blockName))] };
}
function mapPoly(p, f) {
  return { ...p, poly: f(p.poly.map((q) => ({ ...q }))) };
}
function stretchX(M, parse, identity, k) {
  const is = blocksOf(M, parse, identity);
  const pieces = parse.pieces.map((p) =>
    is(p)
      ? {
          ...p,
          poly: p.poly.map((q) => ({ ...q, x: q.x * k })),
          inner: (p.inner ?? []).map((path) => ({
            ...path,
            pts: path.pts.map((q) => ({ ...q, x: q.x * k })),
          })),
          bboxW: p.bboxW * k,
          areaCm2: p.areaCm2 * k,
        }
      : p,
  );
  return { pieces, blockNames: parse.blockNames };
}
const NOISE = {
  // начало обхода с другой вершины
  'start-shift': (poly) => poly.slice(7).concat(poly.slice(0, 7)),
  // лишняя вершина в середине каждого второго отрезка
  subdivide: (poly) =>
    poly.flatMap((q, i) => {
      const n = poly[(i + 1) % poly.length];
      return i % 2 ? [q] : [q, { ...q, x: (q.x + n.x) / 2, y: (q.y + n.y) / 2 }];
    }),
  // обратный обход
  reverse: (poly) => poly.slice().reverse(),
  // деталь отзеркалена экспортом
  mirror: (poly) => {
    const maxX = Math.max(...poly.map((q) => q.x));
    return poly.map((q) => ({ ...q, x: maxX - q.x }));
  },
};
function noisy(parse, kind) {
  const f = NOISE[kind];
  return {
    pieces: parse.pieces.map((p) => {
      const q = mapPoly(p, f);
      if (kind !== 'mirror') return q;
      const maxX = Math.max(...p.poly.map((v) => v.x));
      return {
        ...q,
        inner: (p.inner ?? []).map((path) => ({
          ...path,
          pts: path.pts.map((v) => ({ ...v, x: maxX - v.x })),
        })),
      };
    }),
    blockNames: parse.blockNames,
  };
}
function withPieces(parse, extra) {
  let id = Math.max(...parse.pieces.map((p) => p.id)) + 1;
  const pieces = [...parse.pieces, ...extra.map((p) => ({ ...p, id: id++, fileIndex: 0 }))];
  return { pieces, blockNames: [...new Set(pieces.map((p) => p.blockName))] };
}

// Детерминированная перестановка (LCG) — тот же порядок при каждом прогоне.
function shuffle(xs, seed) {
  const a = [...xs];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── прогон сверки ───────────────────────────────────────────────────────────────────────────

function deps() {
  let n = 0;
  return {
    mintKey: () => `new-${++n}`,
    makePiece: (s) => ({
      lineKey: s.lineKey,
      name: s.name,
      piecesPerGarment: s.piecesPerGarment,
      cutSymmetry: s.cutSymmetry,
    }),
    makeAlias: (s) => ({ id: `al-new-${s.blockName}`, ...s }),
    makeJoin: (s) => ({
      title: `join ${s.outputUnitName}`,
      inputKeys: s.inputKeys,
      outputUnitKey: s.outputUnitKey,
      outputUnitName: s.outputUnitName,
      zoneOf: s.before.title,
    }),
    setReview: (op, review) => ({ ...op, review }),
  };
}

function runCase(M, c) {
  const card =
    c.card ??
    M.cardFromSheet(c.old, { scope: c.scope ?? MAIN, sizeTokens: SIZES, ...(c.spec ?? {}) });
  const input = {
    scope: c.scope ?? MAIN,
    pieces: card.pieces,
    aliases: card.aliases,
    operations: card.operations,
    oldSheet: c.noOldSheet ? null : { parse: c.old, sha256: c.oldSha ?? null },
    newSheet: { parse: c.neu, sha256: c.newSha ?? null },
    sizeTokens: SIZES,
    otherSheets: c.otherSheets,
    seams: c.seams,
  };
  const plan = M.reconcile(input);
  const res = M.applyPlan(input, c.tamper ? c.tamper(structuredClone(plan)) : plan, deps());
  return { card, input, plan, res };
}

// ─── гейты ───────────────────────────────────────────────────────────────────────────────────

const GATES = [
  'g-combo',
  'g-same',
  'g-other',
  'g4-split',
  'g4-merge',
  'g-units',
  'g-sizetail',
  'g-pair-LR',
  'seam-reshape',
  'seam-unit-fallback',
  'split-ambiguous',
  'auto-accept-reshape',
  'ghost-auto-replace',
  'mirror-pair-place',
  'twin-shapes',
  'noop',
  'determinism',
  'noise',
  'corpus',
  'ghost-by-annotation',
  'delete-unreferenced',
  'keep-other-scope',
  'review-rank',
  'marks-never-weaken',
  'moved',
  'sweep-guard',
  'split-join',
  'apply-invariants',
];

function gates(M, data) {
  const { sheets: S, manifests } = data;
  const red = new Map(GATES.map((g) => [g, []]));
  const fail = (g, msg) => red.get(g).push(msg);
  const is = (g, got, want, what) => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) fail(g, `${what}: ${a}, ожидалось ${b}`);
  };
  const yes = (g, cond, what) => {
    if (!cond) fail(g, what);
  };
  const guard = (g, f) => {
    try {
      f();
    } catch (e) {
      fail(g, `исключение: ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`);
    }
  };

  const rowBy = (plan, identity) =>
    plan.rows.find((r) => r.old.some((o) => ci(o.identity) === ci(identity))) ??
    plan.rows.find((r) => r.new.some((n) => ci(n.identity) === ci(identity)));
  const markOf = (r) => {
    const m = {};
    for (const x of r.res.reviews)
      for (const k of x.pieceKeys)
        m[k] = m[k] && m[k] !== x.review ? `${m[k]}|${x.review}` : x.review;
    return Object.fromEntries(Object.entries(m).sort());
  };
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort());

  // Инварианты применения — на каждом прогоне любого гейта.
  const invariants = (name, r, { refused = null } = {}) => {
    const g = 'apply-invariants';
    const { input, res } = r;
    is(g, res.refused?.reason ?? null, refused, `${name}: отказ`);
    // Шаги не теряются; добавляются только join разреза — ровно перед первым шагом с деталью.
    const joins = res.joins ?? [];
    yes(
      g,
      res.operations.length === input.operations.length + joins.length,
      `${name}: шагов ${res.operations.length} из ${input.operations.length} + join ${joins.length}`,
    );
    const joinAt = new Set(joins.map((j) => j.opIndex));
    const pieceKeys = new Set(res.pieces.map((p) => p.lineKey));
    for (const j of joins) {
      const op = res.operations[j.opIndex];
      is(g, op?.inputKeys, [j.parentKey, ...j.partKeys], `${name}: входы join ${j.unitName}`);
      is(
        g,
        [op?.outputUnitKey, op?.outputUnitName],
        [j.unitKey, j.unitName],
        `${name}: выход join`,
      );
      if (name !== 'g4-split' && name !== 'split-join')
        is(g, op?.review, 'split', `${name}: метка join`);
      yes(g, !pieceKeys.has(j.unitKey), `${name}: узел join ${j.unitKey} — ключ детали`);
      const next = res.operations[j.opIndex + 1];
      yes(
        g,
        !!next && (next.inputKeys ?? []).includes(j.unitKey),
        `${name}: join ${j.unitName} не прямо перед первым шагом с деталью`,
      );
      yes(
        g,
        res.operations.slice(0, j.opIndex).every((o) => !(o.inputKeys ?? []).includes(j.parentKey)),
        `${name}: деталь ${j.parentKey} входом раньше join`,
      );
    }
    let src = 0;
    res.operations.forEach((op, i) => {
      if (joinAt.has(i)) return;
      const was = input.operations[src++];
      if (!was) return;
      let want = was.inputKeys;
      for (const j of joins)
        if (j.opIndex < i) want = want.map((k) => (k === j.parentKey ? j.unitKey : k));
      const paired = res.addedPieceKeys.filter(
        (k) => (op.inputKeys ?? []).includes(k) && !(want ?? []).includes(k),
      );
      is(
        g,
        (op.inputKeys ?? []).filter((k) => !paired.includes(k)),
        want,
        `${name}: входы шага ${i}`,
      );
      is(g, op.media ?? null, was.media ?? null, `${name}: аннотации шага ${i}`);
      is(g, op.outputUnitKey, was.outputUnitKey, `${name}: выход шага ${i}`);
    });
    const scopeKey = input.scope.fabricPurpose || input.scope.bomLineKey;
    const foreignIn = input.aliases.filter((a) => (a.fabricPurpose || a.bomLineKey) !== scopeKey);
    const foreignOut = res.aliases.filter((a) => (a.fabricPurpose || a.bomLineKey) !== scopeKey);
    yes(
      g,
      foreignIn.length === foreignOut.length && foreignIn.every((a, i) => a === foreignOut[i]),
      `${name}: алиасы других scope тронуты`,
    );
    const keys = new Set(res.pieces.map((p) => p.lineKey));
    yes(g, keys.size === res.pieces.length, `${name}: повтор ключа детали`);
    yes(
      g,
      new Set(res.pieces.map((p) => ci(p.name))).size === res.pieces.length,
      `${name}: повтор имени детали`,
    );
    for (const a of res.aliases)
      yes(
        g,
        keys.has(a.pieceLineKey),
        `${name}: алиас ${a.blockName} → нет детали ${a.pieceLineKey}`,
      );
    const before = new Set(input.pieces.map((p) => p.lineKey));
    const swapped = new Set(joins.map((j) => j.parentKey));
    for (const op of input.operations) {
      for (const k of op.inputKeys ?? [])
        if (before.has(k)) yes(g, keys.has(k), `${name}: деталь-вход ${k} исчезла`);
    }
    for (const k of swapped) yes(g, keys.has(k), `${name}: разрезанная деталь ${k} исчезла`);
    if (!res.refused)
      is(
        g,
        M.sweepOf(res).map((v) => v.detail),
        [],
        `${name}: assemblySweep после`,
      );
    yes(
      g,
      new Set(res.reviews.map((x) => x.opIndex)).size === res.reviews.length,
      `${name}: две метки на шаг`,
    );
  };

  // Ожидания манифеста golden: ярус строки по старой (или новой) идентичности.
  const manifestTiers = (g, plan, manifest) => {
    for (const t of manifest.tiers) {
      const old = [t.old].flat().filter(Boolean);
      const neu = [t.new].flat().filter(Boolean);
      const r = rowBy(plan, old[0] ?? neu[0]);
      if (!r) {
        fail(g, `нет строки для ${old[0] ?? neu[0]}`);
        continue;
      }
      is(g, r.tier, t.tier, `${old.join('+') || '∅'} → ${neu.join('+') || '∅'}: ярус`);
      is(
        g,
        r.new.map((n) => ci(n.identity)).sort(),
        neu.map(ci).sort(),
        `${old.join('+') || '∅'}: новые блоки`,
      );
      is(
        g,
        r.old.map((o) => ci(o.identity)).sort(),
        old.map(ci).sort(),
        `${neu.join('+') || '∅'}: старые блоки`,
      );
    }
    is(g, plan.rows.length, manifest.tiers.length, 'число строк');
  };

  const K = (s) => `pc-${ci(s)}`;

  // ── g-combo: 2 переименования, пропажа со ссылками, новая, 2 перекроя ─────────────────────
  guard('g-combo', () => {
    const g = 'g-combo';
    const r = runCase(M, { old: S.base, neu: S.gCombo });
    invariants(g, r);
    manifestTiers(g, r.plan, manifests[g]);
    // квиз манифеста → метки: COLLAR_UNDER=CLR_4? → remapped, BP_2/FP_R → reshaped, CLR_3 → orphan
    is(
      g,
      markOf(r),
      sorted({
        [K('BP_2')]: 'reshaped',
        [K('CLR_3')]: 'orphan',
        [K('CLR_4')]: 'remapped',
        [K('FP_R')]: 'reshaped',
      }),
      'метки',
    );
    is(g, rowBy(r.plan, 'FP_L').confidence, 'high', 'FP_L → FRONT_L уверенность');
    is(
      g,
      rowBy(r.plan, 'CLR_4').new.map((n) => n.identity),
      ['COLLAR_UNDER'],
      'COLLAR_UNDER идёт к CLR_4 (место на листе)',
    );
    is(
      g,
      r.res.renamed.map((x) => `${x.from}>${x.to}`),
      ['CLR_4>COLLAR_UNDER', 'FP_L>FRONT_L'],
      'переименования',
    );
    is(g, r.res.ghostPieceKeys, [K('CLR_3')], 'призраки');
    is(g, r.res.removedPieceKeys, [], 'удалённые');
    is(g, r.res.reshapedPieceKeys, [K('BP_2'), K('FP_R')], '«Конструкция» протухла');
    const pkt = r.res.pieces.find((p) => r.res.addedPieceKeys.includes(p.lineKey));
    is(
      g,
      [r.res.addedPieceKeys.length, pkt?.name, pkt?.piecesPerGarment, pkt?.cutSymmetry],
      [1, 'PKT', 1, M.IDENTICAL],
      'новая деталь PKT',
    );
    const bp2 = rowBy(r.plan, 'BP_2').delta;
    yes(
      g,
      bp2 && Math.abs(bp2.dW - 0.1) < 0.01 && Math.abs(bp2.dH) < 0.002,
      `BP_2 ×1.10 по ширине: dW ${bp2?.dW}, dH ${bp2?.dH}`,
    );
    is(g, rowBy(r.plan, 'FP_R').delta?.dNotches, 2, 'FP_R +2 надсечки');
    is(
      g,
      r.res.aliases
        .filter((a) => a.fabricPurpose === 'MAIN')
        .map((a) => `${a.blockName}>${a.pieceLineKey}`),
      [
        'BP>pc-bp',
        'BP_1>pc-bp_1',
        'BP_2>pc-bp_2',
        'COLLAR_UNDER>pc-clr_4',
        'FP_R>pc-fp_r',
        'FRONT_L>pc-fp_l',
        'PKT>new-1',
        'SL_L>pc-sl_l',
        'SL_R>pc-sl_r',
      ],
      'алиасы scope',
    );
  });

  // ── g-same: побайтная копия → всё unchanged, ни одной метки ───────────────────────────────
  guard('g-same', () => {
    const g = 'g-same';
    const r = runCase(M, { old: S.base, neu: S.gSame });
    invariants(g, r);
    manifestTiers(g, r.plan, manifests[g]);
    is(g, r.res.reviews, [], 'метки');
    is(g, r.res.pieces, r.input.pieces, 'детали те же');
    is(
      g,
      r.res.aliases.map((a) => a.id),
      r.input.aliases.map((a) => a.id),
      'алиасы те же строки',
    );
    is(g, r.res.revisionNote, 'dxf reconcile: no changes', 'запись ревизии');
    // старого листа нет (карта до хранения листов) — только имена, форма неизвестна
    const blind = runCase(M, { old: S.base, neu: S.gSame, noOldSheet: true });
    invariants(`${g} без старого листа`, blind);
    is(
      g,
      [...new Set(blind.plan.rows.map((x) => `${x.tier}/${x.confidence}`))],
      ['unchanged/low'],
      'без старого листа',
    );
    is(g, blind.res.reviews, [], 'без старого листа: метки');
  });

  // ── g-other: другой файл → отказанный план без единой перезаписи ─────────────────────────
  guard('g-other', () => {
    const g = 'g-other';
    const r = runCase(M, { old: S.base, neu: S.gOther });
    invariants(g, r, { refused: 'foreign' });
    is(g, r.plan.summary.otherFile, true, 'флаг «другой файл»');
    is(g, [r.plan.refused, r.plan.rows.length], ['foreign', 0], 'план отказан без строк');
    is(g, r.res.refused, { reason: 'foreign' }, 'применение отказано');
    is(g, r.res.pieces, r.input.pieces, 'детали не переписаны');
    is(g, r.res.aliases, r.input.aliases, 'алиасы не переписаны');
    is(g, r.res.operations, r.input.operations, 'шаги не переписаны');
    is(g, r.res.reviews, [], 'меток нет');
  });

  // ── g4-split: BP → BP_U + BP_D; деталь — за большей частью, join ▣ BP перед первым шагом ──
  guard('g4-split', () => {
    const g = 'g4-split';
    const r = runCase(M, {
      old: S.base,
      neu: S.g4split,
      spec: { overrides: { BP: { piecesPerGarment: 2, cutSymmetry: M.MIRRORED } } },
    });
    invariants(g, r);
    manifestTiers(g, r.plan, manifests[g]);
    is(g, markOf(r), {}, 'чистый разрез без метки');
    const row = rowBy(r.plan, 'BP');
    const big = row.links.find((l) => l.pieceLineKey === K('BP'));
    const small = row.links.find((l) => l.pieceLineKey === null);
    yes(g, big && small, 'одна часть за деталью, другая — новая');
    // площадь на слое кроя (1); у BP_U генератор оставил на слое 8 контур целой спинки
    const area = (id) => {
      const p = S.g4split.pieces.filter(
        (q) => ci(q.blockName ?? '') === ci(`${id}_M`) && q.layer === '1',
      );
      return Math.max(...p.map((q) => q.areaCm2));
    };
    yes(
      g,
      big && small && area(big.identity) >= area(small.identity),
      `деталь идёт за большей частью (${big?.identity})`,
    );
    const added = r.res.pieces.find((p) => p.lineKey === r.res.addedPieceKeys[0]);
    is(
      g,
      [r.res.addedPieceKeys.length, added?.name, added?.piecesPerGarment, added?.cutSymmetry],
      [1, small?.identity, 2, M.MIRRORED],
      'часть наследует ×2 зеркально',
    );
    is(g, r.res.reshapedPieceKeys, [K('BP')], '«Конструкция» BP протухла');
    // L5: ОДИН join [BP, часть] → ▣ BP перед первым шагом с BP; чистый разрез без метки.
    is(
      g,
      r.res.joins.map((j) => [j.opIndex, j.parentKey, j.partKeys, j.unitKey, j.unitName]),
      [[0, K('BP'), [r.res.addedPieceKeys[0]], 'BP', 'BP']],
      'join разреза',
    );
    is(g, r.res.operations.length, r.input.operations.length + 1, 'шагов +1');
    is(
      g,
      r.res.operations.map((o) => o.review ?? ''),
      r.res.operations.map(() => ''),
      'join без метки',
    );
    is(g, r.res.operations[0].smv, '', 'без SMV других join — пусто');
    is(g, r.res.operations[1].inputKeys, ['BP', K('BP_1')], 'первый шаг берёт ▣ BP');
  });

  // ── g4-merge: BP_U + BP_D → BP; поглощённая остаётся призраком ────────────────────────────
  // Выжившая — remapped; шаг поглощённой ссылается на призрак, а такой шаг всегда orphan (L4c).
  guard('g4-merge', () => {
    const g = 'g4-merge';
    const r = runCase(M, { old: S.g4split, neu: S.g4merge });
    invariants(g, r);
    manifestTiers(g, r.plan, manifests[g]);
    const ghost = r.res.ghostPieceKeys[0];
    const alive = [K('BP_D'), K('BP_U')].find((k) => k !== ghost);
    is(g, markOf(r), sorted({ [alive]: 'remapped', [ghost]: 'orphan' }), 'метки');
    const row = rowBy(r.plan, 'BP_U');
    is(g, row.old.map((o) => o.fate).sort(), ['ghost', 'keep'], 'судьбы: выжившая и призрак');
    is(
      g,
      r.res.renamed.map((x) => x.to),
      ['BP'],
      'выжившая получила имя блока',
    );
    is(g, r.res.ghostPieceKeys.length, 1, 'один призрак');
  });

  // ── g-units: весь лист ×10 → одна гипотеза единиц, всё unchanged ──────────────────────────
  guard('g-units', () => {
    const g = 'g-units';
    const r = runCase(M, { old: S.base, neu: S.gUnits });
    invariants(g, r);
    manifestTiers(g, r.plan, manifests[g]);
    is(g, r.plan.summary.scale, 10, 'множитель единиц');
    is(g, r.res.reviews, [], 'метки');
  });

  // ── g-sizetail: «PCK_INS_S» одноразмерного листа ↔ «PCK_INS» XS…XL — молча ───────────────
  guard('g-sizetail', () => {
    const g = 'g-sizetail';
    const r = runCase(M, { old: S.card8pocketing, neu: S.gSizetail });
    invariants(g, r);
    manifestTiers(g, r.plan, manifests[g]);
    is(g, r.res.reviews, [], 'метки');
    is(
      g,
      r.plan.rows.map((x) => x.confidence),
      r.plan.rows.map(() => 'high'),
      'уверенность',
    );
    is(
      g,
      r.res.renamed.map((x) => x.to).sort(),
      manifests[g].tiers.map((t) => t.new).sort(),
      'имена за блоками',
    );
  });

  // ── g-pair-LR: FP_L + FP_R → FP ×2 зеркально ──────────────────────────────────────────────
  guard('g-pair-LR', () => {
    const g = 'g-pair-LR';
    // (а) одна деталь на оба блока (веер, как карта 60) — ни метки, ни призрака
    const a = runCase(M, {
      old: S.pairLR,
      neu: S.gPairLR,
      spec: { fan: { FP: ['FP_L', 'FP_R'] } },
    });
    invariants(`${g} веер`, a);
    manifestTiers(g, a.plan, manifests[g]);
    is(g, a.res.reviews, [], 'веер: метки');
    const fp = a.res.pieces.find((p) => p.lineKey === K('FP'));
    is(g, [fp?.piecesPerGarment, fp?.cutSymmetry], [2, M.MIRRORED], 'веер: FP ×2 зеркально');
    // (б) две детали, на FP_R ссылок нет — FP_R удаляется молча, FP_L → FP ×2
    const b = runCase(M, { old: S.pairLR, neu: S.gPairLR, spec: { inputs: ['BP', 'FP_L'] } });
    invariants(`${g} две детали`, b);
    manifestTiers(g, b.plan, manifests[g]);
    is(g, b.res.reviews, [], 'две детали: метки');
    is(g, b.res.removedPieceKeys, [K('FP_R')], 'две детали: FP_R удалена');
    const fl = b.res.pieces.find((p) => p.lineKey === K('FP_L'));
    is(
      g,
      [fl?.name, fl?.piecesPerGarment, fl?.cutSymmetry],
      ['FP', 2, M.MIRRORED],
      'две детали: FP_L → FP ×2 зеркально',
    );
    // (в) на FP_R есть шаг — призрак (его вход теперь внутри FP ×2); шаг со ссылкой на призрак —
    // orphan (L4c), а не remapped: remapped снимался первой правкой при призраке в шаге
    const c = runCase(M, { old: S.pairLR, neu: S.gPairLR });
    invariants(`${g} FP_R в шаге`, c);
    is(g, markOf(c), { [K('FP_R')]: 'orphan' }, 'FP_R в шаге: метка');
    is(g, c.res.ghostPieceKeys, [K('FP_R')], 'FP_R в шаге: призрак');
    // (г) реальная зеркальная пара (allsizes-merged: FP_R = зеркало FP_L): FP_L → FP, FP_R пропала
    let neu = renameIdentity(M, S.base, 'FP_L', 'FP');
    neu = dropIdentity(M, neu, 'FP_R');
    const inputs = ['BP', 'BP_1', 'BP_2', 'CLR_3', 'CLR_4', 'FP_L', 'SL_L', 'SL_R'];
    const d = runCase(M, { old: S.base, neu, spec: { inputs } });
    invariants(`${g} зеркальная пара`, d);
    const fd = d.res.pieces.find((p) => p.lineKey === K('FP_L'));
    is(
      g,
      [rowBy(d.plan, 'FP_L')?.tier, fd?.name, fd?.piecesPerGarment, fd?.cutSymmetry, d.res.reviews],
      ['merged', 'FP', 2, M.MIRRORED, []],
      'зеркальная пара FP_L/FP_R → FP ×2',
    );
  });

  // ── L5 seam-aware reshape: a good seam is automatic; a broken seam marks only its join ───
  guard('seam-reshape', () => {
    const g = 'seam-reshape';
    const only = (identity) => {
      const take = blocksOf(M, S.base, identity);
      const pieces = S.base.pieces.filter(take);
      return { pieces, blockNames: [...new Set(pieces.map((p) => p.blockName))] };
    };
    const source = only('BP_2');
    const renameSource = (to) => ({
      pieces: source.pieces.map((p) => ({
        ...p,
        blockName: to + (p.blockName ?? '').slice('BP_2'.length),
      })),
      blockNames: source.blockNames.map((b) => to + (b ?? '').slice('BP_2'.length)),
    });
    const left = renameSource('PAIR_L');
    const right = renameSource('PAIR_R');
    const old = withPieces(left, right.pieces);
    const neu = stretchX(M, old, 'PAIR_R', 1.04);
    const neuBoth = stretchX(M, stretchX(M, old, 'PAIR_L', 1.04), 'PAIR_R', 1.04);
    const card = M.cardFromSheet(old, { scope: MAIN, sizeTokens: SIZES });
    card.operations.unshift({
      title: 'prep R again',
      inputKeys: [K('PAIR_R')],
      outputUnitKey: '',
      outputUnitName: '',
    });

    let broken = null;
    for (let a = 0; a < 8 && !broken; a++)
      for (let b = 0; b < 8 && !broken; b++) {
        try {
          const seam = M.probeSeam(old, 'PAIR_L', 'PAIR_R', SIZES, a, b);
          const r = runCase(M, { old, neu, card, seams: [seam] });
          if (
            r.res.reviews.length === 1 &&
            r.res.reviews[0].opIndex === 1 &&
            r.res.reviews[0].review === 'reshaped'
          )
            broken = r;
        } catch {
          // This piece has fewer runs; the bounded search remains deterministic.
        }
      }
    yes(g, !!broken, 'broken seam marks only the step that joins its two sides');
    if (broken) {
      invariants(g, broken);
      is(g, broken.res.operations[0].review ?? '', '', 'other step with the piece is unmarked');
    }

    let quiet = null;
    for (let run = 0; run < 8 && !quiet; run++) {
      try {
        const seam = M.probeSeam(old, 'PAIR_L', 'PAIR_R', SIZES, run, run);
        const r = runCase(M, { old, neu: neuBoth, card, seams: [seam] });
        if (r.res.reviews.length === 0) quiet = r;
      } catch {
        // See above.
      }
    }
    yes(g, !!quiet, 'resolved matching seam accepts a material reshape without a mark');
  });

  // ── L5 fix 2: a broken seam whose sides meet only through a unit still leaves a mark ─────
  // Step 1 turns PAIR_L (+ PAIR_X) into ▣ U, step 2 joins U with PAIR_R: no step holds both seam
  // sides, so the seam resolves to no operation — the piece-wide reshape mark must stand instead.
  guard('seam-unit-fallback', () => {
    const g = 'seam-unit-fallback';
    const take = blocksOf(M, S.base, 'BP_2');
    const source = S.base.pieces.filter(take);
    const as = (to) => ({
      pieces: source.map((p) => ({ ...p, blockName: to + (p.blockName ?? '').slice(4) })),
      blockNames: [],
    });
    const old = withPieces(withPieces(as('PAIR_L'), as('PAIR_R').pieces), as('PAIR_X').pieces);
    const neu = stretchX(M, old, 'PAIR_R', 1.04);
    const direct = M.cardFromSheet(old, { scope: MAIN, sizeTokens: SIZES });
    direct.operations = [
      {
        title: 'L+R',
        inputKeys: [K('PAIR_L'), K('PAIR_R')],
        outputUnitKey: 'U',
        outputUnitName: 'U',
      },
      { title: 'U+X', inputKeys: ['U', K('PAIR_X')], outputUnitKey: 'V', outputUnitName: 'V' },
    ];
    const viaUnit = M.cardFromSheet(old, { scope: MAIN, sizeTokens: SIZES });
    viaUnit.operations = [
      {
        title: 'L+X',
        inputKeys: [K('PAIR_L'), K('PAIR_X')],
        outputUnitKey: 'U',
        outputUnitName: 'U',
      },
      { title: 'U+R', inputKeys: ['U', K('PAIR_R')], outputUnitKey: 'V', outputUnitName: 'V' },
    ];
    is(g, [M.sweepOf(direct).length, M.sweepOf(viaUnit).length], [0, 0], 'fixture cards assemble');
    let seam = null;
    for (let a = 0; a < 8 && !seam; a++)
      for (let b = 0; b < 8 && !seam; b++) {
        try {
          const s = M.probeSeam(old, 'PAIR_L', 'PAIR_R', SIZES, a, b);
          const r = runCase(M, { old, neu, card: direct, seams: [s] });
          if (r.res.reviews.length === 1 && r.res.reviews[0].opIndex === 0) seam = s;
        } catch {
          // fewer runs on this piece; the bounded search stays deterministic
        }
      }
    yes(g, !!seam, 'fixture: a seam that breaks when its sides are joined directly');
    if (!seam) return;
    const r = runCase(M, { old, neu, card: viaUnit, seams: [seam] });
    invariants(g, r);
    is(
      g,
      r.res.operations.map((o) => o.review ?? ''),
      ['', 'reshaped'],
      'the step that uses the reshaped piece is marked, never silently dropped',
    );
  });

  // ── L5 fix 3: two equally good split pairs — the split keeps its mark ─────────────────────
  guard('split-ambiguous', () => {
    const g = 'split-ambiguous';
    const isU = blocksOf(M, S.g4split, 'BP_U');
    const twin = S.g4split.pieces
      .filter(isU)
      .map((p) => ({ ...p, blockName: 'BP_V' + (p.blockName ?? '').slice(4) }));
    const neu = withPieces(S.g4split, twin);
    const r = runCase(M, {
      old: S.base,
      neu,
      spec: { overrides: { BP: { piecesPerGarment: 2, cutSymmetry: M.MIRRORED } } },
    });
    invariants(g, r);
    is(g, rowBy(r.plan, 'BP')?.tier, 'split', 'still a split');
    is(
      g,
      r.res.joins.map((j) => r.res.operations[j.opIndex]?.review ?? ''),
      ['split'],
      'ambiguous split join is marked',
    );
  });

  // ── L5 no-seam fallback: area + perimeter ≤2% is automatic, larger drift is marked ───────
  guard('auto-accept-reshape', () => {
    const g = 'auto-accept-reshape';
    const small = runCase(M, { old: S.base, neu: stretchX(M, S.base, 'BP_2', 1.01) });
    invariants(`${g} small`, small);
    is(g, markOf(small)[K('BP_2')] ?? '', '', '1% reshape automatic');
    const large = runCase(M, { old: S.base, neu: stretchX(M, S.base, 'BP_2', 1.04) });
    invariants(`${g} large`, large);
    is(g, markOf(large)[K('BP_2')], 'reshaped', '4% reshape marked');
  });

  // ── L5 ghost: one unmatched upload-only block with a clear lead reuses the ghost row ──────
  guard('ghost-auto-replace', () => {
    const g = 'ghost-auto-replace';
    const isBp2 = blocksOf(M, S.base, 'BP_2');
    const mids = S.base.pieces.filter(isBp2);
    const mid = mids.find((p) => /_M$/i.test(p.blockName ?? '')) ?? mids[0];
    const keep = S.base.pieces.filter((p) => !isBp2(p));
    let chosen = null;
    for (const k of [1.01, 1.02, 1.03, 1.04, 1.05, 1.06]) {
      const p = stretchX(
        M,
        { pieces: [{ ...mid, blockName: 'BP_AUTO' }], blockNames: ['BP_AUTO'] },
        'BP_AUTO',
        k,
      ).pieces[0];
      const neu = withPieces(
        { pieces: keep, blockNames: [...new Set(keep.map((x) => x.blockName))] },
        [p],
      );
      const r = runCase(M, { old: S.base, neu });
      const row = rowBy(r.plan, 'BP_2');
      if (
        row?.tier === 'renamed' &&
        (row.candidates[0]?.cost ?? Infinity) <= M.THRESH.renameMaxNoCommonSize &&
        r.res.ghostPieceKeys.length === 0 &&
        r.res.addedPieceKeys.length === 0 &&
        r.res.reviews.length === 0
      ) {
        chosen = r;
        break;
      }
    }
    yes(g, !!chosen, 'clear upload-only candidate auto-replaces the ghost');
    if (chosen) {
      invariants(g, chosen);
      is(
        g,
        chosen.res.renamed.some((x) => x.pieceLineKey === K('BP_2') && x.to === 'BP_AUTO'),
        true,
        'ghost row renamed to the new block',
      );
    }
  });

  // ── L5 mirror pair: a new opposite-hand block joins every step of its proven mate ─────────
  guard('mirror-pair-place', () => {
    const g = 'mirror-pair-place';
    const old = dropIdentity(M, S.base, 'FP_R');
    const r = runCase(M, { old, neu: S.base });
    invariants(g, r);
    const added = r.res.addedPieceKeys[0];
    is(g, [r.res.addedPieceKeys.length, r.res.reviews.length], [1, 0], 'one pair, no mark');
    const mateStep = r.res.operations.find((o) => (o.inputKeys ?? []).includes(K('FP_L')));
    yes(
      g,
      !!mateStep && (mateStep.inputKeys ?? []).includes(added),
      'new mirror is in the mate step',
    );
    is(g, M.sweepOf(r.res), [], 'pair placement keeps assembly valid');
  });

  // ── две одинаковые формы: переименованный блок узнаётся по месту на листе ────────────────
  guard('twin-shapes', () => {
    const g = 'twin-shapes';
    // CLR_3 получает контуры CLR_4 (каждый размер), но остаётся на своём месте листа
    const twin = (sheet) => {
      const by = new Map(
        sheet.pieces
          .filter((p) => /^CLR_4_/i.test(p.blockName ?? ''))
          .map((p) => [`${p.blockName.slice(6)}|${p.layer}`, p]),
      );
      return {
        pieces: sheet.pieces.map((p) => {
          const src =
            /^CLR_3_/i.test(p.blockName ?? '') && by.get(`${p.blockName.slice(6)}|${p.layer}`);
          return src
            ? {
                ...p,
                poly: src.poly,
                inner: src.inner,
                areaCm2: src.areaCm2,
                bboxW: src.bboxW,
                bboxH: src.bboxH,
              }
            : p;
        }),
        blockNames: sheet.blockNames,
      };
    };
    const old = twin(S.base);
    // Один близнец переименован — второй сошёлся по имени, сомнения нет.
    const one = runCase(M, { old, neu: renameIdentity(M, old, 'CLR_4', 'COLLAR_UNDER') });
    invariants(`${g} один`, one);
    is(
      g,
      [
        rowBy(one.plan, 'CLR_4')?.new[0]?.identity,
        rowBy(one.plan, 'CLR_4')?.confidence,
        one.res.reviews,
      ],
      ['COLLAR_UNDER', 'high', []],
      'один близнец: уверенно, без метки',
    );
    // Оба переименованы, и алфавит против места: CLR_3 → COLLAR_B, CLR_4 → COLLAR_A.
    let both = renameIdentity(M, old, 'CLR_3', 'COLLAR_B');
    both = renameIdentity(M, both, 'CLR_4', 'COLLAR_A');
    const r = runCase(M, { old, neu: both });
    invariants(`${g} оба`, r);
    is(
      g,
      [rowBy(r.plan, 'CLR_3')?.new[0]?.identity, rowBy(r.plan, 'CLR_4')?.new[0]?.identity],
      ['COLLAR_B', 'COLLAR_A'],
      'каждый близнец — к блоку на своём месте',
    );
    is(
      g,
      [rowBy(r.plan, 'CLR_3')?.confidence, rowBy(r.plan, 'CLR_4')?.confidence],
      ['medium', 'medium'],
      'уверенность близнецов',
    );
    is(
      g,
      markOf(r),
      { [K('CLR_3')]: 'remapped', [K('CLR_4')]: 'remapped' },
      'метки remapped на обоих',
    );
  });

  // ── noop: те же sha → план noop, применение отказано, строки как были ─────────────────────
  guard('noop', () => {
    const g = 'noop';
    const sha = manifests['g-same'].sha256;
    const r = runCase(M, { old: S.base, neu: S.gSame, oldSha: sha, newSha: sha });
    is(g, [r.plan.status, r.plan.rows.length], ['noop', 0], 'план');
    invariants(g, r, { refused: 'noop' });
    is(g, r.res.refused, { reason: 'noop' }, 'отказ');
    const other = runCase(M, {
      old: S.base,
      neu: S.gSame,
      oldSha: sha,
      newSha: 'x' + sha.slice(1),
    });
    is(g, other.plan.status, 'ready', 'другой sha — не noop');
  });

  // ── детерминизм: перестановка деталей, алиасов, контуров и имён блоков ────────────────────
  guard('determinism', () => {
    const g = 'determinism';
    const canon = (r) =>
      JSON.stringify({
        plan: r.plan,
        pieces: [...r.res.pieces].sort((x, y) => (x.lineKey < y.lineKey ? -1 : 1)),
        aliases: r.res.aliases
          .map((a) => `${a.fabricPurpose}|${a.blockName}|${a.pieceLineKey}`)
          .sort(),
        reviews: r.res.reviews,
        note: r.res.revisionNote,
      });
    const cases = [
      ['g-combo', S.base, S.gCombo, {}],
      ['g4-split', S.base, S.g4split, {}],
      ['g4-merge', S.g4split, S.g4merge, {}],
      ['g-pair-LR', S.pairLR, S.gPairLR, {}],
      ['card8-MAIN', S.card8main, renameIdentity(M, S.card8main, 'CLR_MAIN', 'COLLAR'), {}],
    ];
    for (const [name, old, neu, spec] of cases) {
      const base = runCase(M, { old, neu, spec });
      const want = canon(base);
      for (const seed of [1, 7, 42]) {
        const perm = (p) => ({
          pieces: shuffle(p.pieces, seed),
          blockNames: shuffle(p.blockNames, seed + 1),
        });
        const card = M.cardFromSheet(old, { scope: MAIN, sizeTokens: SIZES, ...spec });
        const r = runCase(M, {
          old: perm(old),
          neu: perm(neu),
          card: {
            ...card,
            pieces: shuffle(card.pieces, seed + 2),
            aliases: shuffle(card.aliases, seed + 3),
          },
        });
        if (canon(r) !== want)
          fail(g, `${name}: перестановка seed ${seed} меняет план или применение`);
      }
    }
  });

  // ── шум экспорта: начало обхода, лишние вершины, обратный обход, зеркало → unchanged ──────
  guard('noise', () => {
    const g = 'noise';
    for (const kind of Object.keys(NOISE)) {
      const r = runCase(M, { old: S.base, neu: noisy(S.base, kind) });
      invariants(`noise ${kind}`, r);
      const off = r.plan.rows
        .filter((x) => x.tier !== 'unchanged')
        .map((x) => `${x.id}:${x.tier}:${x.delta?.cost?.toFixed(4)}`);
      is(g, off, [], `${kind}: не unchanged`);
      is(g, r.res.reviews, [], `${kind}: метки`);
    }
  });

  // ── реальный корпус: карта 8 (MAIN, LINING), карта 11 и мутированные копии ────────────────
  guard('corpus', () => {
    const g = 'corpus';
    for (const [name, sheet] of [
      ['card8-MAIN', S.card8main],
      ['card8-LINING', S.card8lining],
      ['card11-MAIN', S.card11main],
    ]) {
      const r = runCase(M, { old: sheet, neu: sheet });
      invariants(`${name} сам с собой`, r);
      is(
        g,
        r.plan.rows.filter((x) => x.tier !== 'unchanged').map((x) => x.id),
        [],
        `${name} сам с собой`,
      );
    }
    // переименование, пропажа одной стороны пары, перекрой ×1.10 — в одной заливке
    let neu = renameIdentity(M, S.card8main, 'CLR_MAIN', 'COLLAR');
    neu = dropIdentity(M, neu, 'SL_OUT_R');
    neu = stretchX(M, neu, 'MP_L', 1.1);
    const r = runCase(M, { old: S.card8main, neu });
    invariants('card8-MAIN мутант', r);
    const t = (id) => rowBy(r.plan, id)?.tier;
    is(
      g,
      [t('CLR_MAIN'), t('SL_OUT_R'), t('MP_L'), t('SL_OUT_L')],
      ['renamed', 'removed', 'reshaped', 'unchanged'],
      'ярусы мутанта',
    );
    is(
      g,
      markOf(r),
      { [K('MP_L')]: 'reshaped', [K('SL_OUT_R')]: 'orphan' },
      'метки мутанта (SL_OUT_R: сторона жива у SL_OUT_L — не пара)',
    );
    is(
      g,
      r.res.renamed.map((x) => `${x.from}>${x.to}`),
      ['CLR_MAIN>COLLAR'],
      'переименование',
    );
    // пара свёрнута листом: BP_L → BP, BP_R пропала — одна деталь ×2 зеркально
    let pair = renameIdentity(M, S.card8main, 'BP_L', 'BP');
    pair = dropIdentity(M, pair, 'BP_R');
    const p = runCase(M, { old: S.card8main, neu: pair, spec: { inputs: ['BP_L', 'CLR_MAIN'] } });
    invariants('card8-MAIN пара', p);
    const bp = p.res.pieces.find((x) => x.lineKey === K('BP_L'));
    is(
      g,
      [rowBy(p.plan, 'BP_L')?.tier, bp?.name, bp?.piecesPerGarment, bp?.cutSymmetry],
      ['merged', 'BP', 2, M.MIRRORED],
      'пара BP_L/BP_R → BP ×2',
    );
    is(g, p.res.removedPieceKeys, [K('BP_R')], 'BP_R без ссылок удалена');
  });

  // ── аннотация — тоже ссылка: деталь только в аннотации остаётся призраком ─────────────────
  guard('ghost-by-annotation', () => {
    const g = 'ghost-by-annotation';
    const inputs = ['BP', 'BP_1', 'BP_2', 'CLR_4', 'FP_L', 'FP_R', 'SL_L', 'SL_R'];
    const r = runCase(M, { old: S.base, neu: S.gCombo, spec: { inputs, annotate: ['CLR_3'] } });
    invariants(g, r);
    is(g, r.res.ghostPieceKeys, [K('CLR_3')], 'CLR_3 — призрак');
    const last = r.res.reviews.find((x) => x.opIndex === r.input.operations.length - 1);
    is(
      g,
      last && [last.review, last.pieceKeys],
      ['orphan', [K('CLR_3')]],
      'шаг с аннотацией — orphan',
    );
  });

  // ── без ссылок — удаляется молча ──────────────────────────────────────────────────────────
  guard('delete-unreferenced', () => {
    const g = 'delete-unreferenced';
    const inputs = ['BP', 'BP_1', 'BP_2', 'CLR_4', 'FP_L', 'FP_R', 'SL_L', 'SL_R'];
    const r = runCase(M, { old: S.base, neu: S.gCombo, spec: { inputs } });
    invariants(g, r);
    is(
      g,
      [r.res.removedPieceKeys, r.res.ghostPieceKeys],
      [[K('CLR_3')], []],
      'CLR_3 удалена, призраков нет',
    );
    yes(g, !r.res.reviews.some((x) => x.review === 'orphan'), 'orphan без призрака');
    yes(g, !r.res.pieces.some((p) => p.lineKey === K('CLR_3')), 'CLR_3 нет среди деталей');
  });

  // ── деталь жива в другом scope → остаётся, только алиас этого scope снят ──────────────────
  guard('keep-other-scope', () => {
    const g = 'keep-other-scope';
    const r = runCase(M, {
      old: S.base,
      neu: S.gCombo,
      spec: { otherScope: [{ identity: 'CLR_3', scope: LINING }] },
    });
    invariants(g, r);
    is(
      g,
      rowBy(r.plan, 'CLR_3')?.old.map((o) => o.fate),
      ['keep'],
      'судьба CLR_3',
    );
    is(g, [r.res.ghostPieceKeys, r.res.removedPieceKeys], [[], []], 'ни призрака, ни удаления');
    yes(g, !markOf(r)[K('CLR_3')], 'на CLR_3 нет orphan');
    is(
      g,
      r.res.aliases.filter((a) => a.pieceLineKey === K('CLR_3')).map((a) => a.fabricPurpose),
      ['LINING'],
      'алиас LINING проехал, MAIN снят',
    );
  });

  // ── тяжелейшая метка: orphan > split > remapped > reshaped ───────────────────────────────
  guard('review-rank', () => {
    const g = 'review-rank';
    // последний шаг: вход FP_R (reshaped) + аннотация CLR_3 (orphan)
    const inputs = ['BP', 'BP_1', 'BP_2', 'CLR_3', 'CLR_4', 'FP_L', 'SL_L', 'SL_R', 'FP_R'];
    const r = runCase(M, { old: S.base, neu: S.gCombo, spec: { inputs, annotate: ['CLR_3'] } });
    invariants(g, r);
    const last = r.res.reviews.find((x) => x.opIndex === r.input.operations.length - 1);
    is(g, last && [last.review, last.pieceKeys], ['orphan', [K('CLR_3')]], 'шаг FP_R + CLR_3');
    is(g, r.res.operations.at(-1).review, 'orphan', 'setReview получил тяжелейшую');
    is(g, M.REVIEW_RANK, { orphan: 4, split: 3, remapped: 2, reshaped: 1 }, 'порядок меток');
    // без призрака в шаге: FP_R (reshaped) + выноска CLR_4 (remapped) → remapped
    const inputs2 = ['BP', 'BP_1', 'BP_2', 'CLR_3', 'CLR_4', 'FP_L', 'SL_L', 'SL_R', 'FP_R'];
    const r2 = runCase(M, {
      old: S.base,
      neu: S.gCombo,
      spec: { inputs: inputs2, annotate: ['CLR_4'] },
    });
    const last2 = r2.res.reviews.find((x) => x.opIndex === r2.input.operations.length - 1);
    is(g, last2 && last2.review, 'remapped', 'шаг FP_R + CLR_4');
  });

  // ── метки не слабеют: стоящая тяжелее остаётся, ссылка на призрак (и прошлый) — orphan ─────
  guard('marks-never-weaken', () => {
    const g = 'marks-never-weaken';
    const inputs = ['BP', 'BP_1', 'BP_2', 'CLR_3', 'CLR_4', 'FP_L', 'FP_R', 'SL_L', 'SL_R'];
    const card = M.cardFromSheet(S.base, {
      scope: MAIN,
      sizeTokens: SIZES,
      inputs,
      extra: ['GH'],
    });
    // GH — призрак прошлой заливки: без алиаса, шаг с ним уже orphan.
    card.aliases = card.aliases.filter((a) => a.pieceLineKey !== K('GH'));
    const ops = card.operations;
    ops[1].review = 'orphan'; // BP_2: план даст reshaped
    ops[4].inputKeys = [...ops[4].inputKeys, K('GH')];
    ops[4].review = 'orphan'; // прошлый призрак во входе
    ops[5].review = 'split'; // FP_R: план даст reshaped
    ops[6].media = [{ annotations: [{ pieceLineKey: K('GH') }] }]; // прошлый призрак в выноске
    ops[7].review = 'reshaped'; // SL_R: план не трогает
    yes(g, M.sweepOf(card).length === 0, 'фикстура чистая');
    const r = runCase(M, { old: S.base, neu: S.gCombo, card });
    invariants(g, r);
    is(
      g,
      r.res.operations.map((o) => o.review ?? ''),
      // BP_2 orphan>reshaped · CLR_3 призрак · CLR_4 remapped · FP_L прошлый призрак ·
      // FP_R split>reshaped · SL_L выноска на прошлый призрак · SL_R стоящая метка
      ['', 'orphan', 'orphan', 'remapped', 'orphan', 'split', 'orphan', 'reshaped'],
      'метки после заливки',
    );
    is(g, r.res.ghostPieceKeys, [K('CLR_3')], 'призрак этой заливки');
    // повторная заливка поверх результата: ни одна метка не ослабла
    const again = runCase(M, {
      old: S.gCombo,
      neu: S.base,
      card: { pieces: r.res.pieces, aliases: r.res.aliases, operations: r.res.operations },
    });
    yes(
      g,
      again.res.refused != null ||
        again.res.operations.every(
          (o, i) =>
            (M.REVIEW_RANK[o.review ?? ''] ?? 0) >=
            (M.REVIEW_RANK[r.res.operations[i]?.review ?? ''] ?? 0),
        ),
      'вторая заливка: метки не слабеют',
    );
  });

  // ── T7 moved: блок пришёл из листа другого scope — та же деталь, новая не заводится ───────
  guard('moved', () => {
    const g = 'moved';
    const lin = M.cardFromSheet(S.card8lining, { scope: LINING, sizeTokens: SIZES });
    const main = M.cardFromSheet(S.base, { scope: MAIN, sizeTokens: SIZES });
    const locker = S.card8lining.pieces.filter((p) =>
      ci(p.blockName ?? '').startsWith('pck_locker'),
    );
    yes(g, locker.length > 0, 'PCK_LOCKER в LINING');
    const neu = withPieces(S.base, locker);
    const card = {
      pieces: [...main.pieces, ...lin.pieces],
      aliases: [...main.aliases, ...lin.aliases],
      operations: main.operations,
    };
    const r = runCase(M, {
      old: S.base,
      neu,
      card,
      otherSheets: [{ scope: LINING, parse: S.card8lining }],
    });
    invariants(g, r);
    const row = r.plan.rows.find((x) => x.tier === 'moved');
    is(
      g,
      row?.links.map((l) => l.pieceLineKey),
      [K('PCK_LOCKER')],
      'связь с деталью LINING',
    );
    is(g, r.res.addedPieceKeys, [], 'новых деталей нет');
    is(
      g,
      r.res.aliases
        .filter((a) => a.pieceLineKey === K('PCK_LOCKER'))
        .map((a) => a.fabricPurpose)
        .sort(),
      ['LINING', 'MAIN'],
      'алиасы в обоих scope',
    );
    // Even before the other sheet is loaded, the live card piece name is a card-wide identity.
    const plain = runCase(M, { old: S.base, neu, card });
    is(g, plain.plan.summary.moved, 1, 'без otherSheets — reuse по имени детали');
    is(g, plain.res.addedPieceKeys, [], 'без otherSheets — новая деталь не заводится');
  });

  // ── сторож сборки: план, удаляющий деталь со ссылками, отказывается целиком ───────────────
  guard('sweep-guard', () => {
    const g = 'sweep-guard';
    const tamper = (plan) => {
      for (const r of plan.rows)
        for (const o of r.old) if (o.pieceLineKey === K('CLR_3')) o.fate = 'delete';
      return plan;
    };
    const r = runCase(M, { old: S.base, neu: S.gCombo, tamper });
    is(g, r.res.refused?.reason, 'sweep', 'отказ по сборке');
    yes(
      g,
      r.res.violations.some((v) => v.rule === 1 && v.key === K('CLR_3')),
      `нарушение названо: ${JSON.stringify(r.res.violations.map((v) => [v.rule, v.detail, v.key]))}`,
    );
    yes(
      g,
      r.res.pieces.length === r.input.pieces.length &&
        r.res.pieces.every((p, i) => p === r.input.pieces[i]),
      'детали как были',
    );
    yes(
      g,
      r.res.operations.every((o, i) => o === r.input.operations[i]),
      'шаги как были',
    );
    is(g, r.res.reviews, [], 'меток нет');
  });

  // ── разрез посреди цепочки: join встаёт ровно перед первым шагом с деталью ────────────────
  guard('split-join', () => {
    const g = 'split-join';
    const spec = {
      inputs: ['BP_1', 'BP_2', 'BP', 'CLR_3', 'CLR_4', 'FP_L', 'FP_R', 'SL_L', 'SL_R'],
      overrides: { BP: { piecesPerGarment: 2, cutSymmetry: M.MIRRORED } },
    };
    const card = M.cardFromSheet(S.base, { scope: MAIN, sizeTokens: SIZES, ...spec });
    // шаг 1 — обработка BP (без выхода, не поглощает), шаг 2 — джойн [U1, BP] с выноской на BP
    card.operations.splice(1, 0, {
      title: 'overlock BP',
      inputKeys: [K('BP')],
      outputUnitKey: '',
      outputUnitName: '',
    });
    for (const op of card.operations) if (op.outputUnitKey) op.smv = '2.4';
    card.operations[2].media = [{ annotations: [{ pieceLineKey: K('BP') }] }];
    yes(g, M.sweepOf(card).length === 0, 'фикстура чистая');
    const r = runCase(M, { old: S.base, neu: S.g4split, card });
    invariants(g, r);
    const part = r.res.addedPieceKeys[0];
    is(
      g,
      r.res.joins.map((j) => [j.opIndex, j.parentKey, j.partKeys, j.unitKey, j.unitName]),
      [[1, K('BP'), [part], 'BP', 'BP']],
      'join перед обработкой BP',
    );
    is(
      g,
      r.res.operations.map((o) => [o.title, o.inputKeys, o.review ?? '']),
      [
        ['join 1', [K('BP_1'), K('BP_2')], ''],
        ['join BP', [K('BP'), part], ''],
        ['overlock BP', ['BP'], ''],
        ['join 2', ['u1', 'BP'], ''],
        ...r.input.operations.slice(3).map((o) => [o.title, o.inputKeys, '']),
      ],
      'шаги после разреза',
    );
    is(g, r.res.operations[1].zoneOf, 'overlock BP', 'join знает шаг, перед которым встал');
    is(g, r.res.operations[1].smv, '2.4', 'join получил медиану SMV других join');
    is(
      g,
      r.res.operations[3].media,
      [{ annotations: [{ pieceLineKey: K('BP') }] }],
      'выноска осталась на детали',
    );
    is(g, r.res.reviews, [], 'чистый split без метки');
    is(
      g,
      r.res.pieces.find((p) => p.lineKey === K('BP'))?.name,
      rowBy(r.plan, 'BP')?.links.find((l) => l.pieceLineKey === K('BP'))?.identity,
      'деталь BP переименована за большей частью, узел держит старое имя',
    );

    // имя узла занято выходом другого шага → код с суффиксом
    const taken = structuredClone(card);
    taken.operations = taken.operations.map((o) =>
      o.outputUnitKey === 'u8' ? { ...o, outputUnitKey: 'BP' } : o,
    );
    const r2 = runCase(M, { old: S.base, neu: S.g4split, card: taken });
    is(
      g,
      r2.res.joins.map((j) => j.unitKey),
      ['BP-2'],
      'код узла уникален',
    );

    // старое нарушение ПОСЛЕ join (повтор входа в последнем шаге) — не новое, не отказ
    const dirty = structuredClone(card);
    const last = dirty.operations.at(-1);
    last.inputKeys = [...last.inputKeys, last.inputKeys.at(-1)];
    yes(g, M.sweepOf(dirty).length > 0, 'грязная фикстура грязная');
    const r3 = runCase(M, { old: S.base, neu: S.g4split, card: dirty });
    is(g, r3.res.refused?.reason ?? null, null, 'старое нарушение после join — не отказ');
    is(g, r3.res.joins.length, 1, 'join при старом нарушении');

    // BP ни в одном входе (только выноска) — join нет, меток нет, часть — новая деталь
    const loose = runCase(M, {
      old: S.base,
      neu: S.g4split,
      spec: {
        inputs: ['BP_1', 'BP_2', 'CLR_3', 'CLR_4', 'FP_L', 'FP_R', 'SL_L', 'SL_R'],
        annotate: ['BP'],
      },
    });
    invariants(`${g} без входа`, loose);
    is(
      g,
      [loose.res.joins.length, loose.res.reviews.length, loose.res.addedPieceKeys.length],
      [0, 0, 1],
      'без входа: join/метки/новые',
    );
  });

  // Фикстуры чистые — иначе сторож сборки ловил бы мусор пробы, а не сверку.
  for (const sheet of [S.base, S.g4split, S.pairLR, S.card8main]) {
    is(
      'apply-invariants',
      M.sweepOf(M.cardFromSheet(sheet, { scope: MAIN, sizeTokens: SIZES })).length,
      0,
      'фикстура карточки до сверки',
    );
  }

  return red;
}

// ─── main ────────────────────────────────────────────────────────────────────────────────────

const M0 = await bundle(null);
const data = await loadAll(M0);
const t0 = Date.now();
const base = gates(M0, data);
const ms = Date.now() - t0;
let bad = 0;
console.log(`\nгейты (${ms} мс)`);
for (const g of GATES) {
  const msgs = base.get(g);
  console.log(`${msgs.length ? 'FAIL' : 'ok  '}  ${g}`);
  for (const m of msgs.slice(0, 8)) console.log(`        ${m}`);
  if (msgs.length > 8) console.log(`        … ещё ${msgs.length - 8}`);
  if (msgs.length) bad++;
}

if (process.argv.includes('--mutants')) {
  console.log('\nмутанты');
  const killedBy = new Map(GATES.map((g) => [g, []]));
  for (const m of MUTANTS) {
    let red;
    try {
      const Mm = await bundle(m);
      red = gates(Mm, data);
    } catch (e) {
      console.log(`FAIL  ${m.id}: ${e.message}`);
      bad++;
      continue;
    }
    const reds = GATES.filter((g) => red.get(g).length > 0);
    for (const g of reds) killedBy.get(g).push(m.id);
    const missed = m.kills.filter((g) => !reds.includes(g));
    console.log(
      `${missed.length ? 'FAIL' : 'ok  '}  ${m.id.padEnd(24)} → красные: ${reds.join(', ') || '—'}${missed.length ? `   НЕ покраснели: ${missed.join(', ')}` : ''}`,
    );
    if (missed.length) bad++;
  }
  console.log('\nгейт → мутанты, под которыми он красный');
  for (const g of GATES) {
    const by = killedBy.get(g);
    console.log(
      `${by.length ? 'ok  ' : 'FAIL'}  ${g.padEnd(20)} ${by.join(', ') || 'НИ ОДИН мутант не покраснил'}`,
    );
    if (!by.length) bad++;
  }
}

console.log(bad ? `\n${bad} красных` : '\nвсё зелёное');
process.exit(bad ? 1 : 0);
