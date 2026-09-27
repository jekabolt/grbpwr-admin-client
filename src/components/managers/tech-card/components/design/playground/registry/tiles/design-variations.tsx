import type {
  GetDesignBandResponse,
  common_DesignWorkflowOptions,
  common_MediaFull,
} from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import { BOOST_STEPS, slotCounter, stepLabel, type SliderStep } from '../../fields';
import {
  ENGINE_KEY,
  emptyParams,
  enginesOffered,
  engineSection,
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
import { ideaMediaIds } from '../../ideas-server';
import { matchesWorkflow } from '../run-workflow';
import { EMPTY_DRAFT, type Draft, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 7 · CREATE DESIGN VARIATIONS → kind `freeform`, preset `variations` (C-07) ═════════════
 *
 * Owner: «Create fashion design variations from a reference image.» (10.png: Reference image
 * REQUIRED, «Describe the variation», «Creative booster» ⓘ with the step name in its header, Format
 * 2:3 folded.)
 *
 *  · Reference image → `params.freeform.items = [{media_id, role: ''}]`. The door takes EXACTLY one
 *    picture with no marked area (`one_source_picture`, `one_region`); roles '' | subject.
 *  · «Describe the variation» → `ask`, REQUIRED here: at Off the server's paragraph changes «only
 *    what the words above ask», so a run with no words buys a copy of the reference.
 *  · Creative booster → `options.creativity` 0..3 (Off / Low / Medium / High; the door refuses > 3,
 *    `unknown_option`). It is the ONLY option `variations` reads; every other field of `options`
 *    stays empty (`option_not_read`). The server turns the step into its paragraph (B-05): Off keeps
 *    silhouette, proportions and colours; High uses the reference only as inspiration.
 *  · AI model · Quality (D6, Q19) and Format 2:3 → `params.image` (C-08: `engineSection`,
 *    `formatSection`), both drawn only where the band lists engines.
 */
const IMAGE = 'image';
/** The Ideas key of this prompt (`ideas.ts`: design_variations.variation). */
const VARIATION = 'variation';
const BOOSTER = 'booster';
const ASK_MAX = 4000;
/** The door's ceiling on `options.creativity` (`entity.MaxDesignCreativity`). */
const CREATIVITY_MAX = 3;

/** Off / Low / Medium / High as the draft stores them (a slider field's value is a string). */
const BOOST: readonly SliderStep<string>[] = BOOST_STEPS.map((s) => ({
  value: String(s.value),
  label: s.label,
}));

const FORMAT = formatSection({ initial: '2:3' });

const NOT_SENT: readonly NotSentItem[] = [
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'the card',
    reason: 'nothing of the card travels: no bench, no references, no garment description',
  },
];

const one = (draft: Draft) => mediaIdsOf(imagesOf(draft, IMAGE)).slice(0, 1);

/** The chosen step as the wire's integer: 0..3, anything else reads as Off. */
function creativityOf(draft: Draft): number {
  const n = Number(draft.choices[BOOSTER] ?? '0');
  return Number.isInteger(n) && n >= 0 && n <= CREATIVITY_MAX ? n : 0;
}

/** `params.freeform.options` with the one field this preset reads. */
function optionsOf(draft: Draft): common_DesignWorkflowOptions {
  return {
    framing: '',
    angle: '',
    sceneMode: '',
    sceneText: '',
    modelId: 0,
    productColorwayId: 0,
    logoSize: '',
    creativity: creativityOf(draft),
  };
}

function formatNotSent(band: GetDesignBandResponse): NotSentItem {
  return {
    label: 'AI model and format',
    reason: enginesOffered(band)
      ? 'the server default'
      : 'this server takes no model choice and no aspect ratio yet — its default model picks the frame',
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
          purpose: 'design variations · reference',
          sources: ['card', 'models', 'fittings'],
        },
      ],
    },
    {
      key: VARIATION,
      title: 'Describe the variation',
      glyph: 'text',
      required: true,
      fields: [
        {
          type: 'prompt',
          key: VARIATION,
          label: 'Describe the variation',
          placeholder: 'Same jacket, cropped shorter, wider sleeves',
          hint: 'what to change in the reference design to make a variation of it',
          maxLength: ASK_MAX,
          // C-15: what the server's Ideas look at.
          ideasFrom: (draft) => ({ mediaIds: ideaMediaIds(imagesOf(draft, IMAGE)[0]) }),
        },
      ],
    },
    {
      key: BOOSTER,
      title: 'Creative booster',
      glyph: 'boost',
      info: 'How freely the model may reinterpret the reference. Off keeps its silhouette, proportions and colours and changes only what you describe; High uses it only as inspiration.',
      collapsible: true,
      defaultOpen: true,
      value: (draft) => stepLabel(BOOST, String(creativityOf(draft))),
      fields: [
        { type: 'slider', key: BOOSTER, label: 'Creative booster', steps: BOOST, initial: '0' },
      ],
    },
    engineSection(),
    FORMAT.section,
  ],

  validate: (draft) => {
    if (one(draft).length === 0) {
      return { reason: 'add the reference design', section: IMAGE };
    }
    if (!textOf(draft, VARIATION).trim()) {
      return { reason: 'describe the variation', section: VARIATION };
    }
    return null;
  },

  wire: (draft, { band }) => ({
    kind: 'freeform',
    ask: textOf(draft, VARIATION).trim().slice(0, ASK_MAX),
    params: {
      ...emptyParams(),
      freeform: {
        preset: 'variations',
        items: one(draft).map((mediaId) => ({ mediaId, regions: [], texts: [], role: '' })),
        options: optionsOf(draft),
      },
      image: imageOptionsOf(band, draft, { engine: ENGINE_KEY, format: FORMAT.field }),
    },
  }),

  shape: () => '1 picture',

  inventory: (draft, request, { band }) => {
    const sent = (request.params.freeform?.items ?? []).map((i) => i.mediaId ?? 0);
    const list = imagesOf(draft, IMAGE).filter((m) => sent.includes(m.id ?? 0));
    const creativity = request.params.freeform?.options?.creativity ?? 0;
    const engine = imageInventoryGroup(band, request.params.image);
    return {
      kindWord: 'design variation',
      intro: list.length
        ? 'One reference design travels with the words below and the booster step. One variation comes back.'
        : 'No reference yet. The one you add travels with the words below and the booster step, and one variation comes back.',
      groups: [
        {
          key: 'pictures',
          label: 'reference design',
          aside: `${list.length} of 1`,
          lines: pictureLines(list, () => 'image 1'),
          text: 'no picture yet',
        },
        {
          key: 'words',
          label: 'the variation',
          aside: `${request.ask.length} characters`,
          words: request.ask,
          text: request.ask ? undefined : 'nothing typed yet',
        },
        {
          key: 'options',
          label: 'options',
          lines: [
            {
              key: 'creativity',
              name: 'creative booster',
              text: `${stepLabel(BOOST, String(creativity))} (creativity ${creativity} of ${CREATIVITY_MAX})`,
            },
          ],
        },
        ...(engine ? [engine] : []),
        {
          key: 'craft',
          label: 'what the server adds',
          text: 'its variations paragraph, worded by the booster step: Off keeps the silhouette, proportions and colours and changes only what the words ask; Low keeps silhouette and palette; Medium keeps the garment type and mood; High takes the reference only as inspiration.',
        },
      ],
      notSent: request.params.image ? NOT_SENT : [...NOT_SENT, formatNotSent(band)],
    };
  },

  results: { reps: ['playground'], match: matchesWorkflow('design_variations') },

  recall: (past, media) => {
    let lost = 0;
    const list: common_MediaFull[] = [];
    for (const item of past.params?.freeform?.items ?? []) {
      const found = media.get(item.mediaId ?? 0);
      if (found) list.push(found);
      else lost++;
    }
    const creativity = past.params?.freeform?.options?.creativity ?? 0;
    const image = recallImage(past, { engine: ENGINE_KEY, format: FORMAT.field.key });
    return {
      draft: {
        ...EMPTY_DRAFT,
        texts: { [VARIATION]: (past.ask ?? '').trim() },
        images: { [IMAGE]: list.slice(0, 1) },
        choices: {
          ...image.choices,
          [BOOSTER]: String(Math.min(CREATIVITY_MAX, Math.max(0, Math.trunc(creativity)))),
        },
      },
      said: [],
      lost,
    };
  },
};

export const DESIGN_VARIATIONS: Pick<WorkflowDef, 'gate' | 'run'> = {
  gate: (band) => workflowOffered(band, 'design_variations'),
  run,
};
