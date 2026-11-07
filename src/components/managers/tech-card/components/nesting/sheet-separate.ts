// Показ листа без налезаний (владелец, w1107 В4): в файле экспортёра деталь бывает положена на
// соседнюю (CLO кладёт повёрнутую деталь поверх соседки). Лист показывает файл «как нарисован»,
// и такая деталь читается как одна склеенная фигура — ни выбрать, ни сопоставить.
//
// Здесь — ТОЛЬКО показ: файл, его координаты и всё, что по ним считается (раскладка, площади,
// флизелин), не трогаются. Двигаем копию PieceDTO: начало детали и абсолютные концы долевой.
// Внутренняя геометрия и контур лежат в системе детали и едут сами.
//
// Правила:
// • крупные стоят на месте, мелкая уступает: раскладка листа остаётся узнаваемой;
// • деталь, почти целиком лежащая ВНУТРИ другой (форма флизелина, нарисованная на детали), —
//   не налезание, а намеренная подложка: она едет вместе с хозяином, не отдельно;
// • сдвиг — наименьший из четырёх сторон (вправо/влево/вверх/вниз), до первого положения без
//   пересечения контуров, плюс небольшой зазор, чтобы обводки не слипались.
import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import type { PieceDTO, Pt } from 'lib/nesting/types';

/** Integer grid for clipper: 1 unit = 0.01 mm. */
const SCALE = 1000;
/** A shared area below this (cm²) is the outlines touching, not overlapping. */
const TOUCH_CM2 = 0.05;
/** Share of a piece inside another for it to count as drawn ON it (an interlining shape). */
const CONTAINED = 0.9;
/** Clearance after a move, cm. */
const GAP_CM = 1;

type Placed = { piece: PieceDTO; dx: number; dy: number; path: Path64; area: number };

const worldPath = (p: PieceDTO, dx: number, dy: number): Path64 => {
  const path = new Path64();
  const ox = (p.originX ?? 0) + dx;
  const oy = (p.originY ?? 0) + dy;
  for (const q of p.poly)
    path.push(new Point64(Math.round((ox + q.x) * SCALE), Math.round((oy + q.y) * SCALE)));
  return path;
};

const one = (path: Path64): Paths64 => {
  const out = new Paths64();
  out.push(path);
  return out;
};

const areaCm2 = (paths: Paths64) => Math.abs(Clipper.areaPaths(paths)) / (SCALE * SCALE);

const shared = (a: Path64, b: Path64): number => {
  const out = Clipper.Intersect(one(a), one(b), FillRule.NonZero);
  return areaCm2(out);
};

type Bbox = { minX: number; minY: number; maxX: number; maxY: number };
const bboxOf = (p: PieceDTO, dx: number, dy: number): Bbox => {
  const minX = (p.originX ?? 0) + dx;
  const minY = (p.originY ?? 0) + dy;
  return { minX, minY, maxX: minX + p.bboxW, maxY: minY + p.bboxH };
};
const boxesCross = (a: Bbox, b: Bbox) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/** The pieces the shifted piece overlaps (more than touching), among those already placed. */
function clashes(p: PieceDTO, dx: number, dy: number, placed: readonly Placed[]): Placed[] {
  const box = bboxOf(p, dx, dy);
  let path: Path64 | null = null;
  const out: Placed[] = [];
  for (const q of placed) {
    if (!boxesCross(box, bboxOf(q.piece, q.dx, q.dy))) continue;
    path ??= worldPath(p, dx, dy);
    if (shared(path, q.path) > TOUCH_CM2) out.push(q);
  }
  return out;
}

const shiftPiece = (p: PieceDTO, dx: number, dy: number): PieceDTO => {
  if (dx === 0 && dy === 0) return p;
  const move = (q: Pt): Pt => ({ x: q.x + dx, y: q.y + dy });
  return {
    ...p,
    originX: (p.originX ?? 0) + dx,
    originY: (p.originY ?? 0) + dy,
    grain: p.grain?.map((g) => ({ ...g, a: move(g.a), b: move(g.b) })),
  };
};

/**
 * Display copies of `pieces` with no two outlines overlapping. Pieces without sheet coordinates
 * pass through untouched; so does every piece when nothing overlaps (same array back).
 */
