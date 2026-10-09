// Step 5 · PIECES — seed + outer fill (06-SYNTHESIS: the core). Every region is drawn as found;
// what the fill could not close goes to the human: a leak (red, with where the outside got in),
// two seeds in one region (blue), a region too small to be a piece. Tools: click to seed, close a
// gap (two clicks: a wall between two line ends), ignore a line (a frame, a watermark), lasso to
// merge (around several seeds) or split (inside a merged region), "not a piece", reseed. Each
// region carries a strip of its sizes, so a piece closed in four sizes of six says which two.
import { useMemo, useRef, useState } from 'react';
import type { FillOutcome, PieceEdit, PieceFamily, PtMm } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';
import { SHEET_INK, SheetViewport, f32Attr, inside, ptsAttr, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { exportedRanks, variantsOf } from '../use-import-session';
import { Panel, SplitStage, fmtMm, fmtPct } from '../ui-bits';

type Tool = 'pan' | 'seed' | 'bridge' | 'ignore' | 'lasso' | 'reseed';

const HINT: Record<Tool, string> = {
  pan: 'click a piece to select · wheel zoom · drag pan',
  seed: 'click inside a piece to seed it',
  bridge: 'click one end of the gap, then the other — a wall is drawn between them',
  ignore: 'click a line that is not an outline (frame, watermark, label box)',
  lasso: 'draw around several seeds to merge · inside a two-seed region to split',
  reseed: 'click the new place for the selected seed',
};

type Bridge = Extract<PieceEdit, { kind: 'bridge' }>;

/** Where the worker will land a bridge end (display only; same rule as worker/operator-lines). */
function landOn(previews: readonly Float32Array[], p: PtMm, skip: ReadonlySet<number>): PtMm {
  let best: PtMm | null = null;
  let bd = 4;
  previews.forEach((a, id) => {
    if (skip.has(id) || a.length < 4) return;
    const closed = a[0] === a[a.length - 2] && a[1] === a[a.length - 1];
    if (closed) return;
    for (const k of [0, a.length - 2]) {
      const d = Math.hypot(a[k] - p.x, a[k + 1] - p.y);
      if (d <= bd) {
        bd = d;
        best = { x: a[k], y: a[k + 1] };
      }
    }
  });
  if (best) return best;
  const n = nearestLine(previews, p, 2, skip);
  return n ? n.at : p;
}

/** The preview line nearest to `p` within `reach` mm (index = ChainId). */
function nearestLine(
  previews: readonly Float32Array[],
  p: PtMm,
  reach: number,
  skip: ReadonlySet<number> = new Set(),
): { id: number; at: PtMm } | null {
  let best: { id: number; at: PtMm } | null = null;
  let bd = reach;
  previews.forEach((a, id) => {
    if (skip.has(id)) return;
    for (let i = 0; i + 3 < a.length; i += 2) {
      const ax = a[i];
      const ay = a[i + 1];
      const dx = a[i + 2] - ax;
      const dy = a[i + 3] - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0;
      const q = { x: ax + t * dx, y: ay + t * dy };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bd) {
        bd = d;
        best = { id, at: q };
      }
    }
  });
  return best;
}

const OUTCOME: Record<FillOutcome, { word: string; tone: 'ok' | 'warn' | 'attention' | 'mut' }> = {
  closed: { word: 'closed', tone: 'ok' },
  leak: { word: 'leak', tone: 'warn' },
  merged: { word: 'two seeds', tone: 'attention' },
  tiny: { word: 'tiny', tone: 'mut' },
};

const STYLE: Record<FillOutcome, { fill: string; stroke: string; dash: boolean }> = {
  closed: { fill: '#f2f2f2', stroke: SHEET_INK.ink, dash: false },
  leak: { fill: '#ffffff', stroke: SHEET_INK.red, dash: true },
  merged: { fill: '#ffffff', stroke: SHEET_INK.blue, dash: true },
  tiny: { fill: '#fafafa', stroke: SHEET_INK.mut, dash: true },
};

const centre = (pts: PtMm[]) => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
};

