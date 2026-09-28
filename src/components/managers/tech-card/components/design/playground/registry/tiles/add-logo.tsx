import type { common_DesignWorkflowOptions, common_MediaFull } from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import type { OptionRowOption } from '../../fields';
import { emptyParams, pictureLines, textOf, workflowOffered } from '../common';
import { ideaMediaIds } from '../../ideas-server';
import { matchesWorkflow } from '../run-workflow';
import { EMPTY_DRAFT, type Draft, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 6 · ADD A LOGO → kind `freeform`, preset `add_logo` (C-07) ═════════════════════════════
 *
 * Owner: «Place your logo on a garment: upload the clothing image and the logo as a PNG, the AI
 * sets it into the…» (the ending is the adopted default, Q12). 9.png: «Your images» REQUIRED with
 * two slots «Your garment» and «Your logo (PNG)», «Logo size» Medium, «Logo placement».
 *
 *  · Your garment → item `{media_id, role: 'subject'}`, Your logo → item `{media_id, role: 'logo'}`,
 *    in that order (image 1 is the garment, image 2 the logo). The door wants exactly one logo and
 *    exactly one other picture (`role_required{logo}`, `one_source_picture`); its roles are
 *    '' | subject | logo.
 *  · Logo size → `options.logo_size` small | medium | large ('' would mean medium; this form always
 *    states it). It is the ONLY option `add_logo` reads (`option_not_read` for the rest). The server
 *    turns it into a width on the garment: 6 / 10 / 16 cm.
 *  · Logo placement → `ask`, REQUIRED here: the server's paragraph places the logo «at the place the
 *    words above say», and a run with no words leaves the place to chance.
 *  · No AI model, no Format (D6: the server's default engine, the photograph's own frame).
 */
const IMAGES = 'images';
const GARMENT = 'garment';
const LOGO = 'logo';
const SIZE = 'logo_size';
/** The Ideas key of this prompt (`ideas.ts`: add_logo.placement). */
const PLACEMENT = 'placement';
const ASK_MAX = 4000;

/** The door's vocabulary (`entity.IsDesignLogoSize`). */
const SIZES: readonly OptionRowOption<string>[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];
const SIZE_CM: Readonly<Record<string, number>> = { small: 6, medium: 10, large: 16 };

const NOT_SENT: readonly NotSentItem[] = [
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'the card',
    reason: 'nothing of the card travels: no bench, no references, no garment description',
  },
  {
    label: 'AI model and format',
    reason: 'this workflow runs on the server default and keeps the frame of your garment picture',
  },
];

const slotOf = (draft: Draft, slot: string): common_MediaFull | null =>
  draft.slots[IMAGES]?.[slot] ?? null;
const idOf = (media: common_MediaFull | null) => media?.id ?? 0;

function sizeOf(draft: Draft): string {
  const want = draft.choices[SIZE] ?? 'medium';
  return SIZES.some((s) => s.value === want) ? want : 'medium';
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
    logoSize: sizeOf(draft),
    creativity: 0,
  };
}

