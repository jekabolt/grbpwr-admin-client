// N1 (AUTO, A4-lite): the wizard runs forward on its own through every step that asks nothing and
// lands on the first one that does (or on check). What "asks" means is the step's own `blocker`
// (use-import-session.ts) plus the things a step offers without blocking on them — written here,
// pure, so the e2e probe prices the same stops (scripts/pattern-import/e2e-entry.ts, A7).
// D3: nothing is accepted here; a suggestion waiting for its click is a stop, not a pass.
import type {
  BoxMm,
  ChainAmbiguity,
  FabricAssignment,
  ImportSession,
  MaskItem,
  PageClassification,
  PageMaskEdit,
  PieceFamily,
  PtMm,
  RasterCalibration,
  Seed,
  ScaleCandidate,
  SetAside,
  StageIO,
  WizardEvent,
  WizardStep,
} from 'lib/pattern-import/types';
import { drawnUnmapped, drawnUnmappedLine, notDrawnLine } from 'lib/pattern-import/sizes/map';
import { pointInPoly } from 'lib/pattern-import/pieces/geom';
import { PATIMPORT, SLIVER_MM } from 'lib/pattern-import/types';
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

type Fam = Pick<PieceFamily, 'candidates' | 'seed'>;
type SeedAt = Pick<Seed, 'id' | 'at'>;

/**
 * A 'size-copy' set-aside is "another size of a piece already seeded": proven only as part of a
 * piece that IS seeded, by the face pass's own account (SetAside.copy, pieces/faces CopyHow):
 *   sliver    narrower than any piece (the gap between two sizes' lines) — junk whatever it joins;
 *   shape     of the shape of the outline it lies in (that one proven too) — the piece it belongs
 *             to still seeded (the family of the seed standing on its seed point);
 *   lines / fragment  joined across size lines only, or a shape with no copy of its own: proven
 *             only as a strip of that seeded piece's grading — its point inside some of the
 *             piece's size outlines and outside others, no larger than the largest less the
 *             smallest, AND its whole edge running along those size outlines (the strip between
 *             two sizes, or where sizes cross at a corner).
 * Anything else is a guess like 'unlabelled' / 'joined' (D5: a possible piece is never set aside
 * silently): wm's sleeve beside the back (outside every size of it), wm's collar inside the back
 * (cut in three by the back's lines, inside every size of it), a welt strip inside a piece, a
 * small piece drawn against a piece's edge (its own outline is not the piece's). An aside without
 * that account is a guess too, and so is one holding a piece label of its own (a text seed in its
 * own face that is not its host's — SetAsideCopy.ownLabel), however it was told a copy.
 */
export const provenCopy = (
  a: SetAside,
  families: readonly Fam[],
  seeds?: readonly SeedAt[],
): boolean => {
  const c = a.copy;
  if (!c || c.ownLabel) return false;
  if (c.how === 'sliver' || c.clearMm <= SLIVER_MM) return true;
  const h = c.host;
  if (!h) return false;
  const closed = (f: Fam) =>
    f.candidates.filter((x) => x.outcome === 'closed' && x.outer.length > 2);
  // the seeded piece of the host outline: the family of the seed standing on the host's seed
  // point (a click moved off it, or the seed gone → not proven); without the seeds, the innermost
  // family whose outline holds the point
  let fam: Fam | null = null;
  if (seeds) {
    const sd = seeds.find((x) => Math.abs(x.at.x - h.x) < 0.01 && Math.abs(x.at.y - h.y) < 0.01);
    fam =
      sd == null ? null : families.find((f) => f.seed === sd.id && closed(f).length > 0) ?? null;
  } else {
    let best = Infinity;
    for (const f of families)
      for (const x of closed(f))
        if (x.areaMm2 < best && pointInPoly(h, x.outer)) {
          best = x.areaMm2;
          fam = f;
        }
  }
  if (!fam) return false;
  if (c.how === 'shape') return true;
  const sizes = closed(fam);
  if (sizes.length < 2 || !c.rim?.length) return false;
  const inside = sizes.filter((x) => pointInPoly(a.at, x.outer)).length;
  const areas = sizes.map((x) => x.areaMm2);
  if (
    !inside ||
    inside === sizes.length ||
    a.areaMm2 > 1.05 * (Math.max(...areas) - Math.min(...areas))
  )
    return false;
  return onOutlines(c.rim, sizes, rimTolMm(c.cellMm)) >= RIM_ON_SHARE;
};

/** A grading strip's edge runs along its piece's size outlines at this share of its points. */
const RIM_ON_SHARE = 0.9;

/**
 * How far a strip's edge sample (pieces/faces rimSamples: on the wall that bounds it — the drawn
 * line) may lie from a size outline and still be that outline's line: 2.5 face cells, never under
 * 1.5 mm.
 */
