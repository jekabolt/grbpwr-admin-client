// Loops → pieces. Layer preference first (AAMA layer "1" = piece boundary), then the
// geometric workhorse: open loops are already gone, small loops (drills/notches) are
// dropped by area, the containment forest keeps only outermost contours (darts and
// internal lines die here — a piece is its outer contour, holes discarded on purpose),
// near-duplicate loops dedupe, and each surviving loop is Clipper-sanitized to a simple
// CCW polygon.
import type { Pt } from '../types';
import { MIN_PIECE_AREA_CM2 } from '../types';
import { area, bounds, ensureCCW, pointInPolygon, stripDegenerate } from '../geom/polygon';
import { sanitizeLoop } from '../geom/clipper';
import type { ClosedLoop } from './chain';
import type { EntityGroup, LayeredChain } from './transform';
import { chainLoops } from './chain';

// Долевая (grain line) в DXF — это отдельная НЕЗАМКНУТАЯ линия внутри блока, а не свойство
// контура. Какой слой её несёт, по одному блоку не понять (в реальном файле это слой 7, но на
// слое 8 лежат внутренние линии такой же формы и длиннее), поэтому парсер только собирает
// кандидатов, а выбор делается там, где виден весь файл.
export type GrainCandidate = {
  layer: string;
  // Угол оси в градусах CCW от +X, приведён к [0,180): у долевой нет направления, есть
  // направление ТКАНИ, а 0 и 180 движок и так разрешает обоим.
  angleDeg: number;
  lengthCm: number;
  // Сам отрезок в АБСОЛЮТНЫХ координатах чертежа — чтобы нарисовать его на листе там, где он
  // и лежит. Оператор должен видеть прочитанную долевую до того, как ткань разрезана: угол
  // числом ничего не проверяет, а линия поверх детали проверяет сразу.
  a: Pt;
  b: Pt;
};

export type RawPiece = {
  name: string;
  // The DXF block this piece came from, or null for the loose-entity pool. Kept SEPARATE from
  // `name` (which falls back to a placeholder label for display): downstream this is the key
  // cut-piece aliases match on, so it must never be a fallback string that a real block could
  // also spell.
  blockName: string | null;
  // The DXF layer this contour was drawn on. A block routinely carries the SAME piece twice —
  // the sewing line and the cutting line on different layers — and which of them is the piece
  // cannot be decided here: it takes seeing every size at once. Measured on a real graded file,
  // layer 1 held one ungraded contour repeated in all five size blocks while layer 14 graded
  // properly, so trusting layer 1 (as this did) made every size come out identical.
  layer: string;
  // Кандидаты в долевую из ЭТОГО блока. Одни и те же у всех контуров блока: долевая
  // принадлежит детали, а не тому, по какой линии её кроят.
  grain: GrainCandidate[];
  poly: Pt[]; // CCW, cm, absolute drawing coords (normalized later)
};

function keepOutermost(loops: ClosedLoop[]): { roots: ClosedLoop[]; dropped: number } {
  const bbs = loops.map((l) => bounds(l.pts));
  // Hoisted out of the O(n²) scan — area() itself is O(v), and a blockless file can carry
  // hundreds of loops with hundreds of vertices each.
  const areas = loops.map((l) => area(l.pts));
  const roots: ClosedLoop[] = [];
  let dropped = 0;
  for (let i = 0; i < loops.length; i++) {
    let contained = false;
    for (let j = 0; j < loops.length && !contained; j++) {
      if (i === j) continue;
      const bi = bbs[i];
      const bj = bbs[j];
      const bboxInside =
        bi.minX >= bj.minX - 1e-6 && bi.maxX <= bj.maxX + 1e-6 && bi.minY >= bj.minY - 1e-6 && bi.maxY <= bj.maxY + 1e-6;
      if (!bboxInside) continue;
      // Same bbox both ways = duplicate handled elsewhere; strict containment needs PIP.
      if (areas[i] >= areas[j]) continue;
      if (pointInPolygon(loops[i].pts[0], loops[j].pts)) contained = true;
    }
    if (contained) dropped++;
    else roots.push(loops[i]);
  }
  return { roots, dropped };
}

