/**
 * THE VIEW VOCABULARY — one spelling, one casing, one place.
 *
 * This module exists because of a defect, not a preference. Three organs of this band were built in
 * parallel and each one spelled the sides for itself: the bench had `SILHOUETTE_VIEWS` with the
 * label `side L`, the mint dialog had `SILHOUETTE_VIEWS` with the label `SIDE L` (that dialog has
 * since been removed along with the sheet's versions; its copy died with it and was not rehomed),
 * and the split modal had `DESIGN_VIEW_KEYS`. Nothing was broken enough to fail a type check — the
 * keys agreed —
 * but the SAME side read differently on three screens, and a fourth organ would have invented a
 * fourth spelling. A vocabulary duplicated per screen drifts silently and by construction.
 *
 * WHY THE KEYS ARE A CLIENT CONSTANT AND NOT A DICTIONARY. The wire carries `view_key` as an open
 * string (`DesignBenchSlotRef.viewKey`, `DesignSplitFrame.viewKey`) and the server's CHECK on
 * `tech_card_media.kind` is the nearest thing to an enumeration. So the client cannot READ this
 * list from anywhere; it can only agree with itself. Which is exactly what this file is for.
 */

/**
 * ═══ THE FOUR ACTIVE SIDES (wave 2026-09-25, D-18 / D-18') ════════════════════════════════════
 *
 * Owner, verbatim: «в разделе flats давай все же уберем 3/4 LEFT и 3/4 RIGHT и вообще везде».
 *
 * This is the list every screen OFFERS: every bench strip, every «which sides» chip row, every
 * slot picker, every role select and every sheet order reads it, so the three-quarters left all of
 * them by construction. It replaces `SILHOUETTE_VIEWS` (round 18, D-28, six sides) under a new
 * name ON PURPOSE: the old name answered «is this a side?», and the moment the list shrank that
 * question got a wrong answer for every stored three-quarter row — «not a side, therefore a
 * detail» (Codex M-11). Renaming made every reader of the old name stop at the type checker and
 * choose, out loud, what it does with a retired view.
 *
 * ⚠ THE SERVER STILL SPEAKS SIX, AND NOTHING HERE ASKS IT TO FORGET. `view_key`, `ghost_view`,
 * `composite_views`, `DesignReference.role` and `params.views` are open strings on the wire, and
 * cards on beta/production carry three-quarter plates and roles. So the two retired keys are not
 * deleted from the vocabulary — they move to `LEGACY_VIEWS` below, where they are UNDERSTOOD
 * (normalised, labelled `3/4 left (legacy)`) but never OFFERED.
 *
 * ⚠ 3D HAS ITS OWN FOUR — `CARDINAL_VIEWS` below. Today they are the same four; they are not the
 * same fact, and a 3D reader names the provider's list, not this one.
 */
export const ACTIVE_VIEWS = ['front', 'back', 'side_l', 'side_r'] as const;
export type ActiveView = (typeof ACTIVE_VIEWS)[number];

/**
 * ═══ THE TWO RETIRED VIEWS — KNOWN, SHOWN, NEVER OFFERED (D-18', Codex B-08) ═══════════════════
 *
 * What stays true for a three-quarter row already written:
 *   · a FILLED flat slot is drawn in the bench's own row «legacy views (N)» with exactly one
 *     door — ✕ (unmark) — because it may still travel into a run or print on the sheet, and a
 *     plate nobody can see or take off is the worst of the three options (keep · show · drop);
 *   · an EMPTY one is not drawn at all — there is nothing on it to take off;
 *   · a reference ROLE of that view stays visible in its select as a disabled item, so the select
 *     does not emit Radix's phantom '' and silently DELETE the role on the server; the person can
 *     move it to «— not sent —» explicitly;
 *   · history prints it as it was, with the word «legacy».
 * What is never true: a three-quarter row filed as a DETAIL. «Not active» is not «detail» — every
 * classifier asks `isLegacyView` before it lets a row fall through (`readBench`, `slotOfPicture`).
 */
export const LEGACY_VIEWS = ['three_quarter_l', 'three_quarter_r'] as const;
export type LegacyView = (typeof LEGACY_VIEWS)[number];