export const rimTolMm = (cellMm: number | undefined) => Math.max(1.5, 2.5 * (cellMm ?? 0.5));

/** The share of points within `tol` mm of one of the outlines. */
function onOutlines(
  pts: readonly PtMm[],
  outlines: readonly { outer: readonly PtMm[]; bbox: BoxMm }[],
  tol: number,
): number {
  const t2 = tol * tol;
  let on = 0;
  for (const p of pts) {
    let hit = false;
    for (const o of outlines) {
      const b = o.bbox;
      if (p.x < b.minX - tol || p.x > b.maxX + tol || p.y < b.minY - tol || p.y > b.maxY + tol)
        continue;
      const q = o.outer;
      for (let i = 0, j = q.length - 1; i < q.length && !hit; j = i++) {
        const A = q[j];
        const B = q[i];
        if (
          (p.x < A.x - tol && p.x < B.x - tol) ||
          (p.x > A.x + tol && p.x > B.x + tol) ||
          (p.y < A.y - tol && p.y < B.y - tol) ||
          (p.y > A.y + tol && p.y > B.y + tol)
        )
          continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L)) : 0;
        const ex = A.x + u * dx - p.x;
        const ey = A.y + u * dy - p.y;
        if (ex * ex + ey * ey <= t2) hit = true;
      }
      if (hit) break;
    }
    if (hit) on++;
  }
  return pts.length ? on / pts.length : 0;
}

/**
 * Piece-sized outlines set aside on a guess (WEAK_ASIDE, or — when the families are given — a size
 * copy not proven a copy of a seeded piece, provenCopy): "this is a piece" is one click.
 */
export const weakAsides = (
  asides: readonly SetAside[] | undefined,
  families?: readonly Fam[],
  seeds?: readonly SeedAt[],
) =>
  (asides ?? []).filter(
    (a) =>
      a.areaMm2 >= PIECE_SIZED_MM2 &&
      (WEAK_ASIDE.has(a.reason) ||
        (!!families && a.reason === 'size-copy' && !provenCopy(a, families, seeds))),
  );

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

/** The tile sheets a file carries (a Burda file: several; most files: one). */
export const tileSheets = (pages: readonly Pick<PageClassification, 'cls' | 'sheet'>[]) =>
  new Set(pages.filter((p) => p.cls === 'tile').map((p) => p.sheet ?? 0)).size;

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
    case 'sheet': {
      // D6: several tile sheets are one drawing — nothing to pick
      return waitingItems(s.sheet?.clean?.items ?? [])
        ? 'suggested to set aside on the sheet — accept, or go on with the lines kept'
        : null;
    }
    case 'sizes': {
      // a size the sheet lists but does not draw is left out of the export: said, never silent
      const undrawn = (s.sizes?.map.entries ?? [])
        .filter((e) => e.notDrawn)
        .map((e) => notDrawnLine(e.source.label));
      // drawn sizes past the card's run (every card size has its source): left out — said, never
      // silent (the partial map with card sizes still free is the blocker's question)
      const loose = s.sizes ? drawnUnmapped(s.sizes.map) : [];
      const past =
        loose.length && s.sizes!.map.entries.some((e) => e.card)
          ? [`${drawnUnmappedLine(loose)} past the card's run — not written; map one, or go on`]
          : [];
      const n = sizeFlags(s.chains?.ambiguities, s.sizes?.expected?.n).length;
      const flags = n
        ? `${n} ${n === 1 ? 'question' : 'questions'} the reader could not settle — look at the flags, or go on`
        : null;
      return [...undrawn, ...past, ...(flags ? [flags] : [])].join(' · ') || null;
    }
    case 'pieces': {
      const n = weakAsides(s.pieces?.setAside, s.pieces?.families, s.pieces?.seeds).length;
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
  // A10: a click seed is the pieces step's own answer (`addSeed`: clickSeeds + the fill again)
  pieces: { events: ['variant', 'piece-edits'], inputs: ['clickSeeds'] },
  // A10: the details controls answer through these fields (the grain's two clicks, the fold edge,
  // "not a fold", the outline, the cutting list, a typed name), then semantics runs again
  meaning: {
    events: ['names', 'semantics'],
    inputs: [
      'confirmedNames',
      'confirmedQuantities',
      'editedNames',
      'overrides',
      'operatorGrain',
      'operatorFold',
      'fileAllowance',
      'foldListChecked',
    ],
  },
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
      // A10: the autopilot's record of what it assumed rides with any answer (it answers nothing)
      .filter((k) => k !== 'autopilot' && !ok.inputs.includes(k))
      .map((k) => `input ${k}`),
  ];
  return bad.length ? `not an answer on ${step}: ${bad.join(', ')}` : null;
}
