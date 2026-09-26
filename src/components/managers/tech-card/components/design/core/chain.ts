import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { FIELD_REVEAL_EVENT, type FieldRevealDetail } from 'utils/field-errors';

import type { DesignKind } from '../bench-kinds';
import { benchSides, renderGate, threedGate, type Gate } from '../render/model';
import {
  draftInputGate,
  moodboardGate,
  moodGateSentence,
  type MoodGateField,
  type MoodGateInput,
  type MoodGateResult,
} from './mood-gate';

/**
 * THE CHAIN — six named steps of the DESIGN band, and where this card stands on them.
 *
 * This module is the rail's brain and holds NO gate of its own. Every refusal it reports is one of
 * the gates that already refuse a run on the step's own screen — `renderGate`, `threedGate` (which
 * folds `fabricRenderGate` in) from `render/model.ts` — plus two facts that are not gates at all:
 * which card fields are filled (step `card`) and what the band holds (`flat`, `pattern`). A second
 * writing of a rule that already refuses in one place is how the rail and the GENERATE button come
 * to disagree about the same card; the rail therefore only ASKS, never decides.
 *
 * ═══ GATES THE RAIL CANNOT READ, AND WHY THAT IS NOT A GAP ═══════════════════════════════════════
 * `colourPlanGate` (colour-plan), `patternGate(band, sourceId)` (pattern) and `recolorGate(sources)`
 * (on-model) refuse over LOCAL state of a mounted screen — the recipe being typed, the picture
 * picked as a tile source, the photos gathered for a repaint. The rail stands above all screens and
 * outlives each of them, so it has nothing to hand these functions: reading them here would mean
 * inventing a state to call them with, i.e. a second copy of the screen's draft. Their refusals stay
 * where they are answered — on the step's own screen, next to its GENERATE. Every one of them is,
 * by construction, an `own` refusal (below), so the rail loses nothing it would have shown.
 *
 * ═══ `own` — A CLASSIFICATION THE PRODUCT DID NOT HAVE, INTRODUCED HERE ═════════════════════════
 * The product's `Gate` says only «may this run start». The chain needs a second question: «is this
 * refusal an OBSTACLE OF THE CHAIN, or the step's own input still being assembled». The rule is
 * one sentence: an obstacle is what the person CANNOT FIX ON THIS STEP — 3D has no front render,
 * the render has no flats on the bench. Everything fixable here — no cloth stated yet, no tile name
 * — is `own`: the step is open, the work simply has not been done. SPEC §2 p.1 forbids the rail to
 * lock the flat over its own empty input («флэт НЕ запирается»); this classification is how that
 * rule is kept for every step, not just the flat.
 *
 * Against the product's gates the rule resolves as follows. `renderGate` refuses only over the FLAT
 * bench (missing front/back) or an archived colourway — both fixed elsewhere → obstacle. `threedGate`
 * refuses over the RENDER bench or the same archived colourway → obstacle. The two screens'
 * `own` refusals (fabric recipe, body, size) live in local drafts and never reach here.
 *
 * ═══ ONE GATE THIS MODULE DOES OWN: THE MOODBOARD MINIMUM (wave 25.09, D-10 / Codex B-10) ═══════
 * «пока мы не заполним минимально поля в мудборде, мы не можем пойти дальше по флоу». The rule is
 * written once, in `./mood-gate.ts`, and read here by three readers — `stepDone('mood')`,
 * `chainGate('mood')` and `chainGate('flat')` — and by the two GENERATE buttons through
 * `moodMinimumGate` below. Before the wave the rail said «mood done» on one picture while the draft
 * refused on another rule and the flat never refused at all: three answers to one question.
 *
 * ═══ TEXTS NAME THE STEP, NEVER ITS NUMBER ═══════════════════════════════════════════════════════
 * CARD DETAILS became step 0 and shifted every number by one (REVIEW: «каждая прежняя ссылка „шаг N“
 * съезжает на соседа»). The product's gate texts already say «FABRIC RENDER»; the bar below
 * prefixes the step's `label`, and no string in this file carries a digit as an address.
 */

export type StepId =
  | 'card'
  | 'mood'
  | 'flat'
  | 'pattern'
  | 'render'
  | 'threed'
  | 'aside'
  | 'playground';

