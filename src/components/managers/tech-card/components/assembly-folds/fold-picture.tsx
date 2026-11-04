// Small fold pictures: the kind glyph, the flat and folded thumbnails of a piece row, the cross-section
// (face black, wrong side grey). Pure SVG from the fold model; no state. Ink weight carries
// meaning, never colour.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { FoldHint } from 'lib/folds';
import {
  foldedOutline,
  foldSection,
  type FlatFold,
  type FoldPleat,
  type FoldPly,
  type PleatKind,
} from 'lib/folds';
import { pieceView, ptsAttr, type FoldGroup, type PickKind, type PieceView } from './fold-model';

export const INK = 'var(--color-textColor)';
export const GREY = 'var(--color-labelColor)';
export const FAINT = 'var(--color-borderColor)';
export const WRONG = 'var(--color-borderColor)';
export const PAPER = 'var(--color-bgColor)';
export const RULE = 'var(--color-hairline)';
/** The owner's own pick (the seam picker's blue). */
export const PICK = 'var(--color-warning)';

const r1 = (v: number) => v.toFixed(1);

/** The kind glyph: a turn over a base line — dashed for in (under), solid for out, two for double. */
export function KindIcon({ kind, size = 14 }: { kind: PickKind; size?: number }) {
  const arc = (y0: number, dash: boolean) => (
    <g key={y0}>
      <path
        d={`M3 ${y0} Q8 ${y0 - 7} 13 ${y0}`}
        fill='none'
        stroke='currentColor'
        strokeWidth={1.3}
        strokeDasharray={dash ? '2 1.6' : undefined}
      />
      <path
        d={`M10.6 ${y0 - 2.2} L13 ${y0} L10.2 ${y0 + 0.6}`}
        fill='none'
        stroke='currentColor'
        strokeWidth={1.3}
        strokeLinejoin='round'
      />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox='0 0 16 16' aria-hidden='true' className='shrink-0'>
      <line x1={1} y1={13} x2={15} y2={13} stroke='currentColor' strokeWidth={1.6} />
      {kind === 'in'
        ? arc(10, true)
        : kind === 'out'
          ? arc(10, false)
          : [arc(10, false), arc(6, false)]}
    </svg>
  );
}

/** A dashed line: the piece has a hint nobody accepted yet. */
export function HintIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={12} viewBox='0 0 16 12' aria-hidden='true' className='shrink-0'>
      <line
        x1={1}
        y1={6}
        x2={15}
        y2={6}
        stroke='currentColor'
        strokeWidth={1.6}
        strokeDasharray='3 2'
      />
    </svg>
  );
}

const THUMB = 40;
const thumbView = (piece: PieceGeom, deg: number) =>
  pieceView(piece, deg, { w: THUMB, h: THUMB, pad: 4 });

const line = (v: PieceView, l: readonly [Pt2, Pt2], props: Record<string, string | number>) => {
  const a = v.toPx(l[0]);
  const b = v.toPx(l[1]);
  return <line x1={r1(a[0])} y1={r1(a[1])} x2={r1(b[0])} y2={r1(b[1])} {...props} />;
};

/** The flat piece with its fold lines (solid) and open hints (dashed). */
export function FlatThumb({
  piece,
  deg,
  inner,
  groups,
  hints,
}: {
  piece: PieceGeom;
  deg: number;
  inner?: readonly Pt2[][];
  groups: readonly FoldGroup[];
  hints: readonly FoldHint[];
}) {
  const v = thumbView(piece, deg);
  return (
    <svg
      width={THUMB}
      height={THUMB}
      viewBox={`0 0 ${THUMB} ${THUMB}`}
      aria-hidden='true'
      className='shrink-0'
    >
      <polygon
        points={ptsAttr(v, piece.rs)}
        fill={PAPER}
        stroke={INK}
        strokeWidth={1}
        strokeLinejoin='round'
      />
      {inner?.map((polyline, i) => (
        <polyline
          key={`i${i}`}
          points={ptsAttr(v, polyline)}
          fill='none'
          stroke={FAINT}
          strokeWidth={0.6}
          data-fold-inner=''
        />
      ))}
      {groups.flatMap((g, i) =>
        g.flat.map((f, j) => (
          <g key={`f${i}.${j}`}>{line(v, [f.a, f.b], { stroke: INK, strokeWidth: 1.2 })}</g>
        )),
      )}
      {hints
        .filter((h) => h.origin !== 'inner')
        .map((h) => (
          <g key={h.id}>
            {line(v, h.lineMm, { stroke: INK, strokeWidth: 1, strokeDasharray: '2 1.5' })}
          </g>
        ))}
    </svg>
  );
}

