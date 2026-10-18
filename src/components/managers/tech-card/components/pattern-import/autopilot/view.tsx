// A10 · AUTOPILOT — what the autopilot assumed, as the operator reads it: strong ones first, each
// a row (step · what · the answer) with, in the wizard, a door back to its step. The card's
// Patterns tab shows the same list read-only, off the sheet's manifest. DESIGN.md: rows on hairline
// rules under a GroupLabel, tone only in a Pill — no box inside the block.
import { useState } from 'react';
import type { AutopilotAssumption, WizardStep } from 'lib/pattern-import/types';
import { Button, GenericPopover, GroupLabel, Pill, Row, Text } from 'ui';

const STEP_WORD: Record<string, string> = {
  files: 'files',
  scale: 'scale',
  sheet: 'sheet',
  sizes: 'sizes',
  pieces: 'pieces',
  meaning: 'details',
  fabrics: 'fabrics',
  check: 'check',
  apply: 'apply',
};

/** "autopilot · 12 assumptions (3 strong)". */
export function autopilotSummary(list: readonly Pick<AutopilotAssumption, 'strong'>[]): string {
  const k = list.filter((a) => a.strong).length;
  return `autopilot · ${list.length} ${list.length === 1 ? 'assumption' : 'assumptions'}${k ? ` (${k} strong)` : ''}`;
}

/** Strong first, then by step order as they were given. */
const ordered = <A extends Pick<AutopilotAssumption, 'strong'>>(xs: readonly A[]) =>
  xs
    .map((a, k) => ({ a, k }))
    .sort((x, y) => Number(y.a.strong) - Number(x.a.strong) || x.k - y.k)
    .map((x) => x.a);

export function AssumptionList({
  assumptions,
  onDoor,
  limit = 12,
  flush = true,
  bare = false,
}: {
  assumptions: readonly AutopilotAssumption[];
  /** The wizard: a door back to the step the answer was given on. Absent = read-only. */
  onDoor?: (step: WizardStep) => void;
  limit?: number;
  flush?: boolean;
  /** Inside a fold that already says the summary: the rows only. */
  bare?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (!assumptions.length) return null;
  const xs = ordered(assumptions);
  const shown = all ? xs : xs.slice(0, limit);
  return (
    <div data-autopilot-assumptions=''>
      {!bare && <GroupLabel flush={flush}>{autopilotSummary(assumptions)}</GroupLabel>}
      {shown.map((a, k) => (
        <Row
          key={`${a.kind}|${a.subject}|${k}`}
          label={
            <span className='flex flex-wrap items-center gap-1.5'>
              {a.strong && (
                <Pill tone='attention' title='a default the drawing gives no evidence for'>
                  strong
                </Pill>
              )}
              <Text size='micro' component='span' title={`${a.rule} — ${a.evidence.join(' · ')}`}>
                {STEP_WORD[a.step] ?? a.step} · {a.subject} {a.answer.startsWith('→') ? '' : '→ '}
                {a.answer}
              </Text>
            </span>
          }
          value={
            onDoor && STEP_WORD[a.step] ? (
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() => onDoor(a.step as WizardStep)}
                title={`back to ${STEP_WORD[a.step]} — change this answer there`}
              >
                {STEP_WORD[a.step]}
              </Button>
            ) : undefined
          }
        />
      ))}
      {xs.length > limit && (
        <Button type='button' variant='underline' size='xs' onClick={() => setAll((v) => !v)}>
          {all ? 'show fewer' : `show all ${xs.length}`}
        </Button>
      )}
    </div>
  );
}

// ── The card's Patterns tab ─────────────────────────────────────────────────────────────────
// The owner (16.10): the old pill + inline list read as a wall («too much text, nonsense for the
// user»). Now: one quiet label «auto · N to check», and behind it a small popover with one line
// per thing a person would check (grain, sizes, pieces, fabric, pages), plain words, piece chips
// and a door. D5 holds: every assumption is still recorded in the manifest and reachable — each
// group's [details] opens its raw rows (subject → answer, rule and evidence on hover).

type GroupId = 'grain' | 'sizes' | 'pieces' | 'fabric' | 'pages';
const GROUP_ORDER: GroupId[] = ['grain', 'sizes', 'pieces', 'fabric', 'pages'];
/** Pages / scale read as the file printed them: shown, never counted as «to check» unless strong. */
const QUIET: ReadonlySet<GroupId> = new Set(['pages']);