export type Step = {
  id: StepId;
  /** Number shown on the cell. Empty for the aside: it is not a link of the chain. */
  n: string;
  label: string;
  optional?: boolean;
  /** The generative screen this step opens. `card` and `mood` have none: they are steps of the
   *  rail all the same — one screen at a time, like every other — but nothing on them runs. */
  kind?: DesignKind;
  /**
   * Whether this step exists on THIS SERVER. Absent = always (every link of the chain, and ON
   * MODEL). Present on the playground alone — see `ASIDES` for the argument.
   */
  visible?: (band: GetDesignBandResponse) => boolean;
};

/** Every step id, in rail order — the one list a URL value or a form path is checked against. */
export const STEP_IDS: readonly StepId[] = [
  'card',
  'mood',
  'flat',
  'pattern',
  'render',
  'threed',
  'aside',
  'playground',
];

export function isStepId(x: unknown): x is StepId {
  return typeof x === 'string' && (STEP_IDS as readonly string[]).includes(x);
}

/**
 * The six links of the chain, in the order of the work. Numbers are the prototype's (`_core.js`
 * STEPS): CARD DETAILS is 0 because it is where the card is named and filed before anything is
 * drawn; PATTERN is optional because a garment without a print is still a garment.
 */
export const STEPS: readonly Step[] = [
  { id: 'card', n: '0', label: 'card details' },
  { id: 'mood', n: '1', label: 'moodboard' },
  { id: 'flat', n: '2', label: 'flat', kind: 'flat' },
  { id: 'pattern', n: '3', label: 'pattern', optional: true, kind: 'pattern' },
  { id: 'render', n: '4', label: 'fabric render', kind: 'render' },
  { id: 'threed', n: '5', label: '3d', kind: 'threed' },
];

/**
 * ON MODEL stands aside, without a number: its input is a real photograph, not the previous step's
 * output, and nothing downstream reads what it makes. It is on the rail because it is a place to
 * go, not because the chain passes through it.
 */
export const ASIDE: Step = { id: 'aside', n: '', label: 'on model', kind: 'onmodel' };

/**
 * ═══ THE PLAYGROUND STANDS ASIDE TOO, AND FOR A STRONGER REASON THAN ON MODEL ═════════════════
 *
 * ON MODEL is aside because nothing downstream reads what it makes. The playground is aside because
 * it has no place in the sequence AT ALL: its input is whatever a person laid on the table this
 * minute, it binds no colourway, and its output is neither a plate of the bench nor an artifact of
 * the sheet. It is a room, not a link.
 *
 * ⚠ THE CELL IS DRAWN ONLY WHERE THE SERVER OFFERS THE ROUTE. `visible` is asked of the BAND, and
 * the doctrine is «absent ≠ empty»: a binary that predates `freeform_presets` sends nothing and the
 * cell must not exist (a step a person cannot leave, on a server that refuses it, is worse than no
 * step); a binary that knows the field sends at least `[]`, the cell exists, and the SCREEN says
 * which key is missing. Every other step is unconditional, so this is a predicate on the step
 * rather than a filter written into the rail — the rail would then be the second place that knows
 * the rule.
 */
export const ASIDES: readonly Step[] = [
  ASIDE,
  {
    id: 'playground',
    n: '',
    label: 'playground',
    kind: 'playground',
    visible: (band) => band.freeformPresets !== undefined,
  },
];

/** Every step of the rail, chain and asides together — the list every lookup below walks. */
const ALL_STEPS: readonly Step[] = [...STEPS, ...ASIDES];

export function stepOfKind(kind: DesignKind): Step {
  return ALL_STEPS.find((s) => s.kind === kind) ?? ASIDE;
}

export function stepById(id: StepId): Step {
  return ALL_STEPS.find((s) => s.id === id) ?? ASIDE;
}

/** The generative kind behind a step, or undefined on the two steps that run nothing. */
export function kindOfStep(id: StepId): DesignKind | undefined {
  return stepById(id).kind;
}

