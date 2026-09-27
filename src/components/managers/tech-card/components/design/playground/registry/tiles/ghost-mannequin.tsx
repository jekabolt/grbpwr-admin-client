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
 * ═══ TILE 3 · IMAGE TO GHOST MANNEQUIN → kind `freeform`, preset `ghost_mannequin` (C-07) ════════
 *
 * Owner: «Turn any image into a ghost mannequin visual.» (5.png: «Image with your garment»
 * REQUIRED — one slot + Reuse, the prompt «Garment to recreate», Format 2:3 folded.)
 *
 *  · Image with your garment → `params.freeform.items = [{media_id, role: ''}]`. The door takes
 *    EXACTLY one picture with no marked area (`one_source_picture`, `one_region`); roles '' | subject.
 *  · «Garment to recreate» → `ask`. OPTIONAL, as the owner drew it: the server's paragraph
 *    recreates «the garment of image 1 (the one the words above name, if they name one)», so a
 *    picture of one garment needs no words; a look of several says which.
 *  · Format → `params.image = {model: the server's default, quality: '', aspect_ratio}` (D6: no
 *    model picker; `imageOptionsOf` without an engine key). Default 2:3 as 5.png shows it. Drawn
 *    only where the band lists engines; `auto` sends no block.
 *  · `options` stays empty: `ghost_mannequin` reads none (`option_not_read`).
 */
const IMAGE = 'image';
/** The Ideas key of this prompt (`ideas.ts`: ghost_mannequin.garment). */
const GARMENT = 'garment';
const ASK_MAX = 4000;

const FORMAT = formatSection({ initial: '2:3' });

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
      title: 'Image with your garment',
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
          purpose: 'ghost mannequin · garment',
          sources: ['card', 'models', 'fittings'],
        },
      ],
    },
    {
      key: GARMENT,
      title: 'Garment to recreate',
      glyph: 'text',
      fields: [
        {
          type: 'prompt',
          key: GARMENT,
          label: 'Garment to recreate',
          placeholder: 'The cropped denim jacket',
          hint: 'which garment of the picture to recreate as a ghost-mannequin product shot on white',
          maxLength: ASK_MAX,
        },
      ],
    },
    FORMAT.section,
  ],

  validate: (draft) =>
    one(draft).length === 0
      ? { reason: 'add the picture with your garment', section: IMAGE }
      : null,

  wire: (draft, { band }) => ({
    kind: 'freeform',
    ask: textOf(draft, GARMENT).trim().slice(0, ASK_MAX),
    params: {
      ...emptyParams(),
      freeform: {
        preset: 'ghost_mannequin',
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
      kindWord: 'ghost mannequin',
      intro: list.length
        ? 'One picture travels with the words below. One ghost-mannequin picture of its garment comes back.'
        : 'No picture yet. The one you add travels with the words below, and one ghost-mannequin picture of its garment comes back.',
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
          label: 'garment to recreate',
          aside: request.ask ? `${request.ask.length} characters` : 'nothing typed',
          words: request.ask,
          text: request.ask
            ? undefined
            : 'no words — the model recreates the garment it finds in the picture',
        },
        ...(engine ? [engine] : []),
        {
          key: 'craft',
          label: 'what the server adds',
          text: 'its ghost-mannequin paragraph: recreate the garment (the one the words name) in its worn 3D shape on an invisible body, the inside of the back neck visible, on a pure white seamless ground in soft studio light — every seam, print and piece of hardware kept as in the picture.',
        },
      ],
      notSent: request.params.image ? NOT_SENT : [...NOT_SENT, formatNotSent(band)],
    };
  },

  results: { reps: ['playground'], match: matchesWorkflow('ghost_mannequin') },

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
        texts: { [GARMENT]: (past.ask ?? '').trim() },
        images: { [IMAGE]: list.slice(0, 1) },
        choices,
      },
      said: [],
      lost,
    };
  },
};

export const GHOST_MANNEQUIN: Pick<WorkflowDef, 'gate' | 'run'> = {
  gate: (band) => workflowOffered(band, 'ghost_mannequin'),
  run,
};