const KIND_GROUP: Record<string, GroupId> = {
  'grain-proposal': 'grain',
  'grain-axis': 'grain',
  'fold-edge': 'grain',
  'not-a-fold': 'grain',
  'drawn-sizes': 'sizes',
  'legend-row': 'sizes',
  'legend-outline': 'sizes',
  'size-guess': 'sizes',
  'size-ordinal': 'sizes',
  'size-dropped': 'sizes',
  'size-flag': 'sizes',
  'sheet-legend': 'sizes',
  fabric: 'fabric',
  'clean-accept': 'pages',
  'pages-as-read': 'pages',
  'scale-confirmed': 'pages',
  'scale-1to1': 'pages',
  'scale-anisotropic': 'pages',
  'sheet-choice': 'pages',
  residuals: 'pages',
  'sheet-grid': 'pages',
  'sheet-passed': 'pages',
};
const STEP_GROUP: Record<string, GroupId> = {
  files: 'pages',
  scale: 'pages',
  sheet: 'pages',
  sizes: 'sizes',
  fabrics: 'fabric',
};
const groupOf = (a: Pick<AutopilotAssumption, 'kind' | 'step'>): GroupId =>
  KIND_GROUP[a.kind] ?? STEP_GROUP[a.step] ?? 'pieces';

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const countOf = (xs: readonly AutopilotAssumption[], test: (a: AutopilotAssumption) => boolean) =>
  xs.filter(test).length;

/** A piece as people name it on the card: its code (WB, BP …), else a short name. */
function pieceChip(subject: string): string | null {
  const s = subject.replace(/\s*\(seed [^)]*\)\s*$/, '').trim();
  if (!s || /^(the |outline |piece at |flag )/.test(s)) return null;
  const first = s.split(/\s+/)[0];
  if (/^[A-Z0-9][A-Z0-9-]{0,5}$/.test(first)) return first;
  const bare = s.replace(/^«|»$/g, '');
  return bare.length > 14 ? `${bare.slice(0, 13)}…` : bare;
}
const piecesOf = (xs: readonly AutopilotAssumption[]) => [
  ...new Set(xs.map((a) => pieceChip(a.subject)).filter((c): c is string => !!c)),
];
const pieceCount = (xs: readonly AutopilotAssumption[]) => new Set(xs.map((a) => a.subject)).size;

function lineOf(g: GroupId, xs: readonly AutopilotAssumption[]): string {
  const parts: string[] = [];
  const rest = (used: number) => {
    if (xs.length > used) parts.push(n(xs.length - used, 'other answer', 'other answers'));
  };
  switch (g) {
    case 'grain': {
      const grain = xs.filter((a) => a.kind === 'grain-axis' || a.kind === 'grain-proposal');
      const fold = xs.filter((a) => a.kind === 'fold-edge' || a.kind === 'not-a-fold');
      const what = grain.length && fold.length ? 'grain and fold' : grain.length ? 'grain' : 'fold';
      return `${what} set on ${n(pieceCount(xs), 'piece', 'pieces')}`;
    }
    case 'fabric':
      return `fabric set on ${n(pieceCount(xs), 'piece', 'pieces')}`;
    case 'sizes': {
      const inside = countOf(xs, (a) => /^legend-/.test(a.kind) && a.answer.startsWith('internal'));
      const legend = countOf(xs, (a) => /^legend-/.test(a.kind)) - inside;
      const order = countOf(xs, (a) => a.kind === 'size-ordinal' || a.kind === 'size-guess');
      const dropped = countOf(xs, (a) => a.kind === 'size-dropped');
      const drawn = countOf(xs, (a) => a.kind === 'drawn-sizes');
      const flags = countOf(xs, (a) => a.kind === 'size-flag');
      if (inside) parts.push(`${n(inside, 'line', 'lines')} read as inside the pieces`);
      if (legend) parts.push(`${n(legend, 'legend line', 'legend lines')} read as printed`);
      if (order) parts.push(`${n(order, 'size', 'sizes')} matched by order`);
      if (dropped) parts.push(`${n(dropped, 'size', 'sizes')} left out`);
      if (drawn) parts.push('number of drawn sizes taken from the sheet');
      if (flags) parts.push(`${n(flags, 'mark', 'marks')} read`);
      rest(inside + legend + order + dropped + drawn + flags);
      return `sizes: ${parts.join(', ')}`;
    }
    case 'pages': {
      const read = new Map<string, number>();
      let aside = 0;
      let drawings = 0;
      let scale = 0;
      for (const a of xs) {
        if (a.kind === 'clean-accept') drawings++;
        else if (a.answer.startsWith('set aside')) aside++;
        else if (a.kind === 'pages-as-read' && a.answer.startsWith('read as ')) {
          const w = a.answer.slice(8).trim();
          read.set(w, (read.get(w) ?? 0) + 1);
        } else if (a.kind.startsWith('scale')) scale++;
      }
      for (const [w, k] of read) parts.push(`${k} read as ${k === 1 ? w : `${w}s`}`);
      if (aside) parts.push(`${aside} set aside`);
      if (drawings) parts.push(`${n(drawings, 'drawing', 'drawings')} set aside`);
      if (scale) parts.push('scale taken as printed');
      rest([...read.values()].reduce((s, k) => s + k, 0) + aside + drawings + scale);
      return `pages: ${parts.join(', ')}`;
    }
    case 'pieces': {
      const names = countOf(xs, (a) => a.kind.startsWith('name-'));
      const counts = countOf(xs, (a) => a.kind === 'quantity');
      const aside = countOf(xs, (a) =>
        ['set-aside', 'not-a-piece', 'dropped-piece'].includes(a.kind),
      );
      const twice = countOf(xs, (a) => a.kind === 'sheet-copy' || a.kind === 'sheet-alternative');
      const outline = xs.find((a) => a.kind === 'outline');
      if (names) parts.push(`${n(names, 'name', 'names')} taken from the file`);
      if (counts) parts.push(`${n(counts, 'count', 'counts')} set`);
      if (aside) parts.push(`${n(aside, 'outline', 'outlines')} set aside`);
      if (twice) parts.push(`${n(twice, 'piece', 'pieces')} drawn twice, kept once`);
      if (outline) parts.push(`outline read as ${outline.answer}`);
      rest(names + counts + aside + twice + (outline ? 1 : 0));
      return `pieces: ${parts.join(', ')}`;
    }
  }
}

