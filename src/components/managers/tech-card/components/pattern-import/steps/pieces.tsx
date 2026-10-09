// Step 5 · PIECES — seed + outer fill (06-SYNTHESIS: the core). Every region is drawn as found;
// what the fill could not close goes to the human: a leak (red, with where the outside got in),
// two seeds in one region (blue), a region too small to be a piece. Tools: click to seed, lasso to
// merge (around several seeds) or split (inside a merged region), "not a piece", reseed.
import { useMemo, useState } from 'react';
import type { FillOutcome, PieceFamily, PtMm } from 'lib/pattern-import/types';
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
import { variantsOf } from '../use-import-session';
import { Panel, SplitStage, fmtMm, fmtPct } from '../ui-bits';

type Tool = 'pan' | 'seed' | 'lasso' | 'reseed';

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
  const variants = variantsOf(out?.seeds ?? [], api.baseSeeds);
  const families = useMemo(() => out?.families ?? [], [out]);
  const markOf = useMemo(() => new Map(families.map((f, i) => [f.seed, i + 1])), [families]);
  if (!out || !session.sheet || !session.chains) return null;

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
                  ['pan', 'pan'],
                  ['seed', '+ seed'],
                  ['lasso', 'lasso'],
                ] as const
              ).map(([t, word]) => (
                <Chip
                  quiet
                  key={t}
                  selected={tool === t}
                  pressed={tool === t}
                  onClick={() => setTool(t)}
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
            <Text size='micro' variant='label' component='span' className='ml-auto'>
              {tool === 'seed'
                ? 'click inside a piece to seed it'
                : tool === 'lasso'
                  ? 'draw around several seeds to merge · inside a two-seed region to split'
                  : tool === 'reseed'
                    ? 'click the new place for the selected seed'
                    : 'click a piece to select · wheel zoom · drag pan'}
            </Text>
          </div>
          <div className='min-h-0 flex-1'>
            <SheetViewport
              bbox={session.sheet.sheet.bbox}
              tool={tool === 'pan' ? 'pan' : tool === 'lasso' ? 'lasso' : 'point'}
              onPick={(k) => setSel(k ? Number(k) : null)}
              onPoint={(pt) => {
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
                  <g
                    fill='none'
                    stroke={SHEET_INK.source}
                    strokeWidth={unit * 0.6}
                    pointerEvents='none'
                  >
                    {session.chains!.chainPreview.map((a, i) => (
                      <polyline key={i} points={f32Attr(a)} />
                    ))}
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
              return (
                <li key={f.seed}>
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
                  ? 'the outline has a gap and the fill ran outside. reseed inside a closed part, or drop it if it is not a piece.'
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
              {inputs.edits.length} {inputs.edits.length === 1 ? 'edit' : 'edits'} ·{' '}
              {inputs.clickSeeds.length} clicked {inputs.clickSeeds.length === 1 ? 'seed' : 'seeds'}
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