const run: WorkflowRun = {
  sections: [
    {
      key: IMAGES,
      title: 'Your images',
      glyph: 'image',
      required: true,
      fields: [
        {
          type: 'images',
          key: IMAGES,
          mode: 'fixed',
          slots: [
            { key: GARMENT, label: 'Your garment' },
            { key: LOGO, label: 'Your logo (PNG)', sources: ['card'] },
          ],
          purpose: 'add a logo',
          sources: ['card', 'models', 'fittings'],
        },
        /* Between the pictures and the placement, as 9.png puts it: a one-line choice under the
           two slots, not a fold of its own (a header that repeated its only row). */
        {
          type: 'option',
          key: SIZE,
          label: 'Logo size',
          options: SIZES,
          initial: 'medium',
          control: 'select',
        },
      ],
    },
    {
      key: PLACEMENT,
      title: 'Logo placement',
      glyph: 'text',
      required: true,
      fields: [
        {
          type: 'prompt',
          key: PLACEMENT,
          label: 'Logo placement',
          placeholder: 'On the chest, left sleeve, back, hip pocket…',
          hint: 'where on the garment the logo goes',
          maxLength: ASK_MAX,
          // C-15: what the server's Ideas look at.
          ideasFrom: (draft) => ({ mediaIds: ideaMediaIds(slotOf(draft, GARMENT)) }),
        },
      ],
    },
  ],

  validate: (draft) => {
    const garment = idOf(slotOf(draft, GARMENT));
    const logo = idOf(slotOf(draft, LOGO));
    if (garment <= 0) return { reason: 'add the garment picture', section: IMAGES };
    if (logo <= 0) return { reason: 'add your logo', section: IMAGES };
    if (garment === logo) {
      return {
        reason: 'the garment and the logo are the same picture: add your logo',
        section: IMAGES,
      };
    }
    if (!textOf(draft, PLACEMENT).trim()) {
      return { reason: 'say where the logo goes', section: PLACEMENT };
    }
    return null;
  },

  wire: (draft) => {
    const garment = idOf(slotOf(draft, GARMENT));
    const logo = idOf(slotOf(draft, LOGO));
    const items = [
      ...(garment > 0 ? [{ mediaId: garment, regions: [], texts: [], role: 'subject' }] : []),
      ...(logo > 0 && logo !== garment
        ? [{ mediaId: logo, regions: [], texts: [], role: 'logo' }]
        : []),
    ];
    return {
      kind: 'freeform',
      ask: textOf(draft, PLACEMENT).trim().slice(0, ASK_MAX),
      params: {
        ...emptyParams(),
        freeform: { preset: 'add_logo', items, options: optionsOf(draft) },
      },
    };
  },

  shape: () => '1 picture',

  inventory: (draft, request) => {
    // The pictures in the order they travel: image 1 the garment, image 2 the logo.
    const held = [slotOf(draft, GARMENT), slotOf(draft, LOGO)].filter(
      (m): m is common_MediaFull => !!m,
    );
    const items = request.params.freeform?.items ?? [];
    const list = items
      .map((it) => held.find((m) => idOf(m) === (it.mediaId ?? 0)))
      .filter((m): m is common_MediaFull => !!m);
    const size = request.params.freeform?.options?.logoSize || 'medium';
    return {
      kindWord: 'add a logo',
      intro:
        list.length === 2
          ? 'Two pictures travel, numbered as below, with the words and the size. One picture of your garment wearing the logo comes back.'
          : 'The garment and the logo travel as two numbered pictures with the words and the size. One picture comes back.',
      groups: [
        {
          key: 'pictures',
          label: 'pictures',
          aside: `${list.length} of 2`,
          lines: pictureLines(list, (i) =>
            items[i]?.role === 'logo' ? 'your logo' : 'your garment',
          ),
          text: 'no picture yet',
        },
        {
          key: 'words',
          label: 'logo placement',
          aside: `${request.ask.length} characters`,
          words: request.ask,
          text: request.ask ? undefined : 'nothing typed yet',
        },
        {
          key: 'options',
          label: 'options',
          lines: [
            {
              key: 'size',
              name: 'logo size',
              text: `${size} — about ${SIZE_CM[size] ?? 10} cm wide on the garment`,
            },
          ],
        },
        {
          key: 'craft',
          label: 'what the server adds',
          text: 'its add-a-logo paragraph: place the logo of image 2 on the garment of image 1 where the words say, at the width above; keep its exact shape, colours and letterforms, let it follow the folds and light of the fabric, and keep the rest of the picture as it is.',
        },
      ],
      notSent: NOT_SENT,
    };
  },

  results: { reps: ['playground'], match: matchesWorkflow('add_logo') },

  recall: (past, media) => {
    let lost = 0;
    let garment: common_MediaFull | null = null;
    let logo: common_MediaFull | null = null;
    for (const item of past.params?.freeform?.items ?? []) {
      const found = media.get(item.mediaId ?? 0);
      if (!found) {
        lost++;
        continue;
      }
      if (item.role === 'logo') logo = logo ?? found;
      else garment = garment ?? found;
    }
    const size = (past.params?.freeform?.options?.logoSize ?? '').trim() || 'medium';
    return {
      draft: {
        ...EMPTY_DRAFT,
        texts: { [PLACEMENT]: (past.ask ?? '').trim() },
        slots: { [IMAGES]: { [GARMENT]: garment, [LOGO]: logo } },
        choices: { [SIZE]: SIZES.some((s) => s.value === size) ? size : 'medium' },
      },
      said: [],
      lost,
    };
  },
};

export const ADD_LOGO: Pick<WorkflowDef, 'gate' | 'run'> = {
  gate: (band) => workflowOffered(band, 'add_logo'),
  run,
};