/** Plies of a folded piece: faint flat outline behind, plies solid, the turned ones hatched. */
export function PliesSvg({
  v,
  piece,
  plies,
  pleats = [],
  thin = false,
}: {
  v: PieceView;
  piece: PieceGeom;
  plies: readonly FoldPly[];
  pleats?: readonly FoldPleat[];
  thin?: boolean;
}) {
  const w = thin ? 1 : 2.4;
  return (
    <>
      <polygon
        points={ptsAttr(v, piece.rs)}
        fill='none'
        stroke={FAINT}
        strokeWidth={thin ? 0.8 : 1.6}
        strokeLinejoin='round'
      />
      {plies
        .filter((ply) => !ply.hidden)
        .map((y, i) => {
          const mid = y.t < 1;
          const back = mid && y.t >= 0.5;
          return (
            <g key={i}>
              <polygon
                points={ptsAttr(v, y.poly)}
                fill={back ? RULE : PAPER}
                stroke={INK}
                strokeWidth={y.by ? w * 0.6 : w}
                strokeLinejoin='round'
              />
              {mid ? (
                <polygon
                  points={ptsAttr(v, y.poly)}
                  fill={INK}
                  fillOpacity={0.18 * Math.sin(Math.PI * y.t)}
                  stroke='none'
                />
              ) : y.by && y.flipped ? (
                <polygon points={ptsAttr(v, y.poly)} fill='url(#fold-hatch)' stroke='none' />
              ) : null}
            </g>
          );
        })}
      {/* A ply turned UNDER (in) is hidden by the face: its outline shows through, dashed. */}
      {plies.map((y, i) =>
        !y.hidden && y.by && y.t >= 1 && i < plies.findIndex((q) => !q.by) ? (
          <polygon
            key={`u${i}`}
            points={ptsAttr(v, y.poly)}
            fill='none'
            stroke={GREY}
            strokeWidth={thin ? 0.6 : 1}
            strokeDasharray={thin ? '2 1.5' : '4 3'}
            strokeLinejoin='round'
          />
        ) : null,
      )}
      <PleatSvg v={v} pleats={pleats} thin={thin} />
    </>
  );
}

function PleatSvg({
  v,
  pleats,
  thin,
}: {
  v: PieceView;
  pleats: readonly FoldPleat[];
  thin: boolean;
}) {
  return (
    <>
      {pleats.map((pleat, index) => (
        <g key={index} pointerEvents='none' data-fold-pleat=''>
          <polygon points={ptsAttr(v, pleat.wedge)} fill={FAINT} stroke='none' />
          {pleat.edges.map((edge, edgeIndex) => (
            <g key={edgeIndex}>
              {line(v, edge, {
                stroke: GREY,
                strokeWidth: thin ? 0.7 : 1.2,
                strokeDasharray: thin ? '2 1.5' : '4 3',
              })}
            </g>
          ))}
          {line(v, pleat.centre, { stroke: INK, strokeWidth: thin ? 1.2 : 2.4 })}
        </g>
      ))}
    </>
  );
}

export function HatchDef() {
  return (
    <defs>
      <pattern
        id='fold-hatch'
        width={4}
        height={4}
        patternUnits='userSpaceOnUse'
        patternTransform='rotate(45)'
      >
        <line x1={0} y1={0} x2={0} y2={4} stroke={GREY} strokeWidth={0.8} />
      </pattern>
    </defs>
  );
}

