import type {
  GetDesignBandResponse,
  common_DesignRun,
  common_MediaFull,
  common_TechCardAnnotation,
} from 'api/proto-http/admin';
import type { JSX } from 'react';
import {
  annotationCapsOut,
  annotationColorToWire,
  annotationKindToWire,
} from 'ui/components/annotation/wire';
import Text from 'ui/components/text';
import { inputToDecimal } from 'utils/decimal';

import { PRICED_LATER } from '../../../core';
import { slotCounter } from '../../fields';
import { cornerText, type MaskPoint } from '../../mask/geometry';
import { RetouchSource } from '../../mask/retouch-source';
import { emptyParams, imagesOf, workflowOffered } from '../common';
import { matchesWorkflow, retouchSourceId } from '../run-workflow';
import {
  EMPTY_DRAFT,
  type Refusal,
  type RunRequest,
  type WorkflowDef,
  type WorkflowRun,
} from '../types';

/**
 * ═══ TILE 10 · RETOUCH A ZONE → kind `freeform`, preset `retouch` (C-11, D3 phase 2) ═════════════
 *
 * Owner: «Paint over part of a design and describe what should change there.» His 12.png has NO
 * form: the tile explains, and the work starts on a picture — «Open or upload any picture …, press
 * Mask, paint the zone, describe what should be there». So this file holds two things:
 *
 *   · the tile's panel: the explanation, the honest lines, and ONE picture slot (+ upload / Reuse,
 *     G-02 M-1, `../../mask/retouch-source.tsx`) whose pick opens the same mask editor the result
 *     tiles open (`startsElsewhere` — the panel draws no GENERATE; one action, one button, and that
 *     button is in the mask editor);
 *   · THE ONE WRITER OF A RETOUCH REQUEST (`retouchRequest`) and its free refusals
 *     (`retouchRefusal`), which the mask editor (`../../mask/mask-editor.tsx`) calls.
 *
 * THE WIRE (the door: `designRefuseUnworkableFreeform`, case retouch, backend design_freeform.go):
 *   kind 'freeform', ask '' — the words travel in `items[0].texts[0]`, paired with the region;
 *   params.freeform = {preset:'retouch', items:[{mediaId, regions:[POLYGON], texts:[words], role:''}]}
 *   — exactly one picture, exactly one region, words for it; role '' (the preset reads '' | subject);
 *   no options (retouch reads none: `option_not_read`), no `params.image` (the window's crop decides
 *   shape and size, G-02), `extra_input_media_ids` empty (`one_list_per_fact`).
 *
 * ⚠ PHASE 2 REDRAWS A RECTANGLE (window.go): the server crops a box around the zone, padded to at
 * least 512 px, has it redrawn and pastes the whole box back. «The rectangle around your zone may
 * change» is said on the panel and under the brush [Codex 7].
 */

/** The prompt's field key — also its Ideas and Recently used key (`ideas.ts` `retouch_zone`). */
export const RETOUCH_WORDS_KEY = 'change_text';
/** Draft `images` key of the panel's one picture — the picture a retouch starts from (M-1). */
export const RETOUCH_SOURCE_KEY = 'source';
/** Draft flag: the mask editor is open on that picture (a pick, a `mask` corner, a recall). */
export const RETOUCH_MASKING_KEY = 'masking';
/** The door's ceiling on one text of an item (`MaxDesignFreeformTextRunes`). */
export const RETOUCH_WORDS_MAX = 1000;
/** A window cannot be cut from a picture under this on either side (`WindowMinSourcePx`). */
export const RETOUCH_MIN_SOURCE_PX = 64;

/** The honest line of phase 2, verbatim wherever the retouch is offered [Codex 7]. */
export const RETOUCH_CAVEAT = 'The rectangle around your zone may change.';

/** Whether THIS server takes a retouch — the Mask action is not drawn at all when it does not. */
export const retouchOffered = (band: GetDesignBandResponse): boolean =>
  workflowOffered(band, 'retouch_zone').available;

