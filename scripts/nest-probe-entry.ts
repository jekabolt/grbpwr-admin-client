// Probe entry — bundled by scripts/nest-probe.mjs and run in node. See that file for why
// this exists at all: the engine has no test runner, and every promise it makes (gap,
// «влезло», determinism, budget) is only checkable against TRUE geometry.
//
// The measuring code below is DELIBERATELY not shared with the engine. The union of a
// region agreeing with its own Difference is exactly how the last round of overlap bugs
// stayed invisible; a probe that called place.ts's own clearance test would repeat that
// mistake one level up.
import type { NestConfig, NestResult, PieceDTO, Placement, Pt } from '../src/lib/nesting/types';
import { NEST_DEFAULTS } from '../src/lib/nesting/types';
import { parseSheets, type SheetBytes } from '../src/lib/nesting/worker/parse-files';
import { orientToGrain } from '../src/lib/nesting/geom/grain-orient';
import { applySeamAllowance } from '../src/lib/nesting/geom/seam-allowance';
import { nest } from '../src/lib/nesting/nest';
import { renderLayoutDxf } from '../src/lib/nesting/render/dxf';
import { renderLayoutSvg } from '../src/lib/nesting/render/svg';
import { NfpCache, type Flip, type PreparedPiece } from '../src/lib/nesting/nest/nfp';
import { gapOctagon } from '../src/lib/nesting/geom/convex';
import { NFP_SAFETY_CM } from '../src/lib/nesting/nest/nfp';
import { SCALE } from '../src/lib/nesting/geom/clipper';

export type ProbeInput = {
  sheets: SheetBytes[];
  grainLayer?: string;
  contourLayer?: string;
  // Instances per piece. 1 = one of each parsed piece.
  perPiece?: number;
  // Сколько из них ЗЕРКАЛЬНЫЕ (парные детали). Так реальный файл меряется в том режиме, ради
  // которого зеркало и заводилось: предпросчёт NFP растёт, и растёт он на настоящей геометрии,
  // а не на треугольниках.
  flippedPerPiece?: number;
  // Cap on distinct pieces (after layer filtering) — the size of the job.
  maxPieces?: number;
  config?: Partial<NestConfig>;
};

export type ProbeOutput = {
  parsed: number;
  used: number;
  instances: number;
  layers: { layer: string; blocks: number }[];
  result: NestResult;
  // Independent verification, computed here from the placed contours.
  minClearanceCm: number;
  overlaps: number;
  shortPairs: number;
  outsideWidth: number;
  blobHash: string;
  progress: { nfpDone: number; nfpTotal: number; lastGeneration: number };
};

// ── independent geometry (no engine imports) ───────────────────────────────────────────

function segDist2(px: number, py: number, ux: number, uy: number, vx: number, vy: number): number {
  const dx = vx - ux;
  const dy = vy - uy;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ux) * dx + (py - uy) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ux + t * dx;
  const qy = uy + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

function pointInPoly(poly: readonly Pt[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    if (yi > py !== yj > py) {
      const x = poly[i].x + ((py - yi) / (yj - yi)) * (poly[j].x - poly[i].x);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

// Distance between two placed contours, and whether they intersect at all. Brute force on
// purpose: it is O(n·m) per pair and the probe can afford what the placer cannot.
function pairMeasure(a: readonly Pt[], b: readonly Pt[]): { dist: number; overlap: boolean } {
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i];
    const p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const q1 = b[j];
      const q2 = b[(j + 1) % b.length];
      if (segmentsCross(p1.x, p1.y, p2.x, p2.y, q1.x, q1.y, q2.x, q2.y)) {
        return { dist: 0, overlap: true };
      }
      const d = Math.min(
        segDist2(p1.x, p1.y, q1.x, q1.y, q2.x, q2.y),
        segDist2(q1.x, q1.y, p1.x, p1.y, p2.x, p2.y),
      );
      if (d < best) best = d;
    }
  }
  // No crossing — one may still sit wholly inside the other.
  if (pointInPoly(b, a[0].x, a[0].y) || pointInPoly(a, b[0].x, b[0].y)) {
    return { dist: 0, overlap: true };
  }
  return { dist: Math.sqrt(best), overlap: false };
}

