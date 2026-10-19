// GRADE P1 (GRADE-P1.md §1.4–1.5): the explicit per-size questions of one piece — "in sizes XS, S
// 0 notches, in M, L, XL 1 — intended?" — shown on the DETAILS step after every blocking question.
// NOTHING BLOCKS: the step's NEXT never waits for them (the shell gates on `api.blocker` only) and
// the autopilot never answers them. An answer goes back as `inputs.gradeAnswers[ask.key]` through
// the step's semantics re-run; the key is the question's content, so a changed drawing asks again.
//
// The picture is a small multiple: one mini outline per size, side by side, the counted places of
// each size drawn on it and the ones that differ from the smallest count lit blue, captioned with
// the size and its count.
import type {
  GradeAnswer,
  GradeAsk,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
  SemanticsOutput,
} from 'lib/pattern-import/types';
import { Text } from 'ui';
import { SHEET_INK, ptsAttr, vy } from '../sheet-viewport';

/**
 * The questions still open: `ask.answer` is the APPLIED answer (GRADE-P1 §1.5) — absent = open,
 * a refused all / none included (its `refused` says why; the question stays).
 */
export function openGradeAsks(sem: Pick<SemanticsOutput, 'gradeAsks'>): GradeAsk[] {
  return (sem.gradeAsks ?? []).filter((a) => !a.answer);
}

/** Why the operator's all / none could not be applied (null = not refused). */
export const gradeRefusal = (
  sem: Pick<SemanticsOutput, 'gradeRefusals'>,
  ask: GradeAsk,
): string | null =>
  (ask.kind === 'counts' ? ask.refused : undefined) ?? sem.gradeRefusals?.[ask.key] ?? null;

/** Every size the question is about, with its counted places (a lone notch: the one size has it). */
export function placesBySize(
  ask: GradeAsk,
  spec: PieceSpec | undefined,
): { size: string; at: PtMm[] }[] {
  if (ask.kind === 'counts') return ask.perSize.map((p) => ({ size: p.size, at: p.at }));
  const sizes = spec?.sizes.map((s) => s.sizeToken) ?? [ask.size];
  return sizes.map((size) => ({ size, at: size === ask.size ? [ask.at] : [] }));
}

const WORD = {
  notches: ['notch', 'notches'],
  drills: ['drill hole', 'drill holes'],
  internal: ['line', 'lines'],
} as const;

/** The feature the question counts, in words ("notch" / "lines"). */
export const gradeWord = (ask: GradeAsk, n = 2) =>
  WORD[ask.kind === 'counts' ? ask.feature : 'notches'][n === 1 ? 0 : 1];

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (pts: readonly PtMm[]): Box | null =>
  pts.length
    ? {
        minX: Math.min(...pts.map((p) => p.x)),
        minY: Math.min(...pts.map((p) => p.y)),
        maxX: Math.max(...pts.map((p) => p.x)),
        maxY: Math.max(...pts.map((p) => p.y)),
      }
    : null;

/**
 * Which places of each size differ (equal counts: every place is asked): matched (nearest first, in the size's own outline box, so the
 * growth between sizes does not count) against the size with the fewest; the unmatched are lit.
 */
export function litPlaces(
  rows: { size: string; at: PtMm[] }[],
  sizeOf: (token: string) => PieceSizeSpec | undefined,
): boolean[][] {
  const norm = (token: string, at: PtMm[]) => {
    const b = boxOf(sizeOf(token)?.cut ?? []) ?? boxOf(at);
    if (!b) return at;
    const w = b.maxX - b.minX || 1;
    const h = b.maxY - b.minY || 1;
    return at.map((p) => ({ x: (p.x - b.minX) / w, y: (p.y - b.minY) / h }));
  };
  // equal counts at places that do not grade (S:A, M:A, L:B): the places ARE the question — all lit
  if (rows.length && rows.every((r) => r.at.length === rows[0].at.length))
    return rows.map((r) => r.at.map(() => true));
  const ref = rows.reduce<(typeof rows)[number] | null>(
    (m, r) => (!m || r.at.length < m.at.length ? r : m),
    null,
  );
  const refPts = ref ? norm(ref.size, ref.at) : [];
  return rows.map((r) => {
    const pts = norm(r.size, r.at);
    const lit = pts.map(() => true);
    const pairs: { i: number; j: number; d: number }[] = [];
    for (let i = 0; i < pts.length; i++)
      for (let j = 0; j < refPts.length; j++)
        pairs.push({ i, j, d: Math.hypot(pts[i].x - refPts[j].x, pts[i].y - refPts[j].y) });
    pairs.sort((a, b) => a.d - b.d);
    const usedJ = new Set<number>();
    for (const p of pairs) {
      if (!lit[p.i] || usedJ.has(p.j)) continue;
      lit[p.i] = false;
      usedJ.add(p.j);
    }
    return lit;
  });
}

const MINI = 60;

