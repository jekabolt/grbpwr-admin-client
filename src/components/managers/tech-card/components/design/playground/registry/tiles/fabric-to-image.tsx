import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import { slotCounter } from '../../fields';
import {
  emptyParams,
  enginesOffered,
  formatSection,
  imageInventoryGroup,
  imageOptionsOf,
  imagesOf,
  mediaIdsOf,
  pictureLines,
  recallImage,
  textOf,
  workflowOffered,
} from '../common';
import { matchesWorkflow } from '../run-workflow';
import { EMPTY_DRAFT, type Draft, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 2 · FABRIC TO IMAGE → kind `freeform`, preset `fabric_extract` (C-07) ═══════════════════
 *
 * Owner: «Extract a print or fabric pattern from any image.» (4.png: Reference image REQUIRED, the
 * prompt «Fabric pattern to extract from», Format folded.)
 *
 *  · Reference image → `params.freeform.items = [{media_id, role: ''}]`. The door takes EXACTLY one
 *    picture with no marked area (`one_source_picture`, `one_region`); roles '' | subject.
 *  · «Fabric pattern to extract from» → `ask`. OPTIONAL, as the owner drew it (no REQUIRED mark):
 *    the server's paragraph takes «the fabric named in the words above (the main fabric if they
 *    name none)», so an empty box is a legal, meaningful run.
 *  · Format → `params.image = {model: the server's default, quality: '', aspect_ratio}` (D6: no
 *    model picker on this tile; `imageOptionsOf` without an engine key). Default 1:1 — a seamless
 *    swatch is square (Q22). Drawn only where the band lists engines; `auto` sends no block.
 *  · `options` stays empty: `fabric_extract` reads none (`option_not_read`).
 */
const IMAGE = 'image';
/** The Ideas key of this prompt (`ideas.ts`: fabric_to_image.region). */
const REGION = 'region';
const ASK_MAX = 4000;

const FORMAT = formatSection({ initial: '1:1' });

const NOT_SENT: readonly NotSentItem[] = [
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'the card',
    reason: 'nothing of the card travels: no bench, no references, no garment description',
  },
];

const one = (draft: Draft) => mediaIdsOf(imagesOf(draft, IMAGE)).slice(0, 1);

function formatNotSent(band: GetDesignBandResponse): NotSentItem {
  return {
    label: 'format',
    reason: enginesOffered(band)
      ? 'auto — the model picks the frame'
      : 'this server takes no aspect ratio yet — the model picks the frame',
  };
}

const run: WorkflowRun = {
  sections: [
    {
      key: IMAGE,
      title: 'Reference image',
      glyph: 'image',
      required: true,
      // «0/1» beside REQUIRED, as every picture section of the room counts its slots.
      value: (draft) => slotCounter(imagesOf(draft, IMAGE).length, 1),
      fields: [
        {
          type: 'images',
          key: IMAGE,
          mode: 'grow',
          max: 1,
          purpose: 'fabric to image · reference',
          sources: ['card', 'models', 'fittings'],
        },
      ],
    },
    {
      key: REGION,
      title: 'Fabric pattern to extract from',
      glyph: 'text',
      fields: [
        {
          type: 'prompt',
          key: REGION,
          label: 'Fabric pattern to extract from',
          placeholder: 'The pleated skirt',
          hint: 'which garment or area of the picture holds the fabric or print to extract as a flat seamless swatch',
          maxLength: ASK_MAX,
        },
      ],
    },
    FORMAT.section,
  ],

  validate: (draft) =>
    one(draft).length === 0
      ? { reason: 'add the picture to extract the fabric from', section: IMAGE }
      : null,

  wire: (draft, { band }) => ({
    kind: 'freeform',
    ask: textOf(draft, REGION).trim().slice(0, ASK_MAX),
    params: {
      ...emptyParams(),
      freeform: {
        preset: 'fabric_extract',
        items: one(draft).map((mediaId) => ({ mediaId, regions: [], texts: [], role: '' })),
        options: undefined,
      },
      image: imageOptionsOf(band, draft, { format: FORMAT.field }),
    },
  }),

  shape: () => '1 picture',

  inventory: (draft, request, { band }) => {
    const sent = (request.params.freeform?.items ?? []).map((i) => i.mediaId ?? 0);
    const list = imagesOf(draft, IMAGE).filter((m) => sent.includes(m.id ?? 0));
    const engine = imageInventoryGroup(band, request.params.image);
    return {
      kindWord: 'fabric to image',
      intro: list.length
        ? 'One picture travels with the words below. One flat, seamless swatch of its fabric comes back.'
        : 'No picture yet. The one you add travels with the words below, and one flat swatch of its fabric comes back.',
      groups: [
        {
          key: 'pictures',
          label: 'picture',
          aside: `${list.length} of 1`,
          lines: pictureLines(list, () => 'image 1'),
          text: 'no picture yet',
        },
        {
          key: 'words',
          label: 'fabric pattern to extract from',
          aside: request.ask ? `${request.ask.length} characters` : 'nothing typed',
          words: request.ask,
          text: request.ask
            ? undefined
            : 'no words — the model takes the main fabric of the picture',
        },
        ...(engine ? [engine] : []),
        {
          key: 'craft',
          label: 'what the server adds',
          text: 'its fabric-extract paragraph: take the fabric the words name (the main one if they name none) and return it flat, evenly lit, front-on and seamless — no garment shape, no folds, no shadows, the cloth filling the frame.',
        },
      ],
      notSent: request.params.image ? NOT_SENT : [...NOT_SENT, formatNotSent(band)],
    };
  },

  results: { reps: ['playground'], match: matchesWorkflow('fabric_to_image') },

  recall: (past, media) => {
    let lost = 0;
    const list: common_MediaFull[] = [];
    for (const item of past.params?.freeform?.items ?? []) {
      const found = media.get(item.mediaId ?? 0);
      if (found) list.push(found);
      else lost++;
    }
    // No `image` block on the past run = it was made at auto (this tile sends none for auto), or
    // on a server with no ratio at all — either way the model picked the frame.
    const choices = past.params?.image
      ? recallImage(past, { format: FORMAT.field.key }).choices
      : { [FORMAT.field.key]: 'auto' };
    return {
      draft: {
        ...EMPTY_DRAFT,
        texts: { [REGION]: (past.ask ?? '').trim() },
        images: { [IMAGE]: list.slice(0, 1) },
        choices,
      },
      said: [],
      lost,
    };
  },
};

export const FABRIC_TO_IMAGE: Pick<WorkflowDef, 'gate' | 'run'> = {
  gate: (band) => workflowOffered(band, 'fabric_to_image'),
  run,
};