/**
 * ═══ THE FOUR A 3D RUN READS — `DesignCardinalViews` on the server ═════════════════════════════
 *
 * Meshy and fal take exactly four NAMED image slots — front, back, left, right — and nothing else.
 * So the server assembles a 3D run from the cardinal render slots only, and a three-quarter render
 * standing on the render bench feeds no 3D run whatever the screen shows.
 *
 * SINCE 2026-09-25 THIS IS THE SAME SET AS `ACTIVE_VIEWS`, AND IT STAYS A SEPARATE NAME. The two
 * lists answer different questions — «what does the provider read» and «what does this admin
 * offer» — and if the owner ever brings a view back to the benches, 3D must not grow with it.
 * The 3D readers name this list: `turntableSourceIds` (`render/model.ts`, the ids a 3D run is built
 * from, «in view order») and the `read by 3D` word of `render/side-row.tsx`.
 */
export const CARDINAL_VIEWS = ['front', 'back', 'side_l', 'side_r'] as const;
export type CardinalView = (typeof CARDINAL_VIEWS)[number];

/** `detail` is a view key like any other on the wire, but it is never a silhouette slot: a detail
 *  hangs under its own NAME, and the name is what the sheet cites it by. */
export const DETAIL_VIEW = 'detail';

/** What a picker of «which view is this» OFFERS: the four active sides and `detail`. A retired
 *  three-quarter is never offered — `isKnownViewKey` below is the wider question «does the wire
 *  know this key», for readers that mirror a server condition rather than draw a list. */
export const DESIGN_VIEW_KEYS = [...ACTIVE_VIEWS, DETAIL_VIEW] as const;
export type DesignViewKey = (typeof DESIGN_VIEW_KEYS)[number];

/**
 * The one casing: lower case, all of it. The admin's own type scale uppercases labels where it
 * wants them uppercase (`Text variant='uppercase'`), so casing belongs to the presentation, not to
 * the string — an organ that wants shouting asks the type system for it and does not bake it in
 * here.
 *
 * THE SIDES ARE SPELLED IN WORDS AND THE THREE-QUARTERS AS A FRACTION — the owner's ruling on the
 * beta (2026-09-06), verbatim: «вместо THREE-QUARTER R пиши 3/4 right и тд». So `side left`, not
 * `side L`; `3/4 right`, not `three-quarter R`. The earlier argument for `three-quarter L` («the
 * owner named the view in words», «fifteen characters fit the narrowest cell») is retired by that
 * word: `3/4 right` is nine characters and reads as a side at a glance, which is the whole point of
 * a label on a 9px cell. `¾` is still not used — the single glyph shrinks to a smudge at nano size
 * and the owner wrote the fraction with a slash.
 *
 * THE RETIRED TWO CARRY THE WORD «legacy» (D-18, 2026-09-25). Wherever an old row still names one —
 * a plate in the bench's legacy row, a reference role, a frozen run's inputs, a composite's views —
 * the label says that this view is no longer offered, instead of looking like a live option that
 * vanished from every picker.
 */
const VIEW_LABELS: Record<string, string> = {
  front: 'front',
  back: 'back',
  side_l: 'side left',
  side_r: 'side right',
  three_quarter_l: '3/4 left (legacy)',
  three_quarter_r: '3/4 right (legacy)',
  detail: 'detail',
};

/**
 * Both spellings of the sides are accepted on input, because both are already in the wild: the
 * prototype's state uses `sideL`, the wire and the database CHECK use `side_l`. Normalising on read
 * means a row written by either one lands in the same slot instead of creating a second, invisible
 * side. The three-quarters get the same courtesy for the same camel-cased spelling and nothing
 * more — a third spelling the wire has never carried would be an invention here. They are retired
 * (`LEGACY_VIEWS`), not forgotten: a stored `threeQuarterL` must still land in the legacy row, not
 * in the details.
 */
export function normaliseViewKey(key?: string | null): string {
  const k = (key ?? '').trim().toLowerCase();
  if (!k) return '';
  if (k === 'sidel') return 'side_l';
  if (k === 'sider') return 'side_r';
  if (k === 'threequarterl') return 'three_quarter_l';
  if (k === 'threequarterr') return 'three_quarter_r';
  return k;
}

/**
 * An unknown key is echoed back rather than replaced with a guess or with «unknown». The vocabulary
 * is open on the wire, so a key this bundle has not heard of is a key from a newer server — showing
 * it verbatim is the only answer that does not invent a fact.
 */
export function viewLabel(key?: string | null): string {
  const k = normaliseViewKey(key);
  if (!k) return '';
  return VIEW_LABELS[k] ?? k.replace(/_/g, ' ');
}

