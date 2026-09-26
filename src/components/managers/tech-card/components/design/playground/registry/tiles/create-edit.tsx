import type { common_MediaFull } from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import { slotCounter } from '../../fields';
import {
  RETIRED_PRESET_WORD,
  emptyParams,
  imagesOf,
  mediaIdsOf,
  pictureLines,
  presetOffered,
  textOf,
} from '../common';
import { EMPTY_DRAFT, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 11 · CREATE OR EDIT IMAGES → kind `freeform`, preset `free` (C-04, today's backend) ════
 *
 * Owner: «Create or edit any image from a text prompt or reference images.» The Prompt comes FIRST
 * and is the main field (13.png); the references follow, up to 3.
 *
 * ⚠ TODAY'S DOOR NEEDS A PICTURE. `designRefuseUnworkableSources` refuses a freeform run with no
 * `params.freeform.items` (`no_source_picture`), so in phase 1 one reference is required and the form
 * says so in words; text-only arrives with B-04 (`free` accepting 0 pictures when `ask` is set).
 *
 * ⚠ NO FORMAT YET. The owner's reference shows a Format fold (2:3), but today's `DesignRunParams`
 * carries no aspect ratio at all (the server never sends one — 10-CURRENT-SYSTEM §2.2); a grid
 * whose choice goes nowhere would be a control that lies. It arrives with the per-run engine
 * (phase 2, `DesignRunParams.image`).
 *
 * The request: `ask` = the prompt; `params.freeform = {preset:'free', items:[{media_id}…]}` with no
 * regions, no texts and no role (the retired area UI is gone, Q17); `extra_input_media_ids` EMPTY —
 * one list per fact (`one_list_per_fact`).
 */
const PROMPT = 'prompt';
const REFS = 'refs';
const REFS_MAX = 3;
/** The door's own ceiling on `ask` (the old playground's `ASK_MAX`, removed in C-06). */
const ASK_MAX = 4000;

const NOT_SENT: readonly NotSentItem[] = [
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'the card',
    reason: 'nothing of the card travels: no bench, no references, no garment description',
  },
  {
    label: 'format',
    reason: 'this server takes no aspect ratio yet — the model picks the frame',
  },
];

const refIds = (list: readonly common_MediaFull[]) => mediaIdsOf(list).slice(0, REFS_MAX);

const run: WorkflowRun = {
  sections: [
    {
      key: PROMPT,
      title: 'Prompt',
      glyph: 'text',
      required: true,
      fields: [
        {
          type: 'prompt',
          key: PROMPT,
          label: 'Prompt',
          placeholder:
            "'Create a man wearing this t-shirt', 'add sunglasses', 'create a background for this product'…",
          hint: 'an instruction to an image model that creates or edits a picture from reference images',
          maxLength: ASK_MAX,
        },
      ],
    },
    /* «optional», as the owner's reference (13.png) heads it — that is the workflow. Today's server
       still needs one, and that is said ONCE, in one short line under the slots; the lock reason
       names it again only while the list is empty (G-01, m-8). No REQUIRED pill: it would
       contradict the header the owner drew. */
    {
      key: REFS,
      title: 'Reference images',
      glyph: 'image',
      value: (draft) => slotCounter(imagesOf(draft, REFS).length, REFS_MAX, true),
      fields: [
        {
          type: 'images',
          key: REFS,
          mode: 'grow',
          max: REFS_MAX,
          purpose: 'create or edit · references',
        },
        {
          type: 'note',
          key: 'refs-note',
          text: 'For now this server needs at least one.',
        },
      ],
    },
  ],

  validate: (draft) => {
    if (!textOf(draft, PROMPT).trim()) {
      return { reason: 'write what to create or change', section: PROMPT };
    }
    const ids = refIds(imagesOf(draft, REFS));
    if (ids.length === 0) {
      return { reason: 'add a reference image', section: REFS };
    }
    return null;
  },

  wire: (draft) => ({
    kind: 'freeform',
    ask: textOf(draft, PROMPT).trim().slice(0, ASK_MAX),
    params: {
      ...emptyParams(),
      freeform: {
        preset: 'free',
        items: refIds(imagesOf(draft, REFS)).map((mediaId) => ({
          mediaId,
          regions: [],
          texts: [],
          role: '',
        })),
      },
    },
  }),

  shape: () => '1 picture',

  inventory: (draft, request) => {
    const sent = (request.params.freeform?.items ?? []).map((i) => i.mediaId ?? 0);
    const list = sent
      .map((id) => imagesOf(draft, REFS).find((m) => (m.id ?? 0) === id))
      .filter((m): m is common_MediaFull => !!m);
    return {
      kindWord: 'create or edit',
      intro: list.length
        ? `${list.length} reference ${list.length === 1 ? 'image travels' : 'images travel'} with the prompt, numbered in the order below. One picture comes back.`
        : 'No reference image yet: this server needs at least one. One picture comes back.',
      groups: [
        {
          key: 'pictures',
          label: 'reference images',
          aside: `${list.length} of ${REFS_MAX}`,
          note: '«image 1» in the prompt is the first picture of this list.',
          lines: pictureLines(list, (i) => `image ${i + 1}`),
          text: 'no reference yet',
        },
        {
          key: 'words',
          label: 'prompt',
          aside: `${request.ask.length} characters`,
          words: request.ask,
          text: request.ask ? undefined : 'nothing typed yet',
        },
        {
          key: 'craft',
          label: 'what the server adds',
          text: 'its own closing sentence for this route: follow the words above; the pictures are numbered as listed; one picture comes back.',
        },
      ],
      notSent: NOT_SENT,
    };
  },

  results: {
    reps: ['playground'],
    /* EVERY freeform run, on the kind alone (G-01, m-3). Matching on the preset flipped a paid
       picture in and out of this tile as the feed paged: off the first page a run is a four-field
       stub that states no preset (in), and once its page loaded it said `add_hardware` (out). The
       retired presets are absorbed by this workflow anyway (Q17) — recall lays them out here — and
       their rows say which preset made them (`retiredPresetWord`). */
    match: (run) => (run.kind ?? '').trim().toLowerCase() === 'freeform',
  },

  recall: (past, media) => {
    const said: string[] = [];
    let lost = 0;
    const list: common_MediaFull[] = [];
    let areas = 0;
    for (const item of past.params?.freeform?.items ?? []) {
      const found = media.get(item.mediaId ?? 0);
      if (!found) {
        lost++;
        continue;
      }
      areas += (item.regions ?? []).length;
      if (!list.some((m) => m.id === found.id)) list.push(found);
    }
    const preset = (past.params?.freeform?.preset ?? '').trim();
    if (preset && preset !== 'free') {
      said.push(
        `«${RETIRED_PRESET_WORD[preset] ?? preset.replace(/_/g, ' ')}» is not a workflow any more — its pictures and words are laid out here`,
      );
    }
    if (areas) said.push('its marked areas did not come along');
    if (list.length > REFS_MAX) {
      said.push(
        `${list.length - REFS_MAX} pictures over the ${REFS_MAX} this workflow takes were left out`,
      );
    }
    return {
      draft: {
        ...EMPTY_DRAFT,
        texts: { [PROMPT]: (past.ask ?? '').trim() },
        images: { [REFS]: list.slice(0, REFS_MAX) },
      },
      said,
      lost,
    };
  },
};

export const CREATE_EDIT: Pick<WorkflowDef, 'gate' | 'run'> = {
  gate: (band) => presetOffered(band, 'free'),
  run,
};
