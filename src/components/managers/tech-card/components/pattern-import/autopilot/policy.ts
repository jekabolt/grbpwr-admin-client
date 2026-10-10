// A10 · AUTOPILOT POLICY (rule D5, auto/00-PLAN §A10) — "drop the files, it does it by itself".
//
// Every question the wizard asks (the `blocker` memo of use-import-session.ts, `openQuestions` of
// answers.ts, and what a step offers without blocking on it — N1 `stepOffer`) gets an answer here —
// best evidence → the run's own proposal → a sensible default — or a HARD STOP with the reason.
// Each answer is an ASSUMPTION (rule, evidence, confidence; `strong` for the dangerous defaults)
// that travels to the manifest (`Inputs.autopilot` → write), so nothing is hidden.
//
// Pure: {session, inputs, step, question, card} → {patch, events, stop, assumptions} — the shape
// of N1's `AutoResolver` (auto-advance.ts), so `api.advance({ resolve: autopilotResolver(card) })`
// drives it. The answers are the SAME the operator's controls give (scaleConfirmed, the size map,
// confirmedQuantities, operatorGrain with `accepted`, overrides, the fabric assignment …), so the
// gate and the manifest see ordinary answers and no check is weakened. One question, one answer:
// the step is checked again on the new outputs — a fixpoint (no question → the step's next) or a
// stop.
import type {
  AllowanceDecision,
  BackgroundKind,
  FabricAssignment,
  ImportSession,
  NameDecision,
  PageMaskEdit,
  PieceEdit,
  PieceFamily,
  PtMm,
  Seed,
  SeedId,
  SizeMapEntry,
  WizardEvent,
  WizardStep,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { identitiesOf, identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import { isKnownCode } from 'lib/pattern-import/dictionary/codes';
import { nameOriginOf } from 'lib/pattern-import/ai/dxf-names';
import { planScopes } from 'lib/pattern-import/fabrics/scope';
import { anisotropyOf, squareSidesOf } from '../formats';
import { answersNowOf, openQuestions, questionKey, type AnswerCtx } from '../answers';
import type { CardContext } from '../client';
import {
  exportedRanks,
  guessedSizes,
  legendKey,
  textNameOf,
  variantsOf,
  type Inputs,
  type LegendEdit,
} from '../use-import-session';
import { fallbackGrain } from './grain';
import { deterministicCodes } from './names';
import { seedPoints } from './seeds';
import { mergeAssumptions, type Assumption, type AssumptionKind } from './types';

/** What the policy reads — N1's `AutoSnapshot` plus the card (the resolver closes over it). */
export type AutopilotSnapshot = {
  session: ImportSession;
  inputs: Inputs;
  card: CardContext;
  /** Why the step stops: its blocker, else its offer (N1). null = it asks nothing. */
  question?: string | null;
  step?: WizardStep;
  /** The first pieces run's seeds (`api.baseSeeds`); absent = the session's seeds. */
  baseSeeds?: Seed[] | null;
  /** The DXF fast path (`api.extracted.presegmented`); absent = read off the files' kind. */
  presegmented?: boolean;
};

/** The policy's internal view: the snapshot made whole. */
type Snap = {
  session: ImportSession;
  inputs: Inputs;
  card: CardContext;
  baseSeeds: Seed[] | null;
  answersNow: AnswerCtx;
  presegmented: boolean;
  blocker: string | null;
};

/** The answers the autopilot gives — each is one the operator's UI gives the same way. */
export type AutopilotAction =
  | {
      kind: 'inputs';
      patch: Partial<Pick<Inputs, 'scaleConfirmed' | 'residualsAccepted' | 'legendConfirmed'>>;
    }
  /** A8 "accept" on the clean stage's suggestions (files / sheet step). */
  | { kind: 'clean'; edits: PageMaskEdit[] }
  /** A legend answer (from the pieces step: back to the sizes step first). */
  | { kind: 'legend'; edits: LegendEdit[]; back?: WizardStep; confirm?: string[] }
  /** Click seeds (appended to the run's own seeds), the pieces run again. */
  | { kind: 'seeds'; seeds: Seed[] }
  /** Go on past an offer the run leaves as it is (pages set aside to check). */
  | { kind: 'proceed' }
  | { kind: 'drawn-sizes'; n: number }
  | { kind: 'size-map'; entries: SizeMapEntry[] }
  | { kind: 'variant'; variant: string }
  /** The full piece-edit list (the run goes back to the pieces step first when past it). */
  | { kind: 'piece-edits'; edits: PieceEdit[] }
  /** A details answer: these inputs merged over the current ones, then semantics re-runs. */
  | {
      kind: 'semantics';
      patch: Partial<
        Pick<
          Inputs,
          'fileAllowance' | 'overrides' | 'operatorGrain' | 'operatorFold' | 'foldListChecked'
        >
      >;
    }
  /** D3 "confirm all as shown" (counts, sheet-note names, AI names below the threshold). */
  | { kind: 'confirm-shown' }
  /** A name typed over an AI / DXF name the identity rule refuses. */
  | { kind: 'edit-name'; seed: SeedId; code: string; mods: string[]; displayName: string }
  | { kind: 'fabrics'; assignment: FabricAssignment };

export type AutopilotStop = { step: WizardStep; reason: string };

export type AutopilotDecision = {
  actions: AutopilotAction[];
  assumptions: Assumption[];
  stop?: AutopilotStop;
};

/**
 * The answer in N1's `AutoAnswer` shape (structurally: patch → events, applied in order, then the
 * step is checked again), plus what N1 does not carry: `proceed` (go on past an offer left as it
 * is), the stop's reason, and the assumptions of this answer (already merged into
 * `patch.autopilot`, listed again for the caller's log).
 */
export type AutopilotAnswer = {
  patch?: Partial<Inputs>;
  events?: WizardEvent[];
  stop?: boolean;
  proceed?: boolean;
  reason?: AutopilotStop;
  assumptions: Assumption[];
};

const NONE: AutopilotDecision = { actions: [], assumptions: [] };
const stopAt = (step: WizardStep, reason: string, assumptions: Assumption[] = []) => ({
  actions: [],
  assumptions,
  stop: { step, reason },
});

/** One assumption (the record the manifest carries, plus the seed it is about). */
function A(
  step: WizardStep,
  kind: AssumptionKind,
  subject: string,
  answer: string,
  rule: string,
  evidence: string[],
  confidence: number,
  strong: boolean,
  seed?: SeedId,
): Assumption {
  return {
    step,
    kind,
    subject,
    answer,
    rule,
    evidence,
    confidence: Math.round(confidence * 100) / 100,
    strong,
    ...(seed != null ? { seed } : {}),
  };
}

const snapOf = (x: AutopilotSnapshot): Snap => ({
  session: x.session,
  inputs: x.inputs,
  card: x.card,
  baseSeeds: x.baseSeeds ?? null,
  answersNow: answersNowOf(x.session, x.inputs),
  presegmented: x.presegmented ?? x.session.files.some((f) => f.kind === 'dxf'),
  blocker: x.question ?? null,
});

/**
 * The policy's answer to the question the step stops on, as patch + events (N1 `AutoAnswer`). A
 * question the policy has no answer for is a stop (the reason says which).
 */
export function autopilotAnswer(x: AutopilotSnapshot): AutopilotAnswer {
  const snap = snapOf(x);
  const d = decideSnap(snap);
  const autopilot = mergeAssumptions(x.inputs.autopilot ?? [], d.assumptions);
  if (d.stop)
    return { stop: true, reason: d.stop, assumptions: d.assumptions, patch: { autopilot } };
  const act = d.actions[0];
  if (!act) {
    if (!snap.blocker) return { assumptions: d.assumptions, patch: { autopilot } };
    return {
      stop: true,
      reason: { step: x.session.step, reason: `no answer for: ${snap.blocker}` },
      assumptions: d.assumptions,
      patch: { autopilot },
    };
  }
  const { patch, events, proceed } = toWizard(snap, act);
  return {
    patch: { ...patch, autopilot },
    events,
    ...(proceed ? { proceed } : {}),
    assumptions: d.assumptions,
  };
}

/**
 * N1's resolver: `api.advance({ resolve: autopilotResolver(card) })`. The assumptions accumulate in
 * `Inputs.autopilot` through the patch; a stop's reason goes to `onStop` (N1 stops silently).
 */
export function autopilotResolver(
  card: CardContext,
  opts: {
    onStop?: (stop: AutopilotStop) => void;
    extra?: () => Pick<AutopilotSnapshot, 'baseSeeds' | 'presegmented'>;
  } = {},
) {
  return (snap: {
    session: ImportSession;
    inputs: Inputs;
    step: WizardStep;
    question: string;
  }): AutopilotAnswer => {
    const a = autopilotAnswer({ ...snap, card, ...(opts.extra?.() ?? {}) });
    if (a.stop && a.reason) opts.onStop?.(a.reason);
    return a;
  };
}

/** The same answer the operator's control gives, as an inputs patch and wizard events. */
function toWizard(
  snap: Snap,
  a: AutopilotAction,
): { patch?: Partial<Inputs>; events?: WizardEvent[]; proceed?: boolean } {
  const { session: s, inputs: i } = snap;
  // re-submitting the names table as it is re-runs semantics on the LIVE answers through the
  // wizard's own `semanticsInput` (the AI's counts and fold hints included): the details answer
  const rerunSemantics: WizardEvent = { type: 'names', decisions: s.names };
  switch (a.kind) {
    case 'inputs':
      return { patch: a.patch };
    case 'clean':
      return { events: [{ type: 'clean', edits: a.edits }] };
    case 'proceed':
      return { proceed: true };
    case 'seeds':
      // `addSeed()` of the hook: the clicks join the first run's seeds, the fill runs again
      return {
        patch: { clickSeeds: [...i.clickSeeds, ...a.seeds] },
        events: [{ type: 'piece-edits', edits: i.edits }],
      };
    case 'legend':
      return {
        ...(a.confirm ? { patch: { legendConfirmed: a.confirm } } : {}),
        events: [
          ...(a.back ? [{ type: 'back', to: a.back } as WizardEvent] : []),
          { type: 'legend', edits: a.edits },
        ],
      };
    case 'drawn-sizes':
      return { events: [{ type: 'drawn-sizes', n: a.n }] };
    case 'size-map':
      return { events: [{ type: 'size-map', entries: a.entries }] };
    case 'variant':
      return { events: [{ type: 'variant', variant: a.variant }] };
    case 'piece-edits':
      return {
        events: [
          ...(s.step !== 'pieces' ? [{ type: 'back', to: 'pieces' } as WizardEvent] : []),
          { type: 'piece-edits', edits: a.edits },
        ],
      };
    case 'semantics':
      return { patch: a.patch, events: [rerunSemantics] };
    case 'confirm-shown': {
      // `confirmShown()` of the hook: every open count keyed by its question, every open name
      const now = snap.answersNow;
      const open = openQuestions(s.semantics, s.names, i, now);
      return {
        patch: {
          confirmedQuantities: {
            ...i.confirmedQuantities,
            ...Object.fromEntries(open.quantity.map((u) => [u.seed, questionKey(u, now)])),
          },
          confirmedNames: [
            ...new Set([
              ...i.confirmedNames,
              ...open.name.map((u) => u.seed),
              ...open.aiNames.map((n) => n.seed),
            ]),
          ],
        },
      };
    }
    case 'edit-name': {
      // `editName()` of the hook: the name is typed (origin 'operator'), the AI's fabric call for
      // the old name is dropped, the names table re-runs semantics
      const staleFabric = !!i.assignment?.aiOnly?.some((x) => x.seed === a.seed);
      const p = { code: a.code, mods: a.mods, displayName: a.displayName };
      const decisions: NameDecision[] = s.names.some((n) => n.seed === a.seed)
        ? s.names.map((n) => (n.seed === a.seed ? { ...n, ...p } : n))
        : [...s.names, { ...textNameOf(a.seed, s.semantics, i.overrides[a.seed]), ...p }];
      return {
        patch: {
          editedNames: [...new Set([...i.editedNames, a.seed])],
          confirmedNames: [...new Set([...i.confirmedNames, a.seed])],
          ...(staleFabric ? { assignment: null } : {}),
        },
        events: [{ type: 'names', decisions }],
      };
    }
    case 'fabrics':
      return { events: [{ type: 'fabrics', assignment: a.assignment }] };
  }
}

/** The policy's decision on a snapshot (the actions, before they are put in wizard terms). */
export function decide(x: AutopilotSnapshot): AutopilotDecision {
  return decideSnap(snapOf(x));
}

/** Residuals up to this many times the limit are accepted (beyond: a stop). */
export const RESIDUAL_ACCEPT_X = 3;

/** The policy: what to answer on the current step (or why to stop). */
function decideSnap(snap: Snap): AutopilotDecision {
  const s = snap.session;
  if (s.busy) return NONE;
  if (s.error) return stopAt(s.step, s.error);
  switch (s.step) {
    case 'files':
      return filesStep(snap);
    case 'scale':
      return scaleStep(snap);
    case 'sheet':
      return sheetStep(snap);
    case 'sizes':
      return sizesStep(snap);
    case 'pieces':
      return piecesStep(snap);
    case 'meaning':
      return meaningStep(snap);
    case 'fabrics':
      return fabricsStep(snap);
    case 'check': {
      const failing = Object.entries(s.gate).flatMap(([scope, g]) =>
        g.checks
          .filter((c) => !c.ok && c.severity === 'block')
          .map((c) => `${scope.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()} ${c.id}`),
      );
      // a gate block is never answered: the export would be known wrong
      if (failing.length) return stopAt('check', `the gate blocks: ${failing.join(', ')}`);
      return NONE;
    }
    default:
      return NONE;
  }
}

// ── files: the clean stage's offers ─────────────────────────────────────────────────────────────

/** The edits with this kind's run-wide decision replaced (steps/files-clean.tsx `withKind`). */
function withKind(edits: readonly PageMaskEdit[], kind: BackgroundKind, keep: boolean) {
  return [
    ...edits.filter((e) => !('kind' in e && e.kind === kind && e.file === undefined)),
    { kind, keep },
  ];
}

/** Suggested mask kinds nobody accepted yet, with what they cover. */
function waitingKinds(
  items: readonly {
    kind: BackgroundKind;
    status: string;
    applied: boolean;
    lines: number;
    evidence: string[];
  }[],
) {
  const by = new Map<BackgroundKind, { lines: number; evidence: string[] }>();
  for (const it of items)
    if (it.status === 'suggest' && !it.applied) {
      const b = by.get(it.kind) ?? { lines: 0, evidence: [] };
      b.lines += it.lines;
      if (b.evidence.length < 2) b.evidence.push(...it.evidence.slice(0, 1));
      by.set(it.kind, b);
    }
  return by;
}

/** An offer's suggested set-asides are accepted (the clean stage's proposal, D5 order). */
function acceptWaiting(
  step: WizardStep,
  by: Map<BackgroundKind, { lines: number; evidence: string[] }>,
  i: Inputs,
): AutopilotDecision {
  let edits: PageMaskEdit[] = [...i.cleanEdits];
  for (const k of by.keys()) edits = withKind(edits, k, false);
  return {
    actions: [{ kind: 'clean', edits }],
    assumptions: [...by].map(([k, b]) =>
      A(
        step,
        'clean-accept',
        `${k} (${b.lines} lines)`,
        'set aside',
        'what the clean stage suggests setting aside is accepted',
        b.evidence,
        0.6,
        false,
      ),
    ),
  };
}

function filesStep({ session: s, inputs: i, presegmented, blocker }: Snap): AutopilotDecision {
  if (!s.files.length) return stopAt('files', 'no file was read');
  if (!s.scale.candidates.length) return stopAt('files', 'the files could not be read');
  if (!blocker || presegmented || !s.clean) return NONE;
  const by = waitingKinds(s.clean.pages.flatMap((p) => p.items));
  if (by.size) return acceptWaiting('files', by, i);
  // pages set aside "to check", pages the reader could not place: left as the reader set them
  const check = s.clean.dropped.filter((d) => d.status === 'suggest');
  const unknown = s.pages.filter((p) => p.cls === 'unknown');
  if (!check.length && !unknown.length) return NONE;
  return {
    actions: [{ kind: 'proceed' }],
    assumptions: [
      ...check.map((d) =>
        A(
          'files',
          'pages-as-read',
          `file ${d.file} page ${d.page + 1}`,
          `set aside (${d.cls})`,
          'a page the reader set aside stays aside',
          [d.why.slice(0, 160)],
          0.6,
          false,
        ),
      ),
      ...unknown.map((p) =>
        A(
          'files',
          'pages-as-read',
          `file ${p.file} page ${p.page + 1}`,
          'role as read (unknown)',
          'a page the reader could not place is read as it is',
          [],
          0.4,
          false,
        ),
      ),
    ],
  };
}

// ── scale ───────────────────────────────────────────────────────────────────────────────────────

function scaleStep({ session: s, inputs: i, blocker }: Snap): AutopilotDecision {
  const c = s.scale.candidates[i.scaleIndex];
  if (!c) return stopAt('scale', 'no scale candidate: the file gives no size reference at all');
  if (!blocker || i.scaleConfirmed || i.manualMeasuredMm) return NONE;
  const sides = squareSidesOf(c.evidence?.text);
  const anis = sides ? anisotropyOf(sides) : 0;
  const answer = `×${c.factor.toFixed(4)} (${c.method})`;
  const ev = [
    `method ${c.method}, confidence ${c.confidence.toFixed(2)}`,
    ...(c.declaredMm ? [`declared ${c.declaredMm} mm`] : []),
    ...(c.measuredMm ? [`measured ${c.measuredMm.toFixed(2)} mm`] : []),
    ...(c.evidence?.text ? [`«${c.evidence.text.slice(0, 80)}»`] : []),
  ];
  const a =
    c.method === 'none'
      ? A(
          'scale',
          'scale-1to1',
          'the file',
          '1:1 as drawn',
          'no test square and no declared scale: the file is taken at 1:1',
          ev,
          0.3,
          true,
        )
      : anis > PATIMPORT.scaleWarnRatio
        ? A(
            'scale',
            'scale-anisotropic',
            'the file',
            answer,
            'the test square is not square in the file: the best candidate is taken as it is',
            [...ev, `anisotropy ${(anis * 100).toFixed(1)} %`],
            0.4,
            true,
          )
        : A(
            'scale',
            'scale-confirmed',
            'the file',
            answer,
            'the best scale candidate is confirmed',
            ev,
            Math.max(0.5, c.confidence),
            Math.abs(c.factor - 1) > 0.05,
          );
  return { actions: [{ kind: 'inputs', patch: { scaleConfirmed: true } }], assumptions: [a] };
}

// ── sheet ───────────────────────────────────────────────────────────────────────────────────────

function sheetStep({ session: s, inputs: i }: Snap): AutopilotDecision {
  const sheets = new Set(s.pages.filter((p) => p.cls === 'tile').map((p) => p.sheet));
  const info: Assumption[] =
    sheets.size > 1
      ? [
          A(
            'sheet',
            'sheet-choice',
            'the file',
            `tile sheet ${i.sheetIndex + 1} of ${sheets.size}`,
            'a file with several tile sheets: the first is imported (one run imports one sheet)',
            [`${sheets.size} tile sheets`],
            0.5,
            false,
          ),
        ]
      : [];
  const waiting = waitingKinds(s.sheet?.clean?.items ?? []);
  if (waiting.size) {
    const d = acceptWaiting('sheet', waiting, i);
    return { ...d, assumptions: [...info, ...d.assumptions] };
  }
  const miss = s.sheet?.sheet.missing.length ?? 0;
  if (miss)
    return stopAt(
      'sheet',
      `${miss} pages are missing — the grid cannot be closed without them`,
      info,
    );
  const worst = Math.max(0, ...(s.sheet?.sheet.poses.map((p) => p.residualMm) ?? [0]));
  const lim = PATIMPORT.registrationMaxResidualMm;
  if (worst > lim && !i.residualsAccepted) {
    if (worst > RESIDUAL_ACCEPT_X * lim)
      return stopAt(
        'sheet',
        `the tiles do not close: ${worst.toFixed(2)} mm > ${RESIDUAL_ACCEPT_X} × ${lim} mm`,
        info,
      );
    return {
      actions: [{ kind: 'inputs', patch: { residualsAccepted: true } }],
      assumptions: [
        ...info,
        A(
          'sheet',
          'residuals',
          'the tile grid',
          `accepted ${worst.toFixed(2)} mm`,
          `a tile residual over the limit but within ${RESIDUAL_ACCEPT_X}× of it is accepted`,
          [`worst residual ${worst.toFixed(2)} mm, limit ${lim} mm`],
          0.5,
          false,
        ),
      ],
    };
  }
  return { actions: [], assumptions: info };
}

// ── sizes ───────────────────────────────────────────────────────────────────────────────────────

/**
 * No legend row draws the outlines (no 'size', no 'common' row — a one-pen plot read as
 * 'internal'): the longest row that is not set aside becomes the size line (the live smoke's own
 * answer on inkscape-pieces-mm.svg). Asked once: a row already answered is not answered again.
 */
function outlineLegend(s: ImportSession, i: Inputs): AutopilotDecision | null {
  const cls = s.chains?.classes ?? [];
  if (!cls.length || cls.some((c) => c.role === 'size' || c.role === 'common')) return null;
  const k = cls
    .filter((c) => c.role !== 'ignore' && !i.legend.some((e) => e.classId === c.id))
    .sort((a, b) => b.totalLengthMm - a.totalLengthMm)[0];
  if (!k) return null;
  return {
    actions: [
      {
        kind: 'legend',
        edits: [
          ...i.legend,
          { classId: k.id, role: 'size', sizeLabel: null, ...(k.sig ? { sig: k.sig } : {}) },
        ],
      },
    ],
    assumptions: [
      A(
        'sizes',
        'legend-outline',
        `legend row ${legendKey(k)}`,
        `${k.role} → size line`,
        'no legend row draws the outlines: the longest row kept is the size line',
        [
          `${k.chains.length} lines, ${Math.round(k.totalLengthMm)} mm`,
          `read as ${k.role} (${k.confidence.toFixed(2)})`,
        ],
        0.4,
        true,
      ),
    ],
  };
}

function sizesStep({ session: s, inputs: i, card, blocker }: Snap): AutopilotDecision {
  if (!card.sizes.length) return stopAt('sizes', 'the card has no size range');
  const sz = s.sizes;
  if (!sz || !blocker) return NONE;
  // H1: how many sizes the sheet draws
  if (sz.countAsk && !sz.expected) {
    const inf = sz.countAsk.inferred;
    const labelled = sz.run.sizes.filter((x) => x.label).length;
    const one = sz.run.sizes.length === 1 || card.sizes.length === 1;
    const n = inf?.n ?? (labelled >= 2 ? labelled : one ? 1 : null);
    if (n == null)
      return stopAt(
        'sizes',
        'how many sizes the sheet draws is not shown by its lines, labels or the card',
      );
    return {
      actions: [{ kind: 'drawn-sizes', n }],
      assumptions: [
        A(
          'sizes',
          'drawn-sizes',
          'the sheet',
          `${n} ${n === 1 ? 'size' : 'sizes'} drawn`,
          inf
            ? 'the count the lines show (nesting of the outlines)'
            : labelled >= 2
              ? 'the count of size labels read off the sheet'
              : card.sizes.length === 1
                ? 'a one-size card: one size drawn'
                : 'the sheet reads as one size: one size drawn',
          inf ? [inf.why] : [`${labelled} size labels`, `card run ${card.sizes.length}`],
          inf ? 0.6 : 0.4,
          !inf && labelled < 2,
        ),
      ],
    };
  }
  // legend rows below 0.6
  const pending = (s.chains?.classes ?? []).filter(
    (c) => c.confidence < 0.6 && !i.legendConfirmed.includes(legendKey(c)),
  );
  if (pending.length) {
    const confirm = [...i.legendConfirmed, ...pending.map(legendKey)];
    const rows = pending.map((c) =>
      A(
        'sizes',
        'legend-row',
        `legend row ${legendKey(c)}`,
        `${c.role}${c.sizeLabel ? ` ${c.sizeLabel}` : ''}`,
        'a legend row below 0.6 is confirmed as read',
        [
          `${c.chains.length} lines, ${Math.round(c.totalLengthMm)} mm`,
          ...c.evidence.slice(0, 3).map((e) => e.kind),
        ],
        c.confidence,
        false,
      ),
    );
    // the same answer: no row draws the outlines → the longest row kept is the size line
    const outline = outlineLegend(s, i);
    const edit = outline?.actions[0];
    if (outline && edit?.kind === 'legend')
      return {
        actions: [{ ...edit, confirm }],
        assumptions: [
          ...rows.filter((r) => !outline.assumptions.some((o) => o.subject === r.subject)),
          ...outline.assumptions,
        ],
      };
    return {
      actions: [{ kind: 'inputs', patch: { legendConfirmed: confirm } }],
      assumptions: rows,
    };
  }
  const entries = sz.map.entries;
  if (!entries.length) return stopAt('sizes', 'no size was read off the sheet');
  const cards = [...card.sizes].sort((a, b) => a.rank - b.rank);
  // nothing reaches the card: by order, from the middle of the card's run
  if (!entries.some((e) => e.card)) {
    const src = [...entries].sort((a, b) => a.source.rank - b.source.rank);
    const k = src.length;
    const m = cards.length;
    const map = new Map<number, (typeof cards)[number]>();
    if (k <= m) src.forEach((e, j) => map.set(e.source.rank, cards[Math.floor((m - k) / 2) + j]));
    else
      for (let j = 0; j < m; j++) map.set(src[Math.floor((k - m) / 2) + j].source.rank, cards[j]);
    const next = entries.map(
      (e): SizeMapEntry => ({
        ...e,
        card: map.get(e.source.rank) ?? null,
        origin: 'operator',
      }),
    );
    return {
      actions: [{ kind: 'size-map', entries: next }],
      assumptions: next.map((e) =>
        A(
          'sizes',
          'size-ordinal',
          `source ${e.source.label || `rank ${e.source.rank}`}`,
          e.card ? `→ ${e.card.token}` : 'not exported',
          'no source size spells a card size: mapped by order from the middle of the card run',
          [`${k} source sizes, card run ${cards.map((c) => c.token).join(' ')}`],
          0.25,
          true,
        ),
      ),
    };
  }
  // two source sizes on one card size: the stronger keeps it
  const ids = entries.flatMap((e) => (e.card ? [e.card.sizeId] : []));
  if (new Set(ids).size !== ids.length) {
    const best = new Map<number, SizeMapEntry>();
    for (const e of entries)
      if (e.card) {
        const b = best.get(e.card.sizeId);
        if (!b || (e.confidence ?? 1) > (b.confidence ?? 1)) best.set(e.card.sizeId, e);
      }
    const dropped = entries.filter((e) => e.card && best.get(e.card.sizeId) !== e);
    const next = entries.map(
      (e): SizeMapEntry =>
        dropped.includes(e)
          ? { ...e, card: null, origin: 'operator' }
          : { ...e, origin: 'operator' },
    );
    return {
      actions: [{ kind: 'size-map', entries: next }],
      assumptions: dropped.map((e) =>
        A(
          'sizes',
          'size-dropped',
          `source ${e.source.label || `rank ${e.source.rank}`}`,
          'not exported',
          'two source sizes point at one card size: the weaker match is not exported',
          [`${e.card!.token} kept for ${best.get(e.card!.sizeId)!.source.label || '?'}`],
          0.5,
          false,
        ),
      ),
    };
  }
  // the guesses (< 0.9) are confirmed as matched
  const guesses = guessedSizes(entries);
  if (guesses.length) {
    const own = (i.sizeMap ?? []).filter(
      (e) => !guesses.some((g) => g.source.rank === e.source.rank),
    );
    return {
      actions: [
        {
          kind: 'size-map',
          entries: [...own, ...guesses.map((g): SizeMapEntry => ({ ...g, origin: 'operator' }))],
        },
      ],
      assumptions: guesses.map((g) => {
        const ordinal =
          (g.confidence ?? 0) <= 0.3 || (g.evidence ?? []).some((x) => /by rank|order/i.test(x));
        return A(
          'sizes',
          ordinal ? 'size-ordinal' : 'size-guess',
          `source ${g.source.label || `rank ${g.source.rank}`}`,
          `→ ${g.card!.token}`,
          ordinal
            ? 'the run aligned by rank only (same length): confirmed by order'
            : 'the automatic match below 0.9 is confirmed',
          g.evidence ?? [],
          g.confidence ?? 0,
          ordinal,
        );
      }),
    };
  }
  return NONE;
}

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────

const labelOf = (seeds: readonly Seed[], seed: SeedId) => {
  const sd = seeds.find((x) => x.id === seed);
  return sd?.text?.text?.slice(0, 32) ?? null;
};
const subjectOf = (seeds: readonly Seed[], seed: SeedId) => {
  const l = labelOf(seeds, seed);
  return `seed ${seed}${l ? ` · ${l}` : ''}`;
};

function piecesStep(snap: Snap): AutopilotDecision {
  const { session: s, inputs: i, baseSeeds, presegmented, blocker } = snap;
  const fams = s.pieces?.families ?? [];
  const seeds = s.pieces?.seeds ?? [];
  const variants = variantsOf(seeds, baseSeeds, s.pieces?.variants);
  if (variants.length > 1 && !s.variant) {
    // the model with the most pieces that close
    const all = [...(baseSeeds ?? []), ...seeds];
    const count = (v: string) =>
      fams.filter(
        (f) =>
          all.find((x) => x.id === f.seed)?.variant === v &&
          f.candidates.some((c) => c.outcome === 'closed'),
      ).length;
    const ranked = variants
      .map((v) => ({ v, n: count(v) }))
      .sort((a, b) => b.n - a.n || a.v.localeCompare(b.v));
    const pick = ranked[0];
    const total = ranked.reduce((a, r) => a + r.n, 0) || 1;
    return {
      actions: [{ kind: 'variant', variant: pick.v }],
      assumptions: [
        A(
          'pieces',
          'model',
          'the sheet',
          `model "${pick.v}"`,
          'several models on the sheet: the one with the most closed pieces',
          ranked.map((r) => `${r.v}: ${r.n} pieces`),
          pick.n / total,
          false,
        ),
      ],
    };
  }
  if (!fams.length) {
    // no line draws an outline: the legend is answered on the sizes step, then the pieces again
    const outline = outlineLegend(s, i);
    if (outline)
      return {
        ...outline,
        actions: outline.actions.map((a) =>
          a.kind === 'legend' ? { ...a, back: 'sizes' as const } : a,
        ),
      };
    // nothing seeded: a click inside every closed outline (once)
    const pts = i.clickSeeds.length ? [] : seedPoints(s.chains?.chainPreview ?? []);
    if (!pts.length) return stopAt('pieces', 'no pieces found on the sheet');
    const all = [...(baseSeeds ?? []), ...seeds, ...i.clickSeeds];
    const id0 = Math.max(0, ...all.map((x) => x.id)) + 1;
    const clicks: Seed[] = pts.map((at, k) => ({
      id: id0 + k,
      at,
      origin: 'click',
      variant: i.variant,
    }));
    return {
      actions: [{ kind: 'seeds', seeds: clicks }],
      assumptions: clicks.map((c) =>
        A(
          'pieces',
          'seed-click',
          `seed ${c.id}`,
          `a piece at (${c.at.x.toFixed(0)}, ${c.at.y.toFixed(0)})`,
          'nothing on the sheet seeds a piece: a click inside every closed outline',
          [`${pts.length} closed outlines`],
          0.4,
          true,
          c.id,
        ),
      ),
    };
  }
  if (!blocker) return NONE;
  const mapped = exportedRanks(s.sizes?.map);
  const open = fams.filter((f) =>
    f.candidates.some((c) => (!mapped || mapped.has(c.rank)) && c.outcome !== 'closed'),
  );
  if (!open.length) return NONE;
  if (presegmented)
    return stopAt(
      'pieces',
      `${open.length} DXF ${open.length === 1 ? 'block does' : 'blocks do'} not close (a DXF block cannot be set aside)`,
    );
  if (open.length === fams.length)
    return stopAt('pieces', `no piece closes (${fams.length} open or held-back regions)`);
  return {
    actions: [
      {
        kind: 'piece-edits',
        edits: [...i.edits, ...open.map((f): PieceEdit => ({ kind: 'not-a-piece', seed: f.seed }))],
      },
    ],
    assumptions: open.map((f) => {
      const outs = f.candidates
        .filter((c) => !mapped || mapped.has(c.rank))
        .map((c) => `${c.rank}:${c.outcome}${c.gradeRefusal ? `(${c.gradeRefusal})` : ''}`);
      const named = labelOf(seeds, f.seed) != null;
      return A(
        'pieces',
        'not-a-piece',
        subjectOf(seeds, f.seed),
        'not a piece',
        'a region that does not close (or whose sizes are held back) is set aside',
        outs.slice(0, 4),
        named ? 0.3 : 0.6,
        named,
        f.seed,
      );
    }),
  };
}

// ── details ─────────────────────────────────────────────────────────────────────────────────────

/** Blocked reasons answered on the details step; every other one sets the piece aside. */
const ANSWERED = new Set([
  'no-grain',
  'grammar',
  'duplicate-identity',
  'fold-question',
  'fold-unresolved',
]);

/** The outline a seed's answers are drawn on: its largest exported size. */
function outlineOf(f: PieceFamily | undefined, mapped: Set<number> | null): PtMm[] | null {
  if (!f) return null;
  const cs = f.candidates
    .filter((c) => c.outcome === 'closed' && c.outer.length > 2 && (!mapped || mapped.has(c.rank)))
    .sort((a, b) => b.areaMm2 - a.areaMm2);
  return cs[0]?.outer ?? f.candidates.find((c) => c.outer.length > 2)?.outer ?? null;
}

function meaningStep(snap: Snap): AutopilotDecision {
  const { session: s, inputs: i, card, presegmented, blocker } = snap;
  const sem = s.semantics;
  if (!sem) return NONE;
  if (!blocker) return NONE;
  const seeds = [...(snap.baseSeeds ?? []), ...(s.pieces?.seeds ?? [])];
  const fams = s.pieces?.families ?? [];
  const famOf = (sd: SeedId) => fams.find((f) => f.seed === sd);
  const mapped = exportedRanks(s.sizes?.map);
  const subj = (sd: SeedId) => subjectOf(seeds, sd);

  // 1 · pieces that cannot be built (offset, leak, sizes not told apart …): set aside
  const drop = sem.blocked.filter((b) => !ANSWERED.has(b.reason));
  if (drop.length) {
    if (presegmented)
      return stopAt(
        'meaning',
        `${drop.length} DXF ${drop.length === 1 ? 'block is' : 'blocks are'} blocked: ${[...new Set(drop.map((b) => b.reason))].join(', ')}`,
      );
    const left = new Set(sem.pieces.map((p) => p.seed));
    for (const b of sem.blocked) left.add(b.seed);
    for (const b of drop) left.delete(b.seed);
    if (!left.size)
      return stopAt(
        'meaning',
        `no piece can be built: ${[...new Set(drop.map((b) => b.reason))].join(', ')}`,
      );
    return {
      actions: [
        {
          kind: 'piece-edits',
          edits: [
            ...i.edits,
            ...[...new Set(drop.map((b) => b.seed))].map(
              (seed): PieceEdit => ({ kind: 'not-a-piece', seed }),
            ),
          ],
        },
      ],
      assumptions: drop.map((b) =>
        A(
          'meaning',
          'dropped-piece',
          subj(b.seed),
          'not a piece',
          'a piece that cannot be built is set aside (the rest is exported)',
          [`${b.reason}: ${b.detail.slice(0, 140)}`],
          0.3,
          true,
          b.seed,
        ),
      ),
    };
  }

  // 2 · names, grainlines, folds: one semantics answer for every blocked piece
  const overrides = { ...i.overrides };
  const operatorGrain = { ...i.operatorGrain };
  const operatorFold = { ...i.operatorFold };
  const out: Assumption[] = [];
  let touched = false;
  const unnamed = sem.blocked.filter(
    (b) => b.reason === 'grammar' || b.reason === 'duplicate-identity',
  );
  if (unnamed.length) {
    const named = new Set(s.names.map((n) => n.seed));
    const codes = deterministicCodes(
      unnamed.flatMap((b) => {
        const f = famOf(b.seed);
        const c = f?.candidates[f.candidates.length - 1];
        return c ? [{ seed: b.seed, box: c.bbox }] : [];
      }),
      sem.pieces.map((p) => p.identity),
      card.sizes.map((c) => c.token),
    );
    // a seed with a name decision (AI / DXF) is renamed through the names table: one per tick
    const viaNames = unnamed.find((b) => named.has(b.seed) && codes.has(b.seed));
    if (viaNames) {
      const code = codes.get(viaNames.seed)!;
      return {
        actions: [
          {
            kind: 'edit-name',
            seed: viaNames.seed,
            code,
            mods: [],
            displayName: `piece ${code.slice(1)}`,
          },
        ],
        assumptions: [
          A(
            'meaning',
            'name-code',
            subj(viaNames.seed),
            code,
            'the name the run had is refused by the identity rule: a deterministic code in reading order',
            [viaNames.detail.slice(0, 140)],
            0.5,
            false,
            viaNames.seed,
          ),
        ],
      };
    }
    for (const b of unnamed) {
      const code = codes.get(b.seed);
      if (!code) continue;
      overrides[b.seed] = {
        ...(overrides[b.seed] ?? {}),
        code,
        mods: [],
        displayName: `piece ${code.slice(1)}`,
        nameOrigin: 'operator',
      };
      touched = true;
      out.push(
        A(
          'meaning',
          'name-code',
          subj(b.seed),
          code,
          b.reason === 'duplicate-identity'
            ? 'a name another piece already has: a deterministic code in reading order'
            : 'nothing names the piece (no AI, no DXF block, no title on the sheet): a deterministic code in reading order',
          [b.detail.slice(0, 140)],
          0.5,
          false,
          b.seed,
        ),
      );
    }
  }
  for (const b of sem.blocked.filter((x) => x.reason === 'no-grain')) {
    const pr = sem.grainProposals?.find((g) => g.seed === b.seed);
    if (pr) {
      operatorGrain[b.seed] = { a: pr.a, b: pr.b, accepted: pr.evidence };
      const ang = ((Math.atan2(pr.b.y - pr.a.y, pr.b.x - pr.a.x) * 180) / Math.PI + 360) % 180;
      const geometryOnly = pr.evidence.every((e) => e === 'geometry');
      out.push(
        A(
          'meaning',
          'grain-proposal',
          subj(b.seed),
          `${ang.toFixed(0)}° (${pr.why})`,
          'the proposed grainline (A1) is accepted',
          [pr.why, ...pr.evidence],
          geometryOnly ? 0.45 : 0.7,
          geometryOnly,
          b.seed,
        ),
      );
      touched = true;
      continue;
    }
    const ring = outlineOf(famOf(b.seed), mapped);
    const g = ring ? fallbackGrain(ring) : null;
    if (!g) return stopAt('meaning', `${subj(b.seed)}: no outline to lay a grainline on`);
    operatorGrain[b.seed] = { a: g.a, b: g.b };
    out.push(
      A(
        'meaning',
        'grain-axis',
        subj(b.seed),
        `${g.angleDeg.toFixed(0)}° (${g.from})`,
        'no grainline drawn or proposed: along the longest straight edge or the long axis, the one nearer the sheet vertical when they disagree',
        [g.why],
        g.confidence,
        true,
        b.seed,
      ),
    );
    touched = true;
  }
  for (const b of sem.blocked.filter(
    (x) => x.reason === 'fold-question' || x.reason === 'fold-unresolved',
  )) {
    const q = sem.folds?.find((f) => f.seed === b.seed);
    const e = q && q.suggested != null ? q.edges[q.suggested] : null;
    if (e) {
      operatorFold[b.seed] = { a: e.a, b: e.b };
      out.push(
        A(
          'meaning',
          'fold-edge',
          subj(b.seed),
          `unfolded across the ${e.lenMm.toFixed(0)} mm edge`,
          'the fold edge the sheet points at (or that unfolds cleanly) is taken',
          [q!.why, ...q!.evidence.slice(0, 2)],
          0.6,
          false,
          b.seed,
        ),
      );
    } else {
      overrides[b.seed] = { ...(overrides[b.seed] ?? {}), unfoldedFold: false };
      out.push(
        A(
          'meaning',
          'not-a-fold',
          subj(b.seed),
          'not a fold (written as drawn)',
          'a fold no edge can be proven for is written as drawn',
          [q?.why ?? b.detail.slice(0, 140), ...(q?.evidence ?? []).slice(0, 2)],
          0.3,
          true,
          b.seed,
        ),
      );
    }
    touched = true;
  }
  if (touched)
    return {
      actions: [{ kind: 'semantics', patch: { overrides, operatorGrain, operatorFold } }],
      assumptions: out,
    };

  // 3 · the cutting list's fold pieces the sheet does not mark
  if (sem.foldList) {
    const entries = sem.foldList.entries;
    return {
      actions: [
        {
          kind: 'semantics',
          patch: { foldListChecked: [...new Set([...i.foldListChecked, ...entries])] },
        },
      ],
      assumptions: entries.map((e) =>
        A(
          'meaning',
          'cutting-list',
          `cutting list «${e.slice(0, 60)}»`,
          'checked, nothing unfolded for it',
          'a cutting-list fold entry no piece is bound to is checked as listed',
          [`${sem.foldList!.unfolded} pieces unfolded in this run`],
          0.3,
          true,
        ),
      ),
    };
  }

  // 4 · the outline: what the text says, else the cut line
  const open = openQuestions(sem, s.names, i, snap.answersNow);
  if (open.allowance.length) {
    const said = sem.pieces.find((p) => p.allowance.origin === 'text')?.allowance;
    const fileAllowance: AllowanceDecision = said
      ? { ...said, origin: 'operator', evidence: [...said.evidence] }
      : {
          meaning: 'cut',
          allowanceMm: PATIMPORT.defaultAllowanceMm,
          origin: 'operator',
          evidence: ['autopilot: no text says what the drawn outline is'],
        };
    return {
      actions: [{ kind: 'semantics', patch: { fileAllowance } }],
      assumptions: [
        A(
          'meaning',
          'outline',
          'the file',
          fileAllowance.meaning === 'cut'
            ? 'the drawn outline is the cut line'
            : `the drawn outline is the seam line + ${fileAllowance.allowanceMm} mm`,
          said
            ? 'the allowance the sheet states for some pieces holds for the rest'
            : 'no text and no second drawn line: the outline is taken as the cut line',
          said ? said.evidence.slice(0, 3) : open.allowance.slice(0, 2).map((u) => u.detail),
          said ? 0.6 : 0.4,
          !said,
        ),
      ],
    };
  }

  // 5 · counts and names as shown
  if (open.total)
    return {
      actions: [{ kind: 'confirm-shown' }],
      assumptions: [
        ...open.quantity.map((u) =>
          A(
            'meaning',
            'quantity',
            subj(u.seed),
            u.shown,
            u.foldAlt
              ? 'the count as shown (cut on fold was the alternative)'
              : 'the count as shown',
            [u.detail.slice(0, 160)],
            0.5,
            false,
            u.seed,
          ),
        ),
        ...open.name.map((u) =>
          A(
            'meaning',
            'name-confirmed',
            subj(u.seed),
            u.shown,
            'the name read from a sheet note is kept',
            [u.detail.slice(0, 160)],
            0.5,
            false,
            u.seed,
          ),
        ),
        ...open.aiNames.map((n) =>
          A(
            'meaning',
            'name-confirmed',
            subj(n.seed),
            [n.code, ...n.mods].join('_'),
            'the AI name below the auto-accept threshold is kept',
            [`AI confidence ${n.confidence.toFixed(2)}`],
            n.confidence,
            false,
            n.seed,
          ),
        ),
      ],
    };

  // 6 · a name the identity rule refuses (the blocker's own check, on the names table)
  const isSizeToken = sizeTokenTest(card.sizes.map((c) => c.token));
  const edited = new Set(i.editedNames);
  const exported = new Set(sem.pieces.map((p) => p.seed));
  for (const n of s.names) {
    if (!exported.has(n.seed)) continue;
    const origin = nameOriginOf(n, edited.has(n.seed));
    const known = origin === 'ai' || origin === 'ai-auto' ? isKnownCode : undefined;
    const hand =
      i.overrides[n.seed]?.pairHand !== undefined
        ? i.overrides[n.seed]!.pairHand!
        : sem.pieces.find((p) => p.seed === n.seed)?.pairHand ?? null;
    const bad = identitiesOf(n.code, n.mods, hand).find((w) =>
      identityProblem(w.identity, {
        isSizeToken,
        pair: { hand: w.pairHand, of: w.pairOf },
        isKnownCode: known,
      }),
    );
    if (!bad) continue;
    const f = famOf(n.seed);
    const c = f?.candidates[f.candidates.length - 1];
    const code = deterministicCodes(
      c
        ? [{ seed: n.seed, box: c.bbox }]
        : [{ seed: n.seed, box: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }],
      sem.pieces.map((p) => p.identity),
      card.sizes.map((x) => x.token),
    ).get(n.seed)!;
    return {
      actions: [
        {
          kind: 'edit-name',
          seed: n.seed,
          code,
          mods: [],
          displayName: n.displayName || `piece ${code.slice(1)}`,
        },
      ],
      assumptions: [
        A(
          'meaning',
          'name-code',
          subj(n.seed),
          code,
          'the name is refused by the identity rule: a deterministic code in reading order',
          [`${bad.identity || 'empty'}: refused`],
          0.5,
          false,
          n.seed,
        ),
      ],
    };
  }
  return NONE;
}

// ── fabrics ─────────────────────────────────────────────────────────────────────────────────────

function fabricsStep({ session: s, card, blocker }: Snap): AutopilotDecision {
  const a = s.fabrics;
  if (!a) return NONE;
  if (!card.scopes.length) return stopAt('fabrics', 'the BOM has no fabric lines');
  if (!blocker) return NONE;
  const main =
    card.scopes.find((x) => /MAIN$/.test(x.fabricPurpose))?.fabricPurpose ??
    card.scopes[0].fabricPurpose;
  const seeds = [...(s.pieces?.seeds ?? [])];
  // C7: a cloth on the AI's word alone → main (lining only by the sheet's layer or name)
  const ai = (a.aiOnly ?? []).filter((x) => x.needsConfirm);
  if (ai.length) {
    const move = new Set(ai.map((x) => x.seed));
    const byPurpose: FabricAssignment['byPurpose'] = {};
    for (const [k, v] of Object.entries(a.byPurpose))
      byPurpose[k] = k === main ? [...v] : v.filter((sd) => !move.has(sd));
    byPurpose[main] = [...new Set([...(byPurpose[main] ?? []), ...move])];
    return {
      actions: [
        {
          kind: 'fabrics',
          assignment: {
            ...a,
            byPurpose,
            aiOnly: (a.aiOnly ?? []).map((x) =>
              move.has(x.seed) ? { ...x, purposes: [main], needsConfirm: false } : x,
            ),
          },
        },
      ],
      assumptions: ai.map((x) =>
        A(
          'fabrics',
          'fabric',
          subjectOf(seeds, x.seed),
          'main fabric',
          "a cloth other than main on the AI's word alone is cut from main (lining only by the sheet)",
          [
            `AI: ${x.purposes.map((p) => p.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()).join(', ')}`,
          ],
          0.5,
          false,
          x.seed,
        ),
      ),
    };
  }
  const problem = planScopes(s.semantics?.pieces ?? [], a, card.scopes).problems[0];
  if (problem) {
    const all = [...new Set((s.semantics?.pieces ?? []).map((p) => p.seed))];
    return {
      actions: [{ kind: 'fabrics', assignment: { ...a, byPurpose: { [main]: all } } }],
      assumptions: [
        A(
          'fabrics',
          'fabric',
          'every piece',
          'main fabric',
          'the proposed fabrics do not fit the BOM: every piece is cut from main',
          [problem.message.slice(0, 160)],
          0.4,
          false,
        ),
      ],
    };
  }
  return NONE;
}
