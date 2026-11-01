// THE FOLD PICKER (doll-folds T4, owner OK 01.11: variant «Inline»). It opens in place under a step's
// `folds` row, on the one piece the owner tapped — no sheet, no piece list. Folds are set once per
// PIECE; the doll and every step that uses the piece read them from here.
//
//   hint    a DXF / mark line is drawn dashed → `fold` on it → in / out / double → saved
//   line    no hint: two clicks on the piece's edges (snap to notches) → the same kind choice
//   saved   the folded result: flat faint behind, folded solid, finished mm + cut mm, `flat / folded`,
//           `swap` (or click the other side), the section under the drawing
//
// The smaller part flips by default. `in` turns toward the wrong side (the part goes under), `out`
// toward the face (over), `double` = two equal inward turns (two rows). The turn animates ~250 ms
// (double 2 × 180 ms), instant with prefers-reduced-motion. Writes are optimistic (folds-store); a
// refused write rolls back and says so in the log. Long pieces (plackets) draw with their short side
// large and their long ends cropped, so the folds stay readable.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { seamPieceOf } from 'lib/assembly-skeleton/geometry';
import { foldedOutline, foldHints, type FoldHint, type FoldSource } from 'lib/folds';
import { grainRotation } from 'lib/pom/upright';
import { cn } from 'lib/utility';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SVGProps,
} from 'react';
import { Button, Chip, ChipRow, Close, Text } from 'ui';
import { FROZEN_REFUSAL } from '../assembly-fullscreen';
import { pieceRefKey } from '../piece-block-refs';
import type { FoundPiece } from '../nesting/dxf-geometry';
import {
  defaultSide,
  flatOfChoice,
  foldGroupsOf,
  openHints,
  pieceView,
  PICK_KINDS,
  ptsAttr,
  rowsOfChoice,
  type FoldGroup,
  type PickKind,
  type PieceView,
} from './fold-model';
import { GREY, HatchDef, INK, KindIcon, PAPER, PICK, PliesSvg, SectionSvg } from './fold-picture';
import { useFoldRows } from './folds-store';
import { useFoldWrites } from './use-fold-writes';

type Shapes = ReadonlyMap<string, FoundPiece | null> | null | undefined;

const W = 720;
const H = 560;
const PAD = 40;
/** A long piece's short side, px at least (the viewBox is 720 wide). */
const MIN_SHORT = 170;
/** Room for the finished / cut dimensions beside the folded shape. */
const DIM_PAD = 76;
const r1 = (v: number) => v.toFixed(1);

type Mode =
  | { t: 'idle' }
  | { t: 'draw'; p1: Pt2 | null }
  | { t: 'pending'; line: [Pt2, Pt2]; source: FoldSource }
  | { t: 'sel'; gi: number };

type Anim = {
  gi: number;
  dir: 1 | -1;
  n: number;
  d: number;
  t0: number;
  T: number;
  then?: () => void;
};

export type PieceRead = {
  geom: PieceGeom;
  deg: number;
  groups: FoldGroup[];
  hints: FoldHint[];
  maxSeq: number;
};

