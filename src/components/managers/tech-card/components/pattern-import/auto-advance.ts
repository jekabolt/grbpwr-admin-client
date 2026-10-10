// N1 (AUTO, A4-lite): the wizard runs forward on its own through every step that asks nothing and
// lands on the first one that does (or on check). What "asks" means is the step's own `blocker`
// (use-import-session.ts) plus the things a step offers without blocking on them — written here,
// pure, so the e2e probe prices the same stops (scripts/pattern-import/e2e-entry.ts, A7).
// D3: nothing is accepted here; a suggestion waiting for its click is a stop, not a pass.
import type {
  ChainAmbiguity,
  FabricAssignment,
  ImportSession,
  MaskItem,
  PageClassification,
  PageMaskEdit,
  RasterCalibration,
  ScaleCandidate,
  SetAside,
  StageIO,
  WizardEvent,
  WizardStep,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { anisotropyOf, squareSidesOf } from './formats';

/** Where the run always stops: the gate is read and apply / download is a deliberate click. */
export const AUTO_STOPS: readonly WizardStep[] = ['check', 'apply'];

/** A page role below this is drawn "uncertain" on the files step (files.tsx) — a stop. */
export const PAGE_SURE = 0.7;
/** A page calibration below this (an inherited 0.5, none 0) is not a scale the file proves. */
export const CALIBRATION_SURE = 0.9;
/**
 * A2 set-asides whose reason is a guess about a piece (no label, drawn against / inside one, in
 * another pen) and that are big enough to BE a piece are shown before the run goes on; chrome,
 * tables, repeats and copies of a seeded outline are proven junk and pass.
 */
export const WEAK_ASIDE: ReadonlySet<SetAside['reason']> = new Set([
  'unlabelled',
  'joined',
  'inner-line',
  'other-pen',
]);
/** The piece detector's own floor (4 cm²): a belt loop or a tab set aside unlabelled is still a piece to look at. */
export const PIECE_SIZED_MM2 = PATIMPORT.minPieceAreaMm2;

/** Mask items offered but not applied — a suggestion waiting for "accept". */
export const waitingItems = (items: readonly Pick<MaskItem, 'status' | 'applied'>[]) =>
  items.filter((it) => it.status === 'suggest' && !it.applied).length;

/** The page roles the operator set on the files step (`roleEdit`): their answer, not a guess. */
const roleSet = (edits: readonly PageMaskEdit[]) =>
  new Set(edits.flatMap((e) => ('role' in e ? [`${e.file}:${e.page}`] : [])));

/** The files step's open offers: suggestions not accepted, pages to check, uncertain roles. */
export function cleanWaiting(
  clean: StageIO['clean']['out'] | null | undefined,
  pages: readonly Pick<
    PageClassification,
    'file' | 'page' | 'cls' | 'confidence'
  >[] = clean?.classes ?? [],
  edits: readonly PageMaskEdit[] = [],
) {
  const set = roleSet(edits);
  return {
    items: clean ? waitingItems(clean.pages.flatMap((p) => p.items)) : 0,
    pages: clean ? clean.dropped.filter((d) => d.status === 'suggest').length : 0,
    // a page the classifier could not place, or placed below "sure", is drawn as a question
    uncertain: pages.filter(
      (p) => !set.has(`${p.file}:${p.page}`) && (p.cls === 'unknown' || p.confidence < PAGE_SURE),
    ).length,
  };
}

/**
 * The scale detection is not certain enough to pass without "I checked" (the scale blocker): a
 * weak candidate, a factor off 1:1, a square that is not square, or a page whose own calibration
 * is weak (an inherited one, none).
 */
export function scaleUncertain(
  c: Pick<ScaleCandidate, 'confidence' | 'evidence'>,
  factor: number,
  calibrations: readonly { calibration: Pick<RasterCalibration, 'confidence'> }[] = [],
) {
  const sides = squareSidesOf(c.evidence?.text);
  return (
    c.confidence < 0.9 ||
    Math.abs(factor - 1) > PATIMPORT.scaleWarnRatio ||
    (!!sides && anisotropyOf(sides) > PATIMPORT.scaleWarnRatio) ||
    calibrations.some((k) => k.calibration.confidence < CALIBRATION_SURE)
  );
}

/** The sizes step's flags (sizes.tsx): what the legend could not settle, shown as questions. */
export const sizeFlags = (
  ambiguities: readonly ChainAmbiguity[] | undefined,
  expectedN: number | null | undefined,
) => (ambiguities ?? []).filter((a) => !(expectedN === 1 && a.kind === 'class-merge'));

/** Piece-sized outlines set aside on a guess (WEAK_ASIDE): "this is a piece" is one click. */
export const weakAsides = (asides: readonly SetAside[] | undefined) =>
  (asides ?? []).filter((a) => WEAK_ASIDE.has(a.reason) && a.areaMm2 >= PIECE_SIZED_MM2);

/**
 * Pieces cut from the main fabric only because nothing named a fabric for them, on a card with
 * more than one fabric scope (with one, main is the only answer). An assignment the operator
 * touched is theirs.
 */
export function defaultedFabrics(
  a: FabricAssignment | null | undefined,
  scopes: number,
  operatorEdited: boolean,
  exported?: readonly number[],
) {
  if (!a || scopes < 2 || operatorEdited) return [];
  const live = exported ? new Set(exported) : null;
  return (a.defaulted ?? []).filter((sd) => !live || live.has(sd));
}

/** What `stepOffer` reads: the session's outputs and the few operator inputs that answer them. */
export type OfferCtx = Pick<
  ImportSession,
  'step' | 'clean' | 'pages' | 'sheet' | 'chains' | 'sizes' | 'pieces' | 'fabrics' | 'semantics'
> & {
  presegmented: boolean;
  cleanEdits: readonly PageMaskEdit[];
  /** Fabric scopes of the card (the run's, after `forRun`). */
  scopes: number;
  /** The operator changed the fabrics assignment (inputs.assignment). */
  fabricsEdited: boolean;
};

/**
 * What a step OFFERS without blocking "next" on it, worded — null when there is nothing. The
 * blocker covers every question a step refuses to move without; this adds the offers that are
 * still the operator's call (D3).
 */
export function stepOffer(s: OfferCtx): string | null {
  switch (s.step) {
    case 'files': {
      if (s.presegmented) return null;
      const w = cleanWaiting(s.clean, s.pages, s.cleanEdits);
      if (w.items) return 'suggested to set aside — accept, or go on with the lines kept';
      if (w.pages) return 'pages set aside to check — read one as a tile, or go on';
      if (w.uncertain)
        return `${w.uncertain} ${w.uncertain === 1 ? 'page' : 'pages'} read without certainty — check the role, or go on`;
      return null;
    }
    case 'sheet':
      return waitingItems(s.sheet?.clean?.items ?? [])
        ? 'suggested to set aside on the sheet — accept, or go on with the lines kept'
        : null;
    case 'sizes': {
      const n = sizeFlags(s.chains?.ambiguities, s.sizes?.expected?.n).length;
      return n
        ? `${n} ${n === 1 ? 'question' : 'questions'} the reader could not settle — look at the flags, or go on`
        : null;
    }
    case 'pieces': {
      const n = weakAsides(s.pieces?.setAside).length;
      return n
        ? `${n} piece-sized ${n === 1 ? 'outline' : 'outlines'} set aside on a guess — "this is a piece", or go on`
        : null;
    }
    case 'fabrics': {
      const exported = s.semantics
        ? [...new Set(s.semantics.pieces.map((p) => p.seed))]
        : undefined;
      const n = defaultedFabrics(s.fabrics, s.scopes, s.fabricsEdited, exported).length;
      return n
        ? `${n} ${n === 1 ? 'piece is' : 'pieces are'} main fabric only because nothing names a fabric — tick another, or go on`
        : null;
    }
    default:
      return null;
  }
}

/** A snapshot the resolver reads: the session, the operator's inputs, why the step stops. */
export type AutoSnapshot<I> = {
  session: ImportSession;
  inputs: I;
  step: WizardStep;
  /** The step's blocker, else its offer (`stepOffer`): the question the resolver may answer. */
  question: string;
};

/**
 * An answer to the question a step stops on (AUTOPILOT plugs a policy in here): an inputs patch
 * and / or wizard events, applied in order; the step is then checked again. null or `stop` = the
 * resolver has no answer — the run stays on the step for the operator. Only the step's own
 * answers are taken (`ANSWERS`): never a move (write, apply, download, back, files, reset).
 */
export type AutoAnswer<I> = { patch?: Partial<I>; events?: WizardEvent[]; stop?: boolean };
export type AutoResolver<I> = (
  snap: AutoSnapshot<I>,
) => AutoAnswer<I> | null | Promise<AutoAnswer<I> | null>;

/**
 * Per step, the events and input fields that ANSWER its questions — what the step's own controls
 * send (files: page roles and mask edits; sizes: legend, map, count; …). A resolver answer with
 * anything else is refused whole.
 */
export const ANSWERS: Record<
  WizardStep,
  { events: readonly WizardEvent['type'][]; inputs: readonly string[] }
> = {
  files: { events: ['clean'], inputs: [] },
  scale: { events: [], inputs: ['scaleIndex', 'manualMeasuredMm', 'scaleConfirmed'] },
  sheet: { events: ['sheet', 'clean'], inputs: ['residualsAccepted'] },
  sizes: { events: ['legend', 'size-map', 'drawn-sizes'], inputs: ['legendConfirmed'] },
  pieces: { events: ['variant', 'piece-edits'], inputs: [] },
  meaning: { events: ['names', 'semantics'], inputs: ['confirmedNames', 'confirmedQuantities'] },
  fabrics: { events: ['fabrics'], inputs: [] },
  check: { events: [], inputs: [] },
  apply: { events: [], inputs: [] },
};

/** Why a resolver answer is refused on this step (null = it only answers the step). */
export function answerProblem<I>(step: WizardStep, a: AutoAnswer<I>): string | null {
  const ok = ANSWERS[step];
  const bad = [
    ...(a.events ?? []).filter((e) => !ok.events.includes(e.type)).map((e) => `event ${e.type}`),
    ...Object.keys(a.patch ?? {})
      .filter((k) => !ok.inputs.includes(k))
      .map((k) => `input ${k}`),
  ];
  return bad.length ? `not an answer on ${step}: ${bad.join(', ')}` : null;
}