function rotate(poly: readonly Pt[], rot: number): Pt[] {
  switch (rot) {
    case 90:
      return poly.map((p) => ({ x: -p.y, y: p.x }));
    case 180:
      return poly.map((p) => ({ x: -p.x, y: -p.y }));
    case 270:
      return poly.map((p) => ({ x: p.y, y: -p.x }));
    default:
      return poly.map((p) => ({ ...p }));
  }
}

// Договор о размещении, ПЕРЕПИСАННЫЙ ЗДЕСЬ ОТ РУКИ: placed(p) = R(rot)·M^flipped·p + (x,y),
// M: (x,y) ↦ (−x,y) (см. types.ts). Звать placedPoly движка тут нельзя по той же причине, по
// которой вся проверка ниже не зовёт его геометрию: инструмент, согласный с измеряемым по
// построению, ничего не измеряет. Расхождение этих девяти строк с types.ts — это и есть то,
// что все зеркальные пробы обязаны ловить.
export function placeIndependently(poly: readonly Pt[], pl: Placement): Pt[] {
  const mirrored = pl.flipped ? poly.map((p) => ({ x: -p.x, y: p.y })) : poly;
  return rotate(mirrored, pl.rot).map((p) => ({ x: p.x + pl.x, y: p.y + pl.y }));
}

function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (((h2 >>> 0) * 4294967296 + (h1 >>> 0)) >>> 0).toString(16).padStart(8, '0');
}

// ── the run ────────────────────────────────────────────────────────────────────────────

// Verification of a finished layout against the TRUE contours, callable on any run — the
// synthetic probes need it as much as the real-file one. Keeping it here rather than inline
// in probe() is what stopped `yarn nest:probe` (which has no DXF to chew on) from asserting
// no geometry at all.
export function verifyPlacements(
  pieces: readonly PieceDTO[],
  result: NestResult,
  cfg: { gapCm: number; fabricWidthCm: number; edgeMarginCm: number },
): { minClearanceCm: number; overlaps: number; shortPairs: number; outsideWidth: number } {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  // ЗЕРКАЛО учитывается здесь так же обязательно, как поворот: проверять зеркальное размещение
  // по незеркальному контуру значит мерить не ту фигуру — и «зазор выдержан» стало бы отчётом о
  // раскладке, которой на ткани нет.
  const placed = result.placements.map((pl) => {
    const dto = byId.get(pl.pieceId)!;
    return placeIndependently(dto.poly, pl);
  });
  let minClearanceCm = Infinity;
  let overlaps = 0;
  let shortPairs = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const m = pairMeasure(placed[i], placed[j]);
      if (m.overlap) {
        overlaps++;
        minClearanceCm = 0;
        continue;
      }
      if (m.dist < minClearanceCm) minClearanceCm = m.dist;
      // 1e-6 slack: the placer works in integer units of 1/1000 cm.
      if (m.dist < cfg.gapCm - 1e-6) shortPairs++;
    }
  }
  let outsideWidth = 0;
  for (const p of placed) {
    for (const q of p) {
      if (q.y < cfg.edgeMarginCm - 1e-6 || q.y > cfg.fabricWidthCm - cfg.edgeMarginCm + 1e-6) {
        outsideWidth++;
        break;
      }
    }
  }
  return {
    minClearanceCm: minClearanceCm === Infinity ? -1 : minClearanceCm,
    overlaps,
    shortPairs,
    outsideWidth,
  };
}

