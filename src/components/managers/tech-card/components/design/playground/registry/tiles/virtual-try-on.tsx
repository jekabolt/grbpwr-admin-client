import type {
  GetDesignBandResponse,
  common_DesignFreeformItem,
  common_MediaFull,
} from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import { mediaThumb } from '../../../render/model';
import { ImageSlots, productRendersOf, slotCounter, type OptionRowOption } from '../../fields';
import {
  ENGINE_KEY,
  emptyParams,
  engineOf,
  engineSection,
  formatSection,
  imageInventoryGroup,
  imageOptionsOf,
  imagesOf,
  recallImage,
  textOf,
  workflowOffered,
} from '../common';
import { matchesWorkflow } from '../run-workflow';
import {
  EMPTY_DRAFT,
  type Draft,
  type InventoryGroupDef,
  type InventoryLineDef,
  type WorkflowDef,
  type WorkflowRun,
} from '../types';

/**
 * ═══ TILE 1 · VIRTUAL TRY-ON → kind `freeform`, preset `tryon` (C-09) ═══════════════════════════
 *
 * Owner: «Put your products on a model you supply.» His fields, in the order of his list and his
 * references (1.png–3.png):
 *
 *   Model profile      REQUIRED   a profile, then ONE photo of its gallery        → item role=model,
 *                                                                                   options.model_id
 *   AI model           folded     «выбор модели», «качество … low mid high» (C-08) → params.image
 *   Framing & angle               two selects in the owner's words                 → options.framing,
 *                                                                                   options.angle
 *   Modify physical features & pose   prompt                                       → ask
 *   Product            REQUIRED   a colourway of this card, then 1..4 of its
 *                                 fabric renders                                   → items role=product,
 *                                                                                   options.product_colorway_id
 *   Scene              folded     Source: Edit scene | With reference; «Describe
 *                                 the scene around the model»                      → options.scene_mode,
 *                                                                                   options.scene_text,
 *                                                                                   item role=scene
 *   Format             folded     9:16 by default (3.png), bound to the AI model   → params.image.aspect_ratio
 *
 * ⚠ EVERY WORD BELOW IS THE DOOR'S (`design_freeform.go`, B-04/B-11, G-02). Roles: tryon reads
 * `model` / `product` / `scene` and nothing else; ≥ 1 model, 1..4 products, one scene picture iff
 * `scene_mode = reference` (a scene picture in edit mode is `option_not_read`). Vocabulary:
 * framing `auto | full_body | upper_body | portrait | hands | feet | product_detail`, angle
 * `auto | eye_level | slightly_above | slightly_below | low_angle`, scene_mode `'' | edit |
 * reference` (unknown → `unknown_option`). Provenance: a `model` picture must be one of profile
 * `model_id`'s photos (`model_photo_mismatch`), and with `product_colorway_id = X` every product
 * must be a render of colourway X on the band (`product_not_colorway_render`) — both pickers offer
 * exactly those pools, and `validate` re-checks the second against the band in hand.
 *
 * `extra_input_media_ids` stays EMPTY (`one_list_per_fact`), `colorway_id` is 0 (a playground run
 * files under no colourway; the product's colourway is provenance in `options`), `logo_size` and
 * `creativity` are zero (`option_not_read` for tryon).
 */
const MODEL = 'model';
const MODEL_PHOTO = 'model_photo';
const FRAMING = 'framing';
const ANGLE = 'angle';
const POSE = 'pose';
const PRODUCT = 'product';
const PRODUCT_CW = 'product_colorway';
const SCENE = 'scene';
const SCENE_MODE = 'scene_mode';
const SCENE_PHOTO = 'scene_photo';

/** How many garments one try-on dresses the person in (`designMaxTryonProducts`). */
export const TRYON_PRODUCTS_MAX = 4;
/** The door's own ceiling on `ask` (the playground's). */
const ASK_MAX = 4000;
/** `entity.MaxDesignFreeformTextRunes` — the ceiling of `options.scene_text`. */
const SCENE_TEXT_MAX = 1000;