const allFlat = (groups: readonly FoldGroup[]): FlatFold[] => groups.flatMap((g) => g.flat);

/** The piece as folded, thumbnail size. */
export function FoldedThumb({
  piece,
  deg,
  groups,
}: {
  piece: PieceGeom;
  deg: number;
  groups: readonly FoldGroup[];
}) {
  const v = thumbView(piece, deg);
  const shape = foldedOutline(piece.rs, allFlat(groups));
  return (
    <svg
      width={THUMB}
      height={THUMB}
      viewBox={`0 0 ${THUMB} ${THUMB}`}
      aria-hidden='true'
      className='shrink-0'
    >
      <HatchDef />
      <PliesSvg v={v} piece={piece} plies={shape.plies} pleats={shape.pleats} thin />
      {shape.creases.map((crease, index) => (
        <g key={index}>{line(v, crease, { stroke: INK, strokeWidth: 1.8 })}</g>
      ))}
    </svg>
  );
}

/** The approved section of a closed pleat: visible fabric black, hidden layers grey. */
const PLEAT_SECTION: Record<PleatKind, { h: number; cloth: string[]; hidden: string }> = {
  pleat: {
    h: 56,
    cloth: ['M10 16 L167 16', 'M173 16 L330 16'],
    hidden:
      'M167 16 C160 16 158 26 150 26 L112 26 C102 26 102 40 112 40 L170 40 L228 40 C238 40 238 26 228 26 L190 26 C182 26 180 16 173 16',
  },
  pleat_r: {
    h: 50,
    cloth: ['M10 12 L170 12', 'M170 36 L330 36'],
    hidden: 'M170 12 C180 12 180 24 170 24 L95 24 C85 24 85 36 95 36 L170 36',
  },
  pleat_l: {
    h: 50,
    cloth: ['M330 12 L170 12', 'M170 36 L10 36'],
    hidden: 'M170 12 C160 12 160 24 170 24 L245 24 C255 24 255 36 245 36 L170 36',
  },
};
const PLEAT_SECTION_W = 340;

/** The section's height at a given drawn width. */
export const pleatSectionHeight = (kind: PleatKind, width: number) =>
  (width * PLEAT_SECTION[kind].h) / PLEAT_SECTION_W;

/** Nests in a bigger drawing with `x`/`y`/`width`; on its own it fills its box by the class. */
export function PleatSectionSvg({
  kind,
  x,
  y,
  width,
  className,
}: {
  kind: PleatKind;
  x?: number;
  y?: number;
  width?: number;
  className?: string;
}) {
  const section = PLEAT_SECTION[kind];
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={width === undefined ? undefined : pleatSectionHeight(kind, width)}
      viewBox={`0 0 ${PLEAT_SECTION_W} ${section.h}`}
      aria-hidden='true'
      className={className}
      data-fold-section='pleat'
      data-fold-section-kind={kind}
    >
      <path d={section.hidden} fill='none' stroke={GREY} strokeWidth={3} data-section-hidden='' />
      {section.cloth.map((d) => (
        <path key={d} d={d} fill='none' stroke={INK} strokeWidth={3} data-section-cloth='' />
      ))}
    </svg>
  );
}