const ease = (x: number) => 1 - Math.pow(1 - x, 5);
const reduced = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const mmDims = (g: PieceGeom) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of g.rs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}`;
};

export function usePieceReads(
  pieces: readonly PieceGeom[],
  shapes: Shapes,
  grainDeg: ReadonlyMap<string, number> | undefined,
): PieceRead[] {
  const rows = useFoldRows();
  return useMemo(
    () =>
      pieces
        .filter((g) => g.rs.length >= 3)
        .map((geom) => {
          const found = shapes?.get(pieceRefKey(geom.pieceKey)) ?? null;
          const dto = found
            ? seamPieceOf(found.layers?.length ? found.layers : [found.piece]) ?? found.piece
            : null;
          const deg = grainDeg?.get(geom.pieceKey) ?? (dto ? grainRotation(dto) : 0);
          const { groups } = foldGroupsOf(geom, rows, deg);
          let hints: FoldHint[] = [];
          if (dto) {
            try {
              hints = foldHints(
                {
                  pieceKey: geom.pieceKey,
                  name: geom.name,
                  piece: dto,
                  piecesPerGarment: 1,
                  cutSymmetry: null,
                  cloth: null,
                  fused: false,
                },
                geom,
                { grainDeg: deg },
              );
            } catch {
              hints = [];
            }
          }
          const own = rows.filter((r) => r.pieceKey.toUpperCase() === geom.pieceKey.toUpperCase());
          return {
            geom,
            deg,
            groups,
            hints: openHints(hints, groups),
            maxSeq: own.reduce((m, r) => Math.max(m, r.seq), 0),
          };
        }),
    [pieces, shapes, grainDeg, rows],
  );
}

export function FoldPicker({
  read,
  cardId,
  frozen,
  size,
  onClose,
}: {
  read: PieceRead;
  cardId: number | undefined;
  frozen: boolean;
  size: string;
  onClose: () => void;
}) {
  const writes = useFoldWrites(cardId, frozen);
  const cur = read;
  const [mode, setMode] = useState<Mode>({ t: 'idle' });
  const [view, setView] = useState<'flat' | 'folded'>('folded');
  const [anim, setAnim] = useState<Anim | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [live, setLive] = useState<Pt2 | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const reset = () => {
    setMode({ t: 'idle' });
    setLive(null);
  };

  // The turn's frames: T runs 0 → n (n turns of d ms each), or back for `flat`.
  useEffect(() => {
    if (!anim) return;
    let raf = 0;
    const tick = (now: number) => {
      const e = Math.min(1, (now - anim.t0) / (anim.n * anim.d));
      const T = anim.dir > 0 ? e * anim.n : (1 - e) * anim.n;
      if (e < 1) {
        setAnim((a) => (a ? { ...a, T } : a));
        raf = requestAnimationFrame(tick);
      } else {
        anim.then?.();
        setAnim(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // One loop per started turn; T updates must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim?.t0]);

  const startTurn = (gi: number, dir: 1 | -1, n: number, then?: () => void) => {
    if (reduced()) {
      then?.();
      setAnim(null);
      return;
    }
    setAnim({ gi, dir, n, d: n > 1 ? 180 : 250, t0: performance.now(), T: dir > 0 ? 0 : n, then });
  };

  const { geom, deg, groups, hints } = cur;
  const folded =
    view === 'folded' && groups.length > 0 && mode.t !== 'pending' && mode.t !== 'draw';
  const v0 = pieceView(geom, deg, { w: W, h: H, pad: PAD, tight: true, minShort: MIN_SHORT });
  // Dimensions sit beside the folded shape: to the right of a lying piece, else below / right.
  const v = folded
    ? pieceView(geom, deg, {
        w: W,
        h: H,
        pad: PAD,
        padRight: PAD + DIM_PAD,
        padBottom: v0.lying ? PAD : PAD + DIM_PAD,
        tight: true,
        minShort: MIN_SHORT,
      })
    : v0;
  const VH = v.h;
  // The visible window of a cropped piece (the dimensions' strip stays clear).
  const clipX: [number, number] = [8, folded ? W - DIM_PAD - 52 : W - 8];

  const save = async (rows: Parameters<typeof writes.upsert>[0] | null) => {
    if (!rows || !rows.length) return false;
    return writes.upsert(rows);
  };

  const choose = async (kind: PickKind) => {
    if (mode.t === 'pending') {
      const side = defaultSide(geom, mode.line);
      const rows = rowsOfChoice(
        geom,
        { line: mode.line, side, kind, source: mode.source },
        { seq: cur.maxSeq + 1, grainDeg: deg, anchoredSize: size },
      );
      reset();
      setView('folded');
      startTurn(groups.length, 1, kind === 'double' ? 2 : 1);
      await save(rows);
    } else if (mode.t === 'sel') {
      const g = groups[mode.gi];
      if (!g || g.kind === kind) return;
      const sameCount = (kind === 'double') === (g.kind === 'double');
      const rows = rowsOfChoice(
        geom,
        { line: g.line, side: g.side, kind, source: g.source },
        {
          seq: sameCount ? g.rows[0].seq : cur.maxSeq + 1,
          grainDeg: deg,
          keys: sameCount ? g.rows.map((r) => r.foldKey) : undefined,
          anchoredSize: size,
        },
      );
      if (!rows) return;
      if (!sameCount && !(await writes.remove(g.rows))) return;
      if (folded) startTurn(sameCount ? mode.gi : groups.length - 1, 1, kind === 'double' ? 2 : 1);
      await save(rows);
    }
  };

  const swap = async (gi: number) => {
    const g = groups[gi];
    if (!g) return;
    const rows = rowsOfChoice(
      geom,
      { line: g.line, side: g.side === 1 ? -1 : 1, kind: g.kind, source: g.source },
      { seq: g.rows[0].seq, grainDeg: deg, keys: g.rows.map((r) => r.foldKey), anchoredSize: size },
    );
    if (!rows) return;
    startTurn(gi, 1, g.flat.length);
    await save(rows);
  };

  const remove = async (gi: number) => {
    const g = groups[gi];
    if (!g) return;
    reset();
    await writes.remove(g.rows);
  };

  // ── pointer: snap to a notch, else to the nearest edge point ──
  const svgPoint = (e: { clientX: number; clientY: number }): Pt2 | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse());
    return [q.x, q.y];
  };
  const snapAt = (px: Pt2): { mm: Pt2; px: Pt2; notch: boolean } | null => {
    let best: { mm: Pt2; px: Pt2; notch: boolean } | null = null;
    let bd = 16;
    for (const i of geom.notchIdx) {
      const q = v.toPx(geom.rs[i]);
      const d = Math.hypot(q[0] - px[0], q[1] - px[1]);
      if (d < bd) {
        bd = d;
        best = { mm: geom.rs[i], px: q, notch: true };
      }
    }
    if (best) return best;
    const P = geom.rs.map(v.toPx);
    let ed = 14;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      const d: Pt2 = [b[0] - a[0], b[1] - a[1]];
      const L2 = d[0] ** 2 + d[1] ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((px[0] - a[0]) * d[0] + (px[1] - a[1]) * d[1]) / L2));
      const q: Pt2 = [a[0] + d[0] * t, a[1] + d[1] * t];
      const dist = Math.hypot(q[0] - px[0], q[1] - px[1]);
      if (dist < ed) {
        ed = dist;
        best = { mm: v.fromPx(q), px: q, notch: false };
      }
    }
    return best;
  };

  const onCanvasClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const px = svgPoint(e);
    if (!px) return;
    if (mode.t === 'draw') {
      const sn = snapAt(px);
      if (!sn) return;
      if (!mode.p1) setMode({ t: 'draw', p1: sn.mm });
      else if (Math.hypot(sn.mm[0] - mode.p1[0], sn.mm[1] - mode.p1[1]) > 5) {
        setMode({ t: 'pending', line: [mode.p1, sn.mm], source: 'owner' });
        setLive(null);
      }
      return;
    }
    if ((e.target as Element).closest('[data-fold-act]')) return;
    if (mode.t === 'sel') {
      setMode({ t: 'idle' });
      return;
    }
    // Folded: a click on the side that does not flip swaps the last fold.
    if (folded && !anim) {
      const gi = groups.length - 1;
      const g = groups[gi];
      const q = v.fromPx(px);
      const l = g.flat[g.flat.length - 1];
      const s = (l.b[0] - l.a[0]) * (q[1] - l.a[1]) - (l.b[1] - l.a[1]) * (q[0] - l.a[0]);
      const onPart = folded && inPoly(geom.rs, q);
      if (onPart && s * g.side < 0) void swap(gi);
    }
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (mode.t === 'draw') setLive(svgPoint(e));
  };

  // A point along the line, `t` of the way through its VISIBLE part (a cropped piece cuts lines off).
  const anchorPct = (l: readonly [Pt2, Pt2], t = 0.5) => {
    const a = v.toPx(l[0]);
    const b = v.toPx(l[1]);
    let lo = 0;
    let hi = 1;
    const dx = b[0] - a[0];
    const x0 = clipX[0] + 24;
    const x1 = clipX[1] - 24;
    if (Math.abs(dx) > 1e-6) {
      const ta = (x0 - a[0]) / dx;
      const tb = (x1 - a[0]) / dx;
      lo = Math.max(lo, Math.min(ta, tb));
      hi = Math.min(hi, Math.max(ta, tb));
    }
    if (hi < lo) [lo, hi] = [0, 1];
    const u = lo + (hi - lo) * t;
    const m: Pt2 = [a[0] + dx * u, a[1] + (b[1] - a[1]) * u];
    return {
      left: `${Math.max(2, Math.min((m[0] / W) * 100, 72))}%`,
      top: `${Math.max(8, Math.min((m[1] / VH) * 100, 92))}%`,
    };
  };

  const ln = (l: readonly [Pt2, Pt2], props: SVGProps<SVGLineElement>, key?: string | number) => {
    const a = v.toPx(l[0]);
    const b = v.toPx(l[1]);
    return <line key={key} x1={r1(a[0])} y1={r1(a[1])} x2={r1(b[0])} y2={r1(b[1])} {...props} />;
  };

  // ── the flat canvas ──
  const flatSvg = () => {
    const pend = mode.t === 'pending' ? mode : null;
    const sel = mode.t === 'sel' ? mode.gi : null;
    const cen = geom.rs.reduce<Pt2>(
      (a, q) => [a[0] + q[0] / geom.rs.length, a[1] + q[1] / geom.rs.length],
      [0, 0],
    );
    const pendFlat = pend
      ? flatOfChoice(geom, pend.line, defaultSide(geom, pend.line), 'in')
      : null;
    const sn = mode.t === 'draw' && live ? snapAt(live) : null;
    return (
      <>
        <polygon
          points={ptsAttr(v, geom.rs)}
          fill={PAPER}
          stroke={INK}
          strokeWidth={3.2}
          strokeLinejoin='round'
        />
        {/* The part that will flip, previewed light: under for in (dashed), over for out. */}
        {groups.map((g, i) => {
          const shape = foldedOutline(geom.rs, g.flat);
          const turned = shape.plies.filter((y) => y.by);
          return turned.map((y, j) => (
            <polygon
              key={`p${i}.${j}`}
              points={ptsAttr(v, y.poly)}
              fill={g.kind === 'out' ? 'var(--color-pageBg)' : 'none'}
              stroke={GREY}
              strokeWidth={1}
              strokeDasharray={g.kind === 'out' ? undefined : '4 3'}
              strokeLinejoin='round'
              pointerEvents='none'
            />
          ));
        })}
        {pendFlat &&
          foldedOutline(geom.rs, pendFlat)
            .plies.filter((y) => y.by)
            .map((y, j) => (
              <polygon
                key={`pp${j}`}
                points={ptsAttr(v, y.poly)}
                fill='none'
                stroke={PICK}
                strokeWidth={1}
                strokeDasharray='4 3'
                pointerEvents='none'
              />
            ))}
        {geom.notchIdx.map((i) => {
          const at = geom.rs[i];
          const a = v.toPx(at);
          const c = v.toPx(cen);
          const d = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
          const b: Pt2 = [a[0] + ((c[0] - a[0]) / d) * 9, a[1] + ((c[1] - a[1]) / d) * 9];
          return (
            <line
              key={`n${i}`}
              x1={r1(a[0])}
              y1={r1(a[1])}
              x2={r1(b[0])}
              y2={r1(b[1])}
              stroke={INK}
              strokeWidth={1.6}
              strokeLinecap='round'
            />
          );
        })}
        {mode.t !== 'draw' &&
          hints.map((h) => {
            const on = hover === h.id || (pend && pend.line === h.lineMm);
            return (
              <g key={h.id}>
                {ln(h.lineMm, {
                  stroke: on ? PICK : INK,
                  strokeWidth: on ? 3 : 2,
                  strokeDasharray: '9 6',
                  pointerEvents: 'none',
                })}
                {ln(h.lineMm, {
                  stroke: 'transparent',
                  strokeWidth: 18,
                  style: { cursor: 'pointer' },
                  'data-fold-act': 'hint',
                  onPointerEnter: () => setHover(h.id),
                  onPointerLeave: () => setHover(null),
                  onClick: () => setMode({ t: 'pending', line: h.lineMm, source: h.source }),
                } as SVGProps<SVGLineElement>)}
              </g>
            );
          })}
        {groups.map((g, i) => {
          const col = sel === i ? PICK : INK;
          return (
            <g key={`g${i}`}>
              {g.flat.map((f, j) =>
                ln(
                  [f.a, f.b],
                  { stroke: col, strokeWidth: 2.6, strokeLinecap: 'round', pointerEvents: 'none' },
                  j,
                ),
              )}
              {g.flat.map((f, j) =>
                ln(
                  [f.a, f.b],
                  {
                    stroke: 'transparent',
                    strokeWidth: 18,
                    style: { cursor: 'pointer' },
                    'data-fold-act': 'sel',
                    onClick: () => setMode(sel === i ? { t: 'idle' } : { t: 'sel', gi: i }),
                  } as SVGProps<SVGLineElement>,
                  `h${j}`,
                ),
              )}
              <TurnGlyph v={v} g={g} color={col} />
            </g>
          );
        })}
        {pend && (
          <>
            {ln(pend.line, { stroke: PICK, strokeWidth: 3, strokeLinecap: 'round' })}
            {pend.line.map((q, i) => {
              const p = v.toPx(q);
              return <circle key={i} cx={r1(p[0])} cy={r1(p[1])} r={4} fill={PICK} />;
            })}
          </>
        )}
        {mode.t === 'draw' && (
          <g pointerEvents='none'>
            {mode.p1 && (
              <>
                <circle cx={r1(v.toPx(mode.p1)[0])} cy={r1(v.toPx(mode.p1)[1])} r={4} fill={PICK} />
                {(sn || live) && (
                  <line
                    x1={r1(v.toPx(mode.p1)[0])}
                    y1={r1(v.toPx(mode.p1)[1])}
                    x2={r1((sn?.px ?? live!)[0])}
                    y2={r1((sn?.px ?? live!)[1])}
                    stroke={PICK}
                    strokeWidth={2}
                    strokeDasharray={sn ? undefined : '4 4'}
                  />
                )}
              </>
            )}
            {sn && (
              <>
                <circle
                  cx={r1(sn.px[0])}
                  cy={r1(sn.px[1])}
                  r={sn.notch ? 7 : 5}
                  fill='none'
                  stroke={PICK}
                  strokeWidth={2.4}
                />
                {sn.notch && <circle cx={r1(sn.px[0])} cy={r1(sn.px[1])} r={2} fill={PICK} />}
              </>
            )}
          </g>
        )}
      </>
    );
  };

  // ── the folded canvas ──
  const foldedSvg = () => {
    const flat = groups.flatMap((g) => g.flat);
    const fin = foldedOutline(geom.rs, flat);
    let shape = fin;
    if (anim) {
      const before = groups.slice(0, anim.gi).reduce((n, g) => n + g.flat.length, 0);
      const T = anim.T;
      const j = Math.min(anim.n - 1, Math.floor(T));
      shape = foldedOutline(geom.rs, flat, {
        progress: { index: before + j, t: ease(Math.max(0, Math.min(1, T - j))) },
      });
    }
    const sel = mode.t === 'sel' ? mode.gi : null;
    return (
      <>
        <polygon points={ptsAttr(v, geom.rs)} fill='transparent' stroke='none' />
        <g pointerEvents='none'>
          <PliesSvg v={v} piece={geom} plies={shape.plies} />
        </g>
        {groups.map((g, i) => {
          const k = groups.slice(0, i + 1).reduce((n, x) => n + x.flat.length, 0) - 1;
          const l = fin.creases[k];
          if (!l) return null;
          return (
            <g key={`c${i}`}>
              {ln(l, {
                stroke: sel === i ? PICK : INK,
                strokeWidth: 3.6,
                strokeLinecap: 'round',
                pointerEvents: 'none',
              })}
              {ln(l, {
                stroke: 'transparent',
                strokeWidth: 18,
                style: { cursor: 'pointer' },
                'data-fold-act': 'sel',
                onClick: () => setMode(sel === i ? { t: 'idle' } : { t: 'sel', gi: i }),
              } as SVGProps<SVGLineElement>)}
            </g>
          );
        })}
        {/* A cropped piece draws its dimensions outside the crop (below). */}
        {!anim && !v.cropped && <Dims v={v} piece={geom} shape={fin} />}
      </>
    );
  };

  const kindChips = (curKind: PickKind | null) => (
    <ChipRow className='flex-col items-stretch'>
      {PICK_KINDS.map((k) => (
        <Chip key={k} selected={curKind === k} onClick={() => void choose(k)} data-fold-kind={k}>
          <span className='inline-flex items-center gap-1'>
            <KindIcon kind={k} />
            {k}
          </span>
        </Chip>
      ))}
    </ChipRow>
  );

  const pop = (l: readonly [Pt2, Pt2], body: ReactNode) => (
    <div
      className='absolute z-10 flex -translate-y-1/2 translate-x-3 flex-col gap-1 border border-textColor bg-bgColor p-1.5'
      style={anchorPct(l)}
      data-fold-pop=''
    >
      {body}
    </div>
  );

  const selG = mode.t === 'sel' ? groups[mode.gi] : null;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className='flex flex-col border-t border-hairline pt-2 focus:outline-none'
      data-fold-picker={geom.name}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (mode.t !== 'idle') reset();
          else onClose();
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && mode.t === 'sel') {
          e.preventDefault();
          void remove(mode.gi);
        }
      }}
    >
      <div className='flex items-center gap-2'>
        <Text size='micro' component='span' className='uppercase'>
          {geom.name}
        </Text>
        <Text size='micro' variant='label' component='span' className='tabular-nums'>
          {mmDims(geom)}
        </Text>
        {frozen && (
          <Text size='micro' variant='label' component='span'>
            {FROZEN_REFUSAL}
          </Text>
        )}
        <Close size='sm' aria-label='close' onClick={onClose} className='ml-auto' />
      </div>
      <div className='relative' data-fold-canvas={folded ? 'folded' : mode.t}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${r1(VH)}`}
          preserveAspectRatio='xMidYMid meet'
          className={cn('block h-auto w-full select-none', mode.t === 'draw' && 'cursor-crosshair')}
          onClick={onCanvasClick}
          onPointerMove={onMove}
        >
          <HatchDef />
          {v.cropped && (
            <defs>
              <clipPath id={`fold-crop-${geom.pieceKey}`}>
                <rect x={clipX[0]} y={0} width={clipX[1] - clipX[0]} height={VH} />
              </clipPath>
            </defs>
          )}
          <g clipPath={v.cropped ? `url(#fold-crop-${geom.pieceKey})` : undefined}>
            {folded ? foldedSvg() : flatSvg()}
          </g>
          {v.cropped && folded && !anim && (
            <Dims
              v={v}
              piece={geom}
              shape={foldedOutline(
                geom.rs,
                groups.flatMap((g) => g.flat),
              )}
              maxT={clipX[1] + 8}
            />
          )}
        </svg>

        {mode.t === 'pending' &&
          pop(
            mode.line,
            <>
              {kindChips(null)}
              <Button variant='underline' size='xs' onClick={reset} className='self-end'>
                cancel
              </Button>
            </>,
          )}
        {selG &&
          pop(
            selG.line,
            <>
              {kindChips(selG.kind)}
              <span className='flex items-center justify-between gap-2'>
                <Button
                  variant='underline'
                  size='xs'
                  onClick={() => void remove((mode as { gi: number }).gi)}
                >
                  remove
                </Button>
                <Close size='sm' aria-label='close' onClick={reset} />
              </span>
            </>,
          )}
        {mode.t === 'idle' &&
          !folded &&
          hints.map((h, i) => (
            <span
              key={h.id}
              className='absolute -translate-y-1/2 translate-x-3'
              style={anchorPct(
                h.lineMm,
                hints.length > 1 ? 0.15 + (0.7 * i) / (hints.length - 1) : 0.5,
              )}
            >
              <Chip
                onClick={() => setMode({ t: 'pending', line: h.lineMm, source: h.source })}
                data-fold-hint=''
              >
                fold
              </Chip>
            </span>
          ))}

        <div className='absolute top-0 left-0'>
          {mode.t === 'draw' ? (
            <Button variant='underline' size='xs' onClick={reset} className='text-warning'>
              cancel
            </Button>
          ) : (
            <Button
              variant='underline'
              size='xs'
              onClick={() => {
                setView('flat');
                setMode({ t: 'draw', p1: null });
              }}
              data-fold-line=''
            >
              line
            </Button>
          )}
        </div>
        {groups.length > 0 && (
          <div className='absolute top-0 right-0 flex items-center gap-3'>
            {folded && (
              <Button
                variant='underline'
                size='xs'
                onClick={() => void swap(mode.t === 'sel' ? mode.gi : groups.length - 1)}
                data-fold-swap=''
              >
                swap
              </Button>
            )}
            <ChipRow>
              <Chip
                selected={!folded}
                onClick={() => {
                  reset();
                  if (folded)
                    startTurn(groups.length - 1, -1, groups[groups.length - 1].flat.length, () =>
                      setView('flat'),
                    );
                  else setView('flat');
                }}
              >
                flat
              </Chip>
              <Chip
                selected={folded}
                onClick={() => {
                  reset();
                  setView('folded');
                  if (!folded)
                    startTurn(groups.length - 1, 1, groups[groups.length - 1].flat.length);
                }}
              >
                folded
              </Chip>
            </ChipRow>
          </div>
        )}
      </div>
      {folded && (
        <div className='flex items-start gap-3 border-t border-hairline pt-2'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            section
          </Text>
          <SectionSvg piece={geom} groups={groups} big />
        </div>
      )}
    </div>
  );
}