/** The owner's words (00-OWNER-SPEC, tile 1) over the server's vocabulary (`IsDesignFraming`). */
export const FRAMING_OPTIONS: readonly OptionRowOption<string>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'full_body', label: 'Full body' },
  { value: 'upper_body', label: 'Upper body' },
  { value: 'portrait', label: 'Portrait – face & neck' },
  { value: 'hands', label: 'Close-up – hands' },
  { value: 'feet', label: 'Close-up – feet' },
  { value: 'product_detail', label: 'Product detail – worn' },
];

/** The owner's words over `IsDesignAngle`. */
export const ANGLE_OPTIONS: readonly OptionRowOption<string>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'eye_level', label: 'Eye level' },
  { value: 'slightly_above', label: 'Slightly above' },
  { value: 'slightly_below', label: 'Slightly below' },
  { value: 'low_angle', label: 'Low angle, from the ground' },
];

/** The owner's segmented «Source» (2.png) over `IsDesignSceneMode` (`'' | edit | reference`). */
const SCENE_OPTIONS: readonly OptionRowOption<string>[] = [
  { value: 'edit', label: 'Edit scene' },
  { value: 'reference', label: 'With reference' },
];

const vocab = (list: readonly OptionRowOption<string>[], value: string) =>
  list.some((o) => o.value === value);
const labelOf = (list: readonly OptionRowOption<string>[], value: string) =>
  list.find((o) => o.value === value)?.label ?? value;

const NOT_SENT: readonly NotSentItem[] = [
  {
    label: 'colourway',
    reason:
      'the run files under no colourway; the product’s colourway travels only as a record of where the garment came from',
  },
  {
    label: 'the card',
    reason: 'nothing else of the card travels: no bench, no garment description, no fit',
  },
];

const FORMAT = formatSection({ initial: '9:16' });

/* ─────────────────────────── the draft, read ─────────────────────────── */

const choice = (draft: Draft, key: string, fallback: string) =>
  (draft.choices[key] ?? '').trim() || fallback;
