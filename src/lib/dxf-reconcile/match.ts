// Матч блоков старого и нового листа: индекс листа, гипотеза единиц, пары по имени, по размерному
// хвосту и по форме, разрез/слияние по площадям.
//
// Идентичность блока — имя без размерного хвоста, выведенное из ФАЙЛА тем же splitPiecesBySize,
// что у вкладки деталей; контур — на слое кроя (defaultContourLayer), тот же, что рисует плитка.
// Всё, что зависит от порядка, упорядочено каноническим ключом (стоимость, место на листе, имя ci,
// имя как есть) — перестановка входа не меняет ни одного решения.
import { bareToken, normBlock } from 'components/managers/tech-card/components/nesting/block-code';
import {
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  splitPiecesBySize,
  type BlockSplit,
} from 'components/managers/tech-card/components/nesting/split-pieces';
import type { PieceDTO } from 'lib/nesting/types';

import { THRESH, UNIT_FACTORS, ciKey } from './defaults';
import { compareSigs, scaleSig, shapeSigOf, type SigCompare } from './shape-sig';
import type { Confidence, ParsedSheetLite } from './types';

type Pt2 = [number, number];

export type SheetEntry = {
  /** идентичность ci — ключ */
  key: string;
  /** идентичность в написании файла (первое в каноническом порядке) */
  identity: string;
  /** сырые имена блоков, ci-сортировка */
  blocks: string[];
  /** голый размер (bareToken) → выбранный контур */
  bySize: Map<string, PieceDTO>;
  /** голый размер → как написан в файле */
  sizeLabel: Map<string, string>;
  /** размеры в порядке градации файла */
  sizes: string[];
  /** максимум контуров одного размера в одном файле */
  instances: number;
  /** последний токен имени, если он размер из словаря (одноразмерный лист: «PCK_INS_S») */
  tail: string;
  /** имя без этого токена */
  stem: string;
  /** место срединного размера на листе, доли габарита листа */
  pos: Pt2 | null;
  /** файлы набора (PieceDTO.fileIndex, -1 без него), где есть блоки идентичности, по возрастанию */
  files: number[];
};

export type SheetIndex = {
  entries: Map<string, SheetEntry>;
  split: BlockSplit;
  layer: string;
};

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const byName = (a: string, b: string) =>
  cmpStr(a.toLowerCase(), b.toLowerCase()) || cmpStr(a, b);

/** Выбор контура среди копий одного размера: на слое кроя, большая площадь, затем место. */
function pickContour(list: PieceDTO[], layer: string): { piece: PieceDTO; drawn: PieceDTO[] } {
  const onLayer = list.filter((p) => (p.layer ?? '') === layer);
  const drawn = onLayer.length > 0 ? onLayer : list;
  const sorted = [...drawn].sort(
    (a, b) =>
      b.areaCm2 - a.areaCm2 ||
      (a.originX ?? 0) - (b.originX ?? 0) ||
      (a.originY ?? 0) - (b.originY ?? 0) ||
      byName(a.layer ?? '', b.layer ?? '') ||
      a.id - b.id,
  );
  return { piece: sorted[0], drawn };
}

const TAIL_RE = /^(.*?)[\s_.\-]+([^\s_.\-]+)$/u;

