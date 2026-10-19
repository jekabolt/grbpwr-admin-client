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
import { Button, CheckboxCommon, Chip, ChipRow, DataTable, Pill, Text } from 'ui';
import type { HeaderWarning } from 'ui';
import { cn } from 'lib/utility';
import {
  AI_PAGES,
  NOT_PATTERN_ROLES,
  PATTERN_ROLES,
  aiWords,
} from 'lib/pattern-import/clean/page-roles';
import { PAGE_SURE } from '../auto-advance';
import { SHEET_INK } from '../sheet-viewport';
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
  askOn = true,
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
  /** false: the block carries no `data-ask` (another, stronger question owns the coach). */
  askOn?: boolean;
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
            {...ask(askKey, askOn && KIND_HINT)}
          >
            {waiting.length > 1 ? `accept all ${waiting.length}` : 'accept'}
          </Chip>
        )}
      </div>
      <Fold
        label={asks ? 'suggested' : 'keep some'}
        open={open}
        onOpenChange={onOpenChange ?? setOwn}
        ask={asks && askOn ? askKey : undefined}
        className='mt-1'
      >
        <KindRowsTable
          rows={rows}
          busy={busy}
          onEdit={onEdit}
          onHover={onHover}
          askKey={askKey}
          askOn={askOn}
        />
        {children}
      </Fold>
    </div>
  );
}

/** The coach's how (THE ASK CONTRACT, ui-bits) for a kind suggested to set aside. */
const KIND_HINT = 'accept it, or press next to keep lines';
const ROW_HINT = 'accept or keep each kind of line';

function KindRowsTable({
  rows,
  busy,
  onEdit,
  onHover,
  askKey,
  askOn,
}: {
  rows: KindRow[];
  busy: boolean;
  onEdit: (kind: BackgroundKind, keep: boolean) => void;
  onHover?: (kind: BackgroundKind | null) => void;
  askKey: string;
  askOn: boolean;
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
                  {...ask(askKey, askOn && !r.applied && r.suggested > 0, ROW_HINT)}
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
                    {...ask(askKey, askOn && ROW_HINT)}
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

/**
 * A page as a toggle (owner 16.10: "KEEP AS TILE / SET ASIDE repeats continuously"): the whole
 * thumbnail is the switch — used = drawn plain, set aside = greyed with a corner ✕; a page the
 * classifier is unsure of carries a small corner "?". The page number sits small in the corner.
 */
function PageToggle({
  p,
  label,
  used,
  unsure,
  title,
  small,
  disabled,
  onToggle,
}: {
  p: CleanPreview | undefined;
  label: string;
  used: boolean;
  unsure: boolean;
  title: string;
  small?: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const live = useMemo(() => (p ? pathData(p.live) : ''), [p]);
  const W = p?.widthMm ?? 210;
  const H = p?.heightMm ?? 297;
  return (
    <button
      type='button'
      aria-pressed={used}
      aria-label={`${label}${unsure ? ', unsure' : ''} — ${used ? 'used as a pattern page' : 'set aside'}`}
      title={title}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'group relative block border bg-bgColor p-1 text-left text-textBaseSize',
        'cursor-pointer hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
        'disabled:cursor-wait',
        unsure ? 'border-warning' : 'border-borderColor',
        small ? 'w-[88px]' : 'w-[120px]',
      )}
    >
      <svg
        viewBox={`0 ${-H} ${W} ${H}`}
        className={cn('block h-auto w-full', !used && 'opacity-30')}
        style={{ aspectRatio: `${W} / ${H}` }}
        preserveAspectRatio='xMidYMid meet'
        aria-hidden
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
      <span className='absolute bottom-1 left-1 bg-bgColor px-0.5 tabular-nums leading-none'>
        {label}
      </span>
      {unsure && (
        <span className='absolute left-1 top-1 bg-bgColor px-0.5 leading-none text-warning'>?</span>
      )}
      {!used && (
        <span className='absolute right-1 top-1 bg-bgColor px-0.5 leading-none'>{'✕'}</span>
      )}
    </button>
  );
}

/**
 * The panels' view state (the clean-up "show", its page, the "more pages" fold) outlives the
 * step's remount while a run reads again — a click must not fold the view it was made in.
 */
const viewMemo = new Map<string, unknown>();
function useViewState<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (viewMemo.has(key) ? (viewMemo.get(key) as T) : init));
  return [
    v,
    (n: T) => {
      viewMemo.set(key, n);
      setV(n);
    },
  ];
}

