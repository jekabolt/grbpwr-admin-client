/**
 * THE VIEW VOCABULARY — one spelling, one casing, one place.
 *
 * This module exists because of a defect, not a preference. Three organs of this band were built in
 * parallel and each one spelled the sides for itself: the bench had `SILHOUETTE_VIEWS` with the
 * label `side L`, the mint dialog had `SILHOUETTE_VIEWS` with the label `SIDE L`, and the split
 * modal had `DESIGN_VIEW_KEYS`. Nothing was broken enough to fail a type check — the keys agreed —
 * but the SAME side read differently on three screens, and a fourth organ would have invented a
 * fourth spelling. A vocabulary duplicated per screen drifts silently and by construction.
 *
 * WHY THE KEYS ARE A CLIENT CONSTANT AND NOT A DICTIONARY. The wire carries `view_key` as an open
 * string (`DesignBenchSlotRef.viewKey`, `DesignSplitFrame.viewKey`) and the server's CHECK on
 * `tech_card_media.kind` is the nearest thing to an enumeration. So the client cannot READ this
 * list from anywhere; it can only agree with itself. Which is exactly what this file is for.
 */

/** The four silhouettes, in the order they are drawn on every screen: front, back, then the sides. */
export const SILHOUETTE_VIEWS = ['front', 'back', 'side_l', 'side_r'] as const;
export type SilhouetteView = (typeof SILHOUETTE_VIEWS)[number];

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
 */
const VIEW_LABELS: Record<string, string> = {
  front: 'front',
  back: 'back',
  side_l: 'side L',
  side_r: 'side R',
  detail: 'detail',
};

/**
 * Both spellings of the sides are accepted on input, because both are already in the wild: the
 * prototype's state uses `sideL`, the wire and the database CHECK use `side_l`. Normalising on read
 * means a row written by either one lands in the same slot instead of creating a second, invisible
 * side.
 */
export function normaliseViewKey(key?: string | null): string {
  const k = (key ?? '').trim().toLowerCase();
  if (!k) return '';
  if (k === 'sidel') return 'side_l';
  if (k === 'sider') return 'side_r';
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

export function isDetailView(key?: string | null): boolean {
  return normaliseViewKey(key) === DETAIL_VIEW;
}

/**
 * WHAT THE SHEET NEEDS AT MINIMUM — front and back.
 *
 * A CLIENT CONSTANT, AND SAYING SO IS THE POINT: the contract carries no «what the sheet requires»
 * field, so this is the client agreeing with itself about a rule the server does not enforce. The
 * sheet bar reads it to say what is missing, and the mint dialog reads it to warn. Neither refuses
 * on it — refusing on a rule the server does not know would make the two disagree about whether a
 * card is mintable, and the server would win.
 */
export const SHEET_MIN_VIEWS: readonly string[] = ['front', 'back'];
