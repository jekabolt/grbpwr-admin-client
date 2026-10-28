// 06 ASSEMBLY — every operation of the card is one row, strictly in operation-number order, each
// with its own picture: a join (sew / overlock) draws its pieces laid along the stored seam edges
// (TechCard.seams on today's DXF), every other op draws the key of its technique next to the
// outline of what it acts on. Rows are measured in the DOM once the print font is in and paginated
// so a row (with its STOP box) never splits.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DataTable, HeaderNote, SectionHeader } from 'ui';

import type { common_TechCard, common_TechCardOperationMedia } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { AnnotationCanvas } from 'components/managers/tech-card/components/annotation-canvas';
import { viewerOrigin } from 'utils/viewer-origin';
import {
  annotationFromWire,
  wireInt,
  type AnnotationForm,
} from 'components/managers/tech-card/components/schema';

import { KEYS_CSS, KeyArt, Line, StopBox, Svg, TURN_KEY } from '../assembly-keys';
import { asmProtoFlags } from '../asm-proto-flags';
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
import { gapHref, gapSection, gapSubjects, gapWhere } from '../gap-findings';
import { gapKey, type Gap } from '../gaps';
import { BODY_PX, chunksOf, TechpackSheet } from '../sheet';
import { own, useT, type PdfT } from '../i18n';

const ASM_CSS = String.raw`
.asm-cols { display: grid; min-height: 0; flex: 1 1 0; column-gap: 24px; }
.asm-cols[data-orient=land] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.asm-cols[data-orient=port] { grid-template-columns: minmax(0, 1fr); }
.asm-col { min-width: 0; min-height: 0; overflow: visible; }
.asm-col > div:has(> table.asm-table) { overflow: visible; }
.asm-table { width: 100%; table-layout: fixed; }
.asm-table td { min-width: 0; padding-top: 4px !important; padding-bottom: 4px !important; font-size: 12px !important; line-height: 1.25; white-space: normal; overflow-wrap: anywhere; }
.asm-table th { font-size: 10px !important; }
.asm-mc { color: var(--color-textColor); }
.asm-table td.asm-n { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; }
.asm-seams { display: flex; min-width: 0; flex-direction: column; gap: 1px; margin-top: 2px; }
.asm-picture-box { position: relative; display: flex; width: 100%; max-width: 100%; flex: none; align-items: center; justify-content: center; }
.asm-picture-box > svg { max-width: 100%; max-height: 100%; }
.asm-picture-key { position: absolute; left: 4px; top: 4px; z-index: 1; background: var(--color-bgColor); }
.asm-pic svg, .asm-table td svg { display: block; flex: none; }
.asm-verb { font-weight: 700; }
.asm-what b { font-weight: 700; }
.asm-params, .asm-machine-params { margin-top: 2px; color: var(--color-labelColor); font-size: 10px; line-height: 1.25; }
.asm-marker { display: inline-block; margin-left: 5px; border: 1px solid var(--color-textColor); padding: 0 3px; color: var(--color-textColor); font-size: 9px; line-height: 1.35; text-transform: lowercase; vertical-align: 1px; }
.asm-turn { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; }
.asm-stop td { padding-top: 0 !important; }
.asm-stop-box { padding: 4px 8px !important; font-size: 12px; line-height: 1.3; }
.asm-measure { position: fixed; left: -30000px; top: 0; visibility: hidden; pointer-events: none; }
.asm-measure .asm-col { overflow: visible; }
.asm-photos { display: grid; min-height: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 24px; }
.asm-photos[data-count='1'] { grid-template-columns: minmax(0, 1fr); }
.asm-photo { display: flex; min-width: 0; margin: 0; flex-direction: column; align-self: start; }
.asm-photo-frame { min-height: 0; overflow: hidden; }
.asm-photo-frame > *, .asm-photo-canvas, .asm-photo-canvas [data-annot-frame] { max-width: 100%; }
.asm-photo-caption { flex: none; padding-bottom: 6px; color: var(--color-textColor); font-size: 11px; }
.asm-gaps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; row-gap: 16px; }
.asm-gap-group { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; break-inside: avoid; }
.asm-gap-title { grid-column: 1 / -1; margin-bottom: 4px; color: var(--color-labelColor); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
.asm-gap-line { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--color-hairline); color: var(--color-error); font-size: 11px; line-height: 1.25; text-decoration: none; }
.asm-gap-text { min-width: 0; text-decoration: underline; text-underline-offset: 2px; }
.asm-gap-to { flex: none; color: var(--color-labelColor); font-size: 10px; }
`;

