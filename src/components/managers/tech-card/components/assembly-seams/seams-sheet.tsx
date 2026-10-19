// THE SHEET (03-SEAMS-DESIGN §5.2 zone 2): every contoured piece once — twins NOT collapsed, this is
// the technologist's audit — laid in reading order (a piece, then its twins), on one SVG so a tie
// line can run between two pieces. Weight carries the state, never colour:
//
//   confirmed 4 px ink · proposed 2.5 px ink dashed · stale 2.5 px grey dashed · rejected 1 px grey
//   · unsewn = the 1 px outline. A closure is drawn confirmed with a gap pattern.
//
// Every edge is a door (an 8 px-wide invisible hit line on top): outside hand mode it finds the
// edge's seam in the rail, or starts a hand connection from an edge nobody sews; in hand mode it
// picks the edge for side A or B (shift adds one more to the side). Numbers at the edges are the
// rail's numbers, not the steps' — steps live on the ASSEMBLY MAP.

import { along } from 'lib/assembly-skeleton/map/frame';
import type { EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Review, ReviewItem, SeamGroup } from './review-model';
import { pieceWords, plainEdges, runWords, type RoleWords } from './words';

/** « · ply of BP» on a piece with an identical twin (a double yoke, collar plies): one pair. */
const plyWord = (g: PieceGeom, nameOf: (key: string) => string) => {
  const mates = g.twinOf.filter((t) => t.kind === 'identical').map((t) => nameOf(t.key));
  return mates.length ? ` · ply of ${mates.join(' + ')}` : '';
};

const INK = '#000';
const GREY = '#999';
const PIECE_FILL = '#e6e6e6';
const BAND = '#fafafa';
const NUM_PX = 9;
const NOTCH_PX = 6;
const GAP_X = 36;
/** Room above a piece for its name, clear of the edge numbers (they sit ~11 px out). */
const LABEL_H = 28;
const PAD = 20;
/** The tallest piece is drawn this tall; every piece shares the scale. */
const TALL_PX = 280;
/** …but no piece is drawn smaller than this, or its edges cannot be picked. */
const MIN_PX = 56;

type Placed = {
  g: PieceGeom;
  x: number;
  y: number;
  /** px per mm for this piece. */
  k: number;
  x0: number;
  y1: number;
  w: number;
  h: number;
};

type Laid = { placed: Placed[]; bands: { y: number; h: number }[]; height: number };

const bbox = (pts: readonly Pt2[]) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
};

/** A piece and its twins next to each other, then the next piece — the card's own order. */
export function sheetOrder(pieces: readonly PieceGeom[]): PieceGeom[] {
  const drawn = pieces.filter((p) => p.rs.length >= 3);
  const byKey = new Map(drawn.map((p) => [p.pieceKey, p]));
  const seen = new Set<string>();
  const out: PieceGeom[] = [];
  for (const p of drawn) {
    if (seen.has(p.pieceKey)) continue;
    const members = [
      p,
      ...p.twinOf.map((t) => byKey.get(t.key)).filter((m): m is PieceGeom => !!m),
    ];
    const left = members.filter((m) => !seen.has(m.pieceKey));
    left.sort((a, b) => (a.hand === 'L' ? -1 : b.hand === 'L' ? 1 : 0));
    for (const m of left) {
      seen.add(m.pieceKey);
      out.push(m);
    }
  }
  return out;
}

function layout(pieces: readonly PieceGeom[], width: number): Laid {
  const boxes = pieces.map((g) => ({ g, b: bbox(g.rs) }));
  const tall = Math.max(1, ...boxes.map(({ b }) => b.y1 - b.y0));
  const base = Math.min(0.5, TALL_PX / tall);
  const placed: Placed[] = [];
  const bands: { y: number; h: number }[] = [];
  let x = PAD;
  let y = 0;
  let lineH = 0;
  let line: Placed[] = [];
  const close = () => {
    if (!line.length) return;
    const h = lineH + LABEL_H + 2 * PAD;
    for (const p of line) p.y = y + PAD + LABEL_H + (lineH - p.h);
    bands.push({ y, h });
    y += h;
    x = PAD;
    lineH = 0;
    line = [];
  };
  for (const { g, b } of boxes) {
    const dw = b.x1 - b.x0;
    const dh = b.y1 - b.y0;
    const k = Math.max(base, MIN_PX / Math.max(dw, dh, 1));
    const w = dw * k;
    const h = dh * k;
    if (line.length && x + w > width - PAD) close();
    const p: Placed = { g, x, y: 0, k, x0: b.x0, y1: b.y1, w, h };
    line.push(p);
    placed.push(p);
    x += Math.max(w, 64) + GAP_X;
    lineH = Math.max(lineH, h);
  }
  close();
  return { placed, bands, height: y };
}