/**
 * The pictures a Mask is offered on: rasters the playground made (freeform, cut-out, recolour).
 * A 3D run's pictures are not here — the playground results never hold them.
 */
export function maskableRun(run: Pick<common_DesignRun, 'kind'>): boolean {
  const kind = (run.kind ?? '').trim().toLowerCase();
  return kind === 'freeform' || kind === 'cutout' || kind === 'recolor';
}

/** What one retouch is made of: the picture, the painted zone, the words. */
export type RetouchInput = {
  media: common_MediaFull | null;
  /** The zone as it travels (`zoneOfStrokes`), or `null` when nothing usable is painted. */
  zone: readonly MaskPoint[] | null;
  /** Whether anything at all is painted (tells «paint the zone» from «paint a larger zone»). */
  painted: boolean;
  words: string;
};

/** The words as they leave: trimmed, at most the door's ceiling in characters (runes). */
export const retouchWords = (words: string): string =>
  Array.from(words.trim()).slice(0, RETOUCH_WORDS_MAX).join('');

/** The full-size pixel dimensions the media row states (0 = not stated). */
function sourceSize(media: common_MediaFull | null): { w: number; h: number } {
  const full = media?.media?.fullSize;
  return { w: full?.width ?? 0, h: full?.height ?? 0 };
}

/**
 * EVERY REFUSAL THE SCREEN CAN MAKE FOR FREE, in the door's order: the region's shape, then one
 * region, then words, then the source size (`source_too_small`, checked after the shape). `null` =
 * ready.
 */
export function retouchRefusal(input: RetouchInput): Refusal | null {
  if (!input.media || (input.media.id ?? 0) <= 0) return { reason: 'pick a picture to retouch' };
  if (!input.painted) return { reason: 'paint the zone to change' };
  if (!input.zone) return { reason: 'the painted zone is too small: paint a larger one' };
  if (!retouchWords(input.words)) return { reason: 'describe what should be there' };
  const { w, h } = sourceSize(input.media);
  if (w > 0 && h > 0 && (w < RETOUCH_MIN_SOURCE_PX || h < RETOUCH_MIN_SOURCE_PX)) {
    return {
      reason: `this picture is ${w}×${h} px; a retouch needs at least ${RETOUCH_MIN_SOURCE_PX} px on each side`,
    };
  }
  return null;
}

/**
 * The zone as the door reads it: a POLYGON with every other field of the annotation empty — the
 * contract says `text` / `color` / `piece_*` are ignored and the words live in `texts`.
 */
export function zoneToRegion(zone: readonly MaskPoint[]): common_TechCardAnnotation {
  return {
    kind: annotationKindToWire('polygon'),
    points: zone.map((p) => ({
      x: inputToDecimal(cornerText(p.x)),
      y: inputToDecimal(cornerText(p.y)),
    })),
    text: '',
    labelX: undefined,
    labelY: undefined,
    color: annotationColorToWire(''),
    dashed: false,
    filled: false,
    ...annotationCapsOut(''),
    pieceLineKey: '',
    pieceLineKeys: [],
  };
}

/** THE ONE WRITER OF A RETOUCH REQUEST (see the file head for every field and why). */
export function retouchRequest(input: RetouchInput): RunRequest {
  const mediaId = input.media?.id ?? 0;
  const items =
    mediaId > 0 && input.zone
      ? [
          {
            mediaId,
            regions: [zoneToRegion(input.zone)],
            texts: [retouchWords(input.words)],
            role: '',
          },
        ]
      : [];
  return {
    kind: 'freeform',
    ask: '',
    params: {
      ...emptyParams(),
      freeform: { preset: 'retouch', items, options: undefined },
    },
  };
}

/**
 * The price line of a retouch (G-02 m-3). The band states no price — `image_models` carries slugs,
 * ratios and tiers, not their ceilings — so no number is derived here; the server prices the run when
 * it starts and the history shows what it cost.
 */
