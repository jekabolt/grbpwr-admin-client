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
 * ═══ THE SIX SILHOUETTES (round 18, D-28) ═══════════════════════════════════════════════════════
 *
 * Owner, verbatim: «добавить три четверти лево и право в слоты и как опцию генерации».
 *
 * The server already speaks six — its own enumeration reads «front | back | side_l | side_r |
 * three_quarter_l | three_quarter_r» on every field that names a side (`ghost_view`,
 * `composite_views`, the bench's `view_key`, `StartDesignRunParams.views`), and the render bench
 * mints a three-quarter slot lazily like any other. So this list is not a client invention: it is
 * the wire's own order, in the order the wire states it — front, back, the sides, then the
 * three-quarters. Every bench, every «which sides» chip row and every slot picker reads THIS list
 * and therefore grew to six by construction; nothing had to be told.
 *
 * ⚠ EXCEPT 3D, AND THAT EXCEPTION HAS A NAME — `CARDINAL_VIEWS` below. Read it before enumerating
 * sides for anything a 3D run touches.
 */
export const SILHOUETTE_VIEWS = [
  'front',
  'back',
  'side_l',
  'side_r',
  'three_quarter_l',
  'three_quarter_r',
] as const;
export type SilhouetteView = (typeof SILHOUETTE_VIEWS)[number];

/**
 * ═══ THE FOUR A 3D RUN READS — `DesignCardinalViews` on the server ═════════════════════════════
 *
 * Meshy and fal take exactly four NAMED image slots — front, back, left, right — and nothing else.
 * So the server assembles a 3D run from the cardinal render slots only, and a three-quarter render
 * standing on the render bench feeds no 3D run whatever the screen shows. A 3D reader that
 * enumerates `SILHOUETTE_VIEWS` would draw two sides the provider cannot take and, worse, send
 * their picture ids in `source_picture_ids` — a request the server refuses for free, but a screen
 * that promised the person a six-sided turntable.
 *
 * ⚠ WHO MUST READ THIS LIST INSTEAD OF THE SIX (the client's 3D readers, by address):
 *   · `render/model.ts` — `threedSides` (the mirror of the render bench the 3D input draws) and
 *     `turntableSourceIds` (the ids a 3D run is built from, «in view order»);
 *   · `render/threed-input-strip.tsx` — the `mark ▸` list of a loose render on the 3D input.
 * Two other readers stay on the six on purpose: `benchSides` (a bench IS six slots now) and
 * `RENDER_SHEET_ORDER` (a render sheet walks around the garment; it must NAME the three-quarters or
 * a filled three-quarter slot is silently not asked for).
 */
export const CARDINAL_VIEWS = ['front', 'back', 'side_l', 'side_r'] as const;
export type CardinalView = (typeof CARDINAL_VIEWS)[number];

/** `detail` is a view key like any other on the wire, but it is never a silhouette slot: a detail
 *  hangs under its own NAME, and the name is what the sheet cites it by. */
export const DETAIL_VIEW = 'detail';

export const DESIGN_VIEW_KEYS = [...SILHOUETTE_VIEWS, DETAIL_VIEW] as const;
export type DesignViewKey = (typeof DESIGN_VIEW_KEYS)[number];

/**
 * The one casing. Lower case with a capitalised side letter: `side L` reads as a side named L,
 * `SIDE L` reads as a shout, and the admin's own type scale already uppercases labels where it
 * wants them uppercase (`Text variant='uppercase'`). Casing belongs to the presentation, not to the
 * string — an organ that wants shouting asks the type system for it and does not bake it in here.
 *
 * `three-quarter L` and not `¾ L`: the glyph reads as a fraction of a side in a 9px cell, and the
 * owner named the view in words. Fifteen characters fit the narrowest cell of the band (132px, about
 * twenty-four nano characters) with room for the badge beside it.
 */
const VIEW_LABELS: Record<string, string> = {
  front: 'front',
  back: 'back',
  side_l: 'side L',
  side_r: 'side R',
  three_quarter_l: 'three-quarter L',
  three_quarter_r: 'three-quarter R',
  detail: 'detail',
};

/**
 * Both spellings of the sides are accepted on input, because both are already in the wild: the
 * prototype's state uses `sideL`, the wire and the database CHECK use `side_l`. Normalising on read
 * means a row written by either one lands in the same slot instead of creating a second, invisible
 * side. The three-quarters get the same courtesy for the same camel-cased spelling and nothing
 * more — a third spelling the wire has never carried would be an invention here.
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

export function isSilhouetteView(key?: string | null): boolean {
  return (SILHOUETTE_VIEWS as readonly string[]).includes(normaliseViewKey(key));
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
 * A view that is not a silhouette (`detail`, empty, a key from a newer server) leaves the drawing
 * order untouched.
 */
export function sidesLeadingWith(view?: string | null): SilhouetteView[] {
  const lead = normaliseViewKey(view);
  const rest = SILHOUETTE_VIEWS.filter((side) => side !== lead);
  return isSilhouetteView(lead) ? [lead as SilhouetteView, ...rest] : [...rest];
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
 * Six sides did not move it (D-28): a three-quarter is a view the sheet MAY carry, not one a cutter
 * cannot work without.
 */
export const SHEET_MIN_VIEWS: readonly string[] = ['front', 'back'];
