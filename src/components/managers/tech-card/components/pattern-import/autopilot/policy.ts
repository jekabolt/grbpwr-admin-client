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
  HoleCell,
  AllowanceDecision,
  AutopilotValue,
  BackgroundKind,
  ClassEvidence,
  FabricAssignment,
  ImportSession,
  NameDecision,
  PageMaskEdit,
  PieceEdit,
  PieceFamily,
  PtMm,
  Seed,
  SeedId,
  SheetAnswer,
  SizeMapEntry,
  WizardEvent,
  WizardStep,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import {
  sheetAnswerEdits,
  sheetLegendQuestion,
  sheetQuestion,
} from 'lib/pattern-import/pieces/sheets';
import { identitiesOf, identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import { isKnownCode } from 'lib/pattern-import/dictionary/codes';
import {
  crossKindQuestion,
  drawnUnmapped,
  notDrawnLine,
  cardSizeKindOf,
  ordinalTargets,
  partialSizeMapQuestion,
  sizeKindOf,
} from 'lib/pattern-import/sizes/map';
import { AI_PAGES, PATTERN_ROLES, aiWords } from 'lib/pattern-import/clean/page-roles';
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
import {
  PAGE_SURE,
  dartOf,
  defaultedFabrics,
  openAsides,
  sizeFlags,
  weakAsides,
} from '../auto-advance';
import { heldCells, holeAutoEvidence } from 'lib/pattern-import/assemble/holes';
import { fallbackGrain } from './grain';
import { fitGrainInside } from 'lib/pattern-import/semantics/grain-inside';
import { deterministicCodes } from './names';
import { bulkNames, codeBlocked } from '../bulk-names';
import { seedPoints } from './seeds';
import { modelFromCard, weakReason } from './card-match';
import { mergeAssumptions, type Assumption, type AssumptionKind } from './types';
import { aiAsideAssumptions } from './ai-pages';
import { layerWordConflict, outlineByLayerWord } from './outline-word';

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
  /** The tile sheet to import (sheet step). */
  | { kind: 'sheet'; sheet: number }
  /**
   * UXHOOKS: missing cells of one tile sheet accepted as blank pages — `cells` the whole accepted
   * set of that sheet (D5: only on two evidences that the cell holds no pattern).
   */
  | { kind: 'accept-missing'; sheet: number; cells: HoleCell[] }
  /** D6: a cross-sheet answer with the "not a piece" edits it stands for. */
  | { kind: 'sheet-answer'; key: string; answer: SheetAnswer; edits: PieceEdit[] }
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
  /** "name N pieces" (bulk-names.ts): several names typed in one answer (`editNames()`). */
  | {
      kind: 'edit-names';
      edits: { seed: SeedId; code: string; mods: string[]; displayName: string }[];
    }
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
/** Pattern-CAD tools, as an SVG's own metadata names them (root title/desc, generator). */
const CAD_PRODUCER =
  /\b(seamly2d|valentina|clo3d|clo|marvelous|gerber|accumark|lectra|modaris|optitex|gemini|audaces|tukatech|polypattern|grafis|assyst|richpeace)\b/i;

/**
 * The outline prior from what made the file (Codex final #4, r5): an AAMA / ASTM / CLO-structured
 * DXF (piece blocks with a boundary on layer 1 = the cut line; a free-drawn DXF is not), HP-GL / PLT
 * (industry plotter output — a residual accepted under D4), or an SVG whose own metadata names a
 * pattern CAD (Seamly2D …)
 * reads as a CAD export; a PDF's producer string or a plain Inkscape drawing never does. Every file
 * such and no print layout (tile sheets, an overview page) → the evidence for "cut line"; else null
 * (a question). A drawn inner seam line or the sheet's text decide before this, everywhere.
 */
export function cadExport(s: ImportSession): string[] | null {
  if (!s.files.length) return null;
  const tiles = s.pages.filter((p) => p.cls === 'tile').length;
  if (tiles > 1 || s.pages.some((p) => p.cls === 'overview')) return null;
  const why: string[] = [];
  for (const f of s.files) {
    const by = f.producer ?? '';
    if (f.kind === 'hpgl')
      why.push(
        `${f.name}: HP-GL plot file — plotter files come from industry CAD, which plots the cut line (a residual accepted under D4)`,
      );
    else if (f.kind === 'dxf' && f.dxf && f.dxf.dialect !== 'generic' && f.dxf.cutBlocks > 0)
      why.push(
        `${f.name}: ${f.dxf.dialect} DXF, ${f.dxf.cutBlocks} piece ${f.dxf.cutBlocks === 1 ? 'block' : 'blocks'} with a boundary on layer 1 (the standard's cut line; 14 = sew line)`,
      );
    else if (f.kind === 'svg' && CAD_PRODUCER.test(by))
      why.push(`${f.name}: an SVG exported by ${by}`);
    else return null;
  }
  return why;
}

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
  ref?: string,
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
    ...(ref != null ? { ref } : {}),
  };
}

// ── subjects people can find (Codex re-check #6): the piece's code / name + seed, the file and
//    page, the size's label; the machine handle rides in `seed` / `ref` ─────────────────────────

const mm = (p: PtMm) => `(${Math.round(p.x)}, ${Math.round(p.y)}) mm`;
const fileName = (s: ImportSession, id: ImportSession['files'][number]['id']) =>
  s.files.find((f) => f.id === id)?.name ?? `file ${id}`;
const pageSubject = (s: ImportSession, file: ImportSession['files'][number]['id'], page: number) =>
  `${fileName(s, file)} · page ${page + 1}`;
const sizeSubject = (e: { source: { label: string; rank: number } }) =>
  e.source.label ? `size ${e.source.label}` : `drawn size ${e.source.rank + 1} (no label)`;
