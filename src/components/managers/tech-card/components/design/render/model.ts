import type {
  GetDesignBandResponse,
  common_Color,
  common_DesignBenchSlot,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';

import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { isPictureHidden } from '../visibility';
import { SILHOUETTE_VIEWS, isSilhouetteView, normaliseViewKey, viewLabel } from '../views';
import type { SilhouetteView } from '../views';

/**
 * READING THE BAND FOR THE TWO GENERATIVE SCREENS — everything FABRIC RENDER and 3D need to know
 * about a card, as pure functions over the one band read. No component computes any of this for
 * itself: the input strip, the palette, the colour history and the two gates all have to agree
 * about which picture is a render and which revision it belongs to, and three organs each deriving
 * that separately is how they end up disagreeing on screen.
 *
 * EVERY FIELD BELOW IS READ AS IF IT WERE NULL. The gateway is built with `EmitUnpopulated`, so an
 * unset field arrives as an explicit `null` while the generated TypeScript declares it `|
 * undefined`. Both are real. There is no error boundary over this tab — one thrown `TypeError`
 * takes the whole screen white — so nothing here dereferences without `?.` and nothing defaults
 * without `??`.
 */

/* ─────────────────────────── what kind of picture is this ─────────────────────────── */

/**
 * The run a picture came out of, when that run is on the loaded page.
 *
 * `GetDesignBand` returns only the FIRST page of the feed, with each run's pictures already under
 * it — so a picture reached THROUGH `band.runs` always finds its run here. The ones that may not
 * are the plates reached through a bench slot: `slot.picture` is resolved server-side precisely
 * because it is routinely older than the page. Null therefore means «not on this page», never «no
 * run» — for that, read `runId`.
 */
export function runOfPicture(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): common_DesignRun | null {
  const runId = picture.runId ?? 0;
  if (runId <= 0) return null;
  return (band.runs ?? []).find((run) => run.id === runId) ?? null;
}

/**
 * `flat | render | threed | draft_idea`, or '' when it cannot be told.
 *
 * READ OFF THE RUN AND NOT OFF `picture.kind`, and that is the whole point of this function. The
 * contract spells the run's vocabulary in as many words and freezes it at launch; `DesignPicture.
 * kind` is an open string whose members this bundle has never seen in production, and a filter
 * written against a dictionary you have not seen silently empties a picker — the trap `bench-slot`
 * already documents for the bench. A batch picture answers '' because a manual upload is not a run
 * at all, which is exactly what makes it a legal FLAT input.
 */
export function runKindOf(band: GetDesignBandResponse, picture: common_DesignPicture): string {
  const run = runOfPicture(band, picture);
  return (run?.kind ?? '').trim().toLowerCase();
}

/** The picture's own declared kind, normalised. Corroborating evidence only — see `runKindOf`. */
function declaredKind(picture: common_DesignPicture): string {
  return (picture.kind ?? '').trim().toLowerCase();
}

/**
 * MAY THIS PICTURE BE FED TO A FABRIC RENDER? The strip's right-hand side, and the prototype's rule
 * in the prototype's own words: «a hand file was always legal input here».
 *
 * The exclusions are asymmetric ON PURPOSE. A picture is refused only on POSITIVE evidence that it
 * is an output of the generative machine — the run says so, or, when the run is off-page, the
 * picture's own kind does. Everything else is admitted, including a picture this bundle cannot
 * classify, because the failure of the strict reading is an empty strip on a card full of drawings
 * and the failure of the lax one is one extra tile the human ignores.
 */
export function isFlatCandidate(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): boolean {
  if (isPictureHidden(picture)) return false;
  // A composite holds several views at once; a render reads ONE drawing per view, so it must be
  // split first. Same refusal the bench makes, for the same reason.
  if ((picture.compositeViews ?? []).length > 0) return false;
  const kind = runKindOf(band, picture) || declaredKind(picture);
  return kind !== 'render' && kind !== 'threed';
}

/* ─────────────────────────── the bench, as the render reads it ─────────────────────────── */

export type BenchSide = {
  view: SilhouetteView;
  slot: common_DesignBenchSlot | null;
  picture: common_DesignPicture | null;
  /** The CAS token the next write to this slot must echo. 0 = the slot has never been written. */
  slotRev: number;
};

/**
 * The four silhouette sides in a fixed order, present or not.
 *
 * A side that has never been touched does not exist on the server — the rows are born lazily by the
 * first `SetDesignBenchSlot` — so `slot` is honestly null and `slotRev` is honestly 0, which is the
 * token a lazy first placement is required to send.
 */
export function benchSides(band: GetDesignBandResponse): BenchSide[] {
  const byView = new Map<string, common_DesignBenchSlot>();
  for (const row of band.bench ?? []) {
    const key = normaliseViewKey(row.viewKey);
    if (isSilhouetteView(key)) byView.set(key, row);
  }
  return SILHOUETTE_VIEWS.map((view) => {
    const slot = byView.get(view) ?? null;
    return {
      view,
      slot,
      picture: slot?.picture ?? null,
      slotRev: slot?.slotRev ?? 0,
    };
  });
}

/** Every picture standing in a silhouette slot right now, keyed by its own id. */
function markedPictureIds(band: GetDesignBandResponse): Set<number> {
  const ids = new Set<number>();
  for (const side of benchSides(band)) {
    const id = side.picture?.id ?? 0;
    if (id > 0) ids.add(id);
  }
  return ids;
}

/**
 * Every flat of this card that is NOT in a slot — the right-hand side of the render's input strip.
 *
 * PAGE-BOUND, AND THE SCREEN SAYS SO. The band ships one page of the feed, so this lists the flats
 * of that page and no more. The LEFT side of the strip has no such limit: a bench slot carries its
 * resolved plate however old it is, which is why the two halves are gathered from different places
 * rather than from one filtered list.
 */
export function unmarkedFlats(band: GetDesignBandResponse): common_DesignPicture[] {
  const marked = markedPictureIds(band);
  const out: common_DesignPicture[] = [];
  const push = (pictures: common_DesignPicture[] | undefined | null) => {
    for (const picture of pictures ?? []) {
      const id = picture.id ?? 0;
      if (id <= 0 || marked.has(id)) continue;
      if (!isFlatCandidate(band, picture)) continue;
      out.push(picture);
    }
  };
  for (const run of band.runs ?? []) push(run.pictures);
  for (const batch of band.batches ?? []) push(batch.pictures);
  return out;
}

/** True when the feed has more rows than the band handed over — the strip admits it. */
export function feedIsTruncated(band: GetDesignBandResponse): boolean {
  return !!(band.nextPageToken ?? '').trim();
}

/* ─────────────────────────── renders, by view and by revision ─────────────────────────── */

export type RenderPlate = {
  picture: common_DesignPicture;
  run: common_DesignRun;
  /** MAX+1 per card, assigned only for `kind=render`. The «r4» of the colour history. */
  rrev: number;
};

export type RenderByView = Partial<Record<SilhouetteView, RenderPlate>>;

/**
 * THE LATEST RENDER OF EACH SIDE — the input of a 3D turntable.
 *
 * GATHERED FROM RENDER RUNS ONLY, with no fallback to `picture.kind`, and the missing fallback is a
 * decision rather than an omission: a turntable must be assembled from four sides of ONE revision,
 * `rrev` lives on the RUN, and a render whose run is off-page therefore has no revision to compare.
 * Admitting it would let a rotation be stitched out of two different colours with nothing on screen
 * able to tell. The newest renders are on the newest page by construction, so the case is rare and
 * the honest answer to it is «missing», which the gate then says out loud.
 *
 * `ghost_view` IS THE VIEW. It is the only view-bearing field a picture has; on a generated output
 * the server states it rather than guessing, and the contract already uses it that way for the
 * declared view of a split frame.
 */
export function latestRenderByView(band: GetDesignBandResponse): RenderByView {
  const out: RenderByView = {};
  for (const run of band.runs ?? []) {
    if ((run.kind ?? '').trim().toLowerCase() !== 'render') continue;
    const rrev = run.rrev ?? 0;
    for (const picture of run.pictures ?? []) {
      if (isPictureHidden(picture)) continue;
      const view = normaliseViewKey(picture.ghostView);
      if (!isSilhouetteView(view)) continue;
      const key = view as SilhouetteView;
      const previous = out[key];
      if (!previous || rrev > previous.rrev) out[key] = { picture, run, rrev };
    }
  }
  return out;
}

/**
 * EVERY OUTPUT OF ONE KIND THIS PAGE OF THE BAND HOLDS — the renders, or the turntable frames.
 *
 * READ OFF THE RUN, like everything else here (`runKindOf`): `picture.kind` is an open string whose
 * production vocabulary this bundle has never seen, and a list filtered against a dictionary you
 * have not seen empties silently. Hidden pictures are dropped — `hidden_at` is the one persistent
 * verb for invisibility and a screen that ignores it shows a plate its owner has already withdrawn.
 *
 * PAGE-BOUND, AND EVERY CALLER SAYS SO. The band ships one page of the merged feed; this is what
 * that page carries, newest run first, and never a claim about the whole card.
 */
export function outputsOfKind(
  band: GetDesignBandResponse,
  kind: 'render' | 'threed',
): { picture: common_DesignPicture; run: common_DesignRun }[] {
  const out: { picture: common_DesignPicture; run: common_DesignRun }[] = [];
  for (const run of band.runs ?? []) {
    if ((run.kind ?? '').trim().toLowerCase() !== kind) continue;
    for (const picture of run.pictures ?? []) {
      if (isPictureHidden(picture)) continue;
      if ((picture.id ?? 0) <= 0) continue;
      out.push({ picture, run });
    }
  }
  return out;
}

/* ─────────────────────────── «selected», W-12 ─────────────────────────── */

/**
 * ═══ THE MARK «SELECTED» ON A RUN'S PICTURE — W-12 ════════════════════════════════════════════
 *
 * THE FIELD IS ON THE WIRE. `common_DesignPicture.selected` is a boolean of its own, and the
 * contract states in as many words why it is not `hidden_at` with the sign flipped: hiding says «do
 * not show me this», choosing says «this is the one», a card can hold four visible turntables with
 * one chosen among them, and spending `hidden_at` on both would make un-hiding a rejected frame
 * silently re-elect it. Every reader in this bundle goes through this one function so the two
 * notions cannot be confused at a call site.
 *
 * A FLAT NEEDS NO SUCH FLAG AND DOES NOT GET ONE: the bench slot IS the choice, because a slot
 * holds at most one plate. The flag exists for 3D precisely because the bench refuses `kind=threed`
 * and a turntable frame therefore had nowhere at all to be elected.
 */
export function pictureIsSelected(picture?: common_DesignPicture | null): boolean {
  return picture?.selected === true;
}

/**
 * DOES THE SERVER THAT ANSWERED STATE THE FLAG AT ALL?
 *
 * NOT the same question as «does the contract have the field» — this bundle's contract does, since
 * it was regenerated. The question is about the BINARY on the other end: a rolled-back one answers
 * the band's routes with a message that has no `selected` in it, and `EmitUnpopulated` means a
 * server that HAS the field always sends it (as `false` when unset). So `undefined` is a truthful
 * «this server does not know about the mark» and `false` is a truthful «not chosen» — reading both
 * as «not chosen» would make a screen filtered on the mark look convincingly empty against an old
 * binary. This band already treats rolled-back binaries as a live case; see `use-design-band.ts`.
 */
export function serverStatesSelected(picture?: common_DesignPicture | null): boolean {
  return typeof picture?.selected === 'boolean';
}

/**
 * THE VERB THAT WOULD WRITE THE MARK, AND IT DOES NOT EXIST YET.
 *
 * The field arrived with the contract wave; the RPC did not. `HideDesignPicture` is still the only
 * picture-level verb on `AdminService`, and it writes the OTHER statement — smuggling a `selected`
 * flag onto it would be exactly the collapse the contract's own comment forbids, and would put two
 * unrelated permissions behind one RBAC row.
 *
 * So the mark is READ-ONLY on this client: the badge is drawn from whatever the server states, and
 * the control that would set it is an inert door carrying this sentence. A local `useState`
 * standing in for the verb would be worse than an inert door — it would look like it worked and
 * lose the choice on the next refetch, with nothing saying so.
 */
export const SELECT_VERB_MISSING =
  'the field `DesignPicture.selected` is on this contract and this screen reads it, but nothing can ' +
  'yet WRITE it: `HideDesignPicture` is still the only picture-level verb on the service, and it ' +
  'carries the other statement — reversible invisibility, not an editorial choice. Setting the mark ' +
  'needs an RPC of its own, which arrives with the handlers wave';

/** The revisions the four sides currently come from, ascending and deduplicated. */
export function renderRevisions(byView: RenderByView): number[] {
  const revs = new Set<number>();
  for (const view of SILHOUETTE_VIEWS) {
    const plate = byView[view];
    if (plate) revs.add(plate.rrev);
  }
  return Array.from(revs).sort((a, b) => a - b);
}

/** The picture ids a turntable would be built from, in view order. Empty when a side is missing. */
export function turntableSourceIds(byView: RenderByView): number[] {
  const ids: number[] = [];
  for (const view of SILHOUETTE_VIEWS) {
    const id = byView[view]?.picture?.id ?? 0;
    if (id <= 0) return [];
    ids.push(id);
  }
  return ids;
}

/* ─────────────────────────── money ─────────────────────────── */

export type BudgetLine = {
  spent: number;
  reserved: number;
  cap: number;
  currency: string;
  /** `spent + reserved` — what the ceiling is actually compared against. */
  booked: number;
  exhausted: boolean;
  /** `today $0.41 of $2.00`, already formatted. */
  text: string;
};

function decimalNumber(value?: googletype_Decimal | null): number {
  const parsed = parseDecimalNumber(value?.value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `$0.41`, or `0.41` when the currency is not one `Intl` knows.
 *
 * THE TRY/CATCH IS LOAD-BEARING. `Intl.NumberFormat` throws `RangeError` on an unknown currency
 * code, and the code is on the wire precisely so the bar never hard-codes `$` — so a server that
 * one day answers with something this runtime does not recognise would otherwise take the studio
 * white on a money label.
 */
export function formatMoney(amount: number, currency: string): string {
  const code = (currency ?? '').trim().toUpperCase();
  if (code) {
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: code,
        // `narrowSymbol`, or an en-GB locale renders USD as `US$0.41` — technically correct and
        // unreadable in a one-line money bar that already says which day it is about.
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      /* falls through to the plain number below */
    }
  }
  return amount.toFixed(2);
}

/**
 * The band's money bar, or null.
 *
 * NULL IS A FIRST-CLASS ANSWER: every money field is stripped for an account without
 * `costing:read`, and the contract says such a band must show NO BAR AT ALL — a bar with blanks in
 * it reads as «the budget is zero», which is a different and false statement. A cap of zero is read
 * the same way: no ceiling was stated, so no ceiling is claimed and nothing is ever refused on it.
 */
export function budgetLine(band: GetDesignBandResponse): BudgetLine | null {
  const budget = band.budget;
  if (!budget) return null;
  const cap = decimalNumber(budget.cap);
  if (cap <= 0) return null;
  const spent = decimalNumber(budget.spent);
  const reserved = decimalNumber(budget.reserved);
  const currency = (budget.currency ?? '').trim();
  const booked = spent + reserved;
  const reservedText = reserved > 0 ? ` · ${formatMoney(reserved, currency)} reserved` : '';
  return {
    spent,
    reserved,
    cap,
    currency,
    booked,
    exhausted: booked >= cap,
    text: `today ${formatMoney(spent, currency)} of ${formatMoney(cap, currency)}${reservedText}`,
  };
}

/* ─────────────────────────── the two gates ─────────────────────────── */

export type Gate = { ok: true } | { ok: false; reason: string };

/**
 * THE GATE NAMES WHAT IS MISSING, NEVER THE PROFILE.
 *
 * The prototype's refusal quotes the prompt profile («profile flat-to-fabric @ v2 wants front and
 * back») because the prototype invented one. This admin cannot: `profile_name` / `profile_version`
 * are OUTPUT-ONLY on a run — pinned by the server at launch and unknowable before it — and prompt
 * profiles are server configuration that no card field reads. So the reason states the requirement
 * itself, which is the half of that sentence the technologist can act on anyway.
 */
export function renderGate(band: GetDesignBandResponse): Gate {
  const budget = budgetLine(band);
  if (budget?.exhausted) {
    return {
      ok: false,
      reason: `today's ceiling is reached — ${formatMoney(budget.booked, budget.currency)} of ${formatMoney(budget.cap, budget.currency)} is already spent or reserved`,
    };
  }
  const sides = benchSides(band);
  const missing = sides
    .filter((side) => side.view === 'front' || side.view === 'back')
    .filter((side) => !side.picture)
    .map((side) => viewLabel(side.view));
  if (missing.length) {
    return {
      ok: false,
      reason: `a fabric render is coloured over the flats on the bench — front and back must hold a drawing; missing: ${missing.join(', ')}`,
    };
  }
  return { ok: true };
}

/**
 * THE SERVER'S OWN ANSWER TO «MAY 3D BE ASKED FOR AT ALL» — W-13, read and never recomputed.
 *
 * `has_fabric_render` is on the band response precisely so the interface does not have to derive
 * it: `StartDesignRun` refuses `kind=threed` without an unhidden fabric render, and a client
 * counting renders off the page it was handed would be wrong by exactly the renders that are NOT on
 * that page — the usual case on a card with any history. So a screen that computed its own answer
 * would draw the door open and collect a refusal, or draw it shut over a card that is ready.
 *
 * `undefined` IS NOT `false`. A rolled-back binary answers without the field; reading its silence
 * as «no render» would lock 3D on every card that server serves. Absence means «this server does
 * not state it», and the honest reaction is to say nothing and let the server refuse if it must.
 */
export function fabricRenderGate(band: GetDesignBandResponse): Gate {
  if (band.hasFabricRender === false) {
    return {
      ok: false,
      reason:
        '3D turns a fabric render, and this card owns none that is visible — draw the flats, ' +
        'render them, then come back. The refusal is the server’s: a run of kind 3D is rejected ' +
        'without one',
    };
  }
  return { ok: true };
}

export function threedGate(band: GetDesignBandResponse): Gate {
  // THE SERVER'S REFUSAL COMES FIRST, so the client's first sentence about 3D is the same sentence
  // the server would answer with. The finer conditions below are about assembling ONE turntable out
  // of four sides and are the client's own; they can only narrow this, never widen it.
  const fabric = fabricRenderGate(band);
  if (!fabric.ok) return fabric;
  const budget = budgetLine(band);
  if (budget?.exhausted) {
    return {
      ok: false,
      reason: `today's ceiling is reached — ${formatMoney(budget.booked, budget.currency)} of ${formatMoney(budget.cap, budget.currency)} is already spent or reserved`,
    };
  }
  const byView = latestRenderByView(band);
  const missing = SILHOUETTE_VIEWS.filter((view) => !byView[view]).map((view) => viewLabel(view));
  if (missing.length) {
    return {
      ok: false,
      reason: `3D turns the renders of all four sides — missing: ${missing.join(', ')}`,
    };
  }
  const revs = renderRevisions(byView);
  if (revs.length > 1) {
    return {
      ok: false,
      reason: `four sides of ONE revision r — now mixing ${revs.map((r) => `r${r}`).join(' and ')}`,
    };
  }
  return { ok: true };
}

/* ─────────────────────────── the colour recipe ─────────────────────────── */

/**
 * The three ways a colour can be stated. AN OPEN STRING ON THE WIRE, and this is what this bundle
 * understands — `code` is a dictionary colour, `hex` is one typed by hand, `fabric_media_id` is a
 * photograph. `DesignColourRecipe` carries exactly those three fields, which is where the list
 * comes from; it is not a guess about a vocabulary nobody wrote down.
 */
export const COLOUR_SOURCES = ['dictionary', 'own', 'photo'] as const;
export type ColourSource = (typeof COLOUR_SOURCES)[number];

export const COLOUR_SOURCE_LABEL: Record<ColourSource, string> = {
  dictionary: 'dictionary',
  own: 'own colour',
  photo: 'fabric photo',
};

/** The default recipe of a card that has never rendered: a dictionary colour, nothing chosen. */
export const EMPTY_RECIPE: common_DesignColourRecipe = {
  source: 'dictionary',
  code: '',
  hex: '',
  words: '',
  fabricMediaId: 0,
};

/**
 * Which of the three a stored recipe is.
 *
 * An unrecognised or absent `source` is answered from the POPULATED FIELD rather than from a
 * default, so a recipe minted by a server that spells the sources differently still restores as the
 * thing it actually is instead of silently becoming a dictionary colour with no code.
 */
export function colourSourceOf(recipe?: common_DesignColourRecipe | null): ColourSource {
  const raw = (recipe?.source ?? '').trim().toLowerCase();
  if (raw === 'dictionary' || raw === 'own' || raw === 'photo') return raw;
  if ((recipe?.fabricMediaId ?? 0) > 0) return 'photo';
  if ((recipe?.code ?? '').trim()) return 'dictionary';
  if ((recipe?.hex ?? '').trim()) return 'own';
  return 'dictionary';
}

/** A stable identity for a recipe — the key of a history chip and the join onto a run. */
export function colourRecipeKey(recipe?: common_DesignColourRecipe | null): string {
  return [
    colourSourceOf(recipe),
    (recipe?.code ?? '').trim().toUpperCase(),
    (recipe?.hex ?? '').trim().toLowerCase(),
    (recipe?.words ?? '').trim().toLowerCase(),
    String(recipe?.fabricMediaId ?? 0),
  ].join('|');
}

export function findDictionaryColour(
  colors: readonly common_Color[] | undefined,
  code?: string | null,
): common_Color | null {
  const wanted = (code ?? '').trim().toUpperCase();
  if (!wanted) return null;
  return (colors ?? []).find((c) => (c.code ?? '').trim().toUpperCase() === wanted) ?? null;
}

/**
 * The swatch fill of a recipe, or '' when there is no colour to paint (a fabric photo, or a
 * dictionary code this card's dictionary does not carry). '' is drawn as a striped surface, never
 * as black — an unknown colour that paints itself black is a lie a swatch tells convincingly.
 */
export function colourSwatchHex(
  recipe: common_DesignColourRecipe | null | undefined,
  colors: readonly common_Color[] | undefined,
): string {
  const source = colourSourceOf(recipe);
  if (source === 'photo') return '';
  if (source === 'own') return (recipe?.hex ?? '').trim();
  const entry = findDictionaryColour(colors, recipe?.code);
  return (entry?.hex ?? recipe?.hex ?? '').trim();
}

/** The short name of a recipe — the caption of a chip. */
export function colourLabel(
  recipe: common_DesignColourRecipe | null | undefined,
  colors: readonly common_Color[] | undefined,
): string {
  const source = colourSourceOf(recipe);
  if (source === 'photo') return 'fabric photo';
  if (source === 'own') return (recipe?.hex ?? '').trim() || 'own colour';
  const code = (recipe?.code ?? '').trim().toUpperCase();
  if (!code) return 'no colour picked';
  const entry = findDictionaryColour(colors, code);
  return entry?.name ? `${code} · ${entry.name}` : code;
}

/** The line under the name: where the colour comes from, and what goes into the prompt with it. */
export function colourSubtitle(
  recipe: common_DesignColourRecipe | null | undefined,
  colors: readonly common_Color[] | undefined,
): string {
  const source = colourSourceOf(recipe);
  if (source === 'photo') {
    return (recipe?.fabricMediaId ?? 0) > 0
      ? 'the photo goes into the prompt as an image'
      // NOT «pick one below»: on a read-only card there is nothing below to pick with, and a line
      // that names a control which is not there is the smallest kind of lie a screen can tell.
      : 'no fabric photo yet';
  }
  if (source === 'own') {
    return 'own colour · visualisation override — cannot become canonical';
  }
  const code = (recipe?.code ?? '').trim().toUpperCase();
  if (!code) return 'colour dictionary — nothing picked yet';
  const entry = findDictionaryColour(colors, code);
  if (!entry) {
    return `colour dictionary · ${code} is not in this dictionary — the code travels, the hex cannot`;
  }
  return `colour dictionary · ${(entry.hex ?? '').trim() || 'no hex stated'}`;
}

/** A recipe that could be submitted: something has actually been picked. */
export function recipeIsStated(recipe?: common_DesignColourRecipe | null): boolean {
  switch (colourSourceOf(recipe)) {
    case 'photo':
      return (recipe?.fabricMediaId ?? 0) > 0;
    case 'own':
      return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((recipe?.hex ?? '').trim());
    default:
      return !!(recipe?.code ?? '').trim();
  }
}

/* ─────────────────────────── the colour history ─────────────────────────── */

export type ColourChip = {
  key: string;
  recipe: common_DesignColourRecipe;
  /** The newest render run that used this recipe, when it is on the loaded page. */
  run: common_DesignRun | null;
  rrev: number;
  pictures: number;
  archived: boolean;
  /** The bench has moved since that run — the chip restores a recipe, not a composition. */
  stale: boolean;
};

/** view → the media id standing in that silhouette slot right now. 0 = the slot is empty. */
function benchMediaByView(band: GetDesignBandResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const side of benchSides(band)) {
    out[side.view] = side.picture?.media?.id ?? 0;
  }
  return out;
}

/** view → the media id that side held when the run was launched. 0 = it held nothing. */
function snapshotMediaByView(run: common_DesignRun): Record<string, number> {
  const out: Record<string, number> = {};
  for (const view of SILHOUETTE_VIEWS) out[view] = 0;
  for (const slot of run.inputs?.slots ?? []) {
    const view = normaliseViewKey(slot.viewKey);
    if (!isSilhouetteView(view)) continue;
    out[view] = slot.mediaId || slot.media?.id || 0;
  }
  return out;
}

/**
 * THE CHIPS OF THE COLOUR HISTORY — «the same run ladder, sliced by colour».
 *
 * THE SOURCE IS `band.colourRecipes`, NOT `band.runs`, and the difference matters on a busy card:
 * the recipes are computed over the WHOLE band, newest first, while the runs are one page. So every
 * colour this card has ever rendered gets a chip; the `r4 · 3 pictures` tail is added only for the
 * ones whose run is on the page, because a tail invented from nothing would be worse than a chip
 * that only offers to restore the recipe — which is all a chip ever does anyway. The contract says
 * as much: a chip restores a RECIPE and never a picture.
 */
export function colourChips(band: GetDesignBandResponse): ColourChip[] {
  const bench = benchMediaByView(band);
  const bestRun = new Map<string, common_DesignRun>();
  for (const run of band.runs ?? []) {
    if ((run.kind ?? '').trim().toLowerCase() !== 'render') continue;
    const key = colourRecipeKey(run.params?.colour);
    const held = bestRun.get(key);
    if (!held || (run.rrev ?? 0) > (held.rrev ?? 0)) bestRun.set(key, run);
  }

  const seen = new Set<string>();
  const chips: ColourChip[] = [];
  for (const recipe of band.colourRecipes ?? []) {
    if (!recipe) continue;
    const key = colourRecipeKey(recipe);
    if (seen.has(key)) continue;
    seen.add(key);
    const run = bestRun.get(key) ?? null;
    const snapshot = run ? snapshotMediaByView(run) : null;
    chips.push({
      key,
      recipe,
      run,
      rrev: run?.rrev ?? 0,
      pictures: (run?.pictures ?? []).filter((p) => !isPictureHidden(p)).length,
      archived: !!(run?.archivedAt ?? '').trim(),
      stale: !!snapshot && SILHOUETTE_VIEWS.some((view) => snapshot[view] !== bench[view]),
    });
  }
  return chips;
}

/* ─────────────────────────── the 3D submission ─────────────────────────── */

/**
 * The three shapes a turntable comes back in. `frames` IS A NUMBER ON THE WIRE
 * (`DesignThreedParams.frames`), so the label is presentation and the number is the submission —
 * the prototype's `'turntable 12'` string was a prototype's convenience and must not travel.
 */
export const FRAME_CHOICES = [
  { frames: 12, label: 'turntable 12' },
  { frames: 24, label: 'turntable 24' },
  { frames: 4, label: '4 angles' },
] as const;

export const PRESENTATIONS = [
  { value: 'air', label: 'in the air' },
  { value: 'model', label: 'on a model' },
] as const;

export type Presentation = (typeof PRESENTATIONS)[number]['value'];

/**
 * THE FIT VOCABULARY, AND IT IS RESTATED HERE UNDER PROTEST.
 *
 * The card's own list lives in `style-facts-field.tsx` as a private `const FIT_OPTIONS` that is not
 * exported, and this wave may not edit that file. So the same vocabulary now exists twice, which is
 * exactly the drift `./views.ts` was written to end — a list duplicated per screen rots silently,
 * and the symptom would be a 3D override offering a fit the classification block refuses.
 *
 * IT IS THE APP'S LIST, NOT THE PROTOTYPE'S. The prototype offers `oversized` and no
 * `skinny/cropped/tailored`, and its own source marks that list «НЕ ответ владельцу». The card is
 * the single place of truth about fit, so the override may only offer fits the card can hold.
 *
 * TO FIX: export `FIT_OPTIONS` from `style-facts-field.tsx` (or lift it beside `views.ts`) and
 * delete this constant.
 */
export const FIT_OPTIONS = [
  'regular',
  'slim',
  'loose',
  'relaxed',
  'skinny',
  'cropped',
  'tailored',
] as const;

/**
 * The fits the 3D override may offer: the app's vocabulary MINUS the card's own.
 *
 * The card's fit is not dropped, it MOVES — the picker's first entry is `card · <fit>`, a sentinel
 * meaning «no override», and listing the same value twice would make «card · slim» and «slim» read
 * as two different submissions when they are one. A card carrying a fit outside this list (an older
 * record, a value seeded before the list settled) still keeps it: the sentinel prints whatever the
 * card holds, whether or not this bundle has heard of it.
 */
export function fitChoices(cardFit: string): string[] {
  const fit = (cardFit ?? '').trim();
  return FIT_OPTIONS.filter((f) => f !== fit);
}

/* ─────────────────────────── provenance, at strip width ─────────────────────────── */

/**
 * `AI · run 5`, `uploaded · T.` — the provenance line of a cell in an input strip.
 *
 * NOT `slotFootnote`, WHICH IS THE BENCH'S. That one composes the label, the spoken handle AND the
 * batch's whole stamp — `AI · run 5 · run 5 · a`, or `uploaded · upload 1 · a · T. · 09:00 · 12 MB
 * · 3 files` — which is right under a 196px bench plate with a whole footer to itself, and is four
 * wrapped lines under a 132px strip cell that has three. The strip asks a narrower question, so it
 * gets the narrower answer, and it is the prototype's own: the machine and its run, or the hand and
 * whose it was.
 */
export function stripProvenance(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): string {
  const provenance = readProvenance(picture);
  const parts = [provenanceLabel(provenance)];
  if (provenance.batchId) {
    const batch = (band.batches ?? []).find((b) => b.id === provenance.batchId);
    const author = (batch?.author ?? '').trim();
    if (author) parts.push(author);
  }
  const mixed = mixedInputNote(provenance);
  if (mixed) parts.push(mixed);
  return parts.filter(Boolean).join(' · ');
}

/* ─────────────────────────── frames and thumbnails ─────────────────────────── */

/**
 * The address of the file to draw in a strip cell. Thumbnail first — a cell is 132px wide, not
 * 2000 — and never a bare `media.id`, which draws nothing.
 */
export function pictureThumb(picture?: common_DesignPicture | null): string {
  const media = picture?.media?.media;
  return media?.thumbnail?.mediaUrl || media?.compressed?.mediaUrl || media?.fullSize?.mediaUrl || '';
}

export function mediaThumb(media?: common_MediaFull | null): string {
  const item = media?.media;
  return item?.thumbnail?.mediaUrl || item?.compressed?.mediaUrl || item?.fullSize?.mediaUrl || '';
}
