// A8 · what the clean stage set aside before reading (files step, and the sheet pass on the sheet
// step): one line "removed: …", a row per kind with its undo / accept, the page drawn with its
// mask. Monochrome (DESIGN.md): masked lines are the sheet's light source grey, a suggestion
// nobody accepted yet is the blue of "needs a human", the kind under the pointer is ink.
import { useMemo, useState } from 'react';
import type {
  BackgroundKind,
  CleanPreview,
  MaskItem,
  PageClass,
  PageMaskEdit,
  StageIO,
} from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { SHEET_INK, SheetViewport } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';

export const KIND_LABEL: Record<BackgroundKind, string> = {
  grid: 'grid lines',
  'tile-frame': 'tile frames',
  regmark: 'registration marks',
  'tile-label': 'tile labels',
  watermark: 'watermark',
  'curve-text': 'text drawn as lines',
  logo: 'logo',
  copyright: 'copyright text',
  table: 'table',
  'legend-swatch': 'legend samples',
  'test-square': 'test square',
  stray: 'stray line',
};

/** One SVG path for many polylines (thousands of elements would make pan and zoom crawl). */
export function pathData(arrays: readonly Float32Array[]): string {
  const parts: string[] = [];
  for (const a of arrays) {
    if (a.length < 4) continue;
    let d = `M${a[0].toFixed(1)} ${(-a[1]).toFixed(1)}`;
    for (let i = 2; i < a.length; i += 2) d += `L${a[i].toFixed(1)} ${(-a[i + 1]).toFixed(1)}`;
    parts.push(d);
  }
  return parts.join('');
}

type KindRow = {
  kind: BackgroundKind;
  /** Lines masked now / offered (a suggestion not accepted, an auto the operator kept). */
  applied: number;
  suggested: number;
  kept: number;
  evidence: string[];
};