export type AutopilotGroup = {
  id: GroupId;
  line: string;
  pieces: string[];
  check: boolean;
  rows: AutopilotAssumption[];
};

/** The assumptions, as the groups a person would check — worth-a-look first, quiet ones last. */
export function autopilotGroups(list: readonly AutopilotAssumption[]): AutopilotGroup[] {
  const by = new Map<GroupId, AutopilotAssumption[]>();
  for (const a of list) by.set(groupOf(a), [...(by.get(groupOf(a)) ?? []), a]);
  return GROUP_ORDER.flatMap((id): AutopilotGroup[] => {
    const rows = by.get(id);
    if (!rows?.length) return [];
    const check = !QUIET.has(id) || rows.some((a) => a.strong);
    const pieces = id === 'grain' || id === 'fabric' ? piecesOf(rows) : [];
    return [{ id, line: lineOf(id, rows), pieces, check, rows: ordered(rows) }];
  }).sort((x, y) => Number(y.check) - Number(x.check));
}

/** «auto · 3 to check», or «auto ✓» when nothing is worth a look. */
export const autopilotLabel = (groups: readonly AutopilotGroup[]) => {
  const k = groups.filter((g) => g.check).length;
  return k ? `auto · ${k} to check` : 'auto ✓';
};

const QUIET_LINK =
  'shrink-0 text-micro underline underline-offset-2 hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor';