/** Short kind names for the clean-up line and its chips ("frames 17", "copyright 1"). */
const KIND_SHORT: Record<BackgroundKind, string> = {
  grid: 'grid',
  'tile-frame': 'frames',
  regmark: 'marks',
  'tile-label': 'labels',
  watermark: 'watermark',
  'curve-text': 'text',
  logo: 'logo',
  copyright: 'copyright',
  table: 'table',
  'legend-swatch': 'legend',
  'test-square': 'test square',
  stray: 'stray lines',
};

/** The coach's how for "remove these too?" (THE ASK CONTRACT, ui-bits). */
const SUGGEST_HINT = 'press yes, or next to keep the lines';

/**
 * One page before/after: kept lines ink, removed lines light grey dashed, lines suggested for
 * removal blue dashed; the kind under the pointer blue. Fit to the panel width, never cropped.
 */
function CleanPage({ p, hover }: { p: CleanPreview; hover: BackgroundKind | null }) {
  const live = useMemo(() => pathData(p.live), [p]);
  const layers = useMemo(() => p.masked.map((m) => ({ ...m, d: pathData(m.lines) })), [p]);
  const W = p.widthMm;
  const H = p.heightMm;
  const lit = (m: (typeof layers)[number]) => hover === m.kind;
  return (
    <div className='flex min-h-[360px] justify-center border border-borderColor bg-bgColor p-2'>
      <svg
        viewBox={`0 ${-H} ${W} ${H}`}
        preserveAspectRatio='xMidYMid meet'
        className='block h-auto max-h-[75vh] min-h-[360px] w-full'
        role='img'
        aria-label={`page ${p.page + 1}: ink = kept, grey dashed = removed`}
      >
        <rect x={0} y={-H} width={W} height={H} fill='#ffffff' />
        <path
          d={live}
          fill='none'
          stroke={SHEET_INK.ink}
          strokeOpacity={hover ? 0.4 : 1}
          strokeWidth={0.6}
          vectorEffect='non-scaling-stroke'
        />
        {layers
          .filter((m) => !lit(m))
          .map((m, i) => (
            <path
              key={i}
              d={m.d}
              fill='none'
              stroke={
                m.applied
                  ? SHEET_INK.source
                  : m.status === 'suggest'
                    ? SHEET_INK.blue
                    : SHEET_INK.ink
              }
              strokeOpacity={m.applied || m.status === 'suggest' ? 0.9 : hover ? 0.4 : 1}
              strokeDasharray={m.applied || m.status === 'suggest' ? '3 2' : undefined}
              strokeWidth={0.6}
              vectorEffect='non-scaling-stroke'
            />
          ))}
        {layers.filter(lit).map((m, i) => (
          <path
            key={`h${i}`}
            d={m.d}
            fill='none'
            stroke={SHEET_INK.blue}
            strokeWidth={1.6}
            vectorEffect='non-scaling-stroke'
          />
        ))}
      </svg>
    </div>
  );
}

/** A kind as a toggle chip: removed (grey, dashed) ↔ kept (ink); hover lights its lines. */
function KindToggle({
  r,
  on,
  disabled,
  onClick,
  onHover,
  title,
  ...rest
}: {
  r: KindRow;
  /** Pressed: removed (or, in the question, picked to remove). */
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  onHover: (k: BackgroundKind | null) => void;
  title: string;
} & Record<`data-${string}`, string | undefined>) {
  const n = r.applied + r.suggested + r.kept;
  return (
    <button
      type='button'
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      onMouseEnter={() => onHover(r.kind)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(r.kind)}
      onBlur={() => onHover(null)}
      className={cn(
        'border px-2 py-1 text-textBaseSize tabular-nums hover:border-warning hover:text-warning disabled:cursor-wait',
        on ? 'border-dashed border-labelColor text-labelColor' : 'border-textColor text-textColor',
      )}
      {...rest}
    >
      {on ? '✕ ' : ''}
      {KIND_SHORT[r.kind]} {n.toLocaleString('en-US').replace(/,/g, ' ')}
    </button>
  );
}