const DIM = {
  land: { n: 40, tool: 96, joinW: 212, joinH: 186, keyW: 40, keyH: 34 },
  port: { n: 48, tool: 130, joinW: 330, joinH: 150, keyW: 40, keyH: 34 },
} as const;

const ROWS_PER_SHEET = 6;
/** DataTable cell padding, both sides (px-1.5 ×2). */
const CELL_PAD_X = 12;

/** Edge letters in the table thumbnails: half the letter box, px. */
const THUMB_BADGE_PX = 5.5;

type Row = AsmRow & { pic?: SvgMarkup; sil?: SvgMarkup | null; photoCount: number };

type Photo = {
  op: number;
  index: number;
  url: string;
  caption: string;
  annotations: AnnotationForm[];
};

function pictureDimensions(orient: PrintOrient) {
  const d = DIM[orient];
  return {
    join: [d.joinW, d.joinH] as [number, number],
    silhouette: [d.joinW, d.joinH] as [number, number],
  };
}

function Cols({ orient }: { orient: PrintOrient }) {
  const d = DIM[orient];
  return (
    <colgroup>
      <col style={{ width: d.n }} />
      <col style={{ width: d.joinW + CELL_PAD_X }} />
      <col />
      <col style={{ width: d.tool }} />
    </colgroup>
  );
}