export function PiecesStep({ api }: { api: ImportSessionApi }) {
  const { session, inputs } = api;
  const out = session.pieces;
  const runSizes = session.sizes?.run.sizes ?? [];
  const [rank, setRank] = useState(() => Math.min(2, Math.max(0, runSizes.length - 1)));
  const [tool, setTool] = useState<Tool>('pan');
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  /** First end of a bridge being drawn. */
  const [gapA, setGapA] = useState<PtMm | null>(null);
  /** A bridge closes this size only, or every size (a gap in a line all sizes share). */
  const [allSizes, setAllSizes] = useState(false);
  /** mm per screen pixel of the last render: a click picks a line within a few pixels. */
  const unitRef = useRef(1);
  const variants = variantsOf(out?.seeds ?? [], api.baseSeeds);
  const families = useMemo(() => out?.families ?? [], [out]);
  const markOf = useMemo(() => new Map(families.map((f, i) => [f.seed, i + 1])), [families]);
  if (!out || !session.sheet || !session.chains) return null;
  const previews = session.chains.chainPreview;
  const ignored = new Set(inputs.edits.flatMap((e) => (e.kind === 'ignore-line' ? [e.chain] : [])));
  const bridges = inputs.edits.filter((e): e is Bridge => e.kind === 'bridge');
  const mapped = exportedRanks(session.sizes?.map);
  const labelOf = (r: number) => runSizes.find((z) => z.rank === r)?.label || `#${r + 1}`;
  const pickTool = (t: Tool) => {
    setGapA(null);
    setTool(t);
  };

  const seedAt = (id: number) => out.seeds.find((s) => s.id === id);
  const outcomeOf = (f: PieceFamily): FillOutcome =>
    f.candidates.find((c) => c.outcome !== 'closed')?.outcome ?? 'closed';
  const cand = (f: PieceFamily) => f.candidates[Math.min(rank, f.candidates.length - 1)];
  const selected = families.find((f) => f.seed === sel) ?? null;
  const counts = families.reduce<Record<FillOutcome, number>>(
    (m, f) => ({ ...m, [outcomeOf(f)]: m[outcomeOf(f)] + 1 }),
    { closed: 0, leak: 0, merged: 0, tiny: 0 },
  );

  const onLasso = (poly: PtMm[]) => {
    const ins = families.filter((f) => {
      const s = seedAt(f.seed);
      return s && inside(s.at, poly);
    });
    if (ins.length >= 2) {
      void api.editPieces({ kind: 'merge', seeds: ins.map((f) => f.seed) });
      setHint(`merged ${ins.length} seeds into one piece`);
    } else {
      const c = centre(poly);
      const target =
        ins[0] ?? families.find((f) => outcomeOf(f) === 'merged' && inside(c, cand(f).outer));
      if (target) {
        void api.editPieces({ kind: 'split', seed: target.seed, lassoMm: poly });
        setHint('region split along the lasso');
      } else setHint('the lasso holds no seed and crosses no merged region — nothing to do');
    }
    setTool('pan');
  };

  return (
    <SplitStage
      canvas={
        <Panel
          title='pieces on the sheet'
          aside={
            <span className='flex flex-wrap items-center gap-1'>
              {(
                [
                  ['pan', 'pan', 'pan and select'],
                  ['seed', '+ seed', 'click inside a piece the text did not label'],
                  ['bridge', 'close gap', 'two clicks: a wall between two line ends'],
                  ['ignore', 'ignore line', 'a line that is not an outline'],
                  ['lasso', 'lasso', 'merge seeds or split a two-seed region'],
                ] as const
              ).map(([t, word, title]) => (
                <Chip
                  quiet
                  key={t}
                  selected={tool === t}
                  pressed={tool === t}
                  onClick={() => pickTool(t)}
                  title={title}
                >
                  {word}
                </Chip>
              ))}
            </span>
          }
          bodyClassName='p-0 flex flex-col'
        >
          <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline px-2 py-1'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              size
            </Text>
            <ChipRow>
              {runSizes.map((s) => (
                <Chip
                  key={s.rank}
                  selected={rank === s.rank}
                  pressed={rank === s.rank}
                  onClick={() => setRank(s.rank)}
                >
                  {s.label}
                </Chip>
              ))}
            </ChipRow>
            {variants.length > 1 && (
              <>
                <Text
                  size='micro'
                  variant='label'
                  tracking='label'
                  component='span'
                  className='ml-3 uppercase'
                >
                  model
                </Text>
                <ChipRow>
                  <Chip
                    selected={!session.variant}
                    tone={!session.variant ? 'attention' : 'default'}
                    onClick={() => void api.dispatch({ type: 'variant', variant: null })}
                  >
                    all
                  </Chip>
                  {variants.map((v) => (
                    <Chip
                      key={v}
                      selected={session.variant === v}
                      pressed={session.variant === v}
                      onClick={() => void api.dispatch({ type: 'variant', variant: v })}
                    >
                      {v}
                    </Chip>
                  ))}
                </ChipRow>
              </>
            )}
            {tool === 'bridge' && (
              <ChipRow className='ml-3'>
                <Chip
                  selected={!allSizes}
                  pressed={!allSizes}
                  onClick={() => setAllSizes(false)}
                  title='the gap is in this size line only'
                >
                  size {labelOf(rank)}
                </Chip>
                <Chip
                  selected={allSizes}
                  pressed={allSizes}
                  onClick={() => setAllSizes(true)}
                  title='the gap is in a line every size shares'
                >
                  all sizes
                </Chip>
              </ChipRow>
            )}
            <Text size='micro' variant='label' component='span' className='ml-auto'>
              {tool === 'bridge' && gapA ? '! now click the other end of the gap' : HINT[tool]}
            </Text>
          </div>
          <div className='min-h-0 flex-1'>
            <SheetViewport
              bbox={session.sheet.sheet.bbox}
              tool={tool === 'pan' ? 'pan' : tool === 'lasso' ? 'lasso' : 'point'}
              onPick={(k) => setSel(k ? Number(k) : null)}
              onPoint={(pt) => {
                if (tool === 'bridge') {
                  if (!gapA) {
                    setGapA(landOn(previews, pt, ignored));
                    return;
                  }
                  const to = landOn(previews, pt, ignored);
                  void api.editPieces({
                    kind: 'bridge',
                    seed: sel,
                    rank: allSizes ? null : rank,
                    from: gapA,
                    to,
                  });
                  setGapA(null);
                  setHint(
                    `gap closed in ${allSizes ? 'every size' : `size ${labelOf(rank)}`} — the fill runs again`,
                  );
                  return;
                }
                if (tool === 'ignore') {
                  const hit = nearestLine(
                    previews,
                    pt,
                    Math.max(1.5, unitRef.current * 8),
                    ignored,
                  );
                  if (!hit) {
                    setHint('no line under the click — zoom in and click on the line itself');
                    return;
                  }
                  void api.editPieces({ kind: 'ignore-line', chain: hit.id });
                  setHint('line ignored — it is no wall for any piece now');
                  return;
                }
                if (tool === 'seed') {
                  void api.addSeed(pt).then((id) => id != null && setSel(id));
                  setHint('seed added — the fill runs from it');
                } else if (tool === 'reseed' && sel != null) {
                  void api.editPieces({ kind: 'reseed', seed: sel, at: pt });
                  setTool('pan');
                }
              }}
              onLasso={onLasso}
            >
              {({ unit, box }) => (
                <>
                  {(unitRef.current = unit) && null}
                  <g
                    fill='none'
                    stroke={SHEET_INK.source}
                    strokeWidth={unit * 0.6}
                    pointerEvents='none'
                  >
                    {previews.map((a, i) =>
                      a.length < 4 || ignored.has(i) ? null : (
                        <polyline key={i} points={f32Attr(a)} />
                      ),
                    )}
                  </g>
                  <g
                    fill='none'
                    stroke={SHEET_INK.red}
                    strokeWidth={unit * 1}
                    strokeDasharray={`${unit * 3} ${unit * 3}`}
                    pointerEvents='none'
                  >
                    {[...ignored].map((i) =>
                      previews[i] ? <polyline key={`x${i}`} points={f32Attr(previews[i])} /> : null,
                    )}
                  </g>
                  {[...families]
                    .sort((a, b) => cand(b).areaMm2 - cand(a).areaMm2)
                    .map((f) => {
                      const c = cand(f);
                      const o = outcomeOf(f);
                      const st = STYLE[o];
                      const on = f.seed === sel;
                      return (
                        <polygon
                          key={f.seed}
                          data-key={tool === 'pan' ? f.seed : undefined}
                          points={ptsAttr(c.outer)}
                          fill={on ? SHEET_INK.pick : st.fill}
                          fillOpacity={o === 'leak' && c.outer.length === 4 ? 0.15 : 0.85}
                          stroke={on ? SHEET_INK.ink : st.stroke}
                          strokeWidth={unit * (on ? 2.2 : 1.2)}
                          strokeDasharray={st.dash ? `${unit * 8} ${unit * 5}` : undefined}
                          className={tool === 'pan' ? 'cursor-pointer' : undefined}
                        />
                      );
                    })}
                  {families.map((f) => {
                    const c = cand(f);
                    if (!c.leakAt) return null;
                    return (
                      <g key={`l${f.seed}`} pointerEvents='none'>
                        <circle
                          cx={c.leakAt.x}
                          cy={vy(c.leakAt.y)}
                          r={unit * 9}
                          fill='none'
                          stroke={SHEET_INK.red}
                          strokeWidth={unit * 1.6}
                        />
                        <text
                          x={c.leakAt.x + unit * 12}
                          y={vy(c.leakAt.y)}
                          fontSize={unit * 12}
                          fill={SHEET_INK.red}
                          dominantBaseline='middle'
                        >
                          gap
                        </text>
                      </g>
                    );
                  })}
                  {bridges
                    .filter((b) => b.rank == null || b.rank === rank)
                    .map((b, i) => (
                      <g key={`b${i}`} pointerEvents='none'>
                        <line
                          x1={b.from.x}
                          y1={vy(b.from.y)}
                          x2={b.to.x}
                          y2={vy(b.to.y)}
                          stroke={SHEET_INK.blue}
                          strokeWidth={unit * 2}
                        />
                        {[b.from, b.to].map((p, k) => (
                          <rect
                            key={k}
                            x={p.x - unit * 2.5}
                            y={vy(p.y) - unit * 2.5}
                            width={unit * 5}
                            height={unit * 5}
                            fill={SHEET_INK.blue}
                          />
                        ))}
                      </g>
                    ))}
                  {gapA && (
                    <rect
                      x={gapA.x - unit * 4}
                      y={vy(gapA.y) - unit * 4}
                      width={unit * 8}
                      height={unit * 8}
                      fill='none'
                      stroke={SHEET_INK.blue}
                      strokeWidth={unit * 1.6}
                      pointerEvents='none'
                    />
                  )}
                  {out.seeds.map((s) => {
                    const m = markOf.get(s.id);
                    if (!m) return null;
                    const r = unit * 9;
                    const on = s.id === sel;
                    return (
                      <g
                        key={`s${s.id}`}
                        data-key={tool === 'pan' ? s.id : undefined}
                        className={tool === 'pan' ? 'cursor-pointer' : undefined}
                      >
                        <rect
                          x={s.at.x - r}
                          y={vy(s.at.y) - r}
                          width={r * 2}
                          height={r * 2}
                          fill={on ? SHEET_INK.blue : SHEET_INK.ink}
                        />
                        <text
                          x={s.at.x}
                          y={vy(s.at.y)}
                          fontSize={unit * 11}
                          fill='#ffffff'
                          textAnchor='middle'
                          dominantBaseline='central'
                        >
                          {m}
                        </text>
                        {s.origin === 'click' && (
                          <text
                            x={s.at.x}
                            y={vy(s.at.y) + r * 2.2}
                            fontSize={unit * 9}
                            fill={SHEET_INK.mut}
                            textAnchor='middle'
                          >
                            click
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <title>{`${box.w.toFixed(0)} mm across`}</title>
                </>
              )}
            </SheetViewport>
          </div>
        </Panel>
      }
      side={
        <Panel
          title='regions'
          aside={
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase tracking-label'
            >
              {counts.closed} closed
              {counts.leak ? ` · ${counts.leak} leak` : ''}
              {counts.merged ? ` · ${counts.merged} two seeds` : ''}
              {counts.tiny ? ` · ${counts.tiny} tiny` : ''}
            </Text>
          }
        >
          {variants.length > 1 && !session.variant && (
            <Text size='micro' component='p' className='mb-2 text-warning'>
              ! the sheet carries {variants.length} models ({variants.join(', ')}). one run imports
              one model — pick it above.
            </Text>
          )}
          <ul className='divide-y divide-hairline'>
            {families.map((f) => {
              const c = cand(f);
              const o = outcomeOf(f);
              const s = seedAt(f.seed);
              const ranks = [...f.candidates].sort((a, b) => a.rank - b.rank);
              const out_ = ranks.filter((x) => !mapped || mapped.has(x.rank));
              const shut = out_.filter((x) => x.outcome === 'closed').length;
              return (
                <li key={f.seed} className='pb-1'>
                  <button
                    type='button'
                    onClick={() => setSel(f.seed === sel ? null : f.seed)}
                    className={cn(
                      'flex w-full items-center gap-2 px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                      f.seed === sel ? 'bg-bgZebra' : 'hover:bg-bgZebra',
                    )}
                  >
                    <span className='flex size-4 shrink-0 items-center justify-center bg-textColor text-nano text-bgColor tabular-nums'>
                      {markOf.get(f.seed)}
                    </span>
                    <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                      {s?.origin === 'click' ? 'clicked seed' : `text seed`}
                      {s?.variant ? ` · ${s.variant}` : ''}
                    </Text>
                    <Text size='micro' variant='label' component='span' className='tabular-nums'>
                      {o === 'closed' ? fmtPct(c.sourceCoverage) : ''}
                    </Text>
                    <Pill tone={OUTCOME[o].tone}>{OUTCOME[o].word}</Pill>
                  </button>
                  <div className='flex flex-wrap items-center gap-0.5 pl-6'>
                    {ranks.map((x) => (
                      <RankCell
                        key={x.rank}
                        label={labelOf(x.rank)}
                        outcome={x.outcome}
                        exported={!mapped || mapped.has(x.rank)}
                        current={x.rank === rank}
                        onClick={() => {
                          setRank(x.rank);
                          setSel(f.seed);
                        }}
                      />
                    ))}
                    <Text size='nano' variant='label' component='span' className='ml-1'>
                      {shut}/{out_.length} closed
                    </Text>
                  </div>
                </li>
              );
            })}
          </ul>

          {selected && (
            <>
              <GroupLabel>region {markOf.get(selected.seed)}</GroupLabel>
              <Row
                label='area, this size'
                value={`${(cand(selected).areaMm2 / 100).toFixed(1)} cm²`}
              />
              <Row label='walls covered' value={fmtPct(cand(selected).sourceCoverage)} />
              <Row label='p95 to the walls' value={fmtMm(cand(selected).p95Mm)} />
              <Row
                label='grows with size'
                value={selected.monotone ? 'yes' : <span className='text-error'>no</span>}
              />
              <Text size='micro' variant='label' component='p' className='mt-1'>
                {outcomeOf(selected) === 'leak'
                  ? 'the outline has a gap and the fill ran outside (the red ring). close gap: click the two line ends at the ring. or drop it if it is not a piece.'
                  : outcomeOf(selected) === 'merged'
                    ? 'two seeds share one region: the pieces touch. draw a lasso around one of them to split.'
                    : outcomeOf(selected) === 'tiny'
                      ? `smaller than ${PATIMPORT.minPieceAreaMm2 / 100} cm² — a label or a mark, not a piece.`
                      : 'closed and snapped to the drawn lines.'}
              </Text>
              <div className='mt-2 flex flex-wrap gap-2'>
                <Button
                  variant='secondary'
                  size='sm'
                  disabled={!!session.busy}
                  onClick={() => {
                    void api.editPieces({ kind: 'not-a-piece', seed: selected.seed });
                    setSel(null);
                  }}
                >
                  not a piece
                </Button>
                <Button
                  variant='secondary'
                  size='sm'
                  disabled={!!session.busy}
                  onClick={() => setTool('reseed')}
                >
                  reseed
                </Button>
              </div>
            </>
          )}

          <GroupLabel>edits</GroupLabel>
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label' component='span'>
              {[
                `${inputs.edits.length} ${inputs.edits.length === 1 ? 'edit' : 'edits'}`,
                bridges.length &&
                  `${bridges.length} ${bridges.length === 1 ? 'gap' : 'gaps'} closed`,
                ignored.size && `${ignored.size} ${ignored.size === 1 ? 'line' : 'lines'} ignored`,
                `${inputs.clickSeeds.length} clicked ${inputs.clickSeeds.length === 1 ? 'seed' : 'seeds'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {inputs.edits.length > 0 && (
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                disabled={!!session.busy}
                onClick={() => void api.editPieces('undo')}
              >
                undo last
              </Button>
            )}
          </div>
          {hint && (
            <Text size='micro' variant='label' component='p' className='mt-1'>
              {hint}
            </Text>
          )}
        </Panel>
      }
    />
  );
}

/** One size of a region: filled ink when closed; a leak / two seeds / tiny reads in words too. */
function RankCell({
  label,
  outcome,
  exported,
  current,
  onClick,
}: {
  label: string;
  outcome: FillOutcome;
  exported: boolean;
  current: boolean;
  onClick: () => void;
}) {
  const word = exported ? OUTCOME[outcome].word : 'not exported';
  return (
    <button
      type='button'
      onClick={onClick}
      title={`size ${label}: ${word}`}
      aria-label={`size ${label}: ${word}`}
      className={cn(
        'h-4 min-w-6 border px-0.5 text-nano tabular-nums leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
        !exported
          ? 'border-dashed border-borderColor text-labelColor'
          : outcome === 'closed'
            ? 'border-textColor bg-textColor text-bgColor'
            : outcome === 'leak'
              ? 'border-error text-error line-through'
              : outcome === 'merged'
                ? 'border-warning text-warning'
                : 'border-borderColor text-labelColor',
        current && 'outline outline-1 outline-offset-1 outline-textColor',
      )}
    >
      {label}
    </button>
  );
}