export async function probe(input: ProbeInput): Promise<ProbeOutput> {
  const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
  const { pieces: parsed } = await parseSheets(input.sheets, opts);

  const byLayer = new Map<string, number>();
  for (const p of parsed) byLayer.set(p.layer ?? '', (byLayer.get(p.layer ?? '') ?? 0) + 1);
  const layers = [...byLayer.entries()]
    .map(([layer, blocks]) => ({ layer, blocks }))
    .sort((a, b) => b.blocks - a.blocks);

  // One contour per block: a block routinely carries the piece twice (sewing line and cut
  // line on different layers) and nesting both would measure a job nobody would run.
  const wantLayer = input.contourLayer ?? layers[0]?.layer ?? '';
  const seen = new Set<string>();
  const picked: PieceDTO[] = [];
  for (const p of parsed) {
    if ((p.layer ?? '') !== wantLayer) continue;
    const key = `${p.fileIndex}|${p.blockName || p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (input.maxPieces && picked.length >= input.maxPieces) break;
  }

  const grainLayer = input.grainLayer ?? '';
  const oriented = orientToGrain(picked, grainLayer).pieces;
  const seam = applySeamAllowance(oriented, input.config?.seamAllowanceCm ?? NEST_DEFAULTS.seamAllowanceCm);
  const pieces = seam.pieces;

  const perPiece = input.perPiece ?? 1;
  const flippedPerPiece = Math.min(input.flippedPerPiece ?? 0, perPiece);
  const config: NestConfig = {
    pieces: pieces.map((p) => ({
      pieceId: p.id,
      quantity: perPiece,
      flippedQuantity: flippedPerPiece,
    })),
    fabricWidthCm: NEST_DEFAULTS.fabricWidthCm,
    gapCm: NEST_DEFAULTS.gapCm,
    edgeMarginCm: NEST_DEFAULTS.edgeMarginCm,
    allowCrossGrain: NEST_DEFAULTS.allowCrossGrain,
    // The probe measures GEOMETRY, so it runs the loosest policy on purpose: 'any' is the
    // rotation set the engine has always searched, and pinning it here keeps a change in the
    // direction default from silently re-baselining every recorded number in this file.
    fabricDirection: 'any',
    grainLayer,
    seamAllowanceCm: NEST_DEFAULTS.seamAllowanceCm,
    timeBudgetMs: NEST_DEFAULTS.timeBudgetMs,
    rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    ...input.config,
  };

  const progress = { nfpDone: 0, nfpTotal: 0, lastGeneration: 0 };
  const result = await nest(pieces, config, () => false, (p) => {
    if (p.phase === 'nfp') {
      progress.nfpDone = p.nfpDone ?? progress.nfpDone;
      progress.nfpTotal = p.nfpTotal ?? progress.nfpTotal;
    } else {
      progress.lastGeneration = p.generation ?? progress.lastGeneration;
    }
  });

  // ── verification against the true contours the marker promises ──
  const { minClearanceCm, overlaps, shortPairs, outsideWidth } = verifyPlacements(
    pieces,
    result,
    config,
  );

  const blobHash = hash(
    JSON.stringify(
      result.placements.map((p) => [
        p.pieceId,
        p.instance,
        p.rot,
        p.flipped === true,
        Math.round(p.x * 1000),
        Math.round(p.y * 1000),
      ]),
    ),
  );

  return {
    parsed: parsed.length,
    used: pieces.length,
    instances: pieces.length * perPiece,
    layers,
    result,
    minClearanceCm: minClearanceCm === Infinity ? -1 : minClearanceCm,
    overlaps,
    shortPairs,
    outsideWidth,
    blobHash,
    progress,
  };
}

// A synthetic job with no DXF: `n` rectangles of the given size. Used for the «не влезло»
// probe, where the point is a piece that CANNOT fit the width in any allowed rotation.
export function syntheticPieces(specs: { w: number; h: number }[]): PieceDTO[] {
  return specs.map((s, i) => ({
    id: i + 1,
    name: `rect ${s.w}×${s.h}`,
    blockName: `R${i + 1}`,
    source: 'synthetic',
    fileIndex: 0,
    poly: [
      { x: 0, y: 0 },
      { x: s.w, y: 0 },
      { x: s.w, y: s.h },
      { x: 0, y: s.h },
    ],
    bboxW: s.w,
    bboxH: s.h,
    areaCm2: s.w * s.h,
  }));
}

// Детали из ПРОИЗВОЛЬНЫХ контуров — для зеркальных проб нужна ХИРАЛЬНАЯ фигура: у
// прямоугольника (syntheticPieces выше) зеркало совпадает с ним самим, и любая проверка
// зеркальности на нём проходит, ничего не проверив.
export function syntheticPolyPieces(specs: { name: string; poly: Pt[] }[]): PieceDTO[] {
  return specs.map((s, i) => {
    const xs = s.poly.map((p) => p.x);
    const ys = s.poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const poly = s.poly.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    let a2 = 0;
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k];
      const q = poly[(k + 1) % poly.length];
      a2 += p.x * q.y - q.x * p.y;
    }
    return {
      id: i + 1,
      name: s.name,
      blockName: `P${i + 1}`,
      source: 'synthetic',
      fileIndex: 0,
      // Движок ждёт CCW-контур (так его отдаёт разбор); отрицательную площадь разворачиваем.
      poly: a2 < 0 ? [...poly].reverse() : poly,
      bboxW: Math.max(...xs) - minX,
      bboxH: Math.max(...ys) - minY,
      areaCm2: Math.abs(a2) / 2,
    };
  });
}

// ── честный пересчёт NFP: медленный эталон для зеркального сокращения ──────────────────
//
// Движок НЕ пересчитывает NFP зеркальной пары там, где его можно получить отражением готового
// (nest/nfp.ts). Проверяется это единственным осмысленным способом: тем же NFP, посчитанным
// ЧЕСТНО — от уже преобразованных выпуклых частей, без единого тождества. Оболочка и сумма
// Минковского ниже написаны здесь заново; из движка берутся только ВХОДЫ, общие для обеих
// сторон (восьмиугольник зазора и масштаб) — они не то, что проверяется.
function hullOf(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function minkowski(a: readonly Pt[], b: readonly Pt[]): Pt[] {
  const sums: Pt[] = [];
  for (const p of a) for (const q of b) sums.push({ x: p.x + q.x, y: p.y + q.y });
  return hullOf(sums);
}

function variant(poly: readonly Pt[], rot: number, flip: Flip): Pt[] {
  return rotate(flip ? poly.map((p) => ({ x: -p.x, y: p.y })) : poly, rot);
}

// ПОДПИСЬ ВЫПУКЛОЙ ОБЛАСТИ — опорная функция h(u) = max по вершинам (v·u) на равномерном веере
// направлений. Два выпуклых множества совпадают тогда и только тогда, когда совпадают их
// опорные функции, поэтому подпись сравнивает ОБЛАСТИ, а не их записи: ей всё равно, с какой
// вершины начат обход, в какую сторону он идёт и сколько на границе лишних вершин на одной
// прямой. Последнее не придирка: восьмиугольник зазора строится через cos/sin, и его поворот на
// 90° совпадает с ним самим лишь до последнего бита мантиссы — этого хватает, чтобы вершина,
// ровно лежащая на ребре, то попадала в оболочку, то нет. Область при этом та же.
const SUPPORT_DIRS = 256;
function support(poly: readonly Pt[], scaled: boolean): number[] {
  const out = new Array<number>(SUPPORT_DIRS);
  for (let k = 0; k < SUPPORT_DIRS; k++) {
    const a = (2 * Math.PI * k) / SUPPORT_DIRS;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    let best = -Infinity;
    for (const p of poly) {
      const x = scaled ? p.x : p.x * SCALE;
      const y = scaled ? p.y : p.y * SCALE;
      const v = x * cx + y * cy;
      if (v > best) best = v;
    }
    out[k] = best;
  }
  return out;
}

function deviation(a: number[], b: number[]): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

function preparedFromParts(id: number, parts: Pt[][]): PreparedPiece {
  const mirror = parts.map((part) => part.map((p) => ({ x: -p.x, y: p.y })));
  const all = parts.flat();
  const bb = {
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
  // polyAt/boundsAt кэш NFP не читает вовсе (он живёт на parts0) — заполняем габаритной рамкой,
  // чтобы объект был честным по типу, и не притворяемся, что это контур детали.
  const box = [
    { x: bb.minX, y: bb.minY },
    { x: bb.maxX, y: bb.minY },
    { x: bb.maxX, y: bb.maxY },
    { x: bb.minX, y: bb.maxY },
  ];
  const at = (flip: Flip) => {
    const polyAt = {} as PreparedPiece['polyAt'][0];
    const boundsAt = {} as PreparedPiece['boundsAt'][0];
    for (const r of [0, 90, 180, 270] as const) {
      const v = variant(box, r, flip);
      polyAt[r] = v;
      boundsAt[r] = {
        minX: Math.min(...v.map((p) => p.x)),
        minY: Math.min(...v.map((p) => p.y)),
        maxX: Math.max(...v.map((p) => p.x)),
        maxY: Math.max(...v.map((p) => p.y)),
      };
    }
    return { polyAt, boundsAt };
  };
  const v0 = at(0);
  const v1 = at(1);
  return {
    id,
    polyAt: [v0.polyAt, v1.polyAt],
    boundsAt: [v0.boundsAt, v1.boundsAt],
    parts0: [parts, mirror],
    areaCm2: (bb.maxX - bb.minX) * (bb.maxY - bb.minY),
  };
}

export type NfpAuditResult = {
  cases: number;
  mismatched: number;
  worstDevUnits: number;
  // Первая расходящаяся комбинация, словами — чтобы отчёт назвал ветвь, а не «где-то не сошлось».
  firstBad: string;
};

// Прогон ВСЕХ комбинаций (порядок id × поворот A × поворот B × хиральность A × хиральность B):
// сокращение против честного пересчёта. Каждая ветвь get() — своя строка таблицы, и ни одна из
// них не проверяет себя собой.
export function nfpFlipAudit(opts: {
  aParts: Pt[][];
  bParts: Pt[][];
  gapCm: number;
  rots: number[];
}): NfpAuditResult {
  const gapOct = gapOctagon(opts.gapCm + NFP_SAFETY_CM);
  const out: NfpAuditResult = { cases: 0, mismatched: 0, worstDevUnits: 0, firstBad: '' };
  // Оба порядка id: у get() свои тождества на случай a.id > b.id, и они разные для одно- и
  // разнохиральной пары.
  for (const [idA, idB] of [
    [1, 2],
    [2, 1],
  ]) {
    const A = preparedFromParts(idA, opts.aParts);
    const B = preparedFromParts(idB, opts.bParts);
    const cache = new NfpCache(opts.gapCm);
    for (const fa of [0, 1] as Flip[]) {
      for (const fb of [0, 1] as Flip[]) {
        for (const ra of opts.rots) {
          for (const rb of opts.rots) {
            const shortcut = cache
              .get(A, { rot: ra as never, flip: fa }, B, { rot: rb as never, flip: fb })
              .parts.map((path) => support([...path], true));
            const honest: number[][] = [];
            for (const pa of opts.aParts) {
              for (const pb of opts.bParts) {
                const paT = variant(pa, ra, fa);
                const pbT = variant(pb, rb, fb);
                const hull = minkowski(
                  paT,
                  pbT.map((p) => ({ x: -p.x, y: -p.y })),
                );
                honest.push(support(minkowski(hull, gapOct), false));
              }
            }
            out.cases++;
            const used = new Set<number>();
            let worst = 0;
            for (const h of honest) {
              let best = Infinity;
              let bestIdx = -1;
              for (let i = 0; i < shortcut.length; i++) {
                if (used.has(i)) continue;
                const d = deviation(h, shortcut[i]);
                if (d < best) {
                  best = d;
                  bestIdx = i;
                }
              }
              if (bestIdx >= 0) used.add(bestIdx);
              worst = Math.max(worst, best);
            }
            if (honest.length !== shortcut.length) worst = Infinity;
            out.worstDevUnits = Math.max(out.worstDevUnits, Number.isFinite(worst) ? worst : 1e9);
            // Допуск 2 целых единицы = 0.2 мкм. Столько стоит округление: движок округляет к
            // целым единицам ДО отражения, эталон — ПОСЛЕ, а Math.round(−x) ≠ −Math.round(x)
            // ровно на половинках. Любая ошибка в тождествах даёт сдвиг на сантиметры.
            if (!(worst <= 2)) {
              out.mismatched++;
              if (!out.firstBad) {
                out.firstBad = `id ${idA}vs${idB} fa=${fa} ra=${ra} fb=${fb} rb=${rb}: частей ${shortcut.length}/${honest.length}, расхождение ${worst}`;
              }
            }
          }
        }
      }
    }
  }
  return out;
}

export { nest, NEST_DEFAULTS, renderLayoutDxf, renderLayoutSvg };
// Планировщик подписей — отдельно от отрисовок: DXF и SVG зовут ЕГО ЖЕ, поэтому их согласие
// друг с другом не заметило бы, что зеркало до него не доехало. Проба спрашивает его напрямую.
export { planLayoutLabels } from '../src/lib/nesting/render/label-fit';
export type { NestConfig, NestResult, PieceDTO };