function Head() {
  const { t } = useT();
  return (
    <thead>
      <tr>
        <th>{t('assembly.op')}</th>
        <th data-align='left'>{t('assembly.picture')}</th>
        <th data-align='left'>{t('assembly.operation')}</th>
        <th data-align='left'>{t('assembly.machineDelta')}</th>
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
  const picture = pictureDimensions(orient);
  const drawing = r.pic ?? r.sil;
  const showKey = asmProtoFlags().key;
  return (
    <div className='asm-picture-box' style={{ width: d.joinW, height: d.joinH }}>
      {drawing && (
        <Svg
          m={drawing}
          w={r.pic ? picture.join[0] : picture.silhouette[0]}
          h={r.pic ? picture.join[1] : picture.silhouette[1]}
          label={`${r.n} ${r.words.verb}`}
        />
      )}
      {showKey && <KeyArt icon={r.words.icon} w={d.keyW} h={d.keyH} className='asm-picture-key' />}
    </div>
  );
}

function SegLine({ seg, className }: { seg: Seg; className?: string }) {
  return <div className={className}>{seg.t}</div>;
}

function OpRow({ r, orient }: { r: Row; orient: PrintOrient }) {
  const { t } = useT();
  const w = r.words;
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
          {w.draft && <span className='asm-marker'>{t('assembly.draft')}</span>}
          {Array.from({ length: r.photoCount }, (_, index) => (
            <span className='asm-marker' key={index}>
              {t('assembly.photo', { count: index + 1 })}
            </span>
          ))}
        </div>
        <Line segs={w.line.filter((segment) => !segment.gap)} />
        {w.params.length > 0 && <div className='asm-params'>{w.params.join(' · ')}</div>}
        {w.seams.length > 0 && (
          <div className='asm-seams'>
            {w.seams.map((seam) => (
              <div key={seam}>{seam}</div>
            ))}
          </div>
        )}
        {r.card?.turn && (
          <div className='asm-turn'>
            <KeyArt icon={TURN_KEY} w={24} h={18} />
            <span>{t('assembly.turnOut')}</span>
          </div>
        )}
      </td>
      <td data-align='left'>
        {w.tool
          .filter((segment) => !segment.gap)
          .map((t) => (
            <SegLine key={t.t} seg={t} />
          ))}
        {w.mc && <SegLine seg={w.mc} className='asm-mc' />}
        {w.machineParams.length > 0 && (
          <div className='asm-machine-params'>{w.machineParams.join(' · ')}</div>
        )}
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

function operationPhotos(techCard: common_TechCard): Photo[] {
  const urls = new Map<number, string>();
  for (const resolved of techCard.resolvedOperationMedia ?? []) {
    const id = wireInt(resolved.media?.id);
    const url =
      resolved.media?.media?.fullSize?.mediaUrl || resolved.media?.media?.thumbnail?.mediaUrl;
    if (id && url) urls.set(id, url);
  }
  return (techCard.techCard?.operations ?? []).flatMap((operation) =>
    (operation.media ?? []).flatMap((media: common_TechCardOperationMedia, index) => {
      const url = urls.get(wireInt(media.mediaId));
      return url
        ? [
            {
              op: operation.operationNumber ?? 0,
              index: index + 1,
              url,
              caption: media.caption?.trim() ?? '',
              annotations: (media.annotations ?? []).map(annotationFromWire),
            },
          ]
        : [];
    }),
  );
}

type GapGroup = { kind: string; gaps: Gap[] };
type GapPage = { groups: GapGroup[] };

function gapPages(gaps: readonly Gap[], orient: PrintOrient, t: PdfT): GapPage[] {
  const perPage = orient === 'land' ? 34 : 48;
  return chunksOf(gaps, perPage).map((pageGaps) => {
    const groups: GapGroup[] = [];
    for (const gap of pageGaps) {
      const kind = gapSection(gap, t);
      const previous = groups[groups.length - 1];
      if (previous?.kind === kind) previous.gaps.push(gap);
      else groups.push({ kind, gaps: [gap] });
    }
    return { groups };
  });
}

function PhotoSheet({
  photos,
  orient,
  docline,
  count,
  pieceLabel,
}: {
  photos: Photo[];
  orient: PrintOrient;
  docline: string;
  count: string;
  pieceLabel: (key: string) => string | undefined;
}) {
  const { t } = useT();
  return (
    <TechpackSheet orient={orient} docline={docline} count={count}>
      <SectionHeader
        title={t('assembly.photosTitle')}
        action={<HeaderNote>{t('common.photos', { count: photos.length })}</HeaderNote>}
      />
      <div className='asm-photos' data-count={photos.length} data-assembly-page='photos'>
        {photos.map((photo) => (
          <figure className='asm-photo' data-photo-op={photo.op} key={`${photo.op}-${photo.index}`}>
            <figcaption className='asm-photo-caption'>
              {t('assembly.photoCaption', { op: photo.op, index: photo.index })}
              {photo.caption ? ` · ${own(photo.caption)}` : ''}
            </figcaption>
            <div className='asm-photo-frame'>
              <AnnotationCanvas
                src={photo.url}
                alt={t('assembly.operationAlt', { op: photo.op })}
                annotations={photo.annotations}
                className='asm-photo-canvas'
                maxHeightClass='max-h-[120mm]'
                pieceLabel={pieceLabel}
                frozen
              />
            </div>
          </figure>
        ))}
      </div>
    </TechpackSheet>
  );
}

function GapsSheet({
  page,
  orient,
  docline,
  count,
  subjectOf,
  cardId,
}: {
  page: GapPage;
  orient: PrintOrient;
  docline: string;
  count: string;
  subjectOf: (gap: Gap) => string;
  /** The card the lines link back to; a card not saved yet prints plain lines. */
  cardId?: number;
}) {
  const { t } = useT();
  const origin = viewerOrigin();
  return (
    <TechpackSheet orient={orient} docline={docline} count={count}>
      <SectionHeader title={t('assembly.gapsTitle')} />
      <div className='asm-gaps' data-assembly-page='gaps'>
        {page.groups.map((group, groupIndex) => (
          <div className='asm-gap-group' key={`${group.kind}-${groupIndex}`}>
            <div className='asm-gap-title'>{group.kind}</div>
            {group.gaps.map((gap) => {
              const subject = subjectOf(gap);
              const text = `${gap.target.op ? `${t('assembly.op')} ${gap.target.op} · ` : ''}${gap.label}${subject ? ` · ${own(subject)}` : ''}`;
              if (!cardId)
                return (
                  <div className='asm-gap-line' data-gap-list-row={gapKey(gap)} key={gapKey(gap)}>
                    <span className='asm-gap-text'>{text}</span>
                  </div>
                );
              return (
                <a
                  className='asm-gap-line'
                  data-gap-list-row={gapKey(gap)}
                  key={gapKey(gap)}
                  href={gapHref(gap.target, cardId, origin)}
                  target='_blank'
                  rel='noreferrer'
                >
                  <span className='asm-gap-text'>{text}</span>
                  <span className='asm-gap-to'>{gapWhere(gap.target, t)}</span>
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </TechpackSheet>
  );
}

export function AssemblyPage({
  techCard,
  orient,
  docline,
  n,
  model,
  pdfGaps = model?.gaps ?? [],
  onLaidOut,
}: {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  /** null while the pattern geometry is still loading. */
  model: AssemblyModel | null;
  /** The exact ordered source consumed by the construction audit. */
  pdfGaps: readonly Gap[];
  /** true once the rows are measured and paginated (the print-ready gate waits for it). */
  onLaidOut: (done: boolean) => void;
}) {
  const { t } = useT();
  const picture = useMemo(() => pictureDimensions(orient), [orient]);
  const photos = useMemo(() => operationPhotos(techCard), [techCard]);
  const photoSheets = useMemo(() => chunksOf(photos, 2), [photos]);
  const subjectOf = useMemo(() => gapSubjects(techCard), [techCard]);
  const photoCountByOp = useMemo(() => {
    const counts = new Map<number, number>();
    for (const photo of photos) counts.set(photo.op, (counts.get(photo.op) ?? 0) + 1);
    return counts;
  }, [photos]);
  const rows = useMemo<Row[]>(
    () =>
      (model?.rows ?? []).map((r) => ({
        ...r,
        pic: r.card?.items.length
          ? joinSvg(model!, r.card, true, picture.join, THUMB_BADGE_PX)
          : undefined,
        sil: r.card ? null : silhouetteSvg(model!, r.target, picture.silhouette, r.action),
        photoCount: photoCountByOp.get(r.n) ?? 0,
      })),
    [model, photoCountByOp, picture.join, picture.silhouette],
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
      let out: Col[] = [];
      let cur: Col | null = null;
      let used = 0;
      const perSheet = orient === 'land' ? 2 : 1;
      const rowsPerColumn = ROWS_PER_SHEET / perSheet;
      rows.forEach((r, i) => {
        if (!cur || cur.length >= rowsPerColumn || used + hs[i] > cap) {
          cur = [];
          out.push(cur);
          used = head;
        }
        cur.push(r);
        used += hs[i];
      });
      const balancedColumnCount = Math.ceil(out.length / perSheet) * perSheet;
      if (balancedColumnCount > 1) {
        const base = Math.floor(rows.length / balancedColumnCount);
        const extra = rows.length % balancedColumnCount;
        let at = 0;
        const balanced = Array.from({ length: balancedColumnCount }, (_, index) => {
          const size = base + (index < extra ? 1 : 0);
          const col = rows.slice(at, at + size);
          at += size;
          return col;
        });
        const height = new Map(rows.map((row, index) => [row, hs[index]]));
        if (
          balanced.every(
            (col) => head + col.reduce((sum, row) => sum + (height.get(row) ?? 0), 0) <= cap,
          )
        )
          out = balanced;
      }
      setLaid({ rows, cols: out });
    });
    return () => {
      live = false;
    };
  }, [orient, rows]);

  const done = !!model && (!rows.length || !!cols);
  useLayoutEffect(() => {
    onLaidOut(done);
  }, [done, onLaidOut]);

  if (!model) return null;
  const title = `${n} ${t('assembly.title')}`;

  const per = orient === 'land' ? 2 : 1;
  const pages: Col[][] = [];
  if (cols) for (let i = 0; i < cols.length; i += per) pages.push(cols.slice(i, i + per));
  const gaps = gapPages(pdfGaps, orient, t);
  const total = Math.max(1, pages.length + photoSheets.length + gaps.length);
  const pieceLabel = (key: string) =>
    model.pieces.get(key)?.name ||
    techCard.techCard?.pieces?.find((piece) => piece.lineKey === key)?.name ||
    undefined;

  return (
    <>
      <style>{KEYS_CSS + ASM_CSS}</style>
      {rows.length > 0 && !cols && (
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
          </div>
        </div>
      )}
      {pages.map((pg, pageIndex) => {
        const first = pg[0][0].n;
        const lastCol = pg[pg.length - 1];
        const last = lastCol[lastCol.length - 1].n;
        return (
          <TechpackSheet
            key={first}
            orient={orient}
            docline={docline}
            count={`${pageIndex + 1} / ${total}`}
          >
            <SectionHeader
              title={title}
              action={
                <HeaderNote>
                  {t('assembly.opsRange', { first, last, count: rows.length })}
                </HeaderNote>
              }
            />
            <div className='asm-cols' data-orient={orient} data-assembly-page='operations'>
              {Array.from({ length: per }, (_, i) => (
                <div key={i} className='asm-col'>
                  {pg[i] && <Table col={pg[i]} orient={orient} />}
                </div>
              ))}
            </div>
          </TechpackSheet>
        );
      })}
      {photoSheets.map((sheetPhotos, index) => (
        <PhotoSheet
          key={sheetPhotos.map((photo) => `${photo.op}-${photo.index}`).join('-')}
          photos={sheetPhotos}
          orient={orient}
          docline={docline}
          count={`${pages.length + index + 1} / ${total}`}
          pieceLabel={pieceLabel}
        />
      ))}
      {gaps.map((page, index) => (
        <GapsSheet
          key={`gaps-${index}`}
          page={page}
          orient={orient}
          docline={docline}
          count={`${pages.length + photoSheets.length + index + 1} / ${total}`}
          subjectOf={subjectOf}
          cardId={techCard.id}
        />
      ))}
      {!rows.length && !photos.length && !gaps.length && (
        <TechpackSheet orient={orient} docline={docline} count='1 / 1'>
          <SectionHeader title={title} />
        </TechpackSheet>
      )}
    </>
  );
}