export function separateForDisplay(pieces: readonly PieceDTO[]): readonly PieceDTO[] {
  const onSheet = pieces.filter((p) => p.originX != null && p.originY != null && p.poly.length > 2);
  if (onSheet.length < 2) return pieces;

  // Biggest first: they hold the drawing's layout; ties by position, so the result is stable.
  const order = [...onSheet].sort(
    (a, b) =>
      b.areaCm2 - a.areaCm2 ||
      (a.originY ?? 0) - (b.originY ?? 0) ||
      (a.originX ?? 0) - (b.originX ?? 0),
  );
  const placed: Placed[] = [];
  const offset = new Map<PieceDTO, { dx: number; dy: number }>();
  let moved = false;

  for (const p of order) {
    const own = Math.abs(p.areaCm2) || areaCm2(one(worldPath(p, 0, 0)));
    let dx = 0;
    let dy = 0;
    let hits = clashes(p, 0, 0, placed);
    // Drawn ON a bigger piece (an interlining shape over its piece): ride the host, never split.
    const host = hits.find((q) => own > 0 && shared(worldPath(p, 0, 0), q.path) / own >= CONTAINED);
    if (host) {
      dx = host.dx;
      dy = host.dy;
      offset.set(p, { dx, dy });
      if (dx || dy) moved = true;
      continue;
    }
    for (let guard = 0; hits.length > 0 && guard < 24; guard++) {
      const box = bboxOf(p, dx, dy);
      // Full clearance from every clashing piece along each side, then the least move that is
      // free of everything placed, found by halving between «still overlapping» and «clear».
      const sides: [number, number][] = [
        [Math.max(...hits.map((q) => bboxOf(q.piece, q.dx, q.dy).maxX)) - box.minX, 0],
        [Math.min(...hits.map((q) => bboxOf(q.piece, q.dx, q.dy).minX)) - box.maxX, 0],
        [0, Math.max(...hits.map((q) => bboxOf(q.piece, q.dx, q.dy).maxY)) - box.minY],
        [0, Math.min(...hits.map((q) => bboxOf(q.piece, q.dx, q.dy).minY)) - box.maxY],
      ];
      let best: { dx: number; dy: number; d: number } | null = null;
      for (const [sx, sy] of sides) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) / 2;
          if (clashes(p, dx + sx * mid, dy + sy * mid, placed).length) lo = mid;
          else hi = mid;
        }
        const len = Math.hypot(sx, sy) || 1;
        const cx = dx + sx * hi + (sx / len) * GAP_CM;
        const cy = dy + sy * hi + (sy / len) * GAP_CM;
        const d = Math.hypot(cx - dx, cy - dy);
        if ((!best || d < best.d) && clashes(p, cx, cy, placed).length === 0)
          best = { dx: cx, dy: cy, d };
      }
      if (best) {
        dx = best.dx;
        dy = best.dy;
        hits = [];
        break;
      }
      // No single side clears everything (boxed in): step out to the right of the clash and retry.
      dx += sides[0][0] + GAP_CM;
      hits = clashes(p, dx, dy, placed);
    }
    if (hits.length > 0) {
      // Still boxed in after the guard: right of the whole sheet, where nothing lies.
      const right = Math.max(...placed.map((q) => bboxOf(q.piece, q.dx, q.dy).maxX));
      dx = right + GAP_CM - (p.originX ?? 0);
    }
    if (dx || dy) moved = true;
    offset.set(p, { dx, dy });
    placed.push({ piece: p, dx, dy, path: worldPath(p, dx, dy), area: own });
  }

  if (!moved) return pieces;
  return pieces.map((p) => {
    const o = offset.get(p);
    return o ? shiftPiece(p, o.dx, o.dy) : p;
  });
}

/** Pairs of pieces whose outlines overlap (more than touching) — the check behind the viewer. */
export function overlappingPairs(pieces: readonly PieceDTO[]): [number, number][] {
  const onSheet = pieces.filter((p) => p.originX != null && p.originY != null && p.poly.length > 2);
  const paths = onSheet.map((p) => worldPath(p, 0, 0));
  const out: [number, number][] = [];
  for (let i = 0; i < onSheet.length; i++)
    for (let j = i + 1; j < onSheet.length; j++) {
      if (!boxesCross(bboxOf(onSheet[i], 0, 0), bboxOf(onSheet[j], 0, 0))) continue;
      if (shared(paths[i], paths[j]) > TOUCH_CM2) out.push([onSheet[i].id, onSheet[j].id]);
    }
  return out;
}