const sizeRef = (e: { source: { rank: number } }) => `rank:${e.source.rank}`;
const legendSubject = (c: { role: string; sizeLabel?: string | null; totalLengthMm: number }) =>
  `legend row ${c.role}${c.sizeLabel ? ` ${c.sizeLabel}` : ''} (${Math.round(c.totalLengthMm / 10)} cm of line)`;

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
  const d1 = decideSnap(snap);
  // A9: the pages the AI + geometry set aside by themselves are strong assumptions of the run
  // (no question asked them): recorded with the first answer the autopilot gives
  const standing = aiAsideAssumptions(x.session, x.inputs.autopilot ?? []);
  const d0 = standing.length ? { ...d1, assumptions: [...standing, ...d1.assumptions] } : d1;
  // every answer carries its replayable value (kind + subject + value), not only its words
  const d = {
    ...d0,
    assumptions: d0.assumptions.map((a) =>
      a.value !== undefined ? a : { ...a, value: valueOf(a, d0.actions[0], snap) },
    ),
  };
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
    /** Per question: the hook's extras, and the card snapshot the run reads (else `card`). */
    extra?: () => Pick<AutopilotSnapshot, 'baseSeeds' | 'presegmented'> & { card?: CardContext };
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
    case 'sheet':
      return { events: [{ type: 'sheet', sheet: a.sheet, override: i.gridOverride }] };
    case 'accept-missing':
      // each cell carries who accepted it (the autopilot's new ones, the operator's kept)
      return { events: [{ type: 'sheet-accept-missing', sheet: a.sheet, cells: a.cells }] };
    case 'sheet-answer':
      return {
        events: [
          ...(s.step !== 'pieces' ? [{ type: 'back', to: 'pieces' } as WizardEvent] : []),
          { type: 'sheet-answer', key: a.key, answer: a.answer, edits: a.edits },
        ],
      };
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
    case 'edit-names': {
      // `editNames()` of the hook ("name N pieces"): every name typed at once, same as edit-name
      const edits = new Map(
        a.edits.map((e) => [e.seed, { code: e.code, mods: e.mods, displayName: e.displayName }]),
      );
      const staleFabric = !!i.assignment?.aiOnly?.some((x) => edits.has(x.seed));
      const known = new Set(s.names.map((n) => n.seed));
      const decisions: NameDecision[] = [
        ...s.names.map((n) => (edits.has(n.seed) ? { ...n, ...edits.get(n.seed)! } : n)),
        ...[...edits]
          .filter(([sd]) => !known.has(sd))
          .map(([sd, p]) => ({ ...textNameOf(sd, s.semantics, i.overrides[sd]), ...p })),
      ];
      return {
        patch: {
          editedNames: [...new Set([...i.editedNames, ...edits.keys()])],
          confirmedNames: [...new Set([...i.confirmedNames, ...edits.keys()])],
          ...(staleFabric ? { assignment: null } : {}),
        },
        events: [{ type: 'names', decisions }],
      };
    }
    case 'fabrics':
      return { events: [{ type: 'fabrics', assignment: a.assignment }] };
  }
}

/**
 * The value an answer set, read back off the action that set it (and the snapshot): what a replay
 * puts into the same wizard input. null = nothing to replay (a stop's record).
 */
function valueOf(a: Assumption, act: AutopilotAction | undefined, snap: Snap): AutopilotValue {
  const pt = (p: PtMm) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  const sd = a.seed;
  const c = snap.session.scale.candidates[snap.inputs.scaleIndex];
  switch (a.kind) {
    case 'scale-confirmed':
    case 'scale-1to1':
    case 'scale-anisotropic':
      return c ? { scaleIndex: snap.inputs.scaleIndex, factor: c.factor, method: c.method } : null;
    case 'clean-accept':
      return { kind: a.ref ?? a.subject.split(' ')[0], keep: false };
    case 'pages-as-read': {
      const m = a.ref?.match(/^(\d+):(\d+)$/);
      return m ? { file: +m[1], page: +m[2], as: a.answer } : null;
    }
    case 'sheet-choice':
      return act?.kind === 'sheet' ? { sheet: act.sheet } : null;
    case 'residuals':
      return { residualsAccepted: true };
    case 'missing-accepted': {
      const m = a.ref?.match(/^(\d+):(\d+):(\d+)$/);
      return m ? { sheet: +m[1], row: +m[2], col: +m[3] } : null;
    }
    case 'drawn-sizes':
      return act?.kind === 'drawn-sizes' ? { n: act.n } : null;
    case 'legend-row':
      return { legendConfirmed: a.ref ?? null };
    case 'legend-outline':
      return act?.kind === 'legend'
        ? (JSON.parse(JSON.stringify(act.edits[act.edits.length - 1])) as AutopilotValue)
        : null;
    case 'size-ordinal':
    case 'size-guess':
    case 'size-dropped': {
      if (act?.kind !== 'size-map') return null;
      const e = act.entries.find((x) => sizeRef(x) === a.ref);
      return e
        ? {
            rank: e.source.rank,
            label: e.source.label,
            card: e.card ? { sizeId: e.card.sizeId, token: e.card.token } : null,
          }
        : null;
    }
    case 'size-flag':
      return { goOn: true };
    case 'model':
      return act?.kind === 'variant' ? { variant: act.variant } : null;
    case 'seed-click': {
      const k = act?.kind === 'seeds' ? act.seeds.find((x) => x.id === sd) : undefined;
      return k ? { seed: k.id, at: pt(k.at) } : null;
    }
    case 'set-aside':
      return { aside: +(a.ref?.match(/^aside:(\d+)/)?.[1] ?? -1), keepAside: true };
    case 'name-code': {
      const e = act?.kind === 'edit-names' ? act.edits.find((x) => x.seed === sd) : undefined;
      return e
        ? { seed: e.seed, code: e.code, mods: [...e.mods] }
        : { seed: sd ?? null, code: a.answer };
    }
    case 'grain-proposal':
    case 'grain-axis': {
      const g = act?.kind === 'semantics' && sd != null ? act.patch.operatorGrain?.[sd] : undefined;
      return g
        ? { seed: sd!, a: pt(g.a), b: pt(g.b), accepted: (g.accepted ?? []) as string[] }
        : null;
    }
    case 'fold-edge': {
      const f = act?.kind === 'semantics' && sd != null ? act.patch.operatorFold?.[sd] : undefined;
      return f ? { seed: sd!, a: pt(f.a), b: pt(f.b), ...(f.half ? { half: true } : {}) } : null;
    }
    case 'outline': {
      const f = act?.kind === 'semantics' ? act.patch.fileAllowance : undefined;
      return f ? { meaning: f.meaning, allowanceMm: f.allowanceMm } : null;
    }
    case 'quantity':
      return { seed: sd ?? null, shown: a.answer };
    case 'name-confirmed':
      return { seed: sd ?? null, name: a.answer };
    case 'fabric':
      return { seed: sd ?? null, fabrics: a.answer };
    case 'sheet-copy':
    case 'sheet-alternative':
      return act?.kind === 'sheet-answer' ? { key: act.key, answer: act.answer } : null;
    default:
      return null;
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
        undefined,
        k,
      ),
    ),
  };
}

/** Words that name a page that is not pattern (instructions, legend, cover, contents). */
const NOT_PATTERN_WORDS =
  /\b(instructions?|anleitung|legend|legende|key|symbols?|zeichenerkl\w*|cover|contents|inhalt|инструкц\w*|условн\w*|обложк\w*|содержан\w*)\b/i;

/**
 * Positive evidence that a page set aside "to check" is not pattern: the classifier's
 * instructions / cover role at 0.7 or more, or a word on the page that names it. (A text-only page
 * is never "to check": clean sets it aside by itself.) Null = none (the page-role question).
 */
/** Line work (m) a picture-led page stays under; a text-led one gets this per 100 text items. */
const INK_LINES_MAX_M = 1;

/**
 * The classifier's roles the page-ink evidence pairs with: text-led instructions, a cover led by
 * pictures or text — never a cover that is only "page 1", never an overview (its role IS the tile
 * lattice the ink reading explains as rules and frames: one geometric fact counted twice — Codex
 * review; an overview passes on its reduced copy above).
 */
function inkRole(c: ImportSession['pages'][number]): boolean {
  if (c.cls === 'instructions') return true;
  return c.cls === 'cover' && !!c.ink && (c.ink.raster >= 0.3 || c.ink.texts >= 10);
}