/**
 * ═══ WHERE A FORM FIELD LIVES — root key → step ═══════════════════════════════════════════════════
 * One step is on screen at a time, so a refusal aimed at a field of another step finds NO anchor in
 * the document; `revealField` then asks the document who can bring the field on, and the composer
 * answers from this map (see `studio-tab.tsx`). Keyed by the ROOT of the RHF path (`bomItems.3.name`
 * → `bomItems`), the same key `ERROR_TAB` in `components/index.tsx` routes tabs by. The rows say
 * where the field is DRAWN, not where it is filed. Walk this map with every move of a block.
 *
 * WAVE 25.09 (T05) MOVED TWO ROWS: `fit` and `categoryId` are no longer EDITED on the moodboard step
 * — GENERAL INFORMATION prints them as values with one door `edit in card details ›`, and the
 * editors live in CARD DETAILS (the category browser always stood there too; the fit select moved
 * there in zone CL-C). A row still pointing at `mood` would switch a Save refusal over `fit` to a
 * step that shows the fit but cannot change it.
 */
const FIELD_STEP: Record<string, StepId> = {
  // the header slot (`cardDetails`, index.tsx): identification · classification · base model
  name: 'card',
  styleNumber: 'card',
  brand: 'card',
  purpose: 'card',
  auxSubtype: 'card',
  targetGender: 'card',
  baseModelId: 'card',
  baseSampleSizeId: 'card',
  roles: 'card',
  // the two style facts GENERAL INFORMATION prints read-only since wave 25.09 (T05)
  fit: 'card',
  categoryId: 'card',
  // the moodboard step: the board, its description, the callouts, general information
  // (silhouette/fabric aspects), construction aspects, material slots
  moodboardMedia: 'mood',
  concept: 'mood',
  callouts: 'mood',
  details: 'mood',
  bomItems: 'mood',
  // the flat step: the prompt's words, and the bench doors (`design.bench.*`, `doors.ts`)
  garmentDescription: 'flat',
};

export function stepOfField(path: string): StepId | null {
  const [root, second] = path.split('.');
  if (root === 'design') return second === 'bench' ? 'flat' : null;
  return FIELD_STEP[root ?? ''] ?? null;
}

/**
 * ═══ A DOOR TO THE STEP THAT DRAWS A FIELD — the same seam as `revealField`, without its pulse ═══
 *
 * Organs of one step cannot switch the step: the composer owns `?step=` (`studio-tab.tsx`, `goStep`)
 * and hands the setter to nobody but the rail. It DOES listen for `FIELD_REVEAL_EVENT` — «bring the
 * field at this path on» — and answers from `stepOfField` above. A door such as GENERAL
 * INFORMATION's `edit in card details ›` or the flat's `moodboard ›` asks the same question, but it
 * is not a refusal: `revealField` would pulse the field in the ERROR ring, and a red pulse after a
 * plain «take me there» reads as «something is wrong there». So this dispatches the event itself,
 * then waits (frames, as `revealField` does — a whole step has to mount) for the field's anchor
 * and scrolls it to the centre, falling back to `fallback` when the step draws no anchor for it.
 *
 * Returns false when nobody claimed the request — the field's step is already on screen or the
 * path is unknown — and then only scrolls. Pass a path, not a step: the map stays the one place
 * that knows where a field lives.
 */