const idOf = (draft: Draft, key: string) => {
  const n = Number(draft.choices[key] ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};
const firstId = (list: readonly common_MediaFull[]) => list.find((m) => (m.id ?? 0) > 0) ?? null;

const modelPhoto = (draft: Draft) => firstId(imagesOf(draft, MODEL_PHOTO));
const products = (draft: Draft) => imagesOf(draft, PRODUCT).filter((m) => (m.id ?? 0) > 0);
const sceneMode = (draft: Draft) =>
  choice(draft, SCENE_MODE, 'edit') === 'reference' ? 'reference' : 'edit';
const scenePhoto = (draft: Draft) => firstId(imagesOf(draft, SCENE_PHOTO));

const item = (mediaId: number, role: string): common_DesignFreeformItem => ({
  mediaId,
  regions: [],
  texts: [],
  role,
});

/** The pictures of the run, in the order they travel: the person, the garments, the scene. */
function itemsOf(draft: Draft): common_DesignFreeformItem[] {
  const out: common_DesignFreeformItem[] = [];
  const photo = modelPhoto(draft);
  if (photo) out.push(item(photo.id ?? 0, 'model'));
  for (const m of products(draft).slice(0, TRYON_PRODUCTS_MAX))
    out.push(item(m.id ?? 0, 'product'));
  const scene = scenePhoto(draft);
  if (sceneMode(draft) === 'reference' && scene) out.push(item(scene.id ?? 0, 'scene'));
  return out;
}

/* ─────────────────────────── the form ─────────────────────────── */

const run: WorkflowRun = {
  sections: [
    {
      key: MODEL,
      title: 'Model profile',
      glyph: 'image',
      required: true,
      fields: [{ type: 'model-profile', key: MODEL, photoKey: MODEL_PHOTO }],
    },
    engineSection(),
    {
      key: 'shot',
      title: 'Framing & angle',
      glyph: 'options',
      fields: [
        {
          type: 'option',
          key: FRAMING,
          label: 'Framing',
          options: FRAMING_OPTIONS,
          initial: 'auto',
        },
        { type: 'option', key: ANGLE, label: 'Angle', options: ANGLE_OPTIONS, initial: 'auto' },
      ],
    },
    {
      key: POSE,
      title: 'Modify physical features & pose',
      glyph: 'text',
      fields: [
        {
          type: 'prompt',
          key: POSE,
          label: 'Modify physical features & pose',
          placeholder: 'one hand on hip, weight on one leg, chin up',
          hint: 'how the person in a try-on photo should change: pose, body, hair; their face stays theirs',
          maxLength: ASK_MAX,
        },
      ],
    },
    {
      key: PRODUCT,
      title: 'Product',
      glyph: 'image',
      required: true,
      value: (draft) => slotCounter(products(draft).length, TRYON_PRODUCTS_MAX),
      fields: [
        {
          type: 'colourway-render',
          key: PRODUCT,
          max: TRYON_PRODUCTS_MAX,
          colorwayKey: PRODUCT_CW,
        },
      ],
    },
    {
      key: SCENE,
      title: 'Scene',
      glyph: 'image',
      collapsible: true,
      // Open, as the owner's 2.png draws it (G-02 n-5): Source and the scene box in view.
      defaultOpen: true,
      value: (draft) => labelOf(SCENE_OPTIONS, sceneMode(draft)).toLowerCase(),
      fields: [
        {
          type: 'option',
          key: SCENE_MODE,
          label: 'Source',
          control: 'segmented',
          options: SCENE_OPTIONS,
          initial: 'edit',
        },
        {
          /* The scene picture exists only «with reference»: a slot drawn in edit mode would hold a
             picture the door refuses to read (`option_not_read`). */
          type: 'custom',
          key: SCENE_PHOTO,
          render: ({ band, techCardId, draft, onDraft, disabled }) =>
            sceneMode(draft) === 'reference' ? (
              <ImageSlots
                mode='grow'
                max={1}
                value={imagesOf(draft, SCENE_PHOTO)}
                onChange={(list) =>
                  onDraft((d) => ({ ...d, images: { ...d.images, [SCENE_PHOTO]: list } }))
                }
                band={band}
                techCardId={techCardId}
                purpose='virtual try-on · scene'
                disabled={disabled}
              />
            ) : null,
        },
        /* The owner's 2.png heads the box with its own line; the section title alone («Scene»)
           would leave «Same as model reference» reading as a value, not a placeholder. */
        { type: 'note', key: 'scene-words', text: 'Describe the scene around the model' },
        {
          type: 'prompt',
          key: SCENE,
          label: 'Describe the scene around the model',
          placeholder: 'Same as model reference',
          hint: 'the place, the backdrop and the light around the person in a try-on photo',
          maxLength: SCENE_TEXT_MAX,
        },
      ],
    },
    FORMAT.section,
  ],

  /* THE SERVER'S ORDER: the vocabulary and one-entry-per-picture of the speaker
     (`designRefuseMalformedFreeform`), then the preset's shape (`designRefuseUnworkableFreeform`),
     the engine's reference ceiling, and the product's colourway. */
  validate: (draft, { band }) => {
    if (!vocab(FRAMING_OPTIONS, choice(draft, FRAMING, 'auto'))) {
      return { reason: 'pick a framing', section: 'shot' };
    }
    if (!vocab(ANGLE_OPTIONS, choice(draft, ANGLE, 'auto'))) {
      return { reason: 'pick an angle', section: 'shot' };
    }
    const items = itemsOf(draft);
    const ids = items.map((i) => i.mediaId ?? 0);
    if (new Set(ids).size !== ids.length) {
      return {
        reason: 'the same picture is used twice: the scene must be another picture',
        section: SCENE,
      };
    }
    if (!modelPhoto(draft) || idOf(draft, MODEL) === 0) {
      return { reason: 'pick a model profile and one of its photos', section: MODEL };
    }
    const worn = products(draft);
    if (worn.length === 0) {
      return { reason: 'pick a colourway and at least one of its renders', section: PRODUCT };
    }
    if (worn.length > TRYON_PRODUCTS_MAX) {
      return {
        reason: `at most ${TRYON_PRODUCTS_MAX} garments on one model: take some off`,
        section: PRODUCT,
      };
    }
    if (sceneMode(draft) === 'reference' && !scenePhoto(draft)) {
      return { reason: 'add the scene picture, or switch Source to Edit scene', section: SCENE };
    }
    const engine = engineOf(band, draft, ENGINE_KEY);
    const ceiling = engine?.maxReferences ?? 0;
    if (ceiling > 0 && items.length > ceiling) {
      return {
        reason: `${engine?.label || 'this model'} takes at most ${ceiling} pictures: take a garment off`,
        section: PRODUCT,
      };
    }
    const cw = idOf(draft, PRODUCT_CW);
    if (cw > 0) {
      const pool = new Set(productRendersOf(band, cw).map((m) => m.id ?? 0));
      if (worn.some((m) => !pool.has(m.id ?? 0))) {
        return {
          reason: 'a picked render is no longer a render of that colourway: pick the renders again',
          section: PRODUCT,
        };
      }
    }
    return null;
  },

  wire: (draft, { band }) => ({
    kind: 'freeform',
    ask: textOf(draft, POSE).trim().slice(0, ASK_MAX),
    params: {
      ...emptyParams(),
      freeform: {
        preset: 'tryon',
        items: itemsOf(draft),
        options: {
          framing: choice(draft, FRAMING, 'auto'),
          angle: choice(draft, ANGLE, 'auto'),
          sceneMode: sceneMode(draft),
          sceneText: textOf(draft, SCENE).trim().slice(0, SCENE_TEXT_MAX),
          modelId: idOf(draft, MODEL),
          productColorwayId: idOf(draft, PRODUCT_CW),
          logoSize: '',
          creativity: 0,
        },
      },
      image: imageOptionsOf(band, draft, { engine: ENGINE_KEY, format: FORMAT.field }),
    },
  }),

  shape: () => '1 picture',

  inventory: (draft, request, { band }) => {
    const items = request.params.freeform?.items ?? [];
    const options = request.params.freeform?.options;
    const byId = new Map<number, common_MediaFull>();
    for (const m of [
      ...imagesOf(draft, MODEL_PHOTO),
      ...imagesOf(draft, PRODUCT),
      ...imagesOf(draft, SCENE_PHOTO),
    ]) {
      byId.set(m.id ?? 0, m);
    }
    const line = (role: string, name: string, text: string): InventoryLineDef[] =>
      items.flatMap((it, i) => {
        if (it.role !== role) return [];
        const id = it.mediaId ?? 0;
        return [
          {
            key: `${role}-${id}`,
            number: i + 1,
            thumb: mediaThumb(byId.get(id)),
            name: `image ${i + 1} · ${name}`,
            text: `${text} · media ${id}`,
          },
        ];
      });
    const modelId = options?.modelId ?? 0;
    const cw = options?.productColorwayId ?? 0;
    const garments = line('product', 'garment', cw ? `a render of colourway #${cw}` : 'a render');
    const scene = line('scene', 'the scene', 'the background and its light');
    const sceneText = (options?.sceneText ?? '').trim();
    const groups: InventoryGroupDef[] = [
      {
        key: 'model',
        label: 'the person',
        aside: modelId ? `profile #${modelId}` : 'no profile yet',
        note: 'their face and skin tone are kept; body, hair and pose change only where your words say so.',
        lines: line('model', 'the person', modelId ? `a photo of profile #${modelId}` : 'a photo'),
        text: 'no model photo yet',
      },
      {
        key: 'garments',
        label: 'garments',
        aside: `${garments.length} of ${TRYON_PRODUCTS_MAX}`,
        note: 'cut, colour, print and seams are reproduced as they are.',
        lines: garments,
        text: 'no garment yet',
      },
      ...(scene.length
        ? [{ key: 'scene', label: 'scene picture', lines: scene } satisfies InventoryGroupDef]
        : []),
      {
        key: 'words',
        label: 'physical features & pose',
        aside: request.ask ? `${request.ask.length} characters` : 'nothing typed',
        words: request.ask,
        text: request.ask ? undefined : 'no words: the person keeps the pose of the photo',
      },
      {
        key: 'options',
        label: 'the shot',
        lines: [
          {
            key: 'framing',
            name: 'framing',
            text: labelOf(FRAMING_OPTIONS, options?.framing || 'auto'),
          },
          { key: 'angle', name: 'angle', text: labelOf(ANGLE_OPTIONS, options?.angle || 'auto') },
          {
            key: 'scene',
            name: 'scene',
            text:
              options?.sceneMode === 'reference'
                ? `the scene picture${sceneText ? `, «${sceneText}»` : ''}`
                : sceneText
                  ? `«${sceneText}»`
                  : 'the model photo’s own',
          },
        ],
      },
      ...engineGroup(band, request.params.image),
      {
        key: 'craft',
        label: 'what the server adds',
        text: 'its try-on paragraph: keep the person’s identity, dress them in the garments as they really sit on a body, then the framing, the angle and the scene; the pictures are numbered as listed; one picture comes back.',
      },
    ];
    return {
      kindWord: 'virtual try-on',
      intro: items.length
        ? `${items.length} picture${items.length === 1 ? '' : 's'} travel with your words, numbered in the order below. One picture comes back.`
        : 'No picture yet: a try-on needs a photo of the person and at least one garment. One picture comes back.',
      groups,
      notSent: NOT_SENT,
    };
  },

  results: {
    reps: ['playground'],
    /* A try-on is a freeform run whose preset says so. An off-page stub states no preset
       (`RUN_NOT_STATED`); the server's stamp on its output (`run_workflow`) answers for it
       (`workflowOfRun` → `stampedWorkflowOf`), so a try-on off the feed's first page stays here. */
    match: matchesWorkflow('virtual_try_on'),
  },

  recall: (past, media) => {
    const said: string[] = [];
    let lost = 0;
    const ff = past.params?.freeform;
    const options = ff?.options;
    const byRole: Record<string, common_MediaFull[]> = {};
    for (const it of ff?.items ?? []) {
      const found = media.get(it.mediaId ?? 0);
      if (!found) {
        lost++;
        continue;
      }
      (byRole[it.role ?? ''] ??= []).push(found);
    }
    const modelId = options?.modelId ?? 0;
    const photo = byRole.model?.[0] ?? null;
    /* A photo is laid back only with the profile it belongs to: the picker draws the photo INSIDE
       its profile's gallery, and a photo with no profile would travel without being drawn. */
    if (photo && modelId <= 0)
      said.push('its model profile was not recorded: pick the model again');
    const worn = (byRole.product ?? []).slice(0, TRYON_PRODUCTS_MAX);
    const reference = (options?.sceneMode ?? '').trim() === 'reference';
    const framing = (options?.framing ?? '').trim() || 'auto';
    const angle = (options?.angle ?? '').trim() || 'auto';
    if (!vocab(FRAMING_OPTIONS, framing)) said.push(`its framing «${framing}» is not offered here`);
    if (!vocab(ANGLE_OPTIONS, angle)) said.push(`its angle «${angle}» is not offered here`);
    const image = recallImage(past, { engine: ENGINE_KEY, format: FORMAT.field.key });
    return {
      draft: {
        ...EMPTY_DRAFT,
        texts: { [POSE]: (past.ask ?? '').trim(), [SCENE]: (options?.sceneText ?? '').trim() },
        images: {
          [MODEL_PHOTO]: photo && modelId > 0 ? [photo] : [],
          [PRODUCT]: worn,
          [SCENE_PHOTO]: reference ? (byRole.scene ?? []).slice(0, 1) : [],
        },
        choices: {
          ...image.choices,
          [MODEL]: String(modelId > 0 ? modelId : 0),
          [PRODUCT_CW]: String(options?.productColorwayId ?? 0),
          [FRAMING]: vocab(FRAMING_OPTIONS, framing) ? framing : 'auto',
          [ANGLE]: vocab(ANGLE_OPTIONS, angle) ? angle : 'auto',
          [SCENE_MODE]: reference ? 'reference' : 'edit',
        },
        flags: image.flags,
      },
      said,
      lost,
    };
  },
};

function engineGroup(
  band: GetDesignBandResponse,
  image: Parameters<typeof imageInventoryGroup>[1],
): InventoryGroupDef[] {
  const group = imageInventoryGroup(band, image);
  return group ? [group] : [];
}

export const VIRTUAL_TRY_ON: Pick<WorkflowDef, 'gate' | 'run'> = {
  // Phase 2 only: the server lists `virtual_try_on` in `playground_workflows`, or the tile stays
  // dimmed (an older server has no `tryon` preset and no provenance checks) [Codex 10].
  gate: (band) => workflowOffered(band, 'virtual_try_on'),
  run,
};
