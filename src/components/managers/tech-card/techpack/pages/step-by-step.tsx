// 07 STEP BY STEP — one big drawing per join, in strict operation order, with the same op numbers,
// words, edge letters and Δ as the Assembly table. Every op that belongs to a join (press before,
// topstitch / press / buttonholes after) sits on its card with its own key drawing. A mirror pair
// shares a card only when no other card falls between the two joins, and then reads «L + R».
import { Fragment, useMemo, type ReactNode } from 'react';
import { HeaderNote, Pill, SectionHeader } from 'ui';

import type { common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';

import { KEYS_CSS, KeyArt, Legend, Line, StopBox, Svg } from '../assembly-keys';
import {
  fmtDelta,
  joinSvg,
  shownMetrics,
  type AssemblyModel,
  type OpWords,
  type SeamMetric,
  type StepTileModel,
} from '../derive-assembly';
import { TechpackSheet } from '../sheet';

const ST_CSS = String.raw`
.st-grid { display: grid; flex: 1 1 0; min-height: 0; gap: 14px; }
.st-grid[data-orient=land] { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(min-content, 1fr)); }
.st-grid[data-orient=port] { grid-template-columns: minmax(0, 1fr); grid-template-rows: repeat(3, minmax(min-content, 1fr)); }
.st-card { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-top: 2px solid var(--color-textColor); padding-top: 5px; }
.st-head { display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 1.25; }
.st-op { font-weight: 700; white-space: nowrap; }
.st-title { flex: 0 1 auto; font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
.st-mode { color: var(--color-labelColor); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; margin-left: auto; }
.st-body { display: grid; flex: 1 1 0; gap: 10px; margin-top: 4px; }
.st-body[data-flow=side] { grid-template-columns: minmax(0, 1fr) var(--st-act); }
.st-body[data-flow=below] { grid-template-rows: minmax(0, 1fr) auto; }
.st-pic { position: relative; min-width: 0; min-height: 0; }
.st-pic svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.st-acts { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 12px; line-height: 1.25; }
.st-body[data-flow=below] .st-acts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 10px; }
.st-act { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 6px; align-items: start; padding: 2px 3px; border: 1px solid transparent; }
.st-act[data-main] { border-color: var(--color-textColor); }
.st-act svg { display: block; }
.st-act-n, .st-act-v { font-weight: 700; }
.st-act-t { overflow-wrap: anywhere; }
.st-act-mc { color: var(--color-labelColor); }
.st-metrics { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 3px; font-size: 12px; }
.st-stop { margin-top: 4px; padding: 4px 8px !important; font-size: 12px; line-height: 1.3; }
`;

const ACT_W = { land: 200, port: 250 } as const;
/** The drawing box per layout (card minus head / ops column), so edge letters print at one size. */
const BOX: Record<'side' | 'below' | 'port', [number, number]> = {
  side: [299, 255],
  below: [509, 255],
  port: [444, 283],
};
/** One row of ops under a wide drawing, and the STOP box under the card. */
const ACT_ROW_PX = 45;
const STOP_PX = 100;
const BIG_BADGE_PX = 7;

function What({ w }: { w: OpWords }) {
  return (
    <>
      {w.ins.join(' + ')}
      {w.out && (
        <>
          {' '}
          → <b>{w.out}</b>
        </>
      )}
    </>
  );
}

function Metrics({ ms, prefix }: { ms: readonly SeamMetric[]; prefix?: string }) {
  const shown = shownMetrics(ms);
  if (!shown.length) return null;
  return (
    <>
      {shown.map((m) => (
        <span
          key={`${prefix ?? ''}${m.letter}`}
          className={m.bad ? 'asm-delta-line asm-delta-bad' : 'asm-delta-line'}
        >
          {prefix && <span>{prefix}</span>}
          <i className='asm-letter'>{m.letter}</i>
          {m.left.toFixed(1)} ↔ {m.right?.toFixed(1)} · Δ {fmtDelta(m.delta ?? 0)}
          {m.bad && ' !'}
        </span>
      ))}
    </>
  );
}

/** One line on a card: key drawing, op number(s), verb, instruction line, SA / TS, machine. */
function Act({
  row,
  main,
  own,
  words,
}: {
  row: number[];
  main: boolean;
  own: Set<string>;
  words: OpWords;
}) {
  const w = words;
  // the parts are in the title; repeat them only for an input the join itself does not name
  const showWhat = row.length === 1 && !main && w.ins.some((x) => !own.has(x));
  const mc = w.mc && w.mc.t !== w.verb ? w.mc : undefined;
  return (
    <div className='st-act' data-main={main ? '' : undefined}>
      <KeyArt tech={w.tech} w={34} h={30} />
      <div className='st-act-t'>
        <span className='st-act-n'>{row.join(' · ')}</span>{' '}
        <span className='st-act-v'>{w.verb}</span>
        {showWhat && (
          <>
            {' '}
            <What w={w} />
          </>
        )}
        <Line segs={w.line} />
        {(w.tool.length > 0 || mc) && (
          <div>
            {w.tool.map((t, i) => (
              <Fragment key={t.t}>
                {i > 0 && ' '}
                {t.bad ? <b className='tpa-bad'>{t.t}</b> : t.t}
              </Fragment>
            ))}
            {w.tool.length > 0 && mc && ' · '}
            {mc &&
              (mc.bad ? (
                <b className='tpa-bad'>{mc.t}</b>
              ) : (
                <span className='st-act-mc'>{mc.t}</span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TurnAct() {
  return (
    <div className='st-act'>
      <KeyArt tech='turn' w={34} h={30} />
      <div className='st-act-t'>
        <span className='st-act-v'>Turn out</span>
      </div>
    </div>
  );
}

function StepTile({
  tile,
  model,
  orient,
}: {
  tile: StepTileModel;
  model: AssemblyModel;
  orient: PrintOrient;
}) {
  const pair = tile.mains.length === 2;
  const drawnWords = model.words.get(tile.drawn.n)!;
  const hasPic = tile.drawn.items.length > 0;
  const own = new Set(
    tile.mains.flatMap((m) => {
      const w = model.words.get(m);
      return w ? [...w.ins, w.out ?? ''] : [];
    }),
  );
  const acts: ReactNode[] = [];
  for (const row of tile.rows) {
    const main = row.some((x) => tile.mains.includes(x));
    const words = model.words.get(row[0]);
    if (!words) continue;
    acts.push(<Act key={row[0]} row={row} main={main} own={own} words={words} />);
    if (main && model.cards.get(row[0])?.turn) acts.push(<TurnAct key={`t${row[0]}`} />);
  }
  const [, , bw, bh] = hasPic
    ? joinSvg(model, tile.drawn, false).viewBox.split(' ').map(Number)
    : [0, 0, 1, 1];
  // the ops go beside the drawing or under it, whichever leaves the drawing bigger
  const stopPx = tile.mains.some((m) => model.cards.get(m)?.stop) ? STOP_PX : 0;
  const boxOf = (b: [number, number], under = 0): [number, number] => [
    b[0],
    Math.max(b[1] - stopPx - under, 40),
  ];
  const side = boxOf(BOX[orient === 'land' ? 'side' : 'port']);
  const below = boxOf(BOX.below, Math.ceil(acts.length / 2) * ACT_ROW_PX);
  const scale = (b: [number, number]) => Math.min(b[0] / bw, b[1] / bh);
  const flow = orient === 'land' && scale(below) > scale(side) ? 'below' : 'side';
  const svg = hasPic
    ? joinSvg(model, tile.drawn, false, flow === 'below' ? below : side, BIG_BADGE_PX)
    : null;
  const [, , vw, vh] = svg ? svg.viewBox.split(' ').map(Number) : [0, 0, 1, 1];
  return (
    <section className='st-card' data-card={tile.mains.join(' ')}>
      <div className='st-head'>
        <span className='st-op'>op {tile.mains.join(' · ')}</span>
        <span className='st-title'>
          {drawnWords.verb} <What w={drawnWords} />
        </span>
        {pair && <Pill>L + R</Pill>}
        {tile.drawn.mid && <span className='st-mode'>between layers</span>}
      </div>
      <div
        className='st-body'
        data-flow={flow}
        style={{ ['--st-act' as string]: `${ACT_W[orient]}px` }}
      >
        <div className='st-pic'>
          {svg && <Svg m={svg} w={vw} h={vh} label={`op ${tile.mains.join(' ')}`} />}
        </div>
        <div className='st-acts'>
          {acts}
          <div className='st-metrics'>
            {tile.mains.map((m) => (
              <Fragment key={m}>
                <Metrics
                  ms={model.cards.get(m)?.metrics ?? []}
                  prefix={pair ? `${m}` : undefined}
                />
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      {tile.mains.map((m) => {
        const stop = model.cards.get(m)?.stop;
        return stop ? <StopBox key={m} text={stop} n={m} className='st-stop' /> : null;
      })}
    </section>
  );
}

const opSpan = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

export function StepByStepPage({
  orient,
  docline,
  n,
  model,
}: {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  /** null while the pattern geometry is still loading. */
  model: AssemblyModel | null;
}) {
  const tiles = model?.tiles ?? [];
  const per = orient === 'land' ? 4 : 3;
  const pages = useMemo(() => {
    const out: StepTileModel[][] = [];
    for (let i = 0; i < tiles.length; i += per) out.push(tiles.slice(i, i + per));
    return out;
  }, [tiles, per]);
  // optional section: a card with no joins prints no step pages
  if (!model || !pages.length) return null;
  const title = `${n} step by step`;
  return (
    <>
      <style>{KEYS_CSS + ST_CSS}</style>
      {pages.map((pg) => {
        const last = pg[pg.length - 1];
        return (
          <TechpackSheet key={pg[0].mains[0]} orient={orient} docline={docline}>
            <SectionHeader
              title={title}
              action={
                <HeaderNote>{`op ${opSpan(pg[0].mains[0], last.mains[last.mains.length - 1])} · ${tiles.length} seams`}</HeaderNote>
              }
            />
            <div className='st-grid' data-orient={orient}>
              {pg.map((t) => (
                <StepTile key={t.mains[0]} tile={t} model={model} orient={orient} />
              ))}
            </div>
            <Legend />
          </TechpackSheet>
        );
      })}
    </>
  );
}