/** One mini outline per size, side by side: its places drawn, the differing ones lit blue. */
export function GradeSizes({ ask, spec }: { ask: GradeAsk; spec: PieceSpec | undefined }) {
  const sizeOf = (t: string) => spec?.sizes.find((s) => s.sizeToken === t);
  const rows = placesBySize(ask, spec);
  const lit = litPlaces(rows, sizeOf);
  // one scale for every size: the sizes grow as they do on the sheet
  const boxes = rows.map((r) => boxOf(sizeOf(r.size)?.cut ?? []) ?? boxOf(r.at));
  const side = Math.max(
    1,
    ...boxes.map((b) => (b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) : 0)),
  );
  const box = side * 1.16;
  const px = box / MINI;
  const feature = ask.kind === 'counts' ? ask.feature : 'notches';
  return (
    <span className='flex flex-wrap items-end gap-1.5' data-testid='grade-sizes'>
      {rows.map((r, k) => {
        const s = sizeOf(r.size);
        const b = boxes[k];
        const cx = b ? (b.minX + b.maxX) / 2 : 0;
        const cy = b ? vy((b.minY + b.maxY) / 2) : 0;
        const anyLit = lit[k].some(Boolean);
        return (
          <span key={r.size} className='flex flex-col items-center gap-0.5'>
            <svg
              width={MINI}
              height={MINI}
              viewBox={`${cx - box / 2} ${cy - box / 2} ${box} ${box}`}
              aria-label={`size ${r.size}: ${r.at.length} ${gradeWord(ask, r.at.length)}`}
              className={anyLit ? 'outline outline-1 outline-[#2323ff]' : undefined}
            >
              {s && s.cut.length > 2 && (
                <polygon
                  points={ptsAttr(s.cut)}
                  fill={SHEET_INK.fill}
                  stroke={SHEET_INK.ink}
                  strokeWidth={px * 1.2}
                  strokeLinejoin='round'
                />
              )}
              {/* the size's own drawing of the feature, grey under the places */}
              {s && feature === 'internal'
                ? s.internal.map((l, i) => (
                    <polyline
                      key={i}
                      points={ptsAttr(l.pts)}
                      fill='none'
                      stroke={SHEET_INK.mut}
                      strokeWidth={px * 1.2}
                    />
                  ))
                : null}
              {s && feature === 'notches'
                ? s.notches.map((n, i) => (
                    <line
                      key={i}
                      x1={n.seg[0].x}
                      y1={vy(n.seg[0].y)}
                      x2={n.seg[1].x}
                      y2={vy(n.seg[1].y)}
                      stroke={SHEET_INK.ink}
                      strokeWidth={px * 1.5}
                    />
                  ))
                : null}
              {r.at.map((p, i) =>
                lit[k][i] ? (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={vy(p.y)}
                    r={px * 5}
                    fill='none'
                    stroke={SHEET_INK.blue}
                    strokeWidth={px * 2}
                  />
                ) : (
                  <circle key={i} cx={p.x} cy={vy(p.y)} r={px * 2} fill={SHEET_INK.ink} />
                ),
              )}
            </svg>
            <Text size='micro' component='span' className={anyLit ? 'text-[#2323ff]' : undefined}>
              {r.size} · {r.at.length}
            </Text>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The places on the big canvas (left): every size's outline thin, its counted places dotted, the
 * differing ones lit blue with the size beside them.
 */
export function GradeCanvasMarks({
  ask,
  spec,
  unit,
}: {
  ask: GradeAsk;
  spec: PieceSpec | undefined;
  unit: number;
}) {
  const sizeOf = (t: string) => spec?.sizes.find((s) => s.sizeToken === t);
  const rows = placesBySize(ask, spec);
  const lit = litPlaces(rows, sizeOf);
  return (
    <g pointerEvents='none' data-testid='grade-canvas-marks'>
      {rows.map((r) => {
        const s = sizeOf(r.size);
        return s && s.cut.length > 2 ? (
          <polygon
            key={`o${r.size}`}
            points={ptsAttr(s.cut)}
            fill='none'
            stroke={SHEET_INK.mut}
            strokeWidth={unit * 0.8}
          />
        ) : null;
      })}
      {rows.map((r, k) =>
        r.at.map((p, i) =>
          lit[k][i] ? (
            <g key={`${r.size}-${i}`}>
              <circle
                cx={p.x}
                cy={vy(p.y)}
                r={unit * 7}
                fill='none'
                stroke={SHEET_INK.blue}
                strokeWidth={unit * 2.5}
              />
              <text
                x={p.x + unit * 10}
                y={vy(p.y)}
                fontSize={unit * 12}
                fill={SHEET_INK.blue}
                dominantBaseline='middle'
              >
                {r.size}
              </text>
            </g>
          ) : (
            <circle
              key={`${r.size}-${i}`}
              cx={p.x}
              cy={vy(p.y)}
              r={unit * 3}
              fill={SHEET_INK.ink}
            />
          ),
        ),
      )}
    </g>
  );
}

/**
 * The answers the engine applies, in plain words. A lone notch: every size / none / only its size
 * (`all` / `none` / `only`). A count: intended / every size / no size (`intended` / `all` /
 * `none`); `all` is placed only where the grade derives a place — else refused, with the reason.
 */
export function gradeAnswerChoices(
  ask: GradeAsk,
): { label: string; answer: GradeAnswer; title: string }[] {
  if (ask.kind === 'notch-lone')
    return [
      {
        label: 'every size should have it',
        answer: 'all',
        title: `the notch is placed in every size, graded from size ${ask.size}`,
      },
      { label: 'no size should', answer: 'none', title: `the notch in ${ask.size} is removed` },
      {
        label: `only size ${ask.size}`,
        answer: 'only',
        title: `kept in ${ask.size} only, as drawn`,
      },
    ];
  const w = gradeWord(ask);
  return [
    {
      label: "it's intended",
      answer: 'intended',
      title:
        'the sizes differ on purpose: nothing moves, the count warning is lifted for this piece',
    },
    {
      label: 'every size should have it',
      answer: 'all',
      title: `the missing ${w} are placed where the grade puts them (only if every one has such a place)`,
    },
    {
      label: 'no size should',
      answer: 'none',
      title: `the ${w} not drawn in every size are removed where they are drawn`,
    },
  ];
}
