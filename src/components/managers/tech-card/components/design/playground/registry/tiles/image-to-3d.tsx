import type {
  GetDesignBandResponse,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import type { JSX } from 'react';

import { benchKindOf, colorwayOf } from '../../../bench-kinds';
import type { NotSentItem } from '../../../core';
import { OutputsSection } from '../../../render/outputs';
import { OptionRow, ToggleRow } from '../../fields';
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
 * route's own constant), materials OFF (PBR maps multiply the model file; 11-3D §6 — a person turns
 * them on), Standard, The photo.
 */
function chosenOf(draft: Draft): {
  texture: boolean;
  pbr: boolean;
  quality: Quality;
  follow: Follow;
} {
  return {
    texture: draft.flags[TEXTURE] ?? true,
    pbr: draft.flags[PBR] ?? false,
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

/**
 * The price words of the press: fal's published $1.20 a build, $1.40 in «ultra» (detailed). «About»:
 * the row itself adds that the server prices the run when it starts (a configured tariff may reserve
 * more), so a bare «reserved» here would contradict it (impeccable pass).
 */
function priceWords(quality: string): string {
  return quality === 'detailed' ? 'about $1.40' : 'about $1.20';
}

/* ─────────────────────────── the options fold ─────────────────────────── */

const QUALITY_OPTIONS = [
  { value: 'standard' as const, label: 'Standard' },
  {
    value: 'detailed' as const,
    label: 'Detailed',
    hint: 'finer geometry · $1.40 instead of $1.20',
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
  return <OutputsSection band={band} techCardId={techCardId} kind='threed' disabled={disabled} />;
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
          // size and fit are inert — Q20). `presentation: air` is the old step's default.
          frames: 0,
          presentation: 'air',
          modelId: 0,
          garmentSizeId: 0,
          fitOverride: '',
          bodyType: '',
          sourcePictureIds: [],
          referenceMediaIds: ids,
          texture: o.texture,
          pbr: o.pbr,
          quality: o.quality,
          follow: o.follow,
          surfaceHint: '',
        },
      },
    };
  },

  shape: (_draft, request) => `1 model · ${priceWords(request.params.threed?.quality ?? '')}`,

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
          text: '«presentation air» as the surface hint: the garment on its own, no body.',
        },
      ],
      notSent: NOT_SENT,
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
   */
  recall: (past: common_DesignRun, media) => {
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