/**
 * The files step's clean-up (owner 16.10): machine work, so ONE quiet line —
 * "cleaned up: frames, labels, text ✓ · show" — aligned with the file table's cells. "show" opens
 * a before/after: the page with the most removed lines (← → through the pages that had removals),
 * a row of kind chips over it — hover lights a kind's lines, a click keeps ↔ removes it (the old
 * KEEP / accept edit, `withKind`). Kinds the engine only SUGGESTS ask "remove these too?" with
 * their chips picked and [yes] (accept, as the old "accept all").
 */
export function CleanBlock({
  api,
  page,
  open,
  onOpenChange,
}: {
  api: ImportSessionApi;
  /** A page to show first (`file:page`). */
  page: string | null;
  /** "show", held by the files step; null = folded. */
  open?: boolean | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const { session, inputs } = api;
  const clean = session.clean;
  const [hover, setHover] = useState<BackgroundKind | null>(null);
  const sid = String(session.sessionId ?? '');
  const [ownOpen, setOwnOpen] = useViewState(`${sid}:clean-open`, false);
  const [at, setAt] = useViewState<string | null>(`${sid}:clean-at`, null);
  // the question's chips the operator un-picked (bound to the clean output they were made on)
  const [skipOn, setSkipOn] = useState<{ of: unknown; s: ReadonlySet<BackgroundKind> }>(() => ({
    of: null,
    s: new Set(),
  }));
  const rows = useMemo(() => kindRows(clean?.pages.flatMap((p) => p.items) ?? []), [clean]);
  if (!clean || !rows.length) return null;
  const busy = !!session.busy;
  const isOpen = open ?? ownOpen;
  const setOpen = (o: boolean) => {
    setOwnOpen(o);
    onOpenChange?.(o);
  };
  const removedOf = (p: CleanPreview) =>
    p.masked.reduce((n, m) => n + (m.applied || m.status === 'suggest' ? m.lines.length : 0), 0);
  const pages = clean.previews.filter((p) => removedOf(p) > 0);
  const keyOf = (p: CleanPreview) => `${p.file}:${p.page}`;
  const most = pages.reduce<CleanPreview | undefined>(
    (b, p) => (!b || removedOf(p) > removedOf(b) ? p : b),
    undefined,
  );
  const idx = Math.max(
    0,
    pages.findIndex((p) => keyOf(p) === (at ?? page ?? (most && keyOf(most)))),
  );
  const shown = pages[idx];
  const step = (d: number) => {
    if (!pages.length) return;
    setAt(keyOf(pages[(idx + d + pages.length) % pages.length]));
  };
  const edit = (kind: BackgroundKind, keep: boolean) =>
    void api.dispatch({ type: 'clean', edits: withKind(inputs.cleanEdits, kind, keep) });

  const removed = rows.filter((r) => r.applied > 0);
  const waiting = rows.filter((r) => r.suggested > 0);
  const decided = rows.filter((r) => r.applied > 0 || r.kept > 0);
  const skip = skipOn.of === clean ? skipOn.s : new Set<BackgroundKind>();
  const picked = waiting.filter((r) => !skip.has(r.kind));
  const files = session.files.length;
  const line = removed.length
    ? `cleaned up: ${removed.map((r) => KIND_SHORT[r.kind]).join(', ')} ✓`
    : 'nothing cleaned up';

  return (
    <div className='flex min-w-0 flex-col gap-3 px-1.5 text-textBaseSize'>
      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 text-labelColor'>
        <span>{line}</span>
        <span aria-hidden>·</span>
        <button
          type='button'
          aria-expanded={isOpen}
          onClick={() => setOpen(!isOpen)}
          className='underline hover:text-textColor'
        >
          {isOpen ? 'hide' : 'show'}
        </button>
      </div>

      {waiting.length > 0 && (
        <div
          className='flex flex-wrap items-center gap-x-3 gap-y-2'
          data-ask-zone=''
          data-ask-hint={SUGGEST_HINT}
          data-ask-label='remove these lines too?'
        >
          <span>remove these too?</span>
          {waiting.map((r) => (
            <KindToggle
              key={r.kind}
              r={{ ...r, applied: 0, kept: 0 }}
              on={!skip.has(r.kind)}
              disabled={busy}
              onHover={setHover}
              title={`${KIND_LABEL[r.kind]} — ${r.evidence.join(' · ')}`}
              onClick={() =>
                setSkipOn(() => {
                  const s = new Set(skip);
                  if (s.has(r.kind)) s.delete(r.kind);
                  else s.add(r.kind);
                  return { of: clean, s };
                })
              }
            />
          ))}
          <Button
            variant='main'
            className='px-3 py-1'
            disabled={busy || !picked.length}
            onClick={() =>
              void api.dispatch({
                type: 'clean',
                edits: picked.reduce((e, r) => withKind(e, r.kind, false), inputs.cleanEdits),
              })
            }
            {...ask('files-keep', SUGGEST_HINT)}
          >
            yes
          </Button>
        </div>
      )}

      {isOpen && (
        <div className='flex flex-col gap-3'>
          {decided.length > 0 && (
            <div className='flex flex-wrap items-center gap-2'>
              {decided.map((r) => (
                <KindToggle
                  key={r.kind}
                  r={r}
                  on={r.applied > 0}
                  disabled={busy}
                  onHover={setHover}
                  title={`${KIND_LABEL[r.kind]}: ${r.applied > 0 ? 'removed — click to keep' : 'kept — click to remove'}${r.evidence.length ? ` — ${r.evidence.join(' · ')}` : ''}`}
                  onClick={() => edit(r.kind, r.applied > 0)}
                />
              ))}
            </div>
          )}
          <div className='flex flex-wrap items-baseline justify-between gap-2 text-labelColor'>
            <span>ink = kept · grey dashed = removed · click a kind to keep or remove it</span>
            {shown && (
              <span className='flex items-baseline gap-3 tabular-nums'>
                {pages.length > 1 && (
                  <button
                    type='button'
                    aria-label='previous page'
                    onClick={() => step(-1)}
                    className='px-1 hover:text-textColor'
                  >
                    ←
                  </button>
                )}
                <span className='text-textColor'>
                  page {shown.page + 1}
                  {files > 1 ? ` of file ${Number(shown.file) + 1}` : ''}
                  {pages.length > 1 ? ` · ${idx + 1}/${pages.length}` : ''}
                </span>
                {pages.length > 1 && (
                  <button
                    type='button'
                    aria-label='next page'
                    onClick={() => step(1)}
                    className='px-1 hover:text-textColor'
                  >
                    →
                  </button>
                )}
              </span>
            )}
          </div>
          {shown && <CleanPage p={shown} hover={hover} />}
        </div>
      )}
    </div>
  );
}

/** The page roles the operator set on the files step (`roleEdit`): their answer, not a guess. */
const roleSet = (edits: readonly PageMaskEdit[]) =>
  new Set(edits.flatMap((e) => ('role' in e ? [`${e.file}:${e.page}`] : [])));

/** The coach's how for the pages question (THE ASK CONTRACT, ui-bits). */
const PAGE_HINT = 'click a page to set it aside';

/** One page of the pages panel: used (a tile) or set aside, and the role edit that flips it. */
type PageItem = {
  key: string;
  file: string;
  page: number;
  used: boolean;
  /** Asks the operator: placed below "sure", or set aside holding line work, not answered yet. */
  unsure: boolean;
  title: string;
  /** The edit that answers "use it" (read as tile / keep as tile). */
  use: PageRole;
  /** The edit that answers "set it aside" (keep aside as its class / a tile set aside). */
  aside: PageRole;
};

/**
 * The pages panel (owner 16.10): ONE grid of page thumbnails, each a toggle — use ↔ set aside.
 * The unsure pages first under one plain question ("N pages unsure — use them as pattern
 * pages?" [yes, use all] [set aside the unsure ones]); the pages set aside (cover,
 * instructions) in the same grid, greyed, a click brings one back; the pages read as tiles for
 * sure behind a quiet "N more pages used ✓ · show" that opens the same grid, smaller.
 * The edits are the ones the old per-page doors wrote: read as tile / keep aside as its class /
 * keep as tile / a tile set aside as blank.
 */
export function PageRoles({
  api,
}: {
  api: ImportSessionApi;
  /** The tile drawn with its mask on the files panel (`file:page`) — unused by the toggle grid. */
  shown?: string | null;
  onShow?: (key: string) => void;
}) {
  const { session, inputs } = api;
  const clean = session.clean;
  // a click flips the thumbnail at once; the run's answer replaces it (bound to its snapshot)
  const [pendingOn, setPendingOn] = useViewState<{
    of: unknown;
    m: ReadonlyMap<string, boolean>;
  }>(`${String(session.sessionId ?? '')}:pages-pending`, { of: null, m: new Map() });
  const [moreOpen, setMoreOpen] = useViewState(
    `${String(session.sessionId ?? '')}:pages-more`,
    false,
  );
  if (!clean) return null;
  const busy = !!session.busy;
  const files = session.files.length;
  const answered = roleSet(inputs.cleanEdits);
  const uncertain = (p: { file: string; page: number; cls: PageClass; confidence: number }) =>
    !answered.has(`${p.file}:${p.page}`) && (p.cls === 'unknown' || p.confidence < PAGE_SURE);
  const unsureKeys = new Set(session.pages.filter(uncertain).map(pageKey));
  const pending = pendingOn.of === clean ? pendingOn.m : new Map<string, boolean>();
  const label = (file: string, page: number) =>
    `p${page + 1}${files > 1 ? `·f${Number(file) + 1}` : ''}`;
  const preview = (file: string, page: number) =>
    clean.previews.find((x) => x.file === file && x.page === page);

  const dropped = clean.dropped;
  const droppedKeys = new Set(dropped.map(pageKey));
  const asideItems: PageItem[] = dropped.map((d) => {
    const key = pageKey(d);
    const ai = d.ai ? `AI${d.ai.stale ? ' (before your edits)' : ''}: ${aiWords(d.ai)}` : '';
    return {
      key,
      file: d.file,
      page: d.page,
      used: false,
      unsure: !answered.has(key) && (d.status === 'suggest' || unsureKeys.has(key)),
      title: [
        `set aside as ${d.cls}`,
        d.why,
        d.drawing ? `holds ${d.drawing}: check it is not a pattern page` : '',
        d.aiAside ? 'set aside · AI + geometry' : '',
        ai,
        asideEvidence(d),
      ]
        .filter(Boolean)
        .join(' — '),
      use: { file: d.file, page: d.page, role: 'tile' },
      aside: { file: d.file, page: d.page, role: d.cls },
    };
  });
  const tileItems: PageItem[] = session.pages
    .filter((p) => p.cls === 'tile' && !droppedKeys.has(pageKey(p)))
    .map((p) => ({
      key: pageKey(p),
      file: p.file,
      page: p.page,
      used: true,
      unsure: unsureKeys.has(pageKey(p)),
      title: `used as a pattern page — ${p.why}`,
      use: { file: p.file, page: p.page, role: 'tile' },
      aside: { file: p.file, page: p.page, role: 'blank' },
    }));
  const byPage = (a: PageItem, b: PageItem) =>
    Number(a.file) - Number(b.file) || a.file.localeCompare(b.file) || a.page - b.page;
  // the main grid: the pages that ask, then every page answered or set aside; the rest (tiles read
  // for sure, nobody touched) behind the quiet line
  const asking = [...asideItems, ...tileItems].filter((it) => it.unsure).sort(byPage);
  // a page answered stays where it was asked (by page, among the unsure ones); then the pages the
  // run set aside by itself
  const all = [...asideItems, ...tileItems];
  const first = all.filter((it) => it.unsure || answered.has(it.key)).sort(byPage);
  const rest = asideItems.filter((it) => !it.unsure && !answered.has(it.key)).sort(byPage);
  const more = tileItems.filter((it) => !it.unsure && !answered.has(it.key)).sort(byPage);
  const main = [...first, ...rest];

  const apply = (pages: readonly PageRole[], flips: readonly [string, boolean][]) => {
    if (!pages.length) return;
    const m = new Map(pendingOn.of === clean ? pendingOn.m : []);
    for (const [k, v] of flips) m.set(k, v);
    setPendingOn({ of: clean, m });
    void api.dispatch({ type: 'clean', edits: rolesEdit(inputs.cleanEdits, pages) });
  };
  const usedNow = (it: PageItem) => pending.get(it.key) ?? it.used;
  const toggle = (it: PageItem) => {
    const next = !usedNow(it);
    apply([next ? it.use : it.aside], [[it.key, next]]);
  };
  const tile = (it: PageItem, small?: boolean) => (
    <PageToggle
      key={it.key}
      p={preview(it.file, it.page)}
      label={label(it.file, it.page)}
      used={usedNow(it)}
      unsure={it.unsure}
      title={it.title}
      small={small}
      disabled={busy}
      onToggle={() => toggle(it)}
    />
  );
  const n = asking.length;
  const grid = 'grid gap-3';

  return (
    <div className='flex flex-col gap-4 text-textBaseSize'>
      {main.length > 0 && (
        <div
          className='flex flex-col gap-3'
          {...(n
            ? {
                'data-ask-zone': '',
                'data-ask-hint': PAGE_HINT,
                'data-ask-label': `use ${n === 1 ? 'this page' : `${n} pages`} as pattern?`,
              }
            : {})}
        >
          {n > 0 && (
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <Text component='span'>
                {n} {n === 1 ? 'page' : 'pages'} unsure — use {n === 1 ? 'it' : 'them'} as pattern{' '}
                {n === 1 ? 'page' : 'pages'}?
              </Text>
              <span className='flex flex-wrap gap-2'>
                <Button
                  variant='main'
                  className='px-3 py-1'
                  disabled={busy}
                  onClick={() =>
                    apply(
                      asking.map((it) => it.use),
                      asking.map((it) => [it.key, true]),
                    )
                  }
                  {...ask('files-page', PAGE_HINT)}
                >
                  yes, use {n === 1 ? 'it' : 'all'}
                </Button>
                <Button
                  variant='secondary'
                  className='px-3 py-1'
                  disabled={busy}
                  onClick={() =>
                    apply(
                      asking.map((it) => it.aside),
                      asking.map((it) => [it.key, false]),
                    )
                  }
                >
                  set aside {n === 1 ? 'this one' : 'the unsure ones'}
                </Button>
              </span>
            </div>
          )}
          <div className={cn(grid, 'grid-cols-[repeat(auto-fill,120px)]')}>
            {main.map((it) => tile(it))}
          </div>
        </div>
      )}

      {more.length > 0 && (
        <div className='flex flex-col gap-3'>
          <button
            type='button'
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
            className='self-start text-left text-labelColor hover:text-textColor'
          >
            {more.length} {main.length ? 'more ' : ''}
            {more.length === 1 ? 'page' : 'pages'} used ✓ ·{' '}
            <span className='underline'>{moreOpen ? 'hide' : 'show'}</span>
          </button>
          {moreOpen && (
            <div className={cn(grid, 'grid-cols-[repeat(auto-fill,88px)]')}>
              {more.map((it) => tile(it, true))}
            </div>
          )}
        </div>
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

/**
 * Owner 12.10: several pages' roles in ONE edit list — one dispatch, one rerun of the session —
 * per page exactly the `{ file, page, role }` edit its own tile button writes (so the replay
 * record's `clean-edits` is the same page by page as N separate clicks).
 */
export function rolesEdit(edits: PageMaskEdit[], pages: readonly PageRole[]): PageMaskEdit[] {
  return pages.reduce((e, p) => roleEdit(e, p.file, p.page, p.role), edits);
}

/** The sheet pass (8b) on the sheet step: the watermark and stroke text no page could prove. */
export function SheetCleanRows({
  api,
  clean,
  askOn = true,
}: {
  api: ImportSessionApi;
  clean: NonNullable<StageIO['assemble']['out']['clean']>;
  /** false while the sheet step has a blocker: the blocker's answer owns the coach. */
  askOn?: boolean;
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
        askOn={askOn}
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