export function indexSheet(
  parse: ParsedSheetLite,
  dict: ReadonlySet<string>,
  preferLayer?: string,
): SheetIndex {
  const split = splitPiecesBySize(parse.pieces, dict);
  const options = layerOptions(parse.pieces, split.codeById);
  const layer =
    preferLayer && options.some((o) => o.layer === preferLayer)
      ? preferLayer
      : defaultContourLayer(options);

  // ci-идентичность → голый размер → копии
  const groups = new Map<
    string,
    {
      names: Set<string>;
      spell: Set<string>;
      bySize: Map<string, PieceDTO[]>;
      label: Map<string, string>;
      files: Set<number>;
    }
  >();
  for (const p of parse.pieces) {
    const code = split.codeById.get(p.id);
    const identity = normBlock(code?.identity ?? '');
    if (!identity) continue;
    const key = identity.toLowerCase();
    const g = groups.get(key) ?? {
      names: new Set(),
      spell: new Set(),
      bySize: new Map(),
      label: new Map(),
      files: new Set(),
    };
    groups.set(key, g);
    g.files.add(p.fileIndex ?? -1);
    g.names.add(normBlock(p.blockName ?? ''));
    g.spell.add(identity);
    const size = bareToken(code?.size ?? '');
    if (!g.label.has(size) || byName(code?.size ?? '', g.label.get(size)!) < 0)
      g.label.set(size, code?.size ?? '');
    const list = g.bySize.get(size) ?? [];
    list.push(p);
    g.bySize.set(size, list);
  }

  // Габарит листа по местам контуров — чтобы место детали сравнивалось между листами в долях.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of parse.pieces) {
    if (p.originX === undefined || p.originY === undefined) continue;
    minX = Math.min(minX, p.originX);
    minY = Math.min(minY, p.originY);
    maxX = Math.max(maxX, p.originX + p.bboxW);
    maxY = Math.max(maxY, p.originY + p.bboxH);
  }
  const spanX = maxX > minX ? maxX - minX : 1;
  const spanY = maxY > minY ? maxY - minY : 1;

  const entries = new Map<string, SheetEntry>();
  for (const [key, g] of groups) {
    const bySize = new Map<string, PieceDTO>();
    let instances = 0;
    for (const [size, list] of g.bySize) {
      const { piece, drawn } = pickContour(list, layer);
      bySize.set(size, piece);
      const perFile = new Map<number, number>();
      for (const p of drawn)
        perFile.set(p.fileIndex ?? -1, (perFile.get(p.fileIndex ?? -1) ?? 0) + 1);
      instances = Math.max(instances, ...perFile.values());
    }
    const sizes = [...bySize.keys()].sort(
      (a, b) =>
        (split.orderOfSize.get(g.label.get(a) ?? a) ?? 1e6) -
          (split.orderOfSize.get(g.label.get(b) ?? b) ?? 1e6) || byName(a, b),
    );
    const identity = [...g.spell].sort(byName)[0];
    const m = TAIL_RE.exec(identity);
    const tailTok = m ? bareToken(m[2]) : '';
    const tail = tailTok && dict.has(tailTok) ? tailTok : '';
    const mid = bySize.get(sizes[Math.floor((sizes.length - 1) / 2)]);
    const pos: Pt2 | null =
      mid && mid.originX !== undefined && mid.originY !== undefined
        ? [(mid.originX - minX) / spanX, (mid.originY - minY) / spanY]
        : null;
    entries.set(key, {
      key,
      identity,
      blocks: [...g.names].filter(Boolean).sort(byName),
      bySize,
      sizeLabel: g.label,
      sizes,
      instances: Math.max(1, instances),
      tail,
      stem: tail && m ? normBlock(m[1]) : '',
      pos,
      files: [...g.files].sort((a, b) => a - b),
    });
  }
  return { entries, split, layer };
}

// ─── сравнение двух идентичностей ─────────────────────────────────────────────────────────────

export type PairCmp = {
  /** худший размер (все общие размеры) или срединный (быстрый режим) */
  cmp: SigCompare;
  /** как нашёлся общий размер */
  mode: 'common' | 'tail' | 'median';
};

const median = <T>(xs: readonly T[]): T => xs[Math.floor((xs.length - 1) / 2)];

/**
 * Старый ↔ новый. `k` — множитель единиц нового к старому (новый делится на него). `all` — все
 * общие размеры, худший побеждает (ярус); иначе только срединный общий (матрица кандидатов).
 */
