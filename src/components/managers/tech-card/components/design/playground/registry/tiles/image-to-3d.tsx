import type {
  GetDesignBandResponse,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import type { JSX } from 'react';
import Text from 'ui/components/text';

import { benchKindOf, colorwayOf } from '../../../bench-kinds';
import type { NotSentItem } from '../../../core';
import { OutputsSection } from '../../../render/outputs';
import { OptionRow, ToggleRow, slotCounter } from '../../fields';
import {
  emptyParams,
  imagesOf,
  mediaIdsOf,
  notYet,
  pictureLines,
  workflowOffered,
} from '../common';
import {
  EMPTY_DRAFT,
  type CustomFieldProps,
  type Draft,
  type InventoryLineDef,
  type ResultsViewProps,
  type WorkflowDef,
  type WorkflowRun,
} from '../types';

/**
 * ═══ TILE 12 · IMAGE TO 3D → kind `threed`, REFERENCE MODE (C-10, backend B-09) ═════════════════
 *
 * Owner: «Create a 3D model from your fashion design.» — and of STEP 5: «3D уберется и на место его
 * прийдет Image to 3D с +- тем же функционалом». One reference picture (14.png: REQUIRED, + and
 * Reuse) and the «3D options» fold: Texture, Realistic materials, Quality, Follow.
 *
 * THE REQUEST IS TODAY'S 3D RUN IN ITS REFERENCE MODE (`design_threed_reference.go`):
 *
 *   · `params.threed.reference_media_ids = [id]` — a non-empty list SWITCHES THE SOURCE: the run
 *     reads no bench plate, the bench gates (`no_fabric_render`, `no_front_render`) do not apply,
 *     `source_picture_ids` stays empty. The one picture is read as the FRONT (position 0).
 *   · `texture` / `pbr` — '' | on | off, STRINGS (a proto3 bool cannot say «not stated»); `quality`
 *     — '' | standard | detailed; `follow` — '' | photo | shape. ⚠ EACH IS SENT ONLY WHEN THE BAND
 *     ADVERTISES IT (`threed_options`): a row the server does not list is not drawn, and its field
 *     leaves as '' = today's constant. The door refuses a non-default option its route does not
 *     read (`option_not_read`) and ANY `follow` today (no route reads it — D7, Q21), so a row drawn
 *     without the band's word would sell an option that changes nothing.
 *   · pbr = on with texture = off is refused by the door (materials are part of the texture): the
 *     form says so on the row and never sends that pair.
 *   · `presentation: 'air'` (the garment on its own, the old step's default) — the one word of the
 *     old body/size/fit block that reached the provider; body, size and fit are gone (Q20: inert).
 *     A RECALLED run keeps its own (G-02 Codex 4): a STEP 5 build «on a model» comes back «on a
 *     model», with the old block's inert fields as they were (`CARRY`), and the form says so — the
 *     tile draws no presentation row, so silence would turn «model» into «air».
 *   · `surface_hint: ''` ALWAYS — A DECIDED NON-USE, NOT A GAP (G-02 Codex 1). The band may list
 *     `surface_hint` (routes with a text field, `threed_route.go`), but the owner's tile 12 (14.png)
 *     has exactly four rows — Texture, Realistic materials, Quality, Follow — and no words box. The
 *     capability is deliberately unused: no field is drawn for it, '' is sent, and the route's own
 *     texturing words stand. Adding a box is the owner's call, not this tile's.
 *   · `colorway_id` = the colourway of the picture WHEN it is a render plate standing on this card's
 *     render bench (Reuse → this card → «fabric render · <colourway>»): the model files under that
 *     colourway, as a STEP 5 build did. Any other picture → 0.
 *
 * RESULTS ARE THE CARD'S 3D MODELS, not the room's pictures (`results.view`): the block STEP 5
 * mounted — viewer, «snapshot this angle / 4 sides», BRING YOUR OWN — whole card, every colourway.
 * The history under the tile narrows to `threed` runs (`match`).
 *
 * THE GATE. `image_to_3d` in `playground_workflows` AND a `threed_options` list (even empty). A
 * server older than the list keeps STEP 5 on the rail instead (`core/chain.ts`, `THREED_STEP`).
 */
const REFERENCE = 'reference';
const OPTIONS = 'options';

/**
 * THE OLD 3D BLOCK A RECALLED RUN CARRIES (G-02 Codex 4) — draft `choices` keys of fields the tile
 * does not draw and sends back as they were: the presentation (the one word that reaches the
 * provider's texturing steer) and the inert body / size / fit (Q20 — the door takes them silently).
 * A fresh draft has none of them: `presentation` then leaves as `air`, the rest empty.
 */
const CARRY = {
  presentation: 'carry.presentation',
  modelId: 'carry.modelId',
  garmentSizeId: 'carry.garmentSizeId',
  fitOverride: 'carry.fitOverride',
  bodyType: 'carry.bodyType',
} as const;

/** The presentation a draft sends: the recalled run's own word, else `air`. */
const presentationOf = (draft: Draft): string =>
  (draft.choices[CARRY.presentation] ?? '').trim() || 'air';

/** Draft keys of the options (flags / choices), read with their defaults by `chosenOf`. */
const TEXTURE = 'texture';
const PBR = 'pbr';
const QUALITY = 'quality';
const FOLLOW = 'follow';

type Quality = 'standard' | 'detailed';
type Follow = 'photo' | 'shape';

/** The option names the band advertises (`GetDesignBandResponse.threed_options`). */
type OptionName = typeof TEXTURE | typeof PBR | typeof QUALITY | typeof FOLLOW;

function offers(band: GetDesignBandResponse, name: OptionName): boolean {
  return (band.threedOptions ?? []).some((raw) => (raw ?? '').trim() === name);
}

/**
 * What the form SHOWS for each option — the draft's value, else the default: texture on (the
 * route's own constant), materials ON (the owner's 14.png shows «Realistic materials» switched on;
 * the row — and so this default — exists only where the band lists `pbr`, which the backend
 * advertises only after the GLB-size smoke), Standard, The photo.
 */
function chosenOf(draft: Draft): {
  texture: boolean;
  pbr: boolean;
  quality: Quality;
  follow: Follow;
} {
  return {
    texture: draft.flags[TEXTURE] ?? true,
    pbr: draft.flags[PBR] ?? true,
    quality: draft.choices[QUALITY] === 'detailed' ? 'detailed' : 'standard',
    follow: draft.choices[FOLLOW] === 'shape' ? 'shape' : 'photo',
  };
}

/**
 * THE OPTIONS AS THEY LEAVE — '' for every option this server does not advertise (the route's
 * constant), the stated word for the rest. A texture this server does not let a person switch is
 * ON (its constant), so materials may still be asked for; materials without the texture never
 * leave as `on`.
 */
function wireOptions(
  band: GetDesignBandResponse,
  draft: Draft,
): { texture: string; pbr: string; quality: string; follow: string } {
  const c = chosenOf(draft);
  const textured = offers(band, TEXTURE) ? c.texture : true;
  return {
    texture: offers(band, TEXTURE) ? (c.texture ? 'on' : 'off') : '',
    pbr: offers(band, PBR) ? (textured && c.pbr ? 'on' : 'off') : '',
    quality: offers(band, QUALITY) ? c.quality : '',
    follow: offers(band, FOLLOW) ? c.follow : '',
  };
}

/** Whether this server draws the options fold at all: it advertises at least one option. */
const anyOption = (band: GetDesignBandResponse): boolean =>
  [TEXTURE, PBR, QUALITY, FOLLOW].some((name) => offers(band, name as OptionName));

const one = (draft: Draft) => mediaIdsOf(imagesOf(draft, REFERENCE)).slice(0, 1);

/**
 * The line under the picture while the draft carries a recalled presentation other than `air` — the
 * form has no row for it, and the build would silently differ from the form without it (Codex 4).
 */
function CarriedPresentation({ draft }: CustomFieldProps): JSX.Element | null {
  const presentation = presentationOf(draft);
  if (presentation === 'air') return null;
  return (
    <Text
      size='micro'
      variant='label'
      component='p'
      className='normal-case'
      data-threed-carried={presentation}
    >
      Kept from the recalled run: presentation «{presentation}»
      {presentation === 'model' ? ' (the garment is textured as worn on a body)' : ''}.
    </Text>
  );
}

/**
 * The colourway a picture belongs to WHEN it stands on a render slot of this card — the one case
 * the old step's colourway binding still means something. 0 for everything else.
 */
export function plateColorway(band: GetDesignBandResponse, mediaId: number): number {
  if (mediaId <= 0) return 0;
  for (const slot of band.bench ?? []) {
    if (benchKindOf(slot) !== 'render') continue;
    const media = slot.picture?.media;
    if ((media?.id ?? 0) === mediaId) return colorwayOf(slot);
  }
  return 0;
}

/*
 * NO DOLLAR FIGURE ON THIS TILE (G-02 Codex 3). The server reserves max(the published estimate, the
 * CONFIGURED route's ceiling) — `designThreedRunEstimate`, backend design_threed_reference.go — and
 * the band states neither the tariff nor the reserve. Any number printed here is one the server may
 * legitimately exceed, so the row says what the band can say: the server prices the run when it
 * starts, and the history shows what it cost.
 */

/* ─────────────────────────── the options fold ─────────────────────────── */

const QUALITY_OPTIONS = [
  { value: 'standard' as const, label: 'Standard' },
  {
    value: 'detailed' as const,
    label: 'Detailed',
    hint: 'finer geometry · a higher reserve than Standard',
  },
];

const FOLLOW_OPTIONS = [
  { value: 'photo' as const, label: 'The photo', hint: 'the surface follows the picture' },
  { value: 'shape' as const, label: 'The shape', hint: 'the surface follows the 3D shape' },
];

/**
 * The four rows of 14.png, each drawn only where the band lists it. One ledger of ruled lines, the
 * switch or the segmented control at the right edge — no button besides them.
 */
function ThreedOptionRows({ band, draft, onDraft, disabled }: CustomFieldProps): JSX.Element {
  const c = chosenOf(draft);
  const textured = offers(band, TEXTURE) ? c.texture : true;
  const flag = (key: string, on: boolean) =>
    onDraft((d) => ({ ...d, flags: { ...d.flags, [key]: on } }));
  const choose = (key: string, value: string) =>
    onDraft((d) => ({ ...d, choices: { ...d.choices, [key]: value } }));
  return (
    <div className='flex flex-col' data-threed-options=''>
      {offers(band, TEXTURE) && (
        <ToggleRow
          label='Texture'
          anchor='texture'
          checked={c.texture}
          onChange={(on) => flag(TEXTURE, on)}
          disabled={disabled}
        />
      )}
      {offers(band, PBR) && (
        <ToggleRow
          label='Realistic materials'
          anchor='pbr'
          checked={textured && c.pbr}
          onChange={(on) => flag(PBR, on)}
          disabled={disabled || !textured}
          note={textured ? undefined : 'Materials come with the texture: turn it on first.'}
        />
      )}
      {offers(band, QUALITY) && (
        <OptionRow<Quality>
          label='Quality'
          anchor='quality'
          control='segmented'
          value={c.quality}
          options={QUALITY_OPTIONS}
          onChange={(value) => choose(QUALITY, value)}
          disabled={disabled}
        />
      )}
      {offers(band, FOLLOW) && (
        <OptionRow<Follow>
          label='Follow'
          anchor='follow'
          control='segmented'
          value={c.follow}
          options={FOLLOW_OPTIONS}
          onChange={(value) => choose(FOLLOW, value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── the results ─────────────────────────── */

/** The card's 3D models, whole card: the block STEP 5 stood on (`results.view`). */
function ThreedResults({ band, techCardId, disabled }: ResultsViewProps): JSX.Element | null {
  return <OutputsSection band={band} techCardId={techCardId} disabled={disabled} />;
}

/* ─────────────────────────── the run ─────────────────────────── */

const NOT_SENT: readonly NotSentItem[] = [
  {
    label: 'the bench',
    reason: 'no render plate travels unless it is the picture above — the build reads only that',
  },
  {
    label: 'the card',
    reason: 'no references, no garment description, no fit: the picture is the whole input',
  },
  {
    label: 'body, size, fit',
    reason: 'the old 3D rows are gone — the provider never read them',
  },
];

const run: WorkflowRun = {
  sections: [
    {
      key: REFERENCE,
      title: 'Reference image',
      glyph: 'image',
      required: true,
      // «0/1» beside REQUIRED, as every picture section of the room counts its slots.
      value: (draft) => slotCounter(imagesOf(draft, REFERENCE).length, 1),
      fields: [
        {
          type: 'images',
          key: REFERENCE,
          mode: 'grow',
          max: 1,
          purpose: 'image to 3d · reference',
          // This card (its render plates, grouped by colourway) and the fittings' photographs; the
          // model gallery is left out — a photo of a person builds the person, not the garment.
          sources: ['card', 'fittings'],
        },
        {
          type: 'note',
          key: 'reference-note',
          text: 'Read as the front of the garment. Works best on a plain background (Remove Background cuts one out).',
        },
        {
          type: 'custom',
          key: 'carried',
          render: (props) => <CarriedPresentation {...props} />,
        },
      ],
    },
    {
      key: OPTIONS,
      title: '3D options',
      glyph: 'cube',
      collapsible: true,
      defaultOpen: true,
      when: anyOption,
      // 14.png heads the fold with the quality word; a server without the quality row shows none.
      value: (draft, { band }) => (offers(band, QUALITY) ? chosenOf(draft).quality : undefined),
      fields: [
        { type: 'custom', key: OPTIONS, render: (props) => <ThreedOptionRows {...props} /> },
      ],
    },
  ],

  validate: (draft) =>
    one(draft).length === 0
      ? { reason: 'add the picture to build the model from', section: REFERENCE }
      : null,

  wire: (draft, { band }) => {
    const ids = one(draft);
    const o = wireOptions(band, draft);
    return {
      kind: 'threed',
      ask: '',
      params: {
        ...emptyParams(),
        colorwayId: plateColorway(band, ids[0] ?? 0),
        threed: {
          // EXPLICIT ZERO / EMPTY: the old block's fields are «not said» (frames since K-11; body,
          // size and fit are inert — Q20). `presentation: air` is the old step's default; a
          // recalled run sends its own block back as it was (`CARRY`, Codex 4).
          frames: 0,
          presentation: presentationOf(draft),
          modelId: Number(draft.choices[CARRY.modelId] ?? 0) || 0,
          garmentSizeId: Number(draft.choices[CARRY.garmentSizeId] ?? 0) || 0,
          fitOverride: draft.choices[CARRY.fitOverride] ?? '',
          bodyType: draft.choices[CARRY.bodyType] ?? '',
          sourcePictureIds: [],
          referenceMediaIds: ids,
          texture: o.texture,
          pbr: o.pbr,
          quality: o.quality,
          follow: o.follow,
          // Deliberately unused (the file head, G-02 Codex 1): the owner's form has no words box.
          surfaceHint: '',
        },
      },
    };
  },

  // The row adds «priced by the server when the run starts» itself — no figure (Codex 3).
  shape: () => '1 model',

  inventory: (draft, request) => {
    const sent = request.params.threed?.referenceMediaIds ?? [];
    const list = imagesOf(draft, REFERENCE).filter((m) => sent.includes(m.id ?? 0));
    const t = request.params.threed;
    const cw = request.params.colorwayId ?? 0;
    const said = (v: string | undefined, on: string, off: string, unset: string) =>
      v === 'on' ? on : v === 'off' ? off : unset;
    const options: InventoryLineDef[] = [
      {
        key: 'texture',
        name: 'texture',
        text: said(t?.texture, 'on', 'off — a bare mesh', 'the server default (on)'),
      },
      {
        key: 'pbr',
        name: 'realistic materials',
        text: said(t?.pbr, 'on', 'off', 'the server default (off)'),
      },
      {
        key: 'quality',
        name: 'quality',
        text: t?.quality || 'the server default (standard)',
      },
    ];
    if (t?.follow) options.push({ key: 'follow', name: 'follow', text: `the ${t.follow}` });
    return {
      kindWord: 'image to 3d',
      intro:
        'One picture travels, read as the FRONT of the garment, with the options below. One 3D model comes back — a .glb and a still of it.',
      groups: [
        {
          key: 'pictures',
          label: 'reference image',
          aside: `${list.length} of 1`,
          lines: pictureLines(list, () => 'front'),
          text: 'no picture yet',
        },
        { key: 'options', label: '3D options', lines: options },
        {
          key: 'colourway',
          label: 'colourway',
          text: cw
            ? `#${cw} — the picture is a render plate of that colourway, so the model files under it`
            : 'none — the model files under no colourway',
        },
        {
          key: 'craft',
          label: 'what the server adds',
          text:
            (t?.presentation ?? 'air') === 'air'
              ? '«presentation air» as the surface hint: the garment on its own, no body.'
              : `«presentation ${t?.presentation}» as the surface hint — kept from the recalled run.`,
        },
      ],
      // A recalled STEP 5 block travels back as it was (`CARRY`): «not sent» would then be untrue.
      notSent:
        (t?.modelId ?? 0) > 0 || (t?.garmentSizeId ?? 0) > 0 || !!t?.fitOverride || !!t?.bodyType
          ? NOT_SENT.filter((item) => item.label !== 'body, size, fit')
          : NOT_SENT,
    };
  },

  results: {
    reps: ['threed'],
    match: (run) => (run.kind ?? '').trim().toLowerCase() === 'threed',
    view: ThreedResults,
  },

  /**
   * A 3D run laid back: its first reference and its options. A STEP 5 build (bench plates, no
   * references) has no picture to lay out — said, not guessed; extra angles past the first are
   * said too (this tile takes one picture).
   *
   * ⚠ NOTHING OF THE OLD RUN IS DROPPED IN SILENCE (G-02 Codex 4). Its presentation and the inert
   * body / size / fit ride along (`CARRY`) and are sent back as they were; an option it stated that
   * THIS server's route no longer honours (`threed_options`) is named — the build uses the route's
   * own setting for it; and its surface words, which this tile never sends, are named too.
   */
  recall: (past: common_DesignRun, media, ctx) => {
    const t = past.params?.threed;
    const ids = (t?.referenceMediaIds ?? []).filter((id) => (id ?? 0) > 0);
    const said: string[] = [];
    let lost = 0;
    const list: common_MediaFull[] = [];
    if (ids.length === 0) {
      said.push('it was built from the render bench plates — pick a picture for this tile');
    }
    for (const id of ids.slice(0, 1)) {
      const found = media.get(id);
      if (found) list.push(found);
      else lost++;
    }
    if (ids.length > 1) {
      said.push(
        `${ids.length - 1} more ${ids.length === 2 ? 'angle' : 'angles'} did not come along — this tile takes one picture`,
      );
    }
    const flags: Record<string, boolean> = {};
    const choices: Record<string, string> = {};
    if (t?.texture) flags[TEXTURE] = t.texture !== 'off';
    if (t?.pbr) flags[PBR] = t.pbr === 'on';
    if (t?.quality) choices[QUALITY] = t.quality === 'detailed' ? 'detailed' : 'standard';
    if (t?.follow) choices[FOLLOW] = t.follow === 'shape' ? 'shape' : 'photo';

    const presentation = (t?.presentation ?? '').trim();
    if (presentation && presentation !== 'air') {
      choices[CARRY.presentation] = presentation;
      said.push(`it was built «${presentation}» — this build keeps that`);
    }
    if ((t?.modelId ?? 0) > 0) choices[CARRY.modelId] = String(t?.modelId);
    if ((t?.garmentSizeId ?? 0) > 0) choices[CARRY.garmentSizeId] = String(t?.garmentSizeId);
    if ((t?.fitOverride ?? '').trim()) choices[CARRY.fitOverride] = t!.fitOverride!.trim();
    if ((t?.bodyType ?? '').trim()) choices[CARRY.bodyType] = t!.bodyType!.trim();

    const band = ctx?.band;
    if (band) {
      const gone = (
        [
          [TEXTURE, t?.texture ? `texture ${t.texture}` : ''],
          [PBR, t?.pbr ? `materials ${t.pbr}` : ''],
          [QUALITY, t?.quality ? `${t.quality} quality` : ''],
          [FOLLOW, t?.follow ? `follow the ${t.follow}` : ''],
        ] as const
      )
        .filter(([name, word]) => word && !offers(band, name))
        .map(([, word]) => word);
      if (gone.length) {
        said.push(
          `this server no longer offers ${gone.join(', ')} — the build uses its own setting`,
        );
      }
    }
    if ((t?.surfaceHint ?? '').trim()) {
      said.push('its surface words did not come along — this tile sends none');
    }
    return {
      draft: { ...EMPTY_DRAFT, images: { [REFERENCE]: list }, flags, choices },
      said,
      lost,
    };
  },
};

export const IMAGE_TO_3D: Pick<WorkflowDef, 'gate' | 'run'> = {
  // Phase 2 only [Codex 10]: the list names the tile AND the band states its options (even none).
  gate: (band) => {
    const listed = workflowOffered(band, 'image_to_3d');
    if (!listed.available) return listed;
    return band.threedOptions === undefined ? notYet() : { available: true };
  },
  run,
};
