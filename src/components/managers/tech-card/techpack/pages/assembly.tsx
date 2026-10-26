// 06 ASSEMBLY — every operation of the card is one row, strictly in operation-number order, each
// with its own picture: a join (sew / overlock) draws its pieces laid along the stored seam edges
// (TechCard.seams on today's DXF), every other op draws the key of its technique next to the
// outline of what it acts on. Rows are measured in the DOM once the print font is in and paginated
// so a row (with its STOP box) never splits.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DataTable, HeaderNote, SectionHeader } from 'ui';

import type { common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';

import { KEYS_CSS, KeyArt, Legend, Line, StopBox, Svg } from '../assembly-keys';
import {
  fmtDelta,
  joinSvg,
  shownMetrics,
  silhouetteSvg,
  type AsmRow,
  type AssemblyModel,
  type SeamMetric,
  type Seg,
  type SvgMarkup,
} from '../derive-assembly';
import { BODY_PX, TechpackSheet } from '../sheet';
import { Gap } from '../gaps';

const ASM_CSS = String.raw`
.asm-cols { display: grid; min-height: 0; flex: 1 1 0; column-gap: 24px; }
.asm-cols[data-orient=land] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.asm-cols[data-orient=port] { grid-template-columns: minmax(0, 1fr); }
.asm-col { min-width: 0; min-height: 0; overflow: hidden; }
.asm-table table { table-layout: fixed; }
.asm-table td { padding-top: 4px !important; padding-bottom: 4px !important; font-size: 12px !important; line-height: 1.25; }
.asm-table th { font-size: 10px !important; }
.asm-mc { color: var(--color-labelColor); }
.asm-table td.asm-n { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; }
.asm-seams { display: flex; flex-direction: column; gap: 1px; margin-top: 2px; }
.asm-pic { display: flex; gap: 4px; align-items: flex-start; }
.asm-pic svg, .asm-table td svg { display: block; flex: none; }
.asm-verb { font-weight: 700; }
.asm-what b { font-weight: 700; }
.asm-turn { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; }
.asm-stop td { padding-top: 0 !important; }
.asm-stop-box { padding: 4px 8px !important; font-size: 12px; line-height: 1.3; }
.asm-measure { position: fixed; left: -30000px; top: 0; visibility: hidden; pointer-events: none; }
.asm-measure .asm-col { overflow: visible; }
`;

const DIM = {
  land: { n: 46, tool: 112, joinW: 142, joinH: 112, keyW: 48, keyH: 42 },
  port: { n: 48, tool: 140, joinW: 190, joinH: 150, keyW: 60, keyH: 50 },
} as const;

/** Edge letters in the table thumbnails: half the letter box, px. */
const THUMB_BADGE_PX = 5.5;

type Row = AsmRow & { pic?: SvgMarkup; sil?: SvgMarkup | null };

function Cols({ orient }: { orient: PrintOrient }) {
  const d = DIM[orient];
  return (
    <colgroup>
      <col style={{ width: d.n }} />
      <col style={{ width: '29%' }} />
      <col />
      <col style={{ width: d.tool }} />
    </colgroup>
  );
}

function Head() {
  return (
    <thead>
      <tr>
        <th>op</th>
        <th data-align='left'>picture</th>
        <th data-align='left'>operation</th>
        <th data-align='left'>machine · Δ</th>
      </tr>
    </thead>
  );
}

/** Δ only from 0.5 mm; a broken seam prints both lengths. */
function Delta({ metrics }: { metrics: readonly SeamMetric[] }) {
  const shown = shownMetrics(metrics);
  if (!shown.length) return null;
  return (
    <div className='asm-delta'>
      {shown.map((m) => (
        <Fragment key={m.letter}>
          <span className={m.bad ? 'asm-delta-line asm-delta-bad' : 'asm-delta-line'}>
            <i className='asm-letter'>{m.letter}</i>
            {fmtDelta(m.delta ?? 0)}
            {m.gap && <Gap gap={m.gap} />}
          </span>
          {m.bad && (
            <>
              <span className='asm-delta-bad'>{m.left.toFixed(1)}</span>
              <span className='asm-delta-bad'>↔ {m.right?.toFixed(1)}</span>
            </>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function Picture({ r, orient }: { r: Row; orient: PrintOrient }) {
  const d = DIM[orient];
  if (r.pic) {
    // the drawing's own aspect in the box: wide seams make short rows, tall pieces narrow ones
    const [, , vw, vh] = r.pic.viewBox.split(' ').map(Number);
    const k = Math.min(d.joinW / vw, d.joinH / vh);
    return (
      <Svg
        m={r.pic}
        w={Math.round(vw * k)}
        h={Math.max(d.keyH, Math.round(vh * k))}
        label={`${r.n} ${r.words.verb}`}
      />
    );
  }
  return (
    <div className='asm-pic'>
      <KeyArt tech={r.words.tech} w={d.keyW} h={d.keyH} />
      {r.sil && <Svg m={r.sil} w={d.keyW} h={d.keyH} />}
    </div>
  );
}

function SegLine({ seg, className }: { seg: Seg; className?: string }) {
  return <div className={className}>{seg.gap ? <Gap gap={seg.gap} /> : seg.t}</div>;
}

function OpRow({ r, orient }: { r: Row; orient: PrintOrient }) {
  const w = r.words;
  const cardGaps = (r.card?.gaps ?? []).filter(
    (gap) => !r.card?.metrics.some((metric) => metric.gap === gap),
  );
  return (
    <tr data-op={r.n}>
      <td className='asm-n'>{r.n}</td>
      <td data-align='left'>
        <Picture r={r} orient={orient} />
      </td>
      <td data-align='left'>
        <div className='asm-what'>
          <span className='asm-verb'>{w.verb}</span> {w.ins.join(' + ')}
          {w.out && (
            <>
              {' '}
              → <b>{w.out}</b>
            </>
          )}
        </div>
        <Line segs={w.line.filter((segment) => !segment.gap)} />
        {w.line.some((segment) => segment.gap) && (
          <div>
            {w.line.flatMap((segment, index) =>
              segment.gap ? (
                <Fragment key={`${segment.gap.code}-${index}`}>
                  {index > 0 && ' · '}
                  <Gap gap={segment.gap} />
                </Fragment>
              ) : (
                []
              ),
            )}
          </div>
        )}
        {cardGaps.map((gap) => (
          <div key={`${gap.code}-${gap.refs.join('-')}`}>
            <Gap gap={gap} />
          </div>
        ))}
        {w.seams.length > 0 && (
          <div className='asm-seams'>
            {w.seams.map((seam) => (
              <div key={seam}>{seam}</div>
            ))}
          </div>
        )}
        {r.card?.turn && (
          <div className='asm-turn'>
            <KeyArt tech='turn' w={24} h={18} />
            <span>Turn out</span>
          </div>
        )}
      </td>
      <td data-align='left'>
        {w.tool.map((t) => (
          <SegLine key={t.t} seg={t} />
        ))}
        {w.mc && <SegLine seg={w.mc} className='asm-mc' />}
        <Delta metrics={r.card?.metrics ?? []} />
      </td>
    </tr>
  );
}

/** A block = what stays together on one page: the op row and its STOP box. */
function BlockBody({ r, orient }: { r: Row; orient: PrintOrient }) {
  return (
    <tbody data-block={r.n}>
      <OpRow r={r} orient={orient} />
      {r.card?.stop && (
        <tr className='asm-stop'>
          <td />
          <td colSpan={3} data-align='left'>
            <StopBox text={r.card.stop} n={r.n} className='asm-stop-box' />
          </td>
        </tr>
      )}
    </tbody>
  );
}

type Col = Row[];

function Table({ col, orient }: { col: Col; orient: PrintOrient }) {
  return (
    <DataTable className='asm-table'>
      <Cols orient={orient} />
      <Head />
      {col.map((r) => (
        <BlockBody key={r.n} r={r} orient={orient} />
      ))}
    </DataTable>
  );
}

export function AssemblyPage({
  orient,
  docline,
  n,
  model,
  onLaidOut,
}: {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  /** null while the pattern geometry is still loading. */
  model: AssemblyModel | null;
  /** true once the rows are measured and paginated (the print-ready gate waits for it). */
  onLaidOut: (done: boolean) => void;
}) {
  const rows = useMemo<Row[]>(
    () =>
      (model?.rows ?? []).map((r) => ({
        ...r,
        pic: r.card?.items.length
          ? joinSvg(model!, r.card, true, [DIM[orient].joinW, DIM[orient].joinH], THUMB_BADGE_PX)
          : undefined,
        sil: r.card ? null : silhouetteSvg(model!, r.target),
      })),
    [model, orient],
  );
  const [laid, setLaid] = useState<{ rows: Row[]; cols: Col[] } | null>(null);
  const cols = laid?.rows === rows ? laid.cols : null;
  const probe = useRef<HTMLDivElement>(null);

  // measure once FeatureMono is in (fallback-font heights would mis-paginate)
  useEffect(() => {
    if (!rows.length) return;
    let live = true;
    document.fonts.ready.then(() => {
      const root = probe.current;
      if (!live || !root) return;
      const cap = (root.querySelector<HTMLElement>('.asm-col')?.clientHeight ?? 0) - 2;
      const head = root.querySelector<HTMLElement>('thead')?.getBoundingClientRect().height ?? 0;
      const hs = rows.map(
        (r) =>
          root.querySelector<HTMLElement>(`tbody[data-block="${r.n}"]`)?.getBoundingClientRect()
            .height ?? 0,
      );
      const out: Col[] = [];
      let cur: Col | null = null;
      let used = 0;
      rows.forEach((r, i) => {
        if (!cur || used + hs[i] > cap) {
          cur = [];
          out.push(cur);
          used = head;
        }
        cur.push(r);
        used += hs[i];
      });
      setLaid({ rows, cols: out });
    });
    return () => {
      live = false;
    };
  }, [rows]);

  const done = !!model && (!rows.length || !!cols);
  useLayoutEffect(() => {
    onLaidOut(done);
  }, [done, onLaidOut]);

  if (!model) return null;
  const title = `${n} assembly`;
  if (!rows.length) {
    return (
      <TechpackSheet orient={orient} docline={docline}>
        <SectionHeader title={title} />
        {model.emptyGap && <Gap gap={model.emptyGap} />}
      </TechpackSheet>
    );
  }

  const per = orient === 'land' ? 2 : 1;
  const pages: Col[][] = [];
  if (cols) for (let i = 0; i < cols.length; i += per) pages.push(cols.slice(i, i + per));

  return (
    <>
      <style>{KEYS_CSS + ASM_CSS}</style>
      {!cols && (
        <div
          ref={probe}
          className='asm-measure'
          style={{ width: BODY_PX[orient].w + 90, height: BODY_PX[orient].h + 106 }}
        >
          <div className='tp-body'>
            <SectionHeader title={title} action={<HeaderNote>0</HeaderNote>} />
            <div className='asm-cols' data-orient={orient}>
              <div className='asm-col'>
                <Table col={rows} orient={orient} />
              </div>
            </div>
            <Legend />
          </div>
        </div>
      )}
      {pages.map((pg) => {
        const first = pg[0][0].n;
        const lastCol = pg[pg.length - 1];
        const last = lastCol[lastCol.length - 1].n;
        return (
          <TechpackSheet key={first} orient={orient} docline={docline}>
            <SectionHeader
              title={title}
              action={<HeaderNote>{`ops ${first}–${last} · ${rows.length}`}</HeaderNote>}
            />
            <div className='asm-cols' data-orient={orient}>
              {Array.from({ length: per }, (_, i) => (
                <div key={i} className='asm-col'>
                  {pg[i] && <Table col={pg[i]} orient={orient} />}
                </div>
              ))}
            </div>
            <Legend />
          </TechpackSheet>
        );
      })}
    </>
  );
}
