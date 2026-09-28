import type { common_MediaFull } from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import { slotCounter } from '../../fields';
import {
  emptyParams,
  imagesOf,
  mediaIdsOf,
  pictureLines,
  presetOffered,
  workflowOfferedOr,
} from '../common';
import { EMPTY_DRAFT, type Draft, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 8 · REMOVE BACKGROUND → kind `cutout` (C-04, today's backend) ══════════════════════════
 *
 * Owner: «Cut the subject out and keep it on a transparent background.» One picture in, one PNG
 * with alpha out, from the segmentation route (fal birefnet). The request is ONE media id in
 * `extra_input_media_ids` and nothing else: the route has no prompt, and the door refuses words
 * (`cutout_takes_no_words`) and anything but exactly one picture (`one_source_picture`) — so this
 * form has no prompt and one slot.
 *
 * Offered only where the server lists `remove_background` in `playground_workflows` — or, on a
 * server older than that list, `cutout` in `freeform_presets` (`presetOffered`).
 */
const IMAGE = 'image';

const NOT_SENT: readonly NotSentItem[] = [
  {
    label: 'words',
    reason: 'the cut-out route takes no prompt — the server refuses one that has words',
  },
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'the card',
    reason: 'nothing of the card travels: no bench, no references, no description',
  },
];

const one = (draft: Draft) => mediaIdsOf(imagesOf(draft, IMAGE)).slice(0, 1);

const run: WorkflowRun = {
  sections: [
    {
      key: IMAGE,
      title: 'Image',
      glyph: 'image',
      required: true,
      value: (draft) => slotCounter(imagesOf(draft, IMAGE).length, 1),
      fields: [
        {
          type: 'images',
          key: IMAGE,
          mode: 'grow',
          max: 1,
          purpose: 'remove background',
        },
      ],
    },
  ],

  validate: (draft) =>
    one(draft).length === 0 ? { reason: 'add the picture to cut out', section: IMAGE } : null,

  wire: (draft) => ({
    kind: 'cutout',
    ask: '',
    params: { ...emptyParams(), extraInputMediaIds: one(draft) },
  }),

  shape: () => '1 cut-out on transparency',

  inventory: (draft, request) => {
    const sent = request.params.extraInputMediaIds ?? [];
    const list = imagesOf(draft, IMAGE).filter((m) => sent.includes(m.id ?? 0));
    return {
      kindWord: 'remove background',
      intro:
        'One picture travels, and nothing else: the segmentation route cuts the subject out and returns it on transparency.',
      groups: [
        {
          key: 'pictures',
          label: 'picture',
          aside: `${list.length} of 1`,
          lines: pictureLines(list, () => 'the picture'),
          text: 'no picture yet',
        },
      ],
      notSent: NOT_SENT,
    };
  },

  results: {
    reps: ['playground'],
    match: (run) => (run.kind ?? '').trim().toLowerCase() === 'cutout',
    cutout: true,
  },

  recall: (run, media) => {
    let lost = 0;
    const list: common_MediaFull[] = [];
    for (const id of run.params?.extraInputMediaIds ?? []) {
      const found = media.get(id ?? 0);
      if (found) list.push(found);
      else lost++;
    }
    return {
      draft: { ...EMPTY_DRAFT, images: { [IMAGE]: list.slice(0, 1) } },
      said: [],
      lost,
    };
  },
};

export const REMOVE_BACKGROUND: Pick<WorkflowDef, 'gate' | 'run'> = {
  // The new list when the server sends it (C-08); today's `freeform_presets` answer when it does not.
  gate: (band) => workflowOfferedOr(band, 'remove_background', () => presetOffered(band, 'cutout')),
  run,
};