function dedupeLoops(loops: ClosedLoop[]): ClosedLoop[] {
  const out: ClosedLoop[] = [];
  const sigs: Array<{ a: number; b: ReturnType<typeof bounds> }> = [];
  for (const l of loops) {
    const a = area(l.pts);
    const bb = bounds(l.pts);
    const dup = sigs.some(
      (s) =>
        Math.abs(s.a - a) <= s.a * 0.005 &&
        Math.abs(s.b.minX - bb.minX) < 0.05 &&
        Math.abs(s.b.minY - bb.minY) < 0.05 &&
        Math.abs(s.b.maxX - bb.maxX) < 0.05 &&
        Math.abs(s.b.maxY - bb.maxY) < 0.05,
    );
    if (dup) continue;
    sigs.push({ a, b: bb });
    out.push(l);
  }
  return out;
}

// One group (block instance or the loose pool) → pieces.
export function groupToPieces(
  group: EntityGroup,
  tolChain: number,
  warnings: string[],
): RawPiece[] {
  const label = group.blockName ?? 'модель';

  // Кандидаты в долевую: прямые незамкнутые отрезки. Двухточечные — потому что долевую рисуют
  // одной линией; ломаная из восьми точек на том же слое (встречается на слое внутренних линий)
  // это уже не она.
  const grain: GrainCandidate[] = [];
  for (const c of group.chains) {
    if (c.closed || c.pts.length !== 2) continue;
    const dx = c.pts[1].x - c.pts[0].x;
    const dy = c.pts[1].y - c.pts[0].y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) continue; // засечка или мусор, не долевая
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    // Ось, а не вектор: −30° и 150° — одна и та же долевая.
    angleDeg = ((angleDeg % 180) + 180) % 180;
    grain.push({ layer: c.layer, angleDeg, lengthCm, a: c.pts[0], b: c.pts[1] });
  }

  // Chained PER LAYER, not with layer 1 winning outright. Two reasons. A contour belongs to one
  // layer, so joining open chains ACROSS layers can only invent geometry that is in no file. And
  // the old preference silently answered a question it had no business answering: it returned the
  // layer-1 contour and threw the rest away, so a file whose layer 1 is not graded (a real one:
  // layer 1 identical in all five size blocks, layer 14 grading correctly) reported every size as
  // the same piece. Emitting one candidate PER LAYER moves that choice to where all the sizes are
  // visible at once.
  //
  // Fallback for files that split one contour across layers: chain everything together, which is
  // what the old code did whenever layer 1 was absent.
  const byLayer = new Map<string, LayeredChain[]>();
  for (const c of group.chains) {
    const list = byLayer.get(c.layer) ?? [];
    list.push(c);
    byLayer.set(c.layer, list);
  }
  let perLayer: ClosedLoop[][] = [];
  for (const chains of byLayer.values()) {
    const loops = chainLoops(chains, tolChain, []).loops;
    if (loops.length > 0) perLayer.push(loops);
  }
  if (perLayer.length === 0) {
    const all = chainLoops(group.chains, tolChain, warnings).loops;
    if (all.length > 0) perLayer = [all];
  }

  const pieces: RawPiece[] = [];
  let small = 0;
  for (const group0 of perLayer) {
    // Area floor: drills, notches, buttonholes.
    const before = group0.length;
    let loops = group0.filter((l) => area(l.pts) >= MIN_PIECE_AREA_CM2);
    small += before - loops.length;

    // Deduped and nested-filtered WITHIN the layer. Across layers both are wrong now: the sewing
    // line sits inside the cutting line, so a cross-layer keepOutermost would drop exactly the
    // graded contour this exists to keep, and a cross-layer dedupe would erase whichever of the
    // two happened to coincide on one size — making that piece vanish for one layer only.
    loops = dedupeLoops(loops);
    const { roots } = keepOutermost(loops);
    // A block instance is ONE piece per layer: keep the largest root, the rest are stray
    // annotation shapes. The loose pool has no such promise — every root is its own piece.
    const chosen =
      group.blockName != null
        ? roots.length > 0
          ? [roots.reduce((m, l) => (area(l.pts) > area(m.pts) ? l : m))]
          : []
        : roots;

    for (const loop of chosen) {
      const cleaned = sanitizeLoop(stripDegenerate(loop.pts, 1e-4));
      if (!cleaned || area(cleaned) < MIN_PIECE_AREA_CM2) continue;
      pieces.push({
        name: label,
        blockName: group.blockName,
        layer: loop.layer,
        grain,
        poly: ensureCCW(cleaned),
      });
    }
  }
  if (small > 0 && group.blockName == null) {
    warnings.push(`мелких контуров (< ${MIN_PIECE_AREA_CM2} см²) отброшено: ${small}`);
  }
  return pieces;
}
