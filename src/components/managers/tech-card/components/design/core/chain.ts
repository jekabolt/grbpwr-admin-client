import type { GetDesignBandResponse } from 'api/proto-http/admin';

import type { DesignKind } from '../bench-kinds';
import { benchSides, renderGate, threedGate, type Gate } from '../render/model';

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
 * ═══ TEXTS NAME THE STEP, NEVER ITS NUMBER ═══════════════════════════════════════════════════════
 * CARD DETAILS became step 0 and shifted every number by one (REVIEW: «каждая прежняя ссылка „шаг N“
 * съезжает на соседа»). The product's gate texts already say «FABRIC RENDER»; the bar below
 * prefixes the step's `label`, and no string in this file carries a digit as an address.
 */

export type StepId = 'card' | 'mood' | 'flat' | 'pattern' | 'render' | 'threed' | 'aside';

export type Step = {
  id: StepId;
  /** Number shown on the cell. Empty for the aside: it is not a link of the chain. */
  n: string;
  label: string;
  optional?: boolean;
  /** The generative screen this step opens. `card` and `mood` have none: they are steps of the
   *  rail all the same — one screen at a time, like every other — but nothing on them runs. */
  kind?: DesignKind;
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

export function stepOfKind(kind: DesignKind): Step {
  return [...STEPS, ASIDE].find((s) => s.kind === kind) ?? ASIDE;
}

export function stepById(id: StepId): Step {
  return [...STEPS, ASIDE].find((s) => s.id === id) ?? ASIDE;
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
 * where the field is DRAWN, not where it is filed: `categoryId` is a card fact, and it renders in
 * GENERAL INFORMATION on the moodboard step (`construction-general-info.tsx`, B-27) — a row pointing
 * at `card` would switch to a step that does not contain it, i.e. the same lie ERROR_TAB warns
 * against. Walk this map with every move of a block, as that one.
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
  // the moodboard step: the board, its description, the callouts, general information
  // (fit, category, silhouette/fabric aspects), construction aspects, material slots
  moodboardMedia: 'mood',
  concept: 'mood',
  callouts: 'mood',
  details: 'mood',
  fit: 'mood',
  categoryId: 'mood',
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
  /** How many pictures the moodboard holds (form field `moodboardMedia`). */
  moodPictures: number;
  /** Counters the strip already computed with `pictureRepresentation` — not recomputed here. */
  counts: { pattern: number; render: number; threed: number; onmodel: number };
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
    };

export type StepState = 'now' | 'done' | 'skipped' | 'optional' | 'blocked' | 'next' | 'ready';

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
    case 'mood':
      // The construction draft reads pictures; an empty board is the step's OWN input, fixed here.
      if (ctx.moodPictures === 0) {
        return { ok: false, own: true, reason: 'the moodboard is empty', door: 'mood' };
      }
      return { ok: true };
    case 'flat':
      // The flat's only refusal — an empty prompt — lives in the generation form's local state and
      // is `own` by SPEC §2 p.1. Nothing else refuses a flat run, so the rail never locks it.
      return { ok: true };
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
      return ctx.moodPictures > 0;
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
  const step = [...STEPS, ASIDE].find((s) => s.id === id);
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
    if (!g.ok && !g.own) return { stepId: s.id, why: g.reason, door: g.door ?? null };
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