export function notPatternEvidence(
  d: NonNullable<ImportSession['clean']>['dropped'][number],
  pages: ImportSession['pages'],
): string | null {
  const c = pages.find((p) => p.file === d.file && p.page === d.page);
  // a cover / instructions page: only when text or pictures lead (little line work) and it
  // draws no closed outline of piece size — a line-heavy "cover" may be a pattern page
  if (c && (c.cls === 'instructions' || c.cls === 'cover') && c.confidence >= 0.7) {
    const k = c.ink;
    // led by pictures (≥ 30 % raster, < 1 m of line) or by text (≥ 10 items, at most 1 m of
    // line per 100 text items)
    const led =
      !!k &&
      ((k.raster >= 0.3 && k.strokeM < INK_LINES_MAX_M) ||
        (k.texts >= 10 && k.strokeM <= Math.max(INK_LINES_MAX_M, k.texts / 100)));
    if (led && !d.face)
      return `${c.cls} ${c.confidence.toFixed(2)} + ${k.raster >= 0.3 ? `pictures ${Math.round(k.raster * 100)} %` : `${k.texts} text items`}, ${k.strokeM} m of line, no piece-sized outline`;
  }
  // an overview: the classifier AND a second, independent fact — its outlines are the tiles'
  // whole pieces at a smaller scale (a shape match, not the classifier's lattice; Codex final #5)
  if (c && c.cls === 'overview' && c.confidence >= 0.7 && d.reducedCopy)
    return `overview ${c.confidence.toFixed(2)} + ${d.reducedCopy.matches} of its ${d.reducedCopy.of} outlines are tile pieces at 1:${Math.round(1 / d.reducedCopy.scale)} (shape match)`;
  // STOPS: the classifier's role (text-led instructions, a picture- or text-led cover) AND the
  // page's own line work, every long / piece-sized line of it explained against the file's tile
  // sheet (clean/page-ink.ts) — rules, frames, the test square, tile pieces reduced,
  // small drawings in a pen the tiles do not use. A curve at 1:1 in the pattern's pen is never
  // explained: that page stays the question.
  if (c && d.ink?.explained && c.confidence >= 0.7 && inkRole(c))
    return `${c.cls} ${c.confidence.toFixed(2)} (${c.why}) + every line on it is explained: ${d.ink.explained}`;
  const w = d.face ? null : NOT_PATTERN_WORDS.exec(`${d.why} ${c?.why ?? ''}`);
  if (w) return `the page says «${w[0]}»`;
  return null;
}

function filesStep({ session: s, inputs: i, presegmented, blocker }: Snap): AutopilotDecision {
  if (!s.files.length) return stopAt('files', 'no file was read');
  if (!s.scale.candidates.length) return stopAt('files', 'the files could not be read');
  if (!blocker || presegmented || !s.clean) return NONE;
  const by = waitingKinds(s.clean.pages.flatMap((p) => p.items));
  if (by.size) return acceptWaiting('files', by, i);
  // pages set aside "to check", pages read without certainty: the clean stage's reading is taken
  // as it is (the proceed answer), each page an assumption
  // a page set aside that holds line work stays aside only on positive evidence it is not
  // pattern (Codex re-check #5): else the page-role question
  const check = s.clean.dropped.filter((d) => d.status === 'suggest');
  // A9: the AI reads a page set aside as pattern — never passed over: the question, with "read it
  // as a tile" pre-filled
  const back = check.find(
    (d) => d.ai && PATTERN_ROLES.has(d.ai.role) && d.ai.confidence >= AI_PAGES.patternMin,
  );
  if (back)
    return stopAt(
      'files',
      `${pageSubject(s, back.file, back.page)} was set aside as ${back.cls} but the AI reads it as a pattern page (${aiWords(back.ai!)}) — read it as a tile? (pre-filled: read as tile)`,
    );
  const blind = check.find((d) => !notPatternEvidence(d, s.pages));
  if (blind) {
    const c = s.pages.find((p) => p.file === blind.file && p.page === blind.page);
    const ink = c?.ink
      ? `; ${c.ink.strokeM} m of line, ${c.ink.texts} text items${c.ink.raster ? `, pictures ${Math.round(c.ink.raster * 100)} %` : ''}`
      : '';
    // A9: the AI alone (below 0.85, or no geometry agrees) — the stop carries its answer pre-filled
    const ai =
      blind.ai && blind.ai.role !== 'other'
        ? ` The AI reads it as ${aiWords(blind.ai)}${blind.geo?.length ? ` (geometry suggests the same: ${blind.geo[0]})` : ''}, but nothing in its geometry excludes a piece — pre-filled: keep it aside (one click).`
        : '';
    return stopAt(
      'files',
      `${pageSubject(s, blind.file, blind.page)} was set aside as ${blind.cls} but holds line work${blind.drawing ? ` (${blind.drawing}${blind.face ? ', a piece-sized outline' : ''}${ink})` : ''}${blind.ink?.unexplained ? ` — not a table, frame, test square, reduced tile piece or small drawing: ${blind.ink.unexplained}` : ''} — is it a pattern page?${ai}`,
    );
  }
  const roleSet = new Set(
    i.cleanEdits.flatMap((e) => ('role' in e ? [`${e.file}:${e.page}`] : [])),
  );
  const unsure = s.pages.filter(
    (p) => !roleSet.has(`${p.file}:${p.page}`) && (p.cls === 'unknown' || p.confidence < PAGE_SURE),
  );
  if (!check.length && !unsure.length) return NONE;
  return {
    actions: [{ kind: 'proceed' }],
    assumptions: [
      ...check.map((d) =>
        A(
          'files',
          'pages-as-read',
          pageSubject(s, d.file, d.page),
          `set aside (${d.cls})`,
          'a page the reader set aside stays aside on evidence it is not pattern',
          [
            notPatternEvidence(d, s.pages)!,
            d.why.slice(0, 120),
            ...(d.ai ? [`AI: ${aiWords(d.ai)}`] : []),
          ],
          0.6,
          // an overview set aside holds pattern-like line work: a strong assumption
          d.cls === 'overview',
          undefined,
          `${d.file}:${d.page}`,
        ),
      ),
      ...unsure.map((p) =>
        A(
          'files',
          'pages-as-read',
          pageSubject(s, p.file, p.page),
          `read as ${p.cls}`,
          'a page read without certainty is taken as the reader read it',
          [`${p.cls} ${p.confidence.toFixed(2)}`, p.why.slice(0, 120)],
          p.confidence,
          false,
          undefined,
          `${p.file}:${p.page}`,
        ),
      ),
    ],
  };
}

// ── which sheet, which model: only on evidence (Codex #2, #4) ─────────────────────────────────
// card-match.ts: the card's name / style number / file names against the models and sheets the
// file prints — a UNIQUE token-exact match, else the stop names why.