/** The cross-section of the folds: one bar per ply, face black on top of wrong grey, turns as arcs. */
export function SectionSvg({
  piece,
  groups,
  big = false,
}: {
  piece: PieceGeom;
  groups: readonly FoldGroup[];
  big?: boolean;
}) {
  const sp = foldSection(piece.rs, allFlat(groups));
  if (!sp) return null;
  if (sp.pleat)
    return <PleatSectionSvg kind={sp.pleat.kind} className={big ? 'block w-full' : 'shrink-0'} />;
  const o = big
    ? { W: 420, pad: 56, gap: 24, th: 12, ticks: true, fixedH: 0 }
    : { W: 56, pad: 6, gap: 6, th: 3, ticks: false, fixedH: THUMB };
  const L = sp.plies.length;
  const y0 = o.fixedH ? (o.fixedH - ((L - 1) * o.gap + o.th)) / 2 : 12;
  const bottom = y0 + (L - 1) * o.gap + o.th;
  const H = o.fixedH || bottom + (o.ticks ? 96 : 6);
  const k = (o.W - 2 * o.pad) / (sp.cut.hi - sp.cut.lo || 1);
  const X = (u: number) => o.pad + (u - sp.cut.lo) * k;
  const Y = (i: number) => y0 + (L - 1 - i) * o.gap;
  const idx = new Map(sp.plies.map((y, i) => [y.id, i]));
  const dim = (a: number, b: number, y: number, txt: string, strong: boolean) => {
    const c = strong ? INK : GREY;
    return (
      <g key={txt + y}>
        <line x1={r1(X(a))} y1={y} x2={r1(X(b))} y2={y} stroke={c} />
        <line x1={r1(X(a))} y1={y - 4} x2={r1(X(a))} y2={y + 4} stroke={c} />
        <line x1={r1(X(b))} y1={y - 4} x2={r1(X(b))} y2={y + 4} stroke={c} />
        <text
          x={r1((X(a) + X(b)) / 2)}
          y={y + 17}
          textAnchor='middle'
          fontSize={strong ? 13 : 11}
          fill={c}
        >
          {txt}
        </text>
      </g>
    );
  };
  return (
    <svg
      width={o.W}
      height={H}
      viewBox={`0 0 ${o.W} ${H}`}
      aria-hidden='true'
      className={big ? 'block max-w-full' : 'shrink-0'}
      data-fold-section={big ? 'big' : 'small'}
    >
      {sp.joins.map((j, n) => {
        const ia = idx.get(j.a);
        const ib = idx.get(j.b);
        if (ia == null || ib == null || ia === ib) return null;
        const ya = Y(ia) + o.th / 2;
        const yb = Y(ib) + o.th / 2;
        const x = X(j.c);
        const ply = sp.plies[ia];
        const right = (ply.lo + ply.hi) / 2 - j.c < 0;
        const r = Math.abs(yb - ya) / 2;
        const sweep = right === yb > ya ? 1 : 0;
        return (
          <path
            key={n}
            d={`M${r1(x)} ${r1(ya)} A${r1(r)} ${r1(r)} 0 0 ${sweep} ${r1(x)} ${r1(yb)}`}
            fill='none'
            stroke={GREY}
            strokeWidth={o.th * 0.8}
          />
        );
      })}
      {sp.plies.map((y, i) => {
        const x1 = X(y.lo);
        const w = X(y.hi) - x1;
        const yy = Y(i);
        const h = o.th / 2;
        const faceTop = !y.flipped;
        return (
          <g key={y.id}>
            <rect x={r1(x1)} y={r1(yy)} width={r1(w)} height={h} fill={faceTop ? INK : WRONG} />
            <rect x={r1(x1)} y={r1(yy + h)} width={r1(w)} height={h} fill={faceTop ? WRONG : INK} />
          </g>
        );
      })}
      {o.ticks && (
        <>
          {dim(sp.fin.lo, sp.fin.hi, bottom + 18, `${Math.round(sp.fin.hi - sp.fin.lo)} mm`, true)}
          {dim(sp.cut.lo, sp.cut.hi, bottom + 50, `${Math.round(sp.cut.hi - sp.cut.lo)}`, false)}
          <rect x={o.pad} y={bottom + 78} width={8} height={8} fill={INK} />
          <text x={o.pad + 12} y={bottom + 86} fontSize={10} fill={GREY}>
            face
          </text>
          <rect x={o.pad + 52} y={bottom + 78} width={8} height={8} fill={WRONG} />
          <text x={o.pad + 64} y={bottom + 86} fontSize={10} fill={GREY}>
            wrong
          </text>
        </>
      )}
    </svg>
  );
}