/** One of the four sides this admin offers. ⚠ `false` does NOT mean «detail» — ask
 *  `isLegacyView` first (Codex M-11). */
export function isActiveView(key?: string | null): boolean {
  return (ACTIVE_VIEWS as readonly string[]).includes(normaliseViewKey(key));
}

/** A retired three-quarter: understood on read, never offered (D-18'). */
export function isLegacyView(key?: string | null): boolean {
  return (LEGACY_VIEWS as readonly string[]).includes(normaliseViewKey(key));
}

/**
 * Does the WIRE know this key — an active side, a retired one or `detail`. For readers that mirror
 * a server condition (the server still accepts all seven, e.g. `IsDesignGhostView`), never for a
 * list a person picks from.
 */
export function isKnownViewKey(key?: string | null): boolean {
  return isActiveView(key) || isLegacyView(key) || isDetailView(key);
}

export function isCardinalView(key?: string | null): boolean {
  return (CARDINAL_VIEWS as readonly string[]).includes(normaliseViewKey(key));
}

export function isDetailView(key?: string | null): boolean {
  return normaliseViewKey(key) === DETAIL_VIEW;
}

/**
 * ═══ THE SIDES, WITH THE ONE THIS PICTURE IS SAID TO BE STANDING FIRST (D-6) ═══════════════════
 *
 * Owner, verbatim: «после сплита мы уже знаем какая это деталь и в пикере отметок она должна быть
 * первой» and, on the input strips, «после сплита мы же знаем что это за деталь почему бы ее не
 * показывать первой в разделе марк».
 *
 * WHAT «WE KNOW» IS, PRECISELY. On a crop, `ghost_view` is the view the person NAMED on the frame in
 * the split window (`DesignSplitFrame.view_key` — «it becomes the crop's ghost_view»); on a root it
 * is the machine's guess, routinely wrong on front/back. Nothing else on the wire names a cut
 * piece's side: `derived_from` says which sheet, `derivation` says «crop», and the parent's
 * `composite_views` lists what was glued in without saying which piece is which. So the one fact to
 * lead with is the ghost, and the difference between «named» and «guessed» is not drawn here —
 * because both are expressed the same way, AS ORDER AND NOTHING ELSE (F-17): the guess shortens
 * the reach and claims nothing, and a claim on a picker whose choice is a paid run's input would
 * be a confirmation nobody made.
 *
 * ONE SPELLING FOR FOUR PICKERS. Three organs hand-wrote this sort before this function existed —
 * the slot picker of the feed, the `mark ▸` of the flats input, the `mark ▸` of the 3D input — and
 * the fourth (`mark ▸` in RENDERS OF THIS CARD, `render/outputs.tsx`) did not, which is the defect
 * D-6 names: the same cut piece led with its own side on one screen and with «front» on the next.
 * A view that is not an active side (`detail`, empty, a retired three-quarter, a key from a newer
 * server) leaves the drawing order untouched — a crop cut as «3/4 left» before the retirement is
 * offered the four live sides, never its own retired one back.
 */
export function sidesLeadingWith(view?: string | null): ActiveView[] {
  const lead = normaliseViewKey(view);
  const rest = ACTIVE_VIEWS.filter((side) => side !== lead);
  return isActiveView(lead) ? [lead as ActiveView, ...rest] : [...rest];
}

/**
 * WHAT THE SHEET NEEDS AT MINIMUM — front and back.
 *
 * A CLIENT CONSTANT, AND SAYING SO IS THE POINT: the contract carries no «what the sheet requires»
 * field, so this is the client agreeing with itself about a rule the server does not enforce. The
 * bench reads it to mark those two slots REQUIRED, and marking is the whole of it — nothing here
 * refuses. Refusing on a rule the server does not know would make the two disagree about whether a
 * card is finished, and the server would win.
 *
 * (Two more organs read it and are gone: the sheet bar, which said what was missing, and the mint
 * dialog, which warned before minting. Both went out with the sheet's versions. The rule outlived
 * them because it was never about minting — front and back are what a person needs in order to cut
 * a garment, whatever ceremony sits downstream of that.)
 *
 * Six sides did not move it (D-28), and four do not either (D-18): a three-quarter was a view the
 * sheet MAY carry, never one a cutter cannot work without.
 */
export const SHEET_MIN_VIEWS: readonly string[] = ['front', 'back'];