const fileNamesOf = (s: ImportSession) => s.files.map((f) => f.name);

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
  const info: Assumption[] = [];
  // D6 (one file = one garment): several tile sheets are one drawing — nothing is picked
  const waiting = waitingKinds(s.sheet?.clean?.items ?? []);
  if (waiting.size) {
    const d = acceptWaiting('sheet', waiting, i);
    return { ...d, assumptions: [...info, ...d.assumptions] };
  }
  const refused = s.sheet?.sheet.refused ?? [];
  if (refused.length)
    return stopAt('sheet', `the tile placement is refused — ${refused.join(' · ')}`, info);
  const missing = s.sheet?.sheet.missing ?? [];
  if (missing.length) {
    // UXHOOKS (D5): a missing cell is accepted as a blank page only on two evidences that it
    // holds no pattern (assemble/holes `holeAutoEvidence`); any other stays the operator's
    const sure = missing.flatMap((m) => {
      const ev = holeAutoEvidence(m);
      return ev ? [{ m, ev }] : [];
    });
    if (!sure.length)
      return stopAt(
        'sheet',
        `${missing.length} pages are missing — the grid cannot be closed without them ` +
          `(lines run into them: accept them as blank pages or set the grid)`,
        info,
      );
    const sheets = [...new Set(sure.map((x) => x.m.sheet ?? 0))];
    return {
      actions: sheets.map((k) => ({
        kind: 'accept-missing' as const,
        sheet: k,
        // the event names the WHOLE accepted set of the sheet: what is accepted NOW stays (each
        // cell keeps who accepted it); a stored answer the worker dropped as stale is never re-sent
        cells: [
          ...heldCells(s.sheet?.sheet, k),
          ...sure
            .filter((x) => (x.m.sheet ?? 0) === k)
            .map((x) => ({
              row: x.m.row,
              col: x.m.col,
              ...(x.m.file != null ? { file: x.m.file } : {}),
              origin: 'autopilot' as const,
            })),
        ],
      })),
      assumptions: [
        ...info,
        ...sure.map(({ m, ev }) =>
          A(
            'sheet',
            'missing-accepted',
            `tile row ${m.row + 1} col ${m.col + 1}${(s.sheet?.sheet.parts?.length ?? 0) > 1 ? ` of sheet ${(m.sheet ?? 0) + 1}` : ''}`,
            'a blank page',
            'a missing tile is taken as a blank page only on two evidences that it holds no pattern',
            ev,
            0.7,
            false,
            undefined,
            `${m.sheet ?? 0}:${m.row}:${m.col}`,
          ),
        ),
      ],
    };
  }
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
        legendSubject(k),
        `${k.role} → size line`,
        'no legend row draws the outlines: the longest row kept is the size line',
        [
          `${k.chains.length} lines, ${Math.round(k.totalLengthMm)} mm`,
          `read as ${k.role} (${k.confidence.toFixed(2)})`,
        ],
        0.4,
        true,
        undefined,
        legendKey(k),
      ),
    ],
  };
}

