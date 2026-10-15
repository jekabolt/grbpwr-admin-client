// A8 · what the clean stage set aside before reading (files step, and the sheet pass on the sheet
// step): one line "removed: …" with a fold for the per-kind keep / accept and the page drawn with
// its mask; the pages that ask about their role as thumbnails. Monochrome (DESIGN.md): masked
// lines are the sheet's light source grey, a suggestion nobody accepted yet is the blue of "needs
// a human", the kind under the pointer is ink.
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
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import type { HeaderWarning } from 'ui/components/header-warnings';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';
import {
  AI_PAGES,
  NOT_PATTERN_ROLES,
  PATTERN_ROLES,
  aiWords,
} from 'lib/pattern-import/clean/page-roles';
import { PAGE_SURE } from '../auto-advance';
import { SHEET_INK, SheetViewport } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { Fold, ask } from '../ui-bits';

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

/**
 * The kinds the clean stage set aside, as ONE line ("removed: … · 2 suggested") with the answer
 * beside it (`accept`) and the per-kind table behind a fold — opened by itself while a kind waits
 * for an answer (the only time it asks). `children` (the page with its mask) sit in the fold too.
 * `open`: controlled by the caller (null = the automatic rule); omitted = the fold's own.
 */
export function KindTable({
  rows,
  busy,
  onEdit,
  onAcceptAll,
  onHover,
  lead,
  askKey = 'files-keep',
  open: openProp,
  onOpenChange,
  children,
}: {
  rows: KindRow[];
  busy: boolean;
  onEdit: (kind: BackgroundKind, keep: boolean) => void;
  /** N1: accept every waiting suggestion in one click. */
  onAcceptAll?: () => void;
  onHover?: (kind: BackgroundKind | null) => void;
  /** A word before the line ("sheet"). */
  lead?: string;
  /** The `data-ask` key of this block's answers (THE ASK CONTRACT, ui-bits). */
  askKey?: string;
  open?: boolean | null;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [own, setOwn] = useState<boolean | null>(null);
  if (!rows.length) return null;
  const waiting = rows.filter((r) => r.suggested > 0);
  const asks = waiting.length > 0;
  const open = (openProp !== undefined ? openProp : own) ?? asks;
  return (
    <div data-ask-zone='' data-ask-hint={KIND_HINT} className='min-w-0'>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <Text size='micro' component='span' className='min-w-0'>
          {lead ? `${lead} · ` : ''}
          {removedLine(rows)}
          {asks && <span className='text-warning'> · {waiting.length} suggested</span>}
        </Text>
        {onAcceptAll && asks && (
          <Chip
            tone='attention'
            disabled={busy}
            onClick={onAcceptAll}
            title={`set aside: ${waiting.map((r) => KIND_LABEL[r.kind]).join(', ')} — each row keeps its "keep" to undo`}
            {...ask(askKey, KIND_HINT)}
          >
            {waiting.length > 1 ? `accept all ${waiting.length}` : 'accept'}
          </Chip>
        )}
      </div>
      <Fold
        label={asks ? 'suggested' : 'keep some'}
        open={open}
        onOpenChange={onOpenChange ?? setOwn}
        ask={asks ? askKey : undefined}
        className='mt-1'
      >
        <KindRowsTable rows={rows} busy={busy} onEdit={onEdit} onHover={onHover} askKey={askKey} />
        {children}
      </Fold>
    </div>
  );
}

/** The coach's how (THE ASK CONTRACT, ui-bits) for a kind suggested to set aside. */
const KIND_HINT = 'accept it, or press next to keep lines';
const ROW_HINT = 'accept or keep each kind of line';
/** … and for a page to check. */
const PAGE_HINT = 'keep it or read it as a tile';
const TILE_HINT = 'keep it as a tile, or set aside';

function KindRowsTable({
  rows,
  busy,
  onEdit,
  onHover,
  askKey,
}: {
  rows: KindRow[];
  busy: boolean;
  onEdit: (kind: BackgroundKind, keep: boolean) => void;
  onHover?: (kind: BackgroundKind | null) => void;
  askKey: string;
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
                  {...ask(askKey, !r.applied && r.suggested > 0, ROW_HINT)}
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
                    {...ask(askKey, ROW_HINT)}
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

/**
 * A9: what the AI and the geometry say of a page set aside, in words (the thumbnail's title):
 * "AI: instructions 0.92 («step 3 …») · geometry: another page format …".
 */
export function asideEvidence(d: StageIO['clean']['out']['dropped'][number]): string {
  const ai = d.ai
    ? `AI: ${aiWords(d.ai)}${d.ai.evidence.length ? ` («${d.ai.evidence[0]}»)` : ''}`
    : '';
  const ex = d.exclusion ? `geometry: ${d.exclusion}` : '';
  const geo = d.geo?.length ? `geometry suggests: ${d.geo.join('; ')}` : '';
  return [ai, ex, geo].filter(Boolean).join(' · ');
}

/** A page drawn small: its live lines, its number and role, the doors under it. */
function PageThumb({
  p,
  page,
  file,
  files,
  role,
  check,
  title,
  ariaLabel,
  selected,
  pick,
  onToggle,
  children,
}: {
  p: CleanPreview | undefined;
  page: number;
  file: string;
  files: number;
  role: string;
  /** Needs the operator's look: framed in ink, the role pill reads "check". */
  check: boolean;
  title: string;
  ariaLabel: string;
  selected?: boolean;
  /** The bulk pick's checkbox id (absent = no checkbox). */
  pick?: string;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const live = useMemo(() => (p ? pathData(p.live) : ''), [p]);
  const W = p?.widthMm ?? 210;
  const H = p?.heightMm ?? 297;
  const thumb = (
    <svg
      viewBox={`0 ${-H} ${W} ${H}`}
      className={cn(
        'h-32 w-24 border',
        check ? 'border-textColor' : 'border-borderColor',
        selected && 'outline outline-2 outline-offset-1 outline-textColor',
      )}
      preserveAspectRatio='xMidYMid meet'
      aria-label={ariaLabel}
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
  );
  return (
    <figure className='flex w-24 flex-col gap-0.5' title={title}>
      {/* the whole thumbnail is the checkbox's label: a click on the page picks it */}
      {pick ? (
        <label htmlFor={pick} className='cursor-pointer'>
          {thumb}
        </label>
      ) : (
        thumb
      )}
      <figcaption className='flex flex-wrap items-center gap-1'>
        {pick && (
          <CheckboxCommon
            name={pick}
            checked={!!selected}
            onChange={() => onToggle?.()}
            aria-label={`pick page ${page + 1}${files > 1 ? ` of file ${Number(file) + 1}` : ''}`}
          />
        )}
        <Text size='micro' component='span' className='tabular-nums'>
          p{page + 1}
          {files > 1 ? `·f${Number(file) + 1}` : ''}
        </Text>
        <Pill tone={check ? 'attention' : 'mut'}>{check ? 'check' : role}</Pill>
        {children}
      </figcaption>
    </figure>
  );
}

/** A set-aside page as a thumbnail: its lines, its role, a flag when it holds pattern-like work. */
function AsideThumb({
  p,
  d,
  busy,
  files,
  uncertain,
  onRead,
  onKeep,
  selected,
  onToggle,
}: {
  p: CleanPreview | undefined;
  d: StageIO['clean']['out']['dropped'][number];
  busy: boolean;
  files: number;
  /** The classifier placed the page below "sure": a question even when set aside by itself. */
  uncertain?: boolean;
  onRead: () => void;
  /** A9: "keep it aside" — the operator's answer to a page to check (the AI's, pre-filled). */
  onKeep: () => void;
  /** Owner 12.10: picked for a bulk answer (absent = no checkbox: a single page). */
  selected?: boolean;
  onToggle?: () => void;
}) {
  // A9: the AI's reading pre-fills the answer the operator gives with one click
  const aiPattern = !!d.ai && PATTERN_ROLES.has(d.ai.role);
  const aiAside = !!d.ai && !aiPattern && d.ai.role !== 'other';
  const check = d.status === 'suggest' || !!uncertain;
  const ev = asideEvidence(d);
  const ai = d.ai ? `AI${d.ai.stale ? ' (before your edits)' : ''}: ${aiWords(d.ai)}` : '';
  return (
    <PageThumb
      p={p}
      page={d.page}
      file={d.file}
      files={files}
      role={d.cls}
      check={check}
      pick={onToggle ? pickId(d) : undefined}
      selected={selected}
      onToggle={onToggle}
      ariaLabel={`page ${d.page + 1}, set aside as ${d.cls}`}
      title={[
        d.why,
        d.drawing ? `holds ${d.drawing}: check it is not a pattern page` : '',
        d.aiAside ? 'set aside · AI + geometry' : '',
        ai,
        ev,
      ]
        .filter(Boolean)
        .join(' — ')}
    >
      {check && (
        <Button
          variant={aiAside ? 'main' : 'underline'}
          size='xs'
          disabled={busy}
          onClick={onKeep}
          {...ask('files-page', !aiPattern, PAGE_HINT)}
        >
          keep aside
        </Button>
      )}
      <Button
        variant={aiPattern && check ? 'main' : 'underline'}
        size='xs'
        disabled={busy}
        onClick={onRead}
        {...ask('files-page', check && aiPattern, PAGE_HINT)}
      >
        {d.aiAside ? 'undo · read as tile' : 'read as tile'}
      </Button>
    </PageThumb>
  );
}

/** The files step's clean block: the removed line, the kinds behind a fold, the page with its mask. */
export function CleanBlock({
  api,
  page,
  open,
  onOpenChange,
}: {
  api: ImportSessionApi;
  /** The page picked in the pages panel (`file:page`). */
  page: string | null;
  /** The fold, held by the files step (a tile picked on the pages panel opens it); null = auto. */
  open?: boolean | null;
  onOpenChange?: (open: boolean) => void;
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
  const view = shown && (
    <div className='mt-2'>
      <Text size='micro' variant='label' component='p' className='mb-0.5'>
        page {shown.page + 1}
        {session.files.length > 1 ? ` of file ${Number(shown.file) + 1}` : ''}
      </Text>
      <PageView p={shown} hover={hover} />
    </div>
  );
  if (!rows.length) return null;
  return (
    <KindTable
      rows={rows}
      busy={!!session.busy}
      onEdit={edit}
      onAcceptAll={() =>
        void api.dispatch({ type: 'clean', edits: withAllAccepted(inputs.cleanEdits, rows) })
      }
      onHover={setHover}
      open={open}
      onOpenChange={onOpenChange}
    >
      {view}
    </KindTable>
  );
}

/** The page roles the operator set on the files step (`roleEdit`): their answer, not a guess. */
const roleSet = (edits: readonly PageMaskEdit[]) =>
  new Set(edits.flatMap((e) => ('role' in e ? [`${e.file}:${e.page}`] : [])));

/**
 * The pages panel: only the pages that ask (set aside on a doubt, read below "sure") as
 * thumbnails with their two doors; the pages set aside for sure and the tiles are a count each,
 * behind a fold. The bulk pick stays for several pages to check (owner 12.10).
 */
export function PageRoles({
  api,
  shown,
  onShow,
}: {
  api: ImportSessionApi;
  /** The tile drawn with its mask on the files panel (`file:page`). */
  shown: string | null;
  onShow: (key: string) => void;
}) {
  const { session, inputs } = api;
  const clean = session.clean;
  // owner 12.10: the set-aside pages picked for one bulk answer — nothing picked by default (D3)
  // — bound to the clean output it was made on: `file:page` keys are positional and get reused
  // (a rerun with fresh AI answers, a replaced file), so a pick never outlives its snapshot
  const [pickedOn, setPickedOn] = useState<{ of: unknown; keys: ReadonlySet<string> }>(() => ({
    of: null,
    keys: new Set(),
  }));
  if (!clean) return null;
  const busy = !!session.busy;
  const files = session.files.length;
  const answered = roleSet(inputs.cleanEdits);
  const uncertain = (p: { file: string; page: number; cls: PageClass; confidence: number }) =>
    !answered.has(`${p.file}:${p.page}`) && (p.cls === 'unknown' || p.confidence < PAGE_SURE);
  const unsure = new Set(session.pages.filter(uncertain).map(pageKey));
  const dropped = clean.dropped;
  const droppedKeys = new Set(dropped.map(pageKey));
  const toCheck = dropped.filter((d) => d.status === 'suggest' || unsure.has(pageKey(d)));
  const asideRest = dropped.filter((d) => !toCheck.includes(d));
  const tiles = session.pages.filter((p) => p.cls === 'tile' && !droppedKeys.has(pageKey(p)));
  const tilesToCheck = tiles.filter((p) => unsure.has(pageKey(p)));
  const tilesSure = tiles.filter((p) => !unsure.has(pageKey(p)));

  const keys = dropped.map(pageKey);
  const picked = pickedOn.of === clean ? pickedOn.keys : new Set<string>();
  const setPicked = (next: (prev: ReadonlySet<string>) => ReadonlySet<string>) =>
    setPickedOn((cur) => ({
      of: clean,
      keys: next(cur.of === clean ? cur.keys : new Set()),
    }));
  const sel = new Set(keys.filter((k) => picked.has(k)));
  // the bulk answer is offered when several set-aside pages ask
  const selectable = dropped.length > 1 && toCheck.length > 1;
  const toggle = (k: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const keepPicked = bulkKeep(dropped, sel);
  const readPicked = bulkRead(dropped, sel);
  const aiPicks = dropped.filter(aiKeepSuggested).map(pageKey);
  const applyBulk = (pages: readonly PageRole[]) => {
    setPicked(() => new Set());
    void api.dispatch({ type: 'clean', edits: rolesEdit(inputs.cleanEdits, pages) });
  };
  const preview = (file: string, page: number) =>
    clean.previews.find((x) => x.file === file && x.page === page);
  const setRole = (file: string, page: number, role: PageClass) =>
    void api.dispatch({ type: 'clean', edits: roleEdit(inputs.cleanEdits, file, page, role) });
  const aside = (d: Dropped) => (
    <AsideThumb
      key={pageKey(d)}
      d={d}
      p={preview(d.file, d.page)}
      busy={busy}
      files={files}
      uncertain={unsure.has(pageKey(d))}
      selected={selectable ? sel.has(pageKey(d)) : undefined}
      onToggle={selectable ? () => toggle(pageKey(d)) : undefined}
      onRead={() => setRole(d.file, d.page, 'tile')}
      onKeep={() => setRole(d.file, d.page, d.cls)}
    />
  );

  return (
    <div className='flex flex-col gap-2'>
      {selectable && (
        <ChipRow className='gap-2'>
          <span className='inline-flex items-center gap-1'>
            <CheckboxCommon
              name='pi-aside-all'
              checked={sel.size === dropped.length}
              onChange={(on) => setPicked(() => (on ? new Set(keys) : new Set()))}
            />
            <label htmlFor='pi-aside-all' className='cursor-pointer'>
              <Text size='micro' variant='label' component='span'>
                select all
              </Text>
            </label>
          </span>
          <Text size='micro' component='span' className='tabular-nums'>
            · {sel.size} selected
          </Text>
          {aiPicks.length > 0 && (
            <Chip
              tone='attention'
              onClick={() => setPicked(() => new Set(aiPicks))}
              title={`pick the pages to check that the AI reads as not pattern at ${AI_PAGES.autoMin} or more — nothing is set aside until you press "keep aside"`}
            >
              select AI suggestions ({aiPicks.length})
            </Chip>
          )}
          <Chip
            disabled={busy || !keepPicked.length}
            onClick={() => applyBulk(keepPicked)}
            title={
              readPicked.length > keepPicked.length
                ? 'only the pages to check take this answer — a page already set aside stays as it is'
                : 'keep the picked pages aside (the run reads again once)'
            }
          >
            keep {keepPicked.length} aside
          </Chip>
          <Chip
            disabled={busy || !readPicked.length}
            onClick={() => applyBulk(readPicked)}
            title='read the picked pages as tiles (the run reads again once)'
          >
            read {readPicked.length} as {readPicked.length === 1 ? 'tile' : 'tiles'}
          </Chip>
        </ChipRow>
      )}

      {toCheck.length + tilesToCheck.length > 0 && (
        <div data-ask-zone='' className='flex flex-wrap gap-2'>
          {toCheck.map(aside)}
          {tilesToCheck.map((p) => (
            <PageThumb
              key={pageKey(p)}
              p={preview(p.file, p.page)}
              page={p.page}
              file={p.file}
              files={files}
              role='tile'
              check
              ariaLabel={`page ${p.page + 1}, read as tile`}
              title={`read as tile — ${p.why}`}
            >
              <Button
                variant='underline'
                size='xs'
                disabled={busy}
                onClick={() => setRole(p.file, p.page, 'tile')}
                {...ask('files-page', TILE_HINT)}
              >
                keep as tile
              </Button>
              <Button
                variant='underline'
                size='xs'
                disabled={busy}
                onClick={() => setRole(p.file, p.page, 'blank')}
                {...ask('files-page', TILE_HINT)}
              >
                set aside
              </Button>
            </PageThumb>
          ))}
        </div>
      )}

      {asideRest.length > 0 && (
        <Fold label={`${asideRest.length} set aside`} className='mt-0'>
          <div className='flex flex-wrap gap-2'>{asideRest.map(aside)}</div>
        </Fold>
      )}

      {tilesSure.length > 0 && (
        <Fold
          label={`${tilesSure.length} ${tilesSure.length === 1 ? 'tile' : 'tiles'}`}
          className='mt-0'
        >
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>page</th>
                <th aria-label='page role' />
              </tr>
            </thead>
            <tbody>
              {tilesSure.map((p) => (
                <tr
                  key={pageKey(p)}
                  className={shown === pageKey(p) ? 'bg-hairline' : 'cursor-pointer'}
                  onClick={() => onShow(pageKey(p))}
                  title={p.why}
                >
                  <td data-align='left' className='tabular-nums'>
                    p{p.page + 1}
                    {files > 1
                      ? ` · ${session.files.find((f) => f.id === p.file)?.name ?? p.file}`
                      : ''}
                  </td>
                  <td>
                    {/* the door: a tile set aside */}
                    <Button
                      variant='underline'
                      size='xs'
                      className='text-labelColor hover:text-textColor'
                      disabled={busy}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setRole(p.file, p.page, 'blank');
                      }}
                    >
                      set aside
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Fold>
      )}
    </div>
  );
}

/** What the pages panel's `! N warnings` carries: the AI page-role note and its retry. */
export function pageRoleWarnings(api: ImportSessionApi): HeaderWarning[] {
  if (!api.pageRoleNote) return [];
  return [
    api.pageRolesStale
      ? {
          text: `${api.pageRoleNote} — ask the AI again`,
          action: {
            label: 'ask the AI again',
            disabled: !!api.session.busy,
            onClick: () => void api.dispatch({ type: 'page-roles' }),
          },
        }
      : api.pageRoleNote,
  ];
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

type Dropped = StageIO['clean']['out']['dropped'][number];
/** One page's role answer (`roleEdit`'s arguments). */
export type PageRole = { file: string; page: number; role: PageClass };

/** A set-aside page's key (`file:page`) — the bulk pick's identity. */
export const pageKey = (d: Pick<Dropped, 'file' | 'page'>) => `${d.file}:${d.page}`;
/** The DOM id of a page's pick checkbox (its thumbnail is the label). */
const pickId = (d: Pick<Dropped, 'file' | 'page'>) => `pi-aside-${d.file}-${d.page}`;

/**
 * Owner 12.10: several pages' roles in ONE edit list — one dispatch, one rerun of the session —
 * per page exactly the `{ file, page, role }` edit its own tile button writes (so the replay
 * record's `clean-edits` is the same page by page as N separate clicks).
 */
export function rolesEdit(edits: PageMaskEdit[], pages: readonly PageRole[]): PageMaskEdit[] {
  return pages.reduce((e, p) => roleEdit(e, p.file, p.page, p.role), edits);
}

/** "keep N aside": the picked pages TO CHECK (only they carry the tile's "keep aside"), each as its class. */
export function bulkKeep(dropped: readonly Dropped[], picked: ReadonlySet<string>): PageRole[] {
  return dropped
    .filter((d) => d.status === 'suggest' && picked.has(pageKey(d)))
    .map((d) => ({ file: d.file, page: d.page, role: d.cls }));
}

/** "read N as tiles": every picked page (the tile's "read as tile" is on each). */
export function bulkRead(dropped: readonly Dropped[], picked: ReadonlySet<string>): PageRole[] {
  return dropped
    .filter((d) => picked.has(pageKey(d)))
    .map((d) => ({ file: d.file, page: d.page, role: 'tile' as PageClass }));
}

/**
 * "select AI suggestions": a page to check the AI reads as not pattern at the confidence of the
 * set-aside rule (≥ AI_PAGES.autoMin, a NOT_PATTERN role, asked after the last edit). A PICK only —
 * never applied without the operator's "keep aside" (D3: a page set aside wrongly = missing pieces).
 */
export function aiKeepSuggested(d: Dropped): boolean {
  return (
    d.status === 'suggest' &&
    !!d.ai &&
    !d.ai.stale &&
    NOT_PATTERN_ROLES.has(d.ai.role) &&
    d.ai.confidence >= AI_PAGES.autoMin
  );
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
    <div className='mt-2'>
      <KindTable
        rows={rows}
        busy={!!api.session.busy}
        onEdit={edit}
        lead='sheet'
        askKey='sheet-keep'
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
    </div>
  );
}
