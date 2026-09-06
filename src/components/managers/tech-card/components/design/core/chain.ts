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
  /** The studio view this step opens, when it is a switched screen. `card` and `mood` are always on
   *  screen above the rail and have none: a click on them scrolls, it does not switch. */
  kind?: DesignKind;
};

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

/**
 * What the chain reads. Every member is something the composer (`studio-tab.tsx`) already holds —
 * the band it reads once, the colourway axis it owns, and a handful of form values. Nothing here is
 * a new store.
 */
export type ChainCtx = {
  band: GetDesignBandResponse;
  /** The server does not serve the band: every band-derived answer is «unknown», never «empty». */
  bandless: boolean;
  /** Which switched screen is open. Determines the single `now`. */
  kind: DesignKind;
  card: {
    name: string;
    /** Carried by the rail's builder; NOT judged by `stepDone` — a release blocker, not a link. */
    styleNumber: string;
    categoryId: number;
    /** Carried by the rail's builder; NOT judged by `stepDone` — feeds costing, not the band. */
    baseSampleSizeId: number;
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
 * ⚠ STYLE NUMBER AND BASE SAMPLE SIZE ARE NOT COUNTED, and that is the schema speaking, not
 * leniency. `styleNumber` is required only past the IDEA stage (`schema.ts`, `pastIdea`) and no
 * run reads it — it is a RELEASE blocker (`RELEASE_BLOCKER_TAB.style_number`), and a release is not
 * a link of this chain. `baseSampleSizeId` is optional with default 0 and feeds costing and
 * patterns, not the design band; on aux cards it is routinely empty. Counting either kept the
 * «card details · next» cell up forever on every idea card and capped the counter at 5 of 6.
 * Roles are not counted either: a missing technologist stops neither the moodboard nor the flats.
 */
export function stepDone(id: StepId, ctx: ChainCtx): boolean {
  switch (id) {
    case 'card': {
      const c = ctx.card;
      return !!(c.name.trim() && c.categoryId > 0);
    }
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
 * The first link of the chain a person can take up right now: not on screen, not done, not skipped,
 * and either open or refusing only over its own input. ON MODEL is not in the queue — it is aside.
 */
export function nextUp(ctx: ChainCtx): StepId | null {
  const now = stepOfKind(ctx.kind).id;
  for (const s of STEPS) {
    if (s.id === now) continue;
    if (stepDone(s.id, ctx)) continue;
    const g = chainGate(s.id, ctx);
    if (g.ok || g.own) return s.id;
  }
  return null;
}

/**
 * The word on the cell. Order of the checks matters and is the prototype's:
 *   · `now` is the switched screen on display. `card` and `mood` are never `now`: they are always
 *     on screen above the rail, so «you are here» would be true of them at all times and mean
 *     nothing;
 *   · `optional` WINS over `blocked` on purpose — an optional step nobody can run right now holds
 *     nobody up, and calling it blocked would announce an obstacle where there is only a skip;
 *   · `next` goes to EXACTLY one step, otherwise it stands on three cells and stops meaning anything.
 *
 * `skipped` is in the vocabulary and has no writer yet: the product keeps no «skip PATTERN» mark
 * (a new form field is not this phase's to add), so an optional step reads `optional` or `done`.
 */
export function stepState(id: StepId, ctx: ChainCtx): StepState {
  if (stepOfKind(ctx.kind).id === id) return 'now';
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