function sizesStep(snap: Snap): AutopilotDecision {
  const { session: s, inputs: i, card, blocker } = snap;
  if (!card.sizes.length) return stopAt('sizes', 'the card has no size range');
  const sz = s.sizes;
  if (!sz || !blocker) return NONE;
  // D6: the sheets draw different size pens — which pen is which size is not proven: a stop
  const lq = sheetLegendQuestion(sz.sheetLegend, i.sheetLegendOk);
  if (lq && blocker === lq) return stopAt('sizes', lq);
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
  // gb2: the file name says one size while the lines look graded (chains/face-role sourceClash):
  // the count is the operator's — stop with it, pre-filled from the graded look (A6 over the size
  // checks' geometry), never from the file name; the clash row is never confirmed by the autopilot
  const clash = (c: { evidence: readonly ClassEvidence[] }) =>
    c.evidence.some((e) => e.kind === 'face-graded' && !!e.sourceOne);
  const clashRow = (s.chains?.classes ?? []).find(
    (c) => clash(c) && c.confidence < 0.9 && !i.legendConfirmed.includes(legendKey(c)),
  );
  if (clashRow && sz.expected?.from !== 'operator') {
    const n = sz.countAsk?.auto?.n;
    const look = n != null && n > 1 ? n : null;
    const why = clashRow.evidence.find((e) => e.kind === 'face-graded');
    return stopAt(
      'sizes',
      `these lines look like other sizes, but the file name says one size — how many sizes does the sheet draw?${look ? ` (the lines suggest ${look})` : ''}`,
      [
        A(
          'sizes',
          'drawn-sizes',
          'the sheet',
          look ? `${look} sizes drawn?` : 'several sizes drawn?',
          'a file name naming one size against lines that look graded: asked, never taken',
          [why && why.kind === 'face-graded' ? why.why : 'face-graded'],
          0.3,
          true,
        ),
      ],
    );
  }
  // legend rows below 0.6 (a clash row never: answered by the count, or by the operator)
  const pending = (s.chains?.classes ?? []).filter(
    (c) => c.confidence < 0.6 && !i.legendConfirmed.includes(legendKey(c)) && !clash(c),
  );
  if (pending.length) {
    const confirm = [...i.legendConfirmed, ...pending.map(legendKey)];
    const rows = pending.map((c) =>
      A(
        'sizes',
        'legend-row',
        legendSubject(c),
        `${c.role}${c.sizeLabel ? ` ${c.sizeLabel}` : ''}`,
        'a legend row below 0.6 is confirmed as read',
        [
          `${c.chains.length} lines, ${Math.round(c.totalLengthMm)} mm`,
          ...c.evidence.slice(0, 3).map((e) => e.kind),
        ],
        c.confidence,
        false,
        undefined,
        legendKey(c),
      ),
    );
    // the same answer: no row draws the outlines → the longest row kept is the size line
    const outline = outlineLegend(s, i);
    const edit = outline?.actions[0];
    if (outline && edit?.kind === 'legend')
      return {
        actions: [{ ...edit, confirm }],
        assumptions: [
          ...rows.filter((r) => !outline.assumptions.some((o) => o.ref === r.ref)),
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
  // nothing reaches the card: by order, from the middle of the card's run — only within one size
  // kind (owner rule Ф6): a paired run on a card without pairs, numbers on letters, letters on
  // numbers is a stop with the question, never an order-based map
  if (!entries.some((e) => e.card)) {
    const kindQ = crossKindQuestion(sz.map, cards);
    if (kindQ) return stopAt('sizes', kindQ);
    const src = [...entries].sort((a, b) => a.source.rank - b.source.rank);
    const same = ordinalTargets(
      src.map((e) => e.source),
      cards,
    );
    const k = src.length;
    const m = same.length;
    const map = new Map<number, (typeof cards)[number]>();
    if (k <= m) src.forEach((e, j) => map.set(e.source.rank, same[Math.floor((m - k) / 2) + j]));
    else for (let j = 0; j < m; j++) map.set(src[Math.floor((k - m) / 2) + j].source.rank, same[j]);
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
          sizeSubject(e),
          e.card ? `→ ${e.card.token}` : 'not exported',
          'no source size spells a card size: mapped by order from the middle of the card run',
          [`${k} source sizes, card run ${same.map((c) => c.token).join(' ')}`],
          0.25,
          true,
          undefined,
          sizeRef(e),
        ),
      ),
    };
  }
  // two source sizes on one card size: the operator's call — a source size is never dropped to
  // clear the question (Codex re-check #4)
  const ids = entries.flatMap((e) => (e.card ? [e.card.sizeId] : []));
  if (new Set(ids).size !== ids.length) {
    const twice = entries.filter(
      (e) => e.card && entries.some((o) => o !== e && o.card?.sizeId === e.card!.sizeId),
    );
    return stopAt(
      'sizes',
      `two source sizes point at one card size — ${twice
        .slice(0, 4)
        .map((e) => `${e.source.label || `rank ${e.source.rank}`} → ${e.card!.token}`)
        .join(', ')}: map each to its own card size or leave one out`,
    );
  }
  // the guesses (< 0.9) are confirmed as matched
  const guesses = guessedSizes(entries);
  // Ф6: a guess across size kinds (the one-size middle suggestion «38 → M», a US number written on
  // a letter size) is the operator's to confirm — never confirmed by the autopilot
  const across = guesses.filter((g) => {
    const a = sizeKindOf(g.source.label);
    const b = g.card ? cardSizeKindOf(g.card) : null;
    return a != null && b != null && a !== b;
  });
  if (across.length)
    return stopAt(
      'sizes',
      `${across
        .slice(0, 4)
        .map((g) => `${g.source.label} → ${g.card!.token}`)
        .join(
          ', ',
        )} ${across.length === 1 ? 'is a suggestion' : 'are suggestions'} across size kinds — the sheet does not say which card size ${across.length === 1 ? 'it is' : 'they are'}; map each size`,
    );
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
          sizeSubject(g),
          `→ ${g.card!.token}`,
          ordinal
            ? 'the run aligned by rank only (same length): confirmed by order'
            : 'the automatic match below 0.9 is confirmed',
          g.evidence ?? [],
          g.confidence ?? 0,
          ordinal,
          undefined,
          sizeRef(g),
        );
      }),
    };
  }
  // a partial map — drawn sizes the automatic map left off the card (archive run 13.10: Mimosa wrote
  // 1 size of 8). With card sizes still free they may be theirs: a stop, never an export of fewer
  // sizes than drawn unsaid (D3/D5). Past a full card run they are left out, each a strong
  // assumption naming it.
  const partial = partialSizeMapQuestion(sz.map);
  if (partial) return stopAt('sizes', partial);
  const loose = drawnUnmapped(sz.map);
  if (loose.length) {
    const own = (i.sizeMap ?? []).filter(
      (e) => !loose.some((l) => l.source.rank === e.source.rank),
    );
    return {
      actions: [
        {
          kind: 'size-map',
          entries: [...own, ...loose.map((e): SizeMapEntry => ({ ...e, origin: 'operator' }))],
        },
      ],
      assumptions: loose.map((e) =>
        A(
          'sizes',
          'size-dropped',
          sizeSubject(e),
          'not written (no card size for it)',
          "a drawn size past the card's run (every card size has its source) is left out, never put on a neighbour",
          [...(e.evidence ?? []), `card run ${cards.map((c) => c.token).join(' ')}`],
          1,
          true,
          undefined,
          sizeRef(e),
        ),
      ),
    };
  }
  // a size the sheet lists but draws no line of its own for is left out of the export (never filled
  // from a neighbour): a strong assumption naming it — and a stop when the card has that size,
  // which would then get no pattern from this sheet
  const undrawn = entries.filter((e) => e.notDrawn);
  const dropped = undrawn.map((e) => {
    const would = e.notDrawn?.wouldMap ?? null;
    return A(
      'sizes',
      'size-dropped',
      sizeSubject(e),
      'not written (not drawn on this sheet)',
      'a size the sheet lists but draws no line of its own for is left out, never copied from a neighbour',
      [
        notDrawnLine(e.source.label),
        would
          ? `the card's ${would.token} gets no pattern from this sheet`
          : 'no card size takes it',
      ],
      1,
      true,
      undefined,
      sizeRef(e),
    );
  });
  const needed = undrawn.flatMap((e) => {
    const w = e.notDrawn?.wouldMap;
    return w && card.sizes.some((c) => c.sizeId === w.sizeId) ? [w.token] : [];
  });
  if (needed.length)
    return stopAt(
      'sizes',
      `${undrawn.map((e) => notDrawnLine(e.source.label)).join('; ')} — the card's ${needed.join(', ')} would get no pattern`,
      dropped,
    );
  // the offer: flags the reader could not settle — gone on with, each a strong assumption
  const flags = sizeFlags(s.chains?.ambiguities, sz.expected?.n);
  if (!flags.length && !dropped.length) return NONE;
  return {
    actions: [{ kind: 'proceed' }],
    assumptions: [
      ...dropped,
      ...flags.map((f, k) =>
        A(
          'sizes',
          'size-flag',
          `flag ${k + 1} · ${f.kind}`,
          'gone on as read',
          'a reader flag on the sizes step is left as the reader settled it',
          [JSON.stringify(f).slice(0, 160)],
          0.4,
          true,
        ),
      ),
    ],
  };
}

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────

const labelOf = (seeds: readonly Seed[], seed: SeedId) => {
  const sd = seeds.find((x) => x.id === seed);
  return sd?.text?.text?.slice(0, 32) ?? null;
};
/** "P01 front (seed 3)" · "«2 BACK» (seed 3)" · "piece at (120, 40) mm (seed 3)". */
const subjectOf = (
  seeds: readonly Seed[],
  seed: SeedId,
  names: readonly { seed: SeedId; code: string; displayName: string }[] = [],
) => {
  const n = names.find((x) => x.seed === seed && (x.code || x.displayName));
  const named = n ? [n.code, n.displayName].filter(Boolean).join(' ') : null;
  const l = labelOf(seeds, seed);
  const at = seeds.find((x) => x.id === seed)?.at;
  const who = named ?? (l ? `«${l}»` : at ? `piece at ${mm(at)}` : 'piece');
  return `${who} (seed ${seed})`;
};