/** Per kind: what is masked, what waits for a click, what the operator kept. */
export function kindRows(
  items: Pick<MaskItem, 'kind' | 'status' | 'applied' | 'lines' | 'evidence'>[],
): KindRow[] {
  const by = new Map<BackgroundKind, KindRow>();
  for (const it of items) {
    const r = by.get(it.kind) ?? {
      kind: it.kind,
      applied: 0,
      suggested: 0,
      kept: 0,
      evidence: it.evidence,
    };
    if (it.applied) r.applied += it.lines;
    else if (it.status === 'suggest') r.suggested += it.lines;
    else r.kept += it.lines;
    by.set(it.kind, r);
  }
  return [...by.values()].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

const ORDER = Object.keys(KIND_LABEL) as BackgroundKind[];

/** "removed: 646 grid lines · 1 470 tile labels · test square" */
export function removedLine(rows: KindRow[]): string {
  const on = rows.filter((r) => r.applied);
  if (!on.length) return 'nothing removed';
  return `removed: ${on
    .map((r) =>
      r.kind === 'test-square' || r.kind === 'watermark'
        ? KIND_LABEL[r.kind]
        : `${r.applied.toLocaleString('en-US').replace(/,/g, ' ')} ${KIND_LABEL[r.kind]}`,
    )
    .join(' · ')}`;
}

/**
 * The clean stage in one line — "removed: … · 3 pages set aside (1 to check)" — on the files step
 * and next to its Next button, so what is set aside is seen before the run goes on.
 */
export function cleanLine(clean: StageIO['clean']['out']): string {
  const rows = kindRows(clean.pages.flatMap((p) => p.items));
  const waiting = rows.filter((r) => r.suggested > 0 && !r.applied).length;
  const check = clean.dropped.filter((d) => d.status === 'suggest').length;
  const n = clean.dropped.length;
  return [
    removedLine(rows),
    waiting ? `${waiting} ${waiting === 1 ? 'kind' : 'kinds'} suggested` : '',
    n ? `${n} ${n === 1 ? 'page' : 'pages'} set aside${check ? ` (${check} to check)` : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The edits with this kind's run-wide decision replaced. */
export function withKind(edits: PageMaskEdit[], kind: BackgroundKind, keep: boolean) {
  return [
    ...edits.filter((e) => !('kind' in e && e.kind === kind && e.file === undefined)),
    { kind, keep },
  ];
}

/**
 * N1: the edits with these mask items decided one by one (`{ item, keep }`, later wins in the clean
 * stage) — the sheet pass answers its own items, never a kind across every page.
 */
export function withItems(edits: PageMaskEdit[], ids: readonly string[], keep: boolean) {
  const set = new Set(ids);
  return [
    ...edits.filter((e) => !('item' in e && set.has(e.item))),
    ...ids.map((item) => ({ item, keep })),
  ];
}

/** N1: the edits with every waiting suggestion accepted at once (each kind's undo stays). */
export function withAllAccepted(edits: PageMaskEdit[], rows: KindRow[]) {
  return rows.filter((r) => r.suggested > 0).reduce((e, r) => withKind(e, r.kind, false), edits);
}

/** The kind table: a row per kind, its state as a worded pill and the one action it allows. */
export function KindTable({
  rows,
  busy,
  onEdit,
  onAcceptAll,
  onHover,
}: {
  rows: KindRow[];
  busy: boolean;
  onEdit: (kind: BackgroundKind, keep: boolean) => void;
  /** N1: accept every waiting suggestion in one click (offered from two kinds up). */
  onAcceptAll?: () => void;
  onHover?: (kind: BackgroundKind | null) => void;
}) {
  if (!rows.length) return null;
  const waiting = rows.filter((r) => r.suggested > 0);
  return (
    <>
      {onAcceptAll && waiting.length > 1 && (
        <div className='mb-1 flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span'>
            {waiting.length} suggested: {waiting.map((r) => KIND_LABEL[r.kind]).join(', ')}
          </Text>
          <Chip
            tone='attention'
            disabled={busy}
            onClick={onAcceptAll}
            title='set every suggested kind aside — the page below shows them dashed blue; each row keeps its "keep" to undo'
          >
            accept all {waiting.length}
          </Chip>
        </div>
      )}
      <KindRowsTable rows={rows} busy={busy} onEdit={onEdit} onHover={onHover} />
    </>
  );
}

function KindRowsTable({
  rows,
  busy,
  onEdit,
  onHover,
}: {
  rows: KindRow[];
  busy: boolean;
  onEdit: (kind: BackgroundKind, keep: boolean) => void;
  onHover?: (kind: BackgroundKind | null) => void;
}) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th data-align='left'>set aside</th>
          <th>lines</th>
          <th data-align='left'>state</th>
          <th aria-label='action' />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const state = r.applied
            ? { tone: 'mut' as const, text: 'removed', act: 'keep', keep: true }
            : r.suggested
              ? { tone: 'attention' as const, text: 'suggested', act: 'accept', keep: false }
              : { tone: 'mut' as const, text: 'kept', act: 'remove', keep: false };
          return (
            <tr
              key={r.kind}
              title={r.evidence.join(' · ')}
              onMouseEnter={() => onHover?.(r.kind)}
              onMouseLeave={() => onHover?.(null)}
            >
              <td data-align='left'>{KIND_LABEL[r.kind]}</td>
              <td className='tabular-nums'>{r.applied + r.suggested + r.kept}</td>
              <td data-align='left'>
                <Pill tone={state.tone}>{state.text}</Pill>
                {r.applied > 0 && r.suggested > 0 && (
                  <Pill tone='attention' className='ml-1'>
                    + {r.suggested} suggested
                  </Pill>
                )}
              </td>
              <td>
                <Button
                  variant='underline'
                  size='xs'
                  disabled={busy}
                  onClick={() => onEdit(r.kind, state.keep)}
                  title={
                    state.keep
                      ? 'keep these lines as line work (the run reads again from here)'
                      : 'set these lines aside'
                  }
                >
                  {state.act}
                </Button>
                {r.applied > 0 && r.suggested > 0 && (
                  <Button
                    variant='underline'
                    size='xs'
                    className='ml-2'
                    disabled={busy}
                    onClick={() => onEdit(r.kind, false)}
                  >
                    accept
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

/** One page with its mask: live lines ink, masked grey, waiting suggestions blue (dashed). */
function PageView({ p, hover }: { p: CleanPreview; hover: BackgroundKind | null }) {
  const live = useMemo(() => pathData(p.live), [p]);
  const layers = useMemo(() => p.masked.map((m) => ({ ...m, d: pathData(m.lines) })), [p]);
  return (
    <div className='h-72 border border-borderColor'>
      <SheetViewport bbox={{ minX: 0, minY: 0, maxX: p.widthMm, maxY: p.heightMm }}>
        {() => (
          <>
            <rect
              x={0}
              y={-p.heightMm}
              width={p.widthMm}
              height={p.heightMm}
              fill='#ffffff'
              stroke='#d5d5d5'
              vectorEffect='non-scaling-stroke'
            />
            {layers.map((m, i) => (
              <path
                key={i}
                d={m.d}
                fill='none'
                pointerEvents='none'
                stroke={
                  hover === m.kind ? SHEET_INK.ink : m.applied ? SHEET_INK.source : SHEET_INK.blue
                }
                strokeDasharray={m.applied ? undefined : '3 2'}
                strokeWidth={hover === m.kind ? 1.25 : 0.75}
                vectorEffect='non-scaling-stroke'
              />
            ))}
            <path
              d={live}
              fill='none'
              pointerEvents='none'
              stroke={SHEET_INK.ink}
              strokeOpacity={hover ? 0.35 : 0.85}
              strokeWidth={0.75}
              vectorEffect='non-scaling-stroke'
            />
          </>
        )}
      </SheetViewport>
    </div>
  );
}

/** A set-aside page as a thumbnail: its lines, its role, a flag when it holds pattern-like work. */
function AsideThumb({
  p,
  d,
  busy,
  files,
  onRead,
}: {
  p: CleanPreview | undefined;
  d: StageIO['clean']['out']['dropped'][number];
  busy: boolean;
  files: number;
  onRead: () => void;
}) {
  const live = useMemo(() => (p ? pathData(p.live) : ''), [p]);
  const W = p?.widthMm ?? 210;
  const H = p?.heightMm ?? 297;
  return (
    <figure
      className='flex w-24 flex-col gap-0.5'
      title={`${d.why}${d.drawing ? ` — holds ${d.drawing}: check it is not a pattern page` : ''}`}
    >
      <svg
        viewBox={`0 ${-H} ${W} ${H}`}
        className={
          d.status === 'suggest'
            ? 'h-32 w-24 border border-textColor'
            : 'h-32 w-24 border border-borderColor'
        }
        preserveAspectRatio='xMidYMid meet'
        aria-label={`page ${d.page + 1}, set aside as ${d.cls}`}
      >
        <rect x={0} y={-H} width={W} height={H} fill='#ffffff' />
        <path
          d={live}
          fill='none'
          stroke={SHEET_INK.ink}
          strokeWidth={0.6}
          vectorEffect='non-scaling-stroke'
        />
      </svg>
      <figcaption className='flex flex-wrap items-center gap-1'>
        <Text size='micro' component='span' className='tabular-nums'>
          p{d.page + 1}
          {files > 1 ? `·f${Number(d.file) + 1}` : ''}
        </Text>
        <Pill tone={d.status === 'suggest' ? 'attention' : 'mut'}>
          {d.status === 'suggest' ? 'check' : d.cls}
        </Pill>
        <Button variant='underline' size='xs' disabled={busy} onClick={onRead}>
          read as tile
        </Button>
      </figcaption>
    </figure>
  );
}

/** The files step's clean block: the line, the kinds, the selected page with its mask. */
export function CleanBlock({
  api,
  page,
}: {
  api: ImportSessionApi;
  /** The page picked in the pages table (`file:page`). */
  page: string | null;
}) {
  const { session, inputs } = api;
  const clean = session.clean;
  const [hover, setHover] = useState<BackgroundKind | null>(null);
  const rows = useMemo(() => kindRows(clean?.pages.flatMap((p) => p.items) ?? []), [clean]);
  if (!clean) return null;
  const tilePreviews = clean.previews.filter((p) =>
    clean.pages.some((m) => m.file === p.file && m.page === p.page && m.role === 'tile'),
  );
  const shown =
    tilePreviews.find((p) => `${p.file}:${p.page}` === page) ??
    clean.previews.find((p) =>
      clean.pages.some((m) => m.file === p.file && m.page === p.page && m.items.length),
    ) ??
    tilePreviews[0];
  const edit = (kind: BackgroundKind, keep: boolean) =>
    void api.dispatch({ type: 'clean', edits: withKind(inputs.cleanEdits, kind, keep) });
  return (
    <div className='mb-3'>
      <GroupLabel flush>before reading</GroupLabel>
      <Text size='micro' component='p' className='mb-1'>
        {cleanLine(clean)}
      </Text>
      <KindTable
        rows={rows}
        busy={!!session.busy}
        onEdit={edit}
        onAcceptAll={() =>
          void api.dispatch({ type: 'clean', edits: withAllAccepted(inputs.cleanEdits, rows) })
        }
        onHover={setHover}
      />
      {clean.dropped.length > 0 && (
        <div className='mt-2'>
          <Text size='micro' variant='label' component='p' className='mb-0.5'>
            pages set aside — framed: it holds line work that could be pattern, check it
          </Text>
          <div className='flex flex-wrap gap-2'>
            {[...clean.dropped]
              .sort((a, b) => (a.status === b.status ? 0 : a.status === 'suggest' ? -1 : 1))
              .map((d) => (
                <AsideThumb
                  key={`${d.file}:${d.page}`}
                  d={d}
                  p={clean.previews.find((x) => x.file === d.file && x.page === d.page)}
                  busy={!!session.busy}
                  files={session.files.length}
                  onRead={() =>
                    void api.dispatch({
                      type: 'clean',
                      edits: roleEdit(inputs.cleanEdits, d.file, d.page, 'tile'),
                    })
                  }
                />
              ))}
          </div>
        </div>
      )}
      {shown && (
        <div className='mt-2'>
          <Text size='micro' variant='label' component='p' className='mb-0.5'>
            page {shown.page + 1}
            {session.files.length > 1 ? ` of file ${Number(shown.file) + 1}` : ''} — grey: set aside
            · blue dashed: suggested · hover a row to find its lines
          </Text>
          <PageView p={shown} hover={hover} />
        </div>
      )}
    </div>
  );
}

/** A page's role door: set a tile aside, or read a page the classifier set aside as a tile. */
export function roleEdit(
  edits: PageMaskEdit[],
  file: string,
  page: number,
  role: PageClass,
): PageMaskEdit[] {
  return [
    ...edits.filter((e) => !('role' in e && e.file === file && e.page === page)),
    { file, page, role },
  ];
}

/** The sheet pass (8b) on the sheet step: the watermark and stroke text no page could prove. */
export function SheetCleanRows({
  api,
  clean,
}: {
  api: ImportSessionApi;
  clean: NonNullable<StageIO['assemble']['out']['clean']>;
}) {
  const rows = kindRows(clean.items);
  if (!rows.length) return null;
  // the sheet's own items only: a row answers the items it lists, accept-all the waiting ones —
  // the page decisions and the run-wide kind decisions of the files step stay as they are
  const idsOf = (kind: BackgroundKind) =>
    clean.items.filter((it) => it.kind === kind).map((it) => it.id);
  const edit = (kind: BackgroundKind, keep: boolean) =>
    void api.dispatch({
      type: 'clean',
      edits: withItems(api.inputs.cleanEdits, idsOf(kind), keep),
    });
  return (
    <>
      <GroupLabel>set aside on the sheet</GroupLabel>
      <Text size='micro' component='p' className='mb-1'>
        {removedLine(rows)}
      </Text>
      <KindTable
        rows={rows}
        busy={!!api.session.busy}
        onEdit={edit}
        onAcceptAll={() =>
          void api.dispatch({
            type: 'clean',
            edits: withItems(
              api.inputs.cleanEdits,
              clean.items.filter((it) => it.status === 'suggest' && !it.applied).map((it) => it.id),
              false,
            ),
          })
        }
      />
    </>
  );
}