export function openStepOf(path: string, fallback?: string): boolean {
  if (typeof document === 'undefined') return false;
  const ask = new CustomEvent<FieldRevealDetail>(FIELD_REVEAL_EVENT, {
    bubbles: true,
    cancelable: true,
    detail: { path },
  });
  const claimed = !document.dispatchEvent(ask);
  const find = () =>
    document.querySelector<HTMLElement>(`[data-field="${CSS.escape(path)}"]`) ??
    (fallback ? document.querySelector<HTMLElement>(fallback) : null);
  let left = 90;
  const tick = (): void => {
    const el = find();
    if (el && el.getClientRects().length > 0) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (--left > 0) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return claimed;
}

/**
 * What the chain reads. Every member is something the composer (`studio-tab.tsx`) already holds —
 * the band it reads once, the colourway axis it owns, and a handful of form values. Nothing here is
 * a new store.
 */
export type ChainCtx = {
  band: GetDesignBandResponse;
  /** The server does not serve the band: every band-derived answer is «unknown», never «empty». */
  bandless: boolean;
  /** The step on screen — the single `now`. `null` while the opening step is still being decided
   *  (`defaultStep`), so that no step is skipped as «where you already are». */
  now: StepId | null;
  card: {
    name: string;
    /** Judged by `cardMissingFields` ONLY when `pastIdea` — the schema's own rule, see below. */
    styleNumber: string;
    categoryId: number;
    /** Carried by the rail's builder; NOT judged by `stepDone` — feeds costing, not the band. */
    baseSampleSizeId: number;
    /** `stage !== IDEA` — the one condition under which the schema refuses a blank style number. */
    pastIdea: boolean;
  };
  /**
   * How many pictures stand ON THE BOARD — rows of `moodboardMedia` that pass `isBoardRow`. The
   * REFERENCE rows of the flat input share that field and are NOT counted (Codex B-10): a card whose
   * only picture is a flat reference has an empty moodboard.
   */
  moodPictures: number;
  /** The board's description (`concept`) — the other half of the moodboard minimum. */
  moodConcept: string;
  /** Counters the strip already computed with `pictureRepresentation` — not recomputed here. */
  counts: { pattern: number; render: number; threed: number; onmodel: number; playground: number };
  colorway: { id: number; label: string; archived: boolean };
};

/**
 * The chain's answer for one step. `{ ok: true }` is the product's gate saying yes; `noRun` is the
 * SEPARATE fact that the step has nothing to say yes or no about — CARD DETAILS starts no run,
 * spends no money and therefore has no gate (REVIEW: «У нулевого шага нет прогона … Шаг обязан
 * объявить это состоянием, иначе читается как сломанный»). It is a value, not a default, so the
 * cell can say so instead of showing a green that means nothing.
 */
export type ChainGate =
  | { ok: true; noRun?: true }
  | {
      ok: false;
      /** The step's own input is not assembled yet — open, not an obstacle. */
      own?: true;
      reason: string;
      /** Where the refusal is fixed. Absent = no door to draw (e.g. the colourway select is already
       *  on the rail). */
      door?: StepId;
      /** A refusal with SEVERAL parts, each fixed in its own place (the moodboard minimum): one
       *  door per part, in the order of the sentence. When present it replaces `door` on screen. */
      doors?: GateDoor[];
    };

/**
 * A DOOR TO THE FIELD THAT FIXES ONE PART OF A REFUSAL. Opened with `openGateDoor` — the field's
 * step is brought on by the composer (`FIELD_REVEAL_EVENT`) and the field is scrolled to, no pulse.
 */
export type GateDoor = {
  /** Which part of the refusal this door fixes. */
  field: MoodGateField;
  /** The step the field is drawn on. */
  step: StepId;
  /** The form path the step draws (`[data-field]` anchor). */
  path: string;
  /** The anchor to scroll to when the step draws no `[data-field]` for the path. */
  fallback?: string;
  /** The words on the door. */
  label: string;
};

export type StepState = 'now' | 'done' | 'skipped' | 'optional' | 'blocked' | 'next' | 'ready';

/* ─────────────────────────── the moodboard minimum ─────────────────────────── */

/** The minimum of THIS card, as the chain reads it. */
export function moodGateOf(ctx: ChainCtx): MoodGateResult {
  return moodboardGate({
    boardPictures: ctx.moodPictures,
    concept: ctx.moodConcept,
    categoryId: ctx.card.categoryId,
  });
}

/**
 * ═══ EVERY PART OF A FAILED MINIMUM HAS ITS OWN DOOR (fix-up of the wave, Codex B1) ═════════════
 *
 * The picture is added on the BOARD, the description is written in DESCRIPTION — both on the
 * moodboard step, but not in one place — and the category is picked in CARD DETAILS, where the
 * category browser stands (GENERAL INFORMATION only prints it since T05). One door for all three
 * sent a person lacking only the category to the moodboard, and one lacking only words to the top
 * of the board. The order is the sentence's.
 */
const MOOD_DOORS: Record<MoodGateField, Omit<GateDoor, 'field'>> = {
  board: { step: 'mood', path: 'moodboardMedia', fallback: '#mb-board', label: 'moodboard ›' },
  concept: { step: 'mood', path: 'concept', label: 'description ›' },
  category: {
    step: 'card',
    path: 'categoryId',
    fallback: '#card-details',
    label: 'card details ›',
  },
};

export function moodGateDoors(r: MoodGateResult): GateDoor[] {
  return r.missing.map((m) => ({ field: m.field, ...MOOD_DOORS[m.field] }));
}

/**
 * The FIRST door's step — for a reader that draws one door only. Board content comes first in
 * `moodboardGate`, so a card missing everything is sent to the board, one missing only the
 * category to CARD DETAILS.
 */
export function moodGateDoor(r: MoodGateResult): StepId {
  return r.missing[0] ? MOOD_DOORS[r.missing[0].field].step : 'mood';
}

/** Opens a door: the composer brings the field's step on, the field is scrolled to, no pulse. */
export function openGateDoor(d: Pick<GateDoor, 'path' | 'fallback'>): void {
  openStepOf(d.path, d.fallback);
}

/**
 * ═══ THE MOODBOARD MINIMUM AS A GATE — for the flat's GENERATE (zone CL-D) and the draft's ═══════
 *
 * One call for a button that is about to spend money: the product's `Gate` shape, the step the
 * refusal is fixed on first (`door`, kept for readers that draw one door) and one door per missing
 * part (`doors`). The rail locks FLAT with the SAME sentence (`chainGate('flat')` below), so the
 * cell, the bar under the rail and the button can never disagree about why.
 */
export type MoodMinimum =
  | { ok: true }
  | { ok: false; reason: string; door: StepId; doors: GateDoor[]; missing: MoodGateField[] };

export function moodMinimumGate(v: MoodGateInput): MoodMinimum {
  return asMoodMinimum(moodboardGate(v));
}

/**
 * The CONSTRUCTION DRAFT's own door (`draftInputGate`): something to READ — a board picture or the
 * description — and the category. The draft is what writes the description; gating it on the full
 * minimum would ask for its answer before the question. Same parts, same words, same doors.
 */
export function draftReadGate(v: MoodGateInput): MoodMinimum {
  return asMoodMinimum(draftInputGate(v));
}

function asMoodMinimum(r: MoodGateResult): MoodMinimum {
  if (r.ok) return { ok: true };
  return {
    ok: false,
    reason: moodGateSentence(r),
    door: moodGateDoor(r),
    doors: moodGateDoors(r),
    missing: r.missing.map((m) => m.field),
  };
}

/* ─────────────────────────── the gates, asked not written ─────────────────────────── */

/** Where a product `Gate.next` points, as a step of this chain. */
function doorOf(g: Extract<Gate, { ok: false }>): StepId | undefined {
  switch (g.next) {
    case 'flat':
      return 'flat';
    case 'render':
    case 'front-slot':
    case 'refill':
      return 'render';
    case 'colourway':
      // The one exit is the colourway select, which the rail itself carries in its action slot.
      return undefined;
    default:
      return undefined;
  }
}

export function chainGate(id: StepId, ctx: ChainCtx): ChainGate {
  switch (id) {
    case 'card':
      // No run, no gate — stated, not defaulted (see `ChainGate`).
      return { ok: true, noRun: true };
    case 'mood': {
      // The moodboard minimum is the step's OWN input — fixed on this step (and, for the category,
      // one door away) — so the step stays open; it is the NEXT link that locks (below).
      const r = moodGateOf(ctx);
      if (r.ok) return { ok: true };
      return {
        ok: false,
        own: true,
        reason: moodGateSentence(r),
        door: moodGateDoor(r),
        doors: moodGateDoors(r),
      };
    }
    case 'flat': {
      // THE FLAT IS LOCKED UNTIL THE MOODBOARD MINIMUM HOLDS (D-10): a flat drawn from an empty board
      // and no category has nothing to be a flat OF. This refusal is NOT `own` — nothing on the flat
      // step fixes it — so the rail paints the cell blocked and names the door. The flat's other
      // refusal (an empty prompt) stays local to its form and `own`, per SPEC §2 p.1.
      const r = moodGateOf(ctx);
      if (r.ok) return { ok: true };
      return {
        ok: false,
        reason: moodGateSentence(r),
        door: moodGateDoor(r),
        doors: moodGateDoors(r),
      };
    }
    case 'pattern':
      // `patternGate(band, sourceId)` needs the picked source: local to the screen, `own` by nature.
      return { ok: true };
    case 'render': {
      if (ctx.bandless) return { ok: true };
      const g = renderGate(ctx.band, ctx.colorway.archived, ctx.colorway.label);
      if (g.ok) return g;
      // Missing front/back FLATS: fixed on the flat step, not here → an obstacle of the chain.
      return { ok: false, reason: g.reason, door: g.next ? doorOf(g) : 'flat' };
    }
    case 'threed': {
      if (ctx.bandless) return { ok: true };
      const g = threedGate(ctx.band, ctx.colorway.id, ctx.colorway.label, ctx.colorway.archived);
      if (g.ok) return g;
      // Every refusal of these gates is about the render bench or the colourway → obstacle.
      return { ok: false, reason: g.reason, door: doorOf(g) };
    }
    case 'aside':
      // `recolorGate(sources)` reads the photos gathered on the screen — local, `own`.
      return { ok: true };
    case 'playground':
      // `playgroundGate(draft, preset)` reads the table laid on the screen — local by nature, and
      // the refusal that is NOT local (no route wired on this server) is printed by the screen
      // itself, beside the chips that would have offered it. The rail asks; it never decides.
      return { ok: true };
  }
}

/* ─────────────────────────── done / state / next / nearest ─────────────────────────── */

/**
 * «Done» is judged by what the NEXT step needs from this one, not by a tick someone set. The card
 * is done when it is NAMED AND CATEGORISED — the two card fields the draft and the runs actually
 * read (`designConstructionUserPrompt` writes «Garment:» and «Category:»; fit and gender are
 * optional there too). Bench-backed steps are done when the bench holds a picture — that is what
 * the following run reads.
 *
 * ⚠ STYLE NUMBER IS COUNTED EXACTLY WHEN THE SCHEMA REFUSES WITHOUT IT — past the IDEA stage
 * (`schema.ts`, `pastIdea`) — and never at IDEA, where it may be blank. Counting it always kept the
 * «card details · next» cell up forever on every idea card and capped the counter at 5 of 6;
 * not counting it past IDEA let the strip say «filled» over a card the Save button refuses. BASE
 * SAMPLE SIZE IS NOT COUNTED: optional with default 0, it feeds costing and patterns, not the design
 * band, and on aux cards it is routinely empty. Roles are not counted either: a missing
 * technologist stops neither the moodboard nor the flats.
 *
 * ONE PREDICATE, TWO READERS. `cardMissingFields` is the list the fold strip prints («to fill: …»)
 * and `stepDone('card')` is its emptiness — the strip and the tick cannot disagree, because there
 * is no second list to disagree with.
 */
export function cardMissingFields(ctx: ChainCtx): string[] {
  const c = ctx.card;
  return [
    !c.name.trim() && 'name',
    c.pastIdea && !c.styleNumber.trim() && 'style number',
    !(c.categoryId > 0) && 'category',
  ].filter((x): x is string => typeof x === 'string');
}

export function stepDone(id: StepId, ctx: ChainCtx): boolean {
  switch (id) {
    case 'card':
      return cardMissingFields(ctx).length === 0;
    case 'mood':
      // The same minimum that unlocks the flat: a text-only board that passes it IS done (B-10).
      return moodGateOf(ctx).ok;
    case 'flat':
      return !ctx.bandless && benchSides(ctx.band).some((s) => !!s.picture);
    case 'pattern':
      return ctx.counts.pattern > 0;
    case 'render':
      return (
        !ctx.bandless && benchSides(ctx.band, 'render', ctx.colorway.id).some((s) => !!s.picture)
      );
    case 'threed':
      return ctx.counts.threed > 0;
    case 'aside':
      return ctx.counts.onmodel > 0;
    case 'playground':
      return ctx.counts.playground > 0;
  }
}

/**
 * The first link of the chain a person can take up right now: not on screen, not done, NOT
 * OPTIONAL, and either open or refusing only over its own input. ON MODEL is not in the queue — it
 * is aside.
 *
 * ⚠ OPTIONAL STEPS ARE PASSED OVER, AND THIS IS WHAT PUTS THE WORD «NEXT» ON THE RAIL AT ALL. The
 * queue used to hand «next» to PATTERN the moment the flat was done — but PATTERN's cell prints
 * `optional` (the check in `stepState` comes first), so the word went to a cell that could not
 * show it, FABRIC RENDER read `ready`, and no cell on the rail said NEXT (the mock-up, `_core.js`
 * `nextUp`, says it on FABRIC RENDER after FLAT DONE). A garment without a print is still a
 * garment: the chain's next link after the flat is the render, and the pattern is a place one may
 * go, not the place one is sent. `nearestBlock` skips optional steps for the same reason.
 */
export function nextUp(ctx: ChainCtx): StepId | null {
  for (const s of STEPS) {
    if (s.id === ctx.now) continue;
    if (s.optional) continue;
    if (stepDone(s.id, ctx)) continue;
    const g = chainGate(s.id, ctx);
    if (g.ok || g.own) return s.id;
  }
  return null;
}

/**
 * The word on the cell. Order of the checks matters and is the prototype's:
 *   · `now` is the step on display — any of the seven, CARD DETAILS and MOODBOARD included: the
 *     studio shows one step at a time (`_core.js` `render`: rail + the one step), so «you are
 *     here» is true of exactly one cell;
 *   · `optional` WINS over `blocked` on purpose — an optional step nobody can run right now holds
 *     nobody up, and calling it blocked would announce an obstacle where there is only a skip;
 *   · `next` goes to EXACTLY one step, otherwise it stands on three cells and stops meaning anything
 *     — and never to an optional one: `nextUp` passes those over, so the word lands on a cell that
 *     can print it (FABRIC RENDER after the flat, not PATTERN).
 *
 * `skipped` is in the vocabulary and has no writer yet: the product keeps no «skip PATTERN» mark
 * (a new form field is not this phase's to add), so an optional step reads `optional` or `done`.
 */
export function stepState(id: StepId, ctx: ChainCtx): StepState {
  if (ctx.now === id) return 'now';
  if (stepDone(id, ctx)) return 'done';
  const step = ALL_STEPS.find((s) => s.id === id);
  if (step?.optional) return 'optional';
  const g = chainGate(id, ctx);
  if (!g.ok && !g.own) return 'blocked';
  return nextUp(ctx) === id ? 'next' : 'ready';
}

export type NearestBlock = {
  stepId: StepId;
  /** The refusal, as the product's gate wrote it. */
  why: string;
  /** Where it is fixed, or null when the exit is already on the rail. */
  door: StepId | null;
  /** One door per part when the refusal has several (the moodboard minimum); else empty. */
  doors: GateDoor[];
};

/**
 * The nearest obstacle — the first NON-optional link that refuses over something not fixable on
 * its own step. Optional steps are skipped, not repaired; `own` refusals are open steps, not
 * obstacles. Null means the bar under the rail is not drawn at all.
 */
export function nearestBlock(ctx: ChainCtx): NearestBlock | null {
  for (const s of STEPS) {
    if (s.optional) continue;
    const g = chainGate(s.id, ctx);
    if (!g.ok && !g.own) {
      return { stepId: s.id, why: g.reason, door: g.door ?? null, doors: g.doors ?? [] };
    }
  }
  return null;
}

export function doneCount(ctx: ChainCtx): number {
  return STEPS.filter((s) => stepDone(s.id, ctx)).length;
}

/** Whether the band holds a single picture — on the bench or in any run. */
export function bandHasPictures(band: GetDesignBandResponse): boolean {
  return (
    (band.bench ?? []).some((s) => !!s.picture) ||
    (band.runs ?? []).some((r) => (r.pictures ?? []).length > 0)
  );
}

/**
 * THE STEP A CARD OPENS ON — the prototype's `boot`: the step in the address if there is one,
 * otherwise the first step. «First» is read as the first step WITH WORK LEFT: a card that has not
 * drawn anything yet opens on CARD DETAILS (there is nothing further along to look at), a card
 * with pictures opens on the first link not yet done (`nextUp`), and a card whose chain is complete
 * opens where it started. Decided ONCE per card by the composer, not followed live — followed
 * live, the step would jump under a person the moment a run finished.
 *
 * «NOT YET DONE» PASSES OVER THE OPTIONAL PATTERN, as `nextUp` does: a card with a finished flat
 * opens on FABRIC RENDER, not on a print it may never want — the mock-up's own opening, and the
 * same cell the rail marks NEXT. (Before `nextUp` skipped optional steps such a card opened on
 * PATTERN, i.e. on a step the rail itself did not call next.)
 */
export function defaultStep(ctx: ChainCtx): StepId {
  if (ctx.bandless || !bandHasPictures(ctx.band)) return 'card';
  return nextUp({ ...ctx, now: null }) ?? 'card';
}