function piecesStep(snap: Snap): AutopilotDecision {
  const { session: s, inputs: i, baseSeeds, presegmented, blocker } = snap;
  const fams = s.pieces?.families ?? [];
  const seeds = s.pieces?.seeds ?? [];
  const variants = variantsOf(seeds, baseSeeds, s.pieces?.variants);
  if (variants.length > 1 && !s.variant) {
    // Codex #4: the model the card names — never "the one with the most pieces"
    const pick = modelFromCard(variants, snap.card, fileNamesOf(s));
    if (pick.pick == null)
      return stopAt(
        'pieces',
        `the sheet carries ${variants.length} models (${variants.join(' | ')}) and ${pick.why ?? 'nothing on the card names one'} — pick the model`,
      );
    if (!pick.strong)
      return stopAt(
        'pieces',
        `the sheet carries ${variants.length} models (${variants.join(' | ')}) and ${weakReason(`"${pick.pick}"`, pick)} — pick the model`,
      );
    return {
      actions: [{ kind: 'variant', variant: pick.pick }],
      assumptions: [
        A(
          'pieces',
          'model',
          'the sheet',
          `model "${pick.pick}"`,
          'the one model the card names (a unique token-exact match)',
          pick.evidence,
          0.6,
          true,
        ),
      ],
    };
  }
  if (!fams.length) {
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
          `outline at ${mm(c.at)} (seed ${c.id})`,
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
  // Codex #3: a region of piece size that does not close (or whose sizes are held back) is never
  // made "not a piece" to silence the question — it is a stop
  if (open.length) {
    const what = open
      .slice(0, 4)
      .map((f) => {
        const c = f.candidates.find((x) => x.outcome !== 'closed');
        return `${labelOf(seeds, f.seed) ?? `seed ${f.seed}`}: ${c?.outcome}${c?.gradeRefusal ? ` (${c.gradeRefusal})` : ''}`;
      })
      .join('; ');
    return stopAt(
      'pieces',
      `${open.length} ${open.length === 1 ? 'region does' : 'regions do'} not close or ${open.length === 1 ? 'has' : 'have'} sizes held back — ${what}`,
    );
  }
  // D6: a piece (or a whole tile sheet) drawn twice is kept once only on two evidences (the same
  // outline AND the same label) — one evidence, or a piece split between sheets, is a stop
  const sq = sheetQuestion(s.pieces?.sheets, i.sheetAnswers);
  if (sq) {
    if (sq.kind === 'split' || !sq.strong) return stopAt('pieces', sq.text);
    const read = s.pieces!.sheets!;
    const answer = sq.kind === 'alternative' ? 'keep' : 'copy';
    const edits = sheetAnswerEdits(read, sq.key, answer);
    const alt = read.alternatives.find((x) => x.key === sq.key);
    const cp = read.copies.find((x) => x.key === sq.key);
    return {
      actions: [{ kind: 'sheet-answer', key: sq.key, answer, edits }],
      assumptions: [
        A(
          'pieces',
          alt ? 'sheet-alternative' : 'sheet-copy',
          alt
            ? `tile sheets ${alt.keep + 1} and ${alt.drop + 1}`
            : `the piece on sheets ${cp!.keep.sheet + 1} and ${cp!.copy.sheet + 1} («${cp!.keep.label}»)`,
          alt
            ? `sheet ${alt.drop + 1} is sheet ${alt.keep + 1} drawn again — its ${alt.ofDrop} pieces are not exported`
            : `one piece drawn twice — the copy on sheet ${cp!.copy.sheet + 1} is not exported`,
          'one file is one garment: a piece drawn on two sheets is kept once, on the same outline AND label',
          (alt ?? cp)!.evidence,
          0.8,
          true,
          undefined,
          sq.key,
        ),
      ],
    };
  }
  // the offer: piece-sized outlines set aside on a guess — kept aside only on positive evidence
  // UXHOOKS: a set the operator reviewed (inputs.asideReviewed, never set here) is answered
  const weak = openAsides(
    weakAsides(s.pieces?.setAside, fams, s.pieces?.seeds),
    s.sheet?.sheet.parts,
    i.asideReviewed,
  );
  if (!weak.length) return NONE;
  const host = (box: { minX: number; minY: number; maxX: number; maxY: number }) =>
    Math.max(
      0,
      ...fams.flatMap((f) =>
        f.candidates
          .filter(
            (c) =>
              c.outcome === 'closed' &&
              c.bbox.minX <= box.maxX + 1 &&
              c.bbox.maxX >= box.minX - 1 &&
              c.bbox.minY <= box.maxY + 1 &&
              c.bbox.maxY >= box.minY - 1,
          )
          .map((c) => c.areaMm2),
      ),
    );
  const why = weak.map((a) => {
    // KOMBI-AP: the pieces stage exposes only verdicts backed by two independent facts. They are
    // data for the UI as well as the policy; an absent id stays in the one operator question.
    const decided = s.pieces?.asideEvidence?.find((x) => x.id === a.id);
    if (decided)
      return {
        a,
        ev: decided.evidence,
        kind: decided.kind,
      };
    // P2: a closed loop on the internal layer inside a cut piece (layers proved their meaning)
    if (a.layerLoop) return { a, ev: a.layerLoop };
    // DARTS: a dart word and a wedge whose mouth is on its seeded piece's outline (dartOf)
    const dart = dartOf(a, fams, s.pieces?.seeds);
    if (dart) return { a, ev: dart };
    if (a.reason === 'other-pen')
      return { a, ev: 'drawn inside a seeded piece in another pen or short strokes (a mark)' };
    const h = host(a.box);
    if (a.reason === 'joined' && h > 0 && a.areaMm2 <= STRIP_SHARE * h)
      return {
        a,
        ev: `a strip along a piece: ${Math.round(a.areaMm2 / 100)} cm² against ${Math.round(h / 100)} cm²`,
      };
    return { a, ev: null };
  });
  const unproven = why.filter((w) => !w.ev);
  if (unproven.length)
    return stopAt(
      'pieces',
      `${unproven.length} piece-sized ${unproven.length === 1 ? 'outline' : 'outlines'} set aside on a guess (${[...new Set(unproven.map((w) => (w.a.reason === 'size-copy' ? 'not proven a size copy of a seeded piece' : w.a.reason)))].join(', ')}) — is it a piece?`,
    );
  return {
    actions: [{ kind: 'proceed' }],
    assumptions: why.map((w) => {
      const { a, ev } = w;
      const kind = 'kind' in w ? w.kind : undefined;
      return A(
        'pieces',
        'set-aside',
        `outline ${a.id} at ${mm(a.at)} (${Math.round(a.areaMm2 / 100)} cm²${a.seed?.text ? ` · «${a.seed.text.text.slice(0, 24)}»` : ''})`,
        'not a piece',
        `a piece-sized outline is kept aside only on positive evidence that it is not a piece${kind ? ` (${kind})` : ''}`,
        [a.reason, ...(Array.isArray(ev) ? ev : [ev!])],
        0.5,
        true,
        undefined,
        `aside:${a.id}`,
      );
    }),
  };
}

/** A strip joined to a piece is part of it when it is at most this share of the piece. */
const STRIP_SHARE = 0.05;

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
  // the piece as it is named now (the export's code), else as the namer read it
  const subj = (sd: SeedId) => subjectOf(seeds, sd, [...sem.pieces, ...s.names]);

  // 1 · a piece that cannot be built (offset, leak, merged, sizes not told apart …) is a stop:
  //     a geometry failure is never answered by dropping the piece (Codex #3)
  const fail = sem.blocked.filter((b) => !ANSWERED.has(b.reason) && b.reason !== 'notch-variant');
  if (fail.length)
    return stopAt(
      'meaning',
      `${fail.length} ${fail.length === 1 ? 'piece cannot' : 'pieces cannot'} be built: ${fail
        .slice(0, 3)
        .map((b) => `${subj(b.seed)} ${b.reason}`)
        .join('; ')}`,
    );
  // BACK-VARIANT: which of a piece's variant notches the chosen model keeps — the operator's
  // answer, never the autopilot's (the sheet's word is one evidence at most, D3)
  const nv = sem.blocked.filter((b) => b.reason === 'notch-variant');
  if (nv.length) {
    const byQ = new Map<string, string[]>();
    for (const b of nv) byQ.set(b.detail, [...(byQ.get(b.detail) ?? []), subj(b.seed)]);
    return stopAt(
      'meaning',
      [...byQ].map(([q, ps]) => `${[...new Set(ps)].join(', ')}: ${q}`).join('; '),
    );
  }
  void presegmented;

  // 2 · names, grainlines, folds: one semantics answer for every blocked piece
  const overrides = { ...i.overrides };
  const operatorGrain = { ...i.operatorGrain };
  const operatorFold = { ...i.operatorFold };
  const out: Assumption[] = [];
  let touched = false;
  // CODE lane: the wizard's own "name N pieces" (bulk-names.ts) — the same codes, the same taken
  // set, and a DRAWN pair (FP_L beside FP_R) gets ONE code with its hands: renamed apart, each hand
  // would be re-read as a pair of its own (a doubled cut). One answer for all, as the button gives.
  const unnamed = codeBlocked(sem.blocked);
  if (unnamed.length) {
    const asked = new Set(unnamed.map((b) => b.seed));
    const bulk = bulkNames(
      sem.blocked,
      (sd) => {
        const f = famOf(sd);
        return f?.candidates[f.candidates.length - 1]?.bbox ?? null;
      },
      [
        ...sem.pieces.map((p) => p.identity),
        ...s.names.filter((n) => n.code && !asked.has(n.seed)).map((n) => n.code),
      ],
      card.sizes.map((c) => c.token),
      (sd) => seeds.find((x) => x.id === sd)?.text?.text ?? null,
    );
    if (bulk.size) {
      const why = new Map(unnamed.map((b) => [b.seed, b] as const));
      return {
        actions: [
          {
            kind: 'edit-names',
            edits: [...bulk].map(([seed, n]) => ({ seed, ...n })),
          },
        ],
        assumptions: [...bulk].map(([seed, n]) => {
          const b = why.get(seed);
          const pair = n.mods.length > 0;
          return A(
            'meaning',
            'name-code',
            subj(seed),
            [n.code, ...n.mods].join('_'),
            (pair
              ? 'a drawn pair: both hands one deterministic code in reading order, each keeps its hand — '
              : '') +
              (b?.reason === 'duplicate-identity'
                ? 'a name another piece already has: a deterministic code in reading order'
                : b?.reason === 'grammar'
                  ? 'nothing names the piece usably (no AI, no DXF block, no title on the sheet, or a name the identity rule refuses): a deterministic code in reading order'
                  : 'the other hand of a drawn pair renamed with its twin: one code, both hands'),
            [(b?.detail ?? '').slice(0, 140), `display name «${n.displayName}»`].filter(Boolean),
            0.5,
            false,
            seed,
          );
        }),
      };
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
    const g0 = ring ? fallbackGrain(ring) : null;
    if (!g0) return stopAt('meaning', `${subj(b.seed)}: no outline to lay a grainline on`);
    // GRAIN lane: measured on the largest outline, applied as drawn to every size — so fitted
    // onto every exported size's outline (G5 refuses a grain off its piece), else asked
    const rings = (famOf(b.seed)?.candidates ?? [])
      .filter(
        (c) => c.outcome === 'closed' && c.outer.length > 2 && (!mapped || mapped.has(c.rank)),
      )
      .map((c) => c.outer);
    const fit = fitGrainInside(g0.a, g0.b, rings.length ? rings : [ring!]);
    if (!fit)
      return stopAt(
        'meaning',
        `${subj(b.seed)}: no grainline along ${g0.from === 'edge' ? 'its straight edge' : 'its axis'} fits inside the piece in every size — draw it`,
      );
    const g = { ...g0, a: fit[0], b: fit[1] };
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
  // Codex #4: a fold is unfolded only on two evidences — the edge the sheet points at AND a word
  // or the cutting list; one evidence is a one-click question
  const listed = new Set((sem.foldList?.bound ?? []).map((b) => b.seed));
  const hinted = new Set(s.names.filter((n) => n.suggestion?.onFold).map((n) => n.seed));
  for (const b of sem.blocked.filter(
    (x) => x.reason === 'fold-question' || x.reason === 'fold-unresolved',
  )) {
    // an answered fold that does not hold in every size: never re-answered here (D3) — say where
    if (b.reason === 'fold-unresolved') {
      const m = sem.foldMisses?.find((f) => f.seed === b.seed);
      return stopAt(
        'meaning',
        `${subj(b.seed)}: ${
          !m
            ? `the fold does not hold in every size — ${b.detail}`
            : m.kind === 'no-edge'
              ? `the fold edge you picked is not found in size ${m.size} — pick again or say not a fold`
              : m.picked
                ? `unfolding across the fold edge you picked fails in size ${m.size} (${m.problem}) — pick again or say not a fold`
                : `the fold line drawn in the source does not unfold in size ${m.size} (${m.problem}) — say not a fold or fix the drawing`
        }`,
      );
    }
    const q = sem.folds?.find((f) => f.seed === b.seed);
    // L13 (owner decision 19.10 a): printed «cut on fold», the sheet points at ONE straight edge
    // in every size and unfolding across it fails for an overlap or a slot in every size — the
    // half is exported as drawn with its fold line marked (D3: the claim, the pointer, the
    // failure; the engine sets `auto` only when all hold)
    if (q?.half?.auto) {
      const h = q.half;
      operatorFold[b.seed] = { a: h.edge.a, b: h.edge.b, half: true };
      out.push(
        A(
          'meaning',
          'fold-edge',
          subj(b.seed),
          `half on fold: exported as drawn, the fold line along the ${h.edge.lenMm.toFixed(0)} mm edge`,
          'printed cut on fold, the sheet points at one straight edge in every size, and unfolding across it fails (overlap/slot) — the half is cut on the folded fabric',
          h.evidence,
          0.7,
          false,
          b.seed,
        ),
      );
      touched = true;
      continue;
    }
    const e = q && q.suggested != null ? q.edges[q.suggested] : null;
    const second = [
      ...(q?.evidence.length ? [`the sheet says «${q.evidence[0].slice(0, 40)}»`] : []),
      ...(listed.has(b.seed) ? ['the cutting list'] : []),
      ...(hinted.has(b.seed) ? ['the AI read "on fold"'] : []),
    ];
    // a half offered but not auto: the sheet's pointer and the geometry disagree, or a size does
    // not hold — never unfold across another edge on the text alone (D3, review R1 #3)
    if (q?.half)
      return stopAt(
        'meaning',
        `${subj(b.seed)}: printed cut on fold, but unfolding fails (overlap/slot) — export the half with a fold line?${q.half.missing ? ` (${q.half.missing})` : ''}`,
      );
    if (!e || !second.length)
      return stopAt(
        'meaning',
        `${subj(b.seed)}: is it cut on fold? ${e ? 'only the edge suggests it' : 'no edge is proven'}${q?.evidence.length ? ` (the sheet says «${q.evidence[0].slice(0, 30)}»)` : ''}`,
      );
    operatorFold[b.seed] = { a: e.a, b: e.b };
    out.push(
      A(
        'meaning',
        'fold-edge',
        subj(b.seed),
        `unfolded across the ${e.lenMm.toFixed(0)} mm edge`,
        'a fold with two evidences: the edge the sheet points at, and a word or the cutting list',
        [q!.why, ...second],
        0.7,
        false,
        b.seed,
      ),
    );
    touched = true;
  }
  if (touched)
    return {
      actions: [{ kind: 'semantics', patch: { overrides, operatorGrain, operatorFold } }],
      assumptions: out,
    };

  // 3 · the cutting list names fold pieces the sheet does not mark: one evidence → a question
  if (sem.foldList)
    return stopAt(
      'meaning',
      `the cutting list names pieces cut on fold that the sheet does not mark: ${sem.foldList.entries
        .slice(0, 2)
        .map((e) => `«${e.slice(0, 40)}»`)
        .join(', ')}`,
    );

  // 4 · the outline: what the sheet says (text, or a drawn seam line inside the cut line) for
  //     some pieces holds for the rest; nothing said → a one-click question (prefilled "cut line")
  const open = openQuestions(sem, s.names, i, snap.answersNow);
  const sheetSaid = sem.pieces.find(
    (p) => p.allowance.origin === 'text' || p.allowance.origin === 'measured',
  )?.allowance;
  // PASSPORT Ф1 (c): the file's own layer word against what the sheet says — never one silently
  const clash = layerWordConflict(s, sheetSaid);
  if (clash) return stopAt('meaning', clash);
  const word = outlineByLayerWord(s);
  if (open.allowance.length) {
    // layers that disagree are a question even where the sheet's text says something (Codex P1 #3)
    if (word?.kind === 'stop' && word.conflict) return stopAt('meaning', word.reason);
    const said = sheetSaid;
    if (!said) {
      // the source's own prior: a production / pattern-CAD export draws the cut line (its pieces
      // carry their allowance), and so does a file that names the layer of every outline "cut
      // line" (PASSPORT (c)); a printed home-sewing sheet (tiles, an overview page) does not say —
      // a question. Text or a drawn seam line (above) always wins over both.
      if (word?.kind === 'stop') return stopAt('meaning', word.reason);
      const cad = cadExport(s);
      if (!cad && !word)
        return stopAt(
          'meaning',
          'nothing on the sheet says what the drawn outline is — the cut line (allowance included) or the seam line?',
        );
      const evidence = [...(word?.evidence ?? []), ...(cad ?? [])];
      const fileAllowance: AllowanceDecision = {
        meaning: 'cut',
        // what the one-click "cut line · as drawn" answer sends
        allowanceMm: PATIMPORT.defaultAllowanceMm,
        origin: 'operator',
        evidence,
      };
      return {
        actions: [{ kind: 'semantics', patch: { fileAllowance } }],
        assumptions: [
          A(
            'meaning',
            'outline',
            'the file',
            'the drawn outline is the cut line',
            word
              ? `the file names the layer of every outline: ${word.layers.map((l) => `«${l.slice(0, 40)}»`).join(', ')} → cut line${cad ? ' (and a CAD export)' : ''}`
              : 'CAD export → cut line',
            evidence.slice(0, 4),
            0.6,
            true,
          ),
        ],
      };
    }
    const fileAllowance: AllowanceDecision = {
      ...said,
      origin: 'operator',
      evidence: [...said.evidence],
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
          said.origin === 'text'
            ? 'what the sheet text says for some pieces holds for the rest'
            : 'the seam line drawn inside the cut line on some pieces holds for the rest',
          said.evidence.slice(0, 3),
          0.6,
          false,
        ),
      ],
    };
  }

  // 5 · counts and names as shown — but a piece shown ONCE, unpaired and not on fold, with no word
  //     on the sheet about its count, is a stop: ×1, ×2 (sleeves) or on fold are all as likely
  //     (wm-M's sleeve exported ×1 against 2 expected; A10 r4)
  const single = open.quantity.find((u) => u.shown === '×1' && !u.foldAlt);
  if (single)
    return stopAt(
      'meaning',
      `${subj(single.seed)} is drawn once and nothing on the sheet says how many to cut — ×1, ×2 or on fold?`,
    );
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
            // Codex r5 #5: a piece drawn once, no count printed, defaulted to a mirrored pair —
            // the usual right answer, but a default: strong
            /^pair×/.test(u.shown)
              ? `drawn once, cut as a mirrored pair (industry default)${u.foldAlt ? ' — cut on fold was the alternative' : ''}`
              : u.foldAlt
                ? 'the count as shown (cut on fold was the alternative)'
                : 'the count as shown',
            [u.detail.slice(0, 160)],
            0.5,
            /^pair×/.test(u.shown),
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

function fabricsStep({ session: s, inputs: i, card, blocker }: Snap): AutopilotDecision {
  const a = s.fabrics;
  if (!a) return NONE;
  if (!card.scopes.length) return stopAt('fabrics', 'the BOM has no fabric lines');
  if (!blocker) return NONE;
  const main =
    card.scopes.find((x) => /MAIN$/.test(x.fabricPurpose))?.fabricPurpose ??
    card.scopes[0].fabricPurpose;
  const seeds = [...(s.pieces?.seeds ?? [])];
  const many = card.scopes.length > 1;
  const word = (p: string) => p.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase();
  // C7 + Codex #4: a cloth on the AI's word alone is taken as the AI said (the proven assignments
  // stay as they are) — a strong assumption when the card has more than one fabric
  const ai = (a.aiOnly ?? []).filter((x) => x.needsConfirm);
  if (ai.length)
    return {
      actions: [
        {
          kind: 'fabrics',
          assignment: {
            ...a,
            aiOnly: (a.aiOnly ?? []).map((x) =>
              x.needsConfirm ? { ...x, needsConfirm: false } : x,
            ),
          },
        },
      ],
      assumptions: ai.map((x) =>
        A(
          'fabrics',
          'fabric',
          subjectOf(seeds, x.seed, [...(s.semantics?.pieces ?? []), ...s.names]),
          x.purposes.map(word).join(' + '),
          "the AI's fabric for a piece the sheet says nothing about",
          ['AI only'],
          0.5,
          many,
          x.seed,
        ),
      ),
    };
  // the plan does not fit the BOM: never reset the whole set — a stop
  const problem = planScopes(s.semantics?.pieces ?? [], a, card.scopes).problems[0];
  if (problem) return stopAt('fabrics', problem.message);
  // the offer: main only because nothing names a fabric — kept, strong on a card with several
  const exported = [...new Set((s.semantics?.pieces ?? []).map((p) => p.seed))];
  const dflt = defaultedFabrics(a, card.scopes.length, i.assignment != null, exported);
  if (dflt.length)
    return {
      actions: [{ kind: 'proceed' }],
      assumptions: dflt.map((sd) =>
        A(
          'fabrics',
          'fabric',
          subjectOf(seeds, sd, [...(s.semantics?.pieces ?? []), ...s.names]),
          'main',
          'nothing names a fabric for the piece: it is cut from main',
          ['defaulted'],
          0.4,
          many,
          sd,
        ),
      ),
    };
  return NONE;
}