export function comparePair(o: SheetEntry, n: SheetEntry, k: number, all: boolean): PairCmp | null {
  const common = o.sizes.filter((s) => n.bySize.has(s));
  const sig = (p: PieceDTO, scaleNew: boolean) =>
    scaleNew ? scaleSig(shapeSigOf(p), 1 / k) : shapeSigOf(p);
  const label = (s: string) => n.sizeLabel.get(s) ?? o.sizeLabel.get(s) ?? s;
  if (common.length > 0) {
    const sizes = all ? common : [median(common)];
    let worst: SigCompare | null = null;
    for (const s of sizes) {
      const c = compareSigs(sig(o.bySize.get(s)!, false), sig(n.bySize.get(s)!, true), label(s));
      if (!worst || c.cost > worst.cost + 1e-12) worst = c;
    }
    return worst && { cmp: worst, mode: 'common' };
  }
  // Одноразмерный лист против градуированного: хвост имени и есть размер («PCK_INS_S» ↔ S).
  if (o.sizes.length === 1 && o.sizes[0] === '' && o.tail && n.bySize.has(o.tail)) {
    return {
      cmp: compareSigs(
        sig(o.bySize.get('')!, false),
        sig(n.bySize.get(o.tail)!, true),
        label(o.tail),
      ),
      mode: 'tail',
    };
  }
  if (n.sizes.length === 1 && n.sizes[0] === '' && n.tail && o.bySize.has(n.tail)) {
    return {
      cmp: compareSigs(
        sig(o.bySize.get(n.tail)!, false),
        sig(n.bySize.get('')!, true),
        label(n.tail),
      ),
      mode: 'tail',
    };
  }
  if (o.sizes.length === 0 || n.sizes.length === 0) return null;
  const os = median(o.sizes);
  const ns = median(n.sizes);
  return {
    cmp: compareSigs(sig(o.bySize.get(os)!, false), sig(n.bySize.get(ns)!, true), label(ns)),
    mode: 'median',
  };
}

// ─── гипотеза единиц ──────────────────────────────────────────────────────────────────────────

/**
 * Один множитель на весь лист (×10, ×25.4…): по одноимённым парам, на каждом общем размере
 * отношение √площадей. Множитель принимается, когда в его допуск легли не меньше двух третей
 * отношений (одна перекроенная деталь не отменяет гипотезу), иначе 1.
 */
export function unitsScale(pairs: readonly [SheetEntry, SheetEntry][]): number {
  const ratios: number[] = [];
  for (const [o, n] of pairs) {
    for (const s of o.sizes) {
      const pn = n.bySize.get(s);
      const po = o.bySize.get(s);
      if (!pn || !po || po.areaCm2 <= 0 || pn.areaCm2 <= 0) continue;
      ratios.push(Math.sqrt(shapeSigOf(pn).areaCm2 / shapeSigOf(po).areaCm2));
    }
  }
  if (ratios.length < 2) return 1;
  for (const f of UNIT_FACTORS) {
    const fit = ratios.filter((r) => Math.abs(r / f - 1) <= THRESH.unitsTol).length;
    if (fit >= 2 && fit * 3 >= ratios.length * 2) return f;
  }
  return 1;
}

// ─── матч по форме ────────────────────────────────────────────────────────────────────────────

export type ShapeCandidate = {
  o: string;
  n: string;
  cost: number;
  mode: PairCmp['mode'];
  pos: number;
};

export type ShapeMatch = {
  o: string;
  n: string;
  cost: number;
  confidence: Confidence;
  /** ближайшие новые блоки для старого, канонически */
  candidates: { identity: string; cost: number }[];
};

const posDist = (a: SheetEntry, b: SheetEntry) =>
  a.pos && b.pos ? Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) : 2;

/** Матрица кандидатов старый × новый (срединный общий размер). */
export function shapeMatrix(
  olds: readonly SheetEntry[],
  news: readonly SheetEntry[],
  k: number,
): ShapeCandidate[] {
  const out: ShapeCandidate[] = [];
  for (const o of olds) {
    for (const n of news) {
      const c = comparePair(o, n, k, false);
      if (!c) continue;
      out.push({ o: o.key, n: n.key, cost: c.cmp.cost, mode: c.mode, pos: posDist(o, n) });
    }
  }
  return out;
}

/**
 * Жадное назначение один к одному. Порядок: корзина стоимости (две одинаковые формы — CLR_3 и
 * CLR_4 — попадают в одну), затем место на листе (переименованный блок лежит там же, где лежал),
 * затем точная стоимость и имена. Уверенность: соперник (другой кандидат той же строки или
 * столбца) ближе, чем renameMargin, — 'medium'; стоимость выше renameSure — 'low'.
 */