export const RETOUCH_PRICE = `1 new picture per retouch · ${PRICED_LATER}`;

/** The panel's words: the owner's 12.png, less the credit (we price in $, by the server). */
function Explanation(): JSX.Element {
  return (
    <div className='flex max-w-[60ch] flex-col gap-3' data-retouch-explanation=''>
      <Text component='p' className='normal-case font-bold'>
        Retouch a Zone works on a picture you already have.
      </Text>
      <Text component='p' className='normal-case'>
        Open or upload any picture here or in the results, press <b>Mask</b>, paint the zone to
        change and describe what should be there. The retouch is generated in place.
      </Text>
      <Text size='micro' variant='label' component='p' className='normal-case'>
        {RETOUCH_CAVEAT}
      </Text>
      <Text
        size='micro'
        variant='label'
        component='p'
        className='normal-case'
        data-retouch-price=''
      >
        {RETOUCH_PRICE}
      </Text>
    </div>
  );
}

const NOTHING: RetouchInput = { media: null, zone: null, painted: false, words: '' };

const run: WorkflowRun = {
  sections: [
    {
      key: 'how',
      title: 'How it works',
      glyph: 'text',
      fields: [{ type: 'custom', key: 'explanation', render: () => <Explanation /> }],
    },
    {
      key: RETOUCH_SOURCE_KEY,
      title: 'Picture',
      glyph: 'image',
      // «0/1», as every picture section of the room counts its slots (C-12).
      value: (draft) => slotCounter(imagesOf(draft, RETOUCH_SOURCE_KEY).length, 1),
      fields: [
        {
          type: 'custom',
          key: RETOUCH_SOURCE_KEY,
          render: (props) => <RetouchSource {...props} />,
        },
      ],
    },
  ],
  startsElsewhere: true,
  // The panel never presses: these answer for the empty form, and the editor asks the same writer.
  validate: () => retouchRefusal(NOTHING),
  wire: () => retouchRequest(NOTHING),
  shape: () => '1 picture',
  inventory: () => ({
    kindWord: 'retouch a zone',
    intro:
      'A retouch starts from the Mask action on a picture: the one above, or one in the results.',
    groups: [],
    notSent: [],
  }),
  results: {
    reps: ['playground'],
    /* The history under the open tile narrows to retouches. The pictures above it are the room's
       (`startsElsewhere`, results.tsx): a retouch starts from a picture you already have, and its
       answer lands next to it. A stub run off the feed's first page states no preset; the server's
       stamp on its output (`run_workflow`) says whether it was a retouch (`workflowOfRun`). */
    match: matchesWorkflow('retouch_zone'),
  },
  /**
   * «Run that again» on a retouch (Codex 5): its picture back in the panel's slot WITH THE MASK
   * EDITOR OPEN ON IT, and its words in the box. The zone is not carried: phase 2 froze a polygon,
   * the brush paints strokes, and a hull redrawn as paint would be a zone nobody painted — said, not
   * guessed. The history offers this door only while the snapshot still carries that picture
   * (`history-recall.tsx`, `handsOver`); a picture gone since is said here too.
   */
  recall: (past, media) => {
    const id = retouchSourceId(past);
    const found = id > 0 ? media.get(id) ?? null : null;
    const words = past.params?.freeform?.items?.[0]?.texts?.[0] ?? '';
    return {
      draft: {
        ...EMPTY_DRAFT,
        images: { [RETOUCH_SOURCE_KEY]: found ? [found] : [] },
        texts: { [RETOUCH_WORDS_KEY]: words },
        flags: { [RETOUCH_MASKING_KEY]: !!found },
      },
      said: found ? ['paint the zone again — the brush opens on its picture'] : [],
      lost: found || id <= 0 ? 0 : 1,
    };
  },
};

export const RETOUCH_ZONE: Pick<WorkflowDef, 'gate' | 'run'> = {
  gate: (band) => workflowOffered(band, 'retouch_zone'),
  run,
};
