/**
 * ═══ IDEAS — STATIC STARTING PHRASES PER PROMPT FIELD (PLAYGROUND C-02, D5) ══════════════════════
 *
 * The `Ideas ▾` menu of a playground prompt inserts one of these at the caret. They are fixed lists,
 * not a model call: `EnhanceText` refuses blank text and sees no picture, so it cannot suggest
 * anything for an empty field (D5). Phase 3 may replace them with a `SuggestPrompts` RPC; the shape
 * `ideasFor(workflow, field) → string[]` stays.
 *
 * Keys are the workflow keys of the grid (`playground_workflows`, B-01) and the field keys the
 * registry gives each prompt. A pair with no list gets `[]`, and the field then draws no Ideas door
 * at all rather than an empty menu.
 *
 * Each phrase is short, concrete and in the words a person would type: a pose, a place, a garment
 * part. Nothing brand-specific, nothing that promises a result the route cannot give.
 */

const RETOUCH: readonly string[] = [
  'remove the crease',
  'smooth the fabric, keep the texture',
  'remove the loose thread',
  'straighten the hem',
  'match the stitching to the body colour',
];

export const PROMPT_IDEAS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  virtual_try_on: {
    pose: [
      'one hand on hip, weight on one leg, chin up',
      'walking toward the camera, arms relaxed',
      'three-quarter turn, looking over the shoulder',
      'hands in pockets, shoulders relaxed',
      'seated on a low stool, legs crossed',
      'leaning on a wall, one knee bent',
    ],
    scene: [
      'plain white studio, soft even light',
      'grey seamless backdrop, hard side light',
      'concrete wall in late afternoon sun',
      'city street at dusk, shallow depth of field',
      'empty gallery room, polished floor',
    ],
  },
  fabric_to_image: {
    region: [
      'the pleated skirt',
      'the printed shirt front',
      'the knit body of the sweater',
      'the jacket lining',
      'the scarf around the neck',
    ],
  },
  ghost_mannequin: {
    garment: [
      'the cropped denim jacket',
      'the oversized hoodie',
      'the tailored wool coat',
      'the slip dress',
      'the wide-leg trousers',
    ],
  },
  change_color: {
    garment: [
      'the cropped denim jacket',
      'the shirt only, keep the trousers',
      'the sweater body, keep the rib trims',
      'the dress, keep the buttons as they are',
      'the coat shell, not the lining',
    ],
  },
  swap_fabrics: {
    garment: [
      'the jacket body, keep the collar',
      'the trousers',
      'the sleeves only',
      'the whole dress',
      'the front panel of the shirt',
    ],
  },
  add_logo: {
    placement: [
      'on the chest, left side, small',
      'centred on the back, below the collar',
      'on the left sleeve, near the cuff',
      'on the back hip pocket',
      'on the hem, bottom right',
    ],
  },
  design_variations: {
    variation: [
      'same jacket, cropped shorter, wider sleeves',
      'longer length, relaxed fit',
      'add patch pockets on the chest',
      'collarless neckline, hidden placket',
      'double-breasted front, peak lapels',
      'raw hem, dropped shoulders',
    ],
  },
  create_edit: {
    prompt: [
      'a man wearing this t-shirt, studio light',
      'add sunglasses',
      'a clean background for this product',
      'flat lay of this outfit on concrete',
      'the same look on a model walking outdoors',
    ],
  },
  // Tile 10. The brief names the field `zone`; C-11 names the key `change_text`. Both read one list.
  retouch_zone: { zone: RETOUCH, change_text: RETOUCH },
};

/** The ideas of one prompt field; `[]` when there are none (the field then shows no Ideas door). */
export function ideasFor(workflowKey: string, fieldKey: string): readonly string[] {
  return PROMPT_IDEAS[workflowKey]?.[fieldKey] ?? [];
}

/**
 * The text after inserting `idea` at `[start, end)` of `value`, and where the caret goes.
 *
 * A phrase is a clause of the prompt, so it joins with `, ` unless the text before already ends in
 * a space or punctuation. Pure, so the field and a probe read one rule.
 */
export function insertIdea(
  value: string,
  idea: string,
  start: number,
  end: number = start,
): { text: string; insert: string; caret: number } {
  const before = value.slice(0, start);
  const pad = !before || /\s$/.test(before) ? '' : /[,.;:]$/.test(before) ? ' ' : ', ';
  const insert = `${pad}${idea}`;
  const text = `${before}${insert}${value.slice(end)}`;
  return { text, insert, caret: start + insert.length };
}