export function assignByShape(matrix: readonly ShapeCandidate[]): ShapeMatch[] {
  const ok = matrix.filter(
    (c) => c.cost <= (c.mode === 'median' ? THRESH.renameMaxNoCommonSize : THRESH.renameMax),
  );
  const order = [...ok].sort(
    (a, b) =>
      Math.floor(a.cost / THRESH.tieBucket) - Math.floor(b.cost / THRESH.tieBucket) ||
      a.pos - b.pos ||
      a.cost - b.cost ||
      byName(a.o, b.o) ||
      byName(a.n, b.n),
  );
  const usedO = new Set<string>();
  const usedN = new Set<string>();
  const out: ShapeMatch[] = [];
  for (const c of order) {
    if (usedO.has(c.o) || usedN.has(c.n)) continue;
    usedO.add(c.o);
    usedN.add(c.n);
    const rival = Math.min(
      ...matrix.filter((x) => (x.o === c.o) !== (x.n === c.n)).map((x) => x.cost),
      Infinity,
    );
    const confidence: Confidence =
      c.cost > THRESH.renameSure ? 'low' : rival - c.cost < THRESH.renameMargin ? 'medium' : 'high';
    const candidates = matrix
      .filter((x) => x.o === c.o)
      .sort((a, b) => a.cost - b.cost || byName(a.n, b.n))
      .slice(0, 3)
      .map((x) => ({ identity: x.n, cost: x.cost }));
    out.push({ o: c.o, n: c.n, cost: c.cost, confidence, candidates });
  }
  return out;
}

// ─── разрез / слияние ─────────────────────────────────────────────────────────────────────────

const near = (a: number, b: number, tol: number) => (b > 0 ? Math.abs(a - b) / b <= tol : a <= 0);

/**
 * Складываются ли части в целое на каждом общем размере: сумма площадей ±splitArea и габарит —
 * части друг над другом (ширины ≈, высоты складываются) или рядом (наоборот), ±splitBox.
 * `kParts` — множитель единиц частей к целому (части делятся на него). Ошибка — худшая по площади.
 */
export function partsFit(
  whole: SheetEntry,
  parts: readonly SheetEntry[],
  kParts: number,
): number | null {
  const sizes = whole.sizes.filter((s) => parts.every((p) => p.bySize.has(s)));
  if (sizes.length === 0) return null;
  let worst = 0;
  for (const s of sizes) {
    const w = shapeSigOf(whole.bySize.get(s)!);
    const ps = parts.map((p) => scaleSig(shapeSigOf(p.bySize.get(s)!), 1 / kParts));
    const area = ps.reduce((acc, p) => acc + p.areaCm2, 0);
    const err = w.areaCm2 > 0 ? Math.abs(area - w.areaCm2) / w.areaCm2 : 1;
    if (err > THRESH.splitArea) return null;
    const stacked =
      ps.every((p) => near(p.w, w.w, THRESH.splitBox)) &&
      near(
        ps.reduce((acc, p) => acc + p.h, 0),
        w.h,
        THRESH.splitBox,
      );
    const sideBySide =
      ps.every((p) => near(p.h, w.h, THRESH.splitBox)) &&
      near(
        ps.reduce((acc, p) => acc + p.w, 0),
        w.w,
        THRESH.splitBox,
      );
    if (!stacked && !sideBySide) return null;
    worst = Math.max(worst, err);
  }
  return worst;
}

// ─── L/R-пара ─────────────────────────────────────────────────────────────────────────────────

const SIDE: Record<string, 'l' | 'r'> = { l: 'l', left: 'l', r: 'r', right: 'r' };

/** «FP_L» → { stem: 'fp', side: 'l' }; не пара — null. */
export function sideOf(identity: string): { stem: string; side: 'l' | 'r' } | null {
  const m = TAIL_RE.exec(identity.trim());
  if (!m) return null;
  const side = SIDE[bareToken(m[2])];
  return side ? { stem: ciKey(m[1]), side } : null;
}