type EdgeState = 'confirmed' | 'closure' | 'decide' | 'stale' | 'rejected';
const RANK: Record<EdgeState, number> = {
  confirmed: 0,
  closure: 1,
  decide: 2,
  stale: 3,
  rejected: 4,
};
const stateOf = (it: ReviewItem): EdgeState =>
  it.group === 'confirmed'
    ? it.row?.kind === 'closure'
      ? 'closure'
      : 'confirmed'
    : it.group === 'decide'
      ? 'decide'
      : it.group === 'rejected'
        ? 'rejected'
        : 'stale';

const STYLE: Record<EdgeState, { w: number; dash?: string; grey?: boolean }> = {
  confirmed: { w: 4 },
  closure: { w: 4, dash: '10 5' },
  decide: { w: 2.5, dash: '6 4' },
  stale: { w: 2.5, dash: '6 4', grey: true },
  rejected: { w: 1, grey: true },
};

export type HandPick = { a: EdgeId[]; b: EdgeId[] };

export function SeamsSheet({
  pieces,
  review,
  roles,
  visible,
  active,
  focusId,
  hand,
  onEdge,
}: {
  pieces: readonly PieceGeom[];
  review: Review;
  roles: RoleWords;
  /** Groups the rail shows: edges of hidden groups are drawn as unsewn. */
  visible: ReadonlySet<SeamGroup>;
  /** The hovered or selected row: both sides lit, a tie line between them. */
  active: ReviewItem | null;
  /** Scroll the sheet to this row's first side when it changes (a pick in the rail). */
  focusId: string | null;
  hand: HandPick | null;
  onEdge: (id: EdgeId, shift: boolean) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(480, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(480, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const order = useMemo(() => sheetOrder(pieces), [pieces]);
  const laid = useMemo(() => layout(order, width), [order, width]);
  const at = useMemo(() => new Map(laid.placed.map((p) => [p.g.pieceKey, p])), [laid]);
  const [hover, setHover] = useState<EdgeId | null>(null);

  // Edge → the rows that sew it, best state first.
  const edgeRows = useMemo(() => {
    const m = new Map<EdgeId, ReviewItem[]>();
    for (const it of review.items) {
      if (!visible.has(it.group)) continue;
      for (const e of [...it.a, ...it.b]) m.set(e, [...(m.get(e) ?? []), it]);
    }
    for (const list of m.values())
      list.sort((x, y) => RANK[stateOf(x)] - RANK[stateOf(y)] || x.n - y.n);
    return m;
  }, [review, visible]);

  const toPx = (p: Placed, q: Pt2): Pt2 => [p.x + (q[0] - p.x0) * p.k, p.y + (p.y1 - q[1]) * p.k];
  const edgePx = (id: EdgeId) => {
    const key = id.slice(0, id.lastIndexOf('#'));
    const p = at.get(key);
    const e = p?.g.edges.find((x) => x.id === id);
    return p && e ? { p, e, pts: e.pts.map((q) => toPx(p, q)) } : null;
  };
  const midOf = (ids: readonly EdgeId[]): Pt2 | null => {
    const e = ids.map(edgePx).find(Boolean);
    if (!e) return null;
    const total = e.e.lenMm;
    return toPx(e.p, along(e.e.pts, total / 2).p);
  };

  // A pick in the rail brings its first side into view (the overlay's sheet scrolls, the page not).
  useEffect(() => {
    if (!focusId || !box.current) return;
    const it = review.byId.get(focusId);
    const m = it ? midOf(it.a) ?? midOf(it.b) : null;
    if (!m) return;
    const el = box.current;
    const top = m[1] - el.clientHeight / 2;
    if (m[1] < el.scrollTop + 40 || m[1] > el.scrollTop + el.clientHeight - 40)
      el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const activeEdges = new Set(active ? [...active.a, ...active.b] : []);
  const pickA = new Set(hand?.a ?? []);
  const pickB = new Set(hand?.b ?? []);
  const lit = (id: EdgeId) =>
    activeEdges.has(id) || pickA.has(id) || pickB.has(id) || (hand != null && hover === id);
  const dimming = !!active || (hand != null && hand.a.length > 0);
  const tie = active ? [midOf(active.a), midOf(active.b)] : null;
  const handTie = hand && hand.a.length && hand.b.length ? [midOf(hand.a), midOf(hand.b)] : null;

  return (
    <div ref={box} className='h-full min-h-0 overflow-auto' data-seams-sheet>
      <svg
        xmlns='http://www.w3.org/2000/svg'
        width={width}
        height={Math.max(laid.height, 200)}
        className='block select-none'
        role='img'
        aria-label='the pieces laid flat, every edge a door to its seam'
      >
        {laid.bands.map((b, i) => (
          <rect key={i} x={0} y={b.y} width={width} height={b.h} fill={i % 2 ? '#fff' : BAND} />
        ))}
        {laid.placed.map((p) => {
          const outline = p.g.rs.map((q) => toPx(p, q));
          const plain = plainEdges(p.g);
          return (
            <g key={p.g.pieceKey} data-sheet-piece={p.g.pieceKey}>
              <text
                x={p.x}
                y={p.y - 20}
                className='fill-labelColor uppercase'
                style={{ fontSize: 10, letterSpacing: '0.04em' }}
              >
                {pieceWords(p.g, p.g.pieceKey)}
                {plyWord(p.g, (k) => pieceWords(laid.placed.find((x) => x.g.pieceKey === k)?.g, k))}
              </text>
              <polygon
                points={outline.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')}
                style={{ fill: PIECE_FILL, stroke: dimming ? GREY : INK, strokeWidth: 1 }}
                strokeLinejoin='round'
              />
              {plain.map((e) => {
                const rows = edgeRows.get(e.id);
                const top = rows?.[0];
                const st = top ? STYLE[stateOf(top)] : null;
                const on = lit(e.id);
                const pts = e.pts.map((q) => toPx(p, q));
                const attr = pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
                const grey = (st?.grey ?? false) || (dimming && !on);
                return (
                  <g key={e.id}>
                    {(st || on) && (
                      <polyline
                        points={attr}
                        data-sheet-edge={e.id}
                        data-sheet-state={top ? stateOf(top) : undefined}
                        data-sheet-lit={on ? '1' : undefined}
                        style={{
                          fill: 'none',
                          stroke: grey && !on ? GREY : INK,
                          strokeWidth: on ? 4 : st!.w,
                          strokeDasharray: on ? undefined : st?.dash,
                        }}
                        strokeLinecap='butt'
                        strokeLinejoin='round'
                      />
                    )}
                    {e.notchesMm.map((d, i) => {
                      const { p: q, t } = along(e.pts, d);
                      const [x, y] = toPx(p, q);
                      // CCW contour (y up): the cloth is left of travel; then y flips.
                      const n: Pt2 = [-t[1], -t[0]];
                      return (
                        <line
                          key={i}
                          x1={x}
                          y1={y}
                          x2={x + n[0] * NOTCH_PX}
                          y2={y + n[1] * NOTCH_PX}
                          style={{ stroke: INK, strokeWidth: 1.5 }}
                        />
                      );
                    })}
                    <polyline
                      points={attr}
                      data-sheet-hit={e.id}
                      style={{
                        fill: 'none',
                        stroke: 'transparent',
                        strokeWidth: 10,
                        pointerEvents: 'stroke',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={() => setHover(e.id)}
                      onMouseLeave={() => setHover((h) => (h === e.id ? null : h))}
                      onClick={(ev) => onEdge(e.id, ev.shiftKey)}
                    >
                      <title>{`${pieceWords(p.g, p.g.pieceKey)} · ${runWords([e.id], p.g, roles)} · ${Math.round(e.lenMm)} mm${e.notchesMm.length ? ` · ${e.notchesMm.length} ${e.notchesMm.length === 1 ? 'notch' : 'notches'}` : ''}`}</title>
                    </polyline>
                  </g>
                );
              })}
              {plain.map((e) => {
                const rows = edgeRows.get(e.id)?.filter((it) => it.group !== 'rejected');
                const tag = pickA.has(e.id) ? 'A' : pickB.has(e.id) ? 'B' : null;
                if (!rows?.length && !tag) return null;
                const pts = e.pts.map((q) => toPx(p, q));
                const { p: mid, t } = along(pts, polyLenPx(pts) / 2);
                // Outward on screen: y is flipped, so the cloth sits left of travel, the air right.
                const out: Pt2 = [-t[1], t[0]];
                const label = tag ?? rows!.map((it) => it.n).join('·');
                const hot =
                  tag != null || rows!.some((it) => activeEdges.has(e.id) && it === active);
                return (
                  <text
                    key={`n-${e.id}`}
                    x={mid[0] + out[0] * 11}
                    y={mid[1] + out[1] * 11}
                    textAnchor='middle'
                    dominantBaseline='central'
                    data-sheet-number={label}
                    style={{
                      fontSize: NUM_PX,
                      fontWeight: 700,
                      fill: dimming && !hot ? GREY : INK,
                      stroke: '#fff',
                      strokeWidth: 3,
                      paintOrder: 'stroke',
                      pointerEvents: 'none',
                    }}
                  >
                    {label}
                  </text>
                );
              })}
            </g>
          );
        })}
        {[tie, handTie].map((pair, i) =>
          pair && pair[0] && pair[1] ? (
            <line
              key={i}
              x1={pair[0][0]}
              y1={pair[0][1]}
              x2={pair[1][0]}
              y2={pair[1][1]}
              data-sheet-tie=''
              style={{ stroke: INK, strokeWidth: 1, strokeDasharray: '3 3', pointerEvents: 'none' }}
            />
          ) : null,
        )}
      </svg>
    </div>
  );
}

function polyLenPx(pts: readonly Pt2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++)
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