function inPoly(poly: readonly Pt2[], p: Pt2): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The half-arrow over a saved line: from the flipping side across — dashed in, solid out, two for double. */
function TurnGlyph({ v, g, color }: { v: PieceView; g: FoldGroup; color: string }) {
  const a = v.toPx(g.line[0]);
  const b = v.toPx(g.line[1]);
  const m: Pt2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const d: Pt2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  // The flipping side in px: a point on it, against the line.
  const f = g.flat[g.flat.length - 1];
  const fp = v.toPx(f.flipAt);
  const sgn = Math.sign(d[0] * (fp[1] - a[1]) - d[1] * (fp[0] - a[0])) || 1;
  const n: Pt2 = [-d[1] * sgn, d[0] * sgn];
  const arc = (r: number, dash: boolean) => {
    const s: Pt2 = [m[0] + n[0] * r, m[1] + n[1] * r];
    const e: Pt2 = [m[0] - n[0] * r, m[1] - n[1] * r];
    const c: Pt2 = [m[0] + d[0] * r * 1.5, m[1] + d[1] * r * 1.5];
    const tl = Math.hypot(e[0] - c[0], e[1] - c[1]) || 1;
    const t: Pt2 = [(e[0] - c[0]) / tl, (e[1] - c[1]) / tl];
    const rot = (q: Pt2, ang: number): Pt2 => [
      q[0] * Math.cos(ang) - q[1] * Math.sin(ang),
      q[0] * Math.sin(ang) + q[1] * Math.cos(ang),
    ];
    const h1 = rot(t, 0.5);
    const h2 = rot(t, -0.5);
    return (
      <g key={r}>
        <path
          d={`M${r1(s[0])} ${r1(s[1])} Q${r1(c[0])} ${r1(c[1])} ${r1(e[0])} ${r1(e[1])}`}
          fill='none'
          stroke={color}
          strokeWidth={1.6}
          strokeDasharray={dash ? '3 3' : undefined}
          strokeLinecap='round'
        />
        <path
          d={`M${r1(e[0] - h1[0] * 7)} ${r1(e[1] - h1[1] * 7)} L${r1(e[0])} ${r1(e[1])} L${r1(e[0] - h2[0] * 7)} ${r1(e[1] - h2[1] * 7)}`}
          fill='none'
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </g>
    );
  };
  return (
    <g pointerEvents='none'>
      {g.kind === 'in'
        ? arc(15, true)
        : g.kind === 'out'
          ? arc(15, false)
          : [arc(13, false), arc(22, false)]}
    </g>
  );
}