function GroupLine({
  g,
  onCheck,
}: {
  g: AutopilotGroup;
  /** The door: the pieces viewer of the slot (grain, pieces, fabric). Absent = no door. */
  onCheck?: () => void;
}) {
  const [raw, setRaw] = useState(false);
  const door = onCheck && g.id !== 'sizes' && g.id !== 'pages';
  return (
    <li className='flex flex-col gap-1.5 py-2' data-autopilot-group={g.id}>
      <span className='flex items-baseline gap-2'>
        <Text
          size='micro'
          component='span'
          variant={g.check ? undefined : 'label'}
          className='min-w-0 flex-1'
        >
          {g.line}
        </Text>
        {door && (
          <button type='button' onClick={onCheck} className={QUIET_LINK}>
            check
          </button>
        )}
        <button
          type='button'
          aria-expanded={raw}
          onClick={() => setRaw((v) => !v)}
          className={`${QUIET_LINK} text-labelColor`}
        >
          {raw ? 'hide' : 'details'}
        </button>
      </span>
      {g.pieces.length > 0 && (
        <span className='flex flex-wrap gap-1'>
          {g.pieces.slice(0, 12).map((p) => (
            <Pill key={p} tone='mut'>
              {p}
            </Pill>
          ))}
          {g.pieces.length > 12 && (
            <Text size='micro' variant='label' component='span'>
              +{g.pieces.length - 12}
            </Text>
          )}
        </span>
      )}
      {raw && (
        <ul className='flex flex-col gap-1'>
          {g.rows.map((a, k) => (
            <li key={`${a.kind}|${a.subject}|${k}`}>
              <Text
                size='micro'
                variant='label'
                component='span'
                title={`${a.rule} — ${a.evidence.join(' · ')}`}
              >
                {a.subject} {a.answer.startsWith('→') ? '' : '→ '}
                {a.answer}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The card's Patterns tab: a quiet «auto · N to check» on a sheet the autopilot wrote. */
export function AutopilotPill({
  assumptions,
  onCheckPieces,
}: {
  assumptions: readonly AutopilotAssumption[];
  /** Opens the slot's pieces viewer — the door for grain / pieces / fabric. */
  onCheckPieces?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!assumptions.length) return null;
  const groups = autopilotGroups(assumptions);
  const toCheck = groups.some((g) => g.check);
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      className='w-[320px]'
      triggerProps={{
        title: 'the importer answered some questions itself — open to see what',
        className:
          'flex items-center text-micro underline decoration-borderColor underline-offset-2 hover:opacity-70 ' +
          (toCheck ? 'text-warning' : 'text-labelColor'),
      }}
      openElement={autopilotLabel(groups)}
    >
      <ul data-autopilot-assumptions='' className='flex flex-col divide-y divide-borderColor'>
        {groups.map((g) => (
          <GroupLine
            key={g.id}
            g={g}
            onCheck={
              onCheckPieces
                ? () => {
                    setOpen(false);
                    onCheckPieces();
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </GenericPopover>
  );
}

// ── The wizard: «skip — decide for me» ─────────────────────────────────────────────────────
// Owner 18.10: skip answers every open question with its likely answer (ui-bits LIKELY ANSWERS).
// D5: nothing silent — each guess is one line here, grouped by step, the step a door back.

/** One guess skip took for the operator: where, what, which answer. */
export type SkipGuess = { step: WizardStep; what: string; answer: string };

/** The wizard header's «auto · N to check»: the skip guesses by step, each step a door back. */
export function GuessesPill({
  guesses,
  onDoor,
}: {
  guesses: readonly SkipGuess[];
  onDoor: (step: WizardStep) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!guesses.length) return null;
  const steps = [...new Set(guesses.map((g) => g.step))];
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      className='w-[320px]'
      triggerProps={{
        title: 'skip answered these questions for you — open to see what',
        className:
          'flex items-center text-micro text-warning underline decoration-borderColor underline-offset-2 hover:opacity-70',
        ...({ 'data-testid': 'pattern-import-guesses' } as object),
      }}
      openElement={`auto · ${steps.length} to check`}
    >
      <ul data-skip-guesses='' className='flex flex-col divide-y divide-borderColor'>
        {steps.map((st) => (
          <li key={st} className='flex flex-col gap-1 py-2' data-skip-step={st}>
            <span className='flex items-baseline gap-2'>
              <Text size='micro' component='span' className='min-w-0 flex-1'>
                {STEP_WORD[st] ?? st}
              </Text>
              <button
                type='button'
                className={QUIET_LINK}
                title={`back to ${STEP_WORD[st] ?? st} — change these answers there (skip stops)`}
                onClick={() => {
                  setOpen(false);
                  onDoor(st);
                }}
              >
                back
              </button>
            </span>
            <ul className='flex flex-col gap-0.5'>
              {guesses
                .filter((g) => g.step === st)
                .map((g) => (
                  <li key={g.what}>
                    <Text size='micro' variant='label' component='span'>
                      {g.what} → {g.answer}
                    </Text>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </GenericPopover>
  );
}

/** Per viewer: the files step's "autopilot" switch (localStorage, never required). */
const PREF_KEY = 'patimport.autopilot';
export function readAutopilotPref(): boolean {
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v == null ? true : v === '1';
  } catch {
    return true;
  }
}
export function writeAutopilotPref(on: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    /* private window, blocked storage: the switch still works for this run */
  }
}