/** Finished width (ink) and cut width (faint) across the last fold, beside the folded shape. */
function Dims({
  v,
  piece,
  shape,
  maxT = Infinity,
}: {
  v: PieceView;
  piece: PieceGeom;
  shape: ReturnType<typeof foldedOutline>;
  /** A cropped piece: the dimensions stand at this px along their offset, not past the cut-off end. */
  maxT?: number;
}) {
  const l = shape.creases[shape.creases.length - 1];
  if (!l) return null;
  // The fold's normal and its direction in px.
  const a = v.toPx(l[0]);
  const b = v.toPx(l[1]);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tv0: Pt2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n: Pt2 = [-tv0[1], tv0[0]];
  // Dimension lines run along n, set off along the line direction toward bottom / right.
  const tv: Pt2 =
    Math.abs(tv0[0]) >= Math.abs(tv0[1])
      ? tv0[0] > 0
        ? tv0
        : [-tv0[0], -tv0[1]]
      : tv0[1] > 0
        ? tv0
        : [-tv0[0], -tv0[1]];
  const dot = (p: Pt2, q: Pt2) => p[0] * q[0] + p[1] * q[1];
  const span = (polys: readonly (readonly Pt2[])[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    let tmax = -Infinity;
    for (const P of polys)
      for (const q of P) {
        const p = v.toPx(q);
        lo = Math.min(lo, dot(p, n));
        hi = Math.max(hi, dot(p, n));
        tmax = Math.max(tmax, dot(p, tv));
      }
    return { lo, hi, tmax };
  };
  const cut = span([piece.rs]);
  const fin = span(shape.plies.map((y) => y.poly));
  const tmax = Math.min(Math.max(cut.tmax, fin.tmax), maxT);
  const dim = (lo: number, hi: number, off: number, text: string, strong: boolean) => {
    const p: Pt2 = [n[0] * lo + tv[0] * off, n[1] * lo + tv[1] * off];
    const q: Pt2 = [n[0] * hi + tv[0] * off, n[1] * hi + tv[1] * off];
    const col = strong ? INK : GREY;
    const across = Math.abs(tv[0]) > 0.7;
    const m: Pt2 = [
      (p[0] + q[0]) / 2 + tv[0] * (across ? 8 : 14),
      (p[1] + q[1]) / 2 + tv[1] * (across ? 8 : 14),
    ];
    const tick = (c: Pt2) => (
      <line
        x1={r1(c[0] + tv[0] * 4)}
        y1={r1(c[1] + tv[1] * 4)}
        x2={r1(c[0] - tv[0] * 4)}
        y2={r1(c[1] - tv[1] * 4)}
        stroke={col}
        strokeWidth={1}
      />
    );
    return (
      <g data-fold-dim={strong ? 'finished' : 'cut'}>
        <line
          x1={r1(p[0])}
          y1={r1(p[1])}
          x2={r1(q[0])}
          y2={r1(q[1])}
          stroke={col}
          strokeWidth={1}
        />
        {tick(p)}
        {tick(q)}
        <text
          x={r1(m[0])}
          y={r1(m[1] + 4)}
          textAnchor={across ? 'start' : 'middle'}
          fontSize={strong ? 13 : 11}
          fill={col}
        >
          {text}
        </text>
      </g>
    );
  };
  return (
    <g pointerEvents='none'>
      {dim(cut.lo, cut.hi, tmax + 76, `${Math.round(shape.cutWidthMm)}`, false)}
      {dim(fin.lo, fin.hi, tmax + 16, `${Math.round(shape.finishedWidthMm)} mm`, true)}
    </g>
  );
}
