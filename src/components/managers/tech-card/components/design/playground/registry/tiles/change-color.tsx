import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_MediaFull,
} from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import {
  RECOLOR_SOURCES_MAX,
  recolorShape,
  recolourWireColour,
  targetIsStated,
} from '../../../recolor/model';
import { EMPTY_RECIPE, hexIsPaintable } from '../../../render/model';
import { NO_PANTONE, PantoneValue, pantoneColour, slotCounter } from '../../fields';
import {
  colourOf,
  emptyParams,
  imagesOf,
  mediaIdsOf,
  pictureLines,
  textOf,
  workflowOfferedOr,
} from '../common';
import { matchesWorkflow } from '../run-workflow';
import { EMPTY_DRAFT, type Draft, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 4 · CHANGE A COLOR → kind `recolor`, the ON MODEL request (C-04, today's backend) ═══════
 *
 * Owner: «Change a color on your fashion design» — «только там где колорпикер наш пикер с
 * пантоном». It is ON MODEL absorbed (Q2, Q10, Q18): the same door, the same body, the same money.
 *
 *  · Reference image → `params.extra_input_media_ids`, 1..24 photographs (`RECOLOR_SOURCES_MAX`,
 *    the server's cap). ONE PAID CALL PER PHOTOGRAPH; each call sees its own photograph only
 *    (`imageCalls`, `requested_outputs = len(extra_input_media_ids)`).
 *  · Garment to recolor → `ask`. The recolour door takes words (only `cutout` refuses them), and
 *    `composePrompt` writes `ask` first, before the colour block and the recolour craft.
 *  · New color → `params.colour {code, hex}` through `recolourWireColour` — the ON MODEL writer, so a
 *    half-typed hex never travels and `source` is derived from what actually leaves. No cloth: this
 *    tile recolours; re-clothing is Swap Fabrics (tile 5).
 *  · `colorwayId: 0` — the playground binds no colourway (the ON MODEL chips are gone, Q10).
 *
 * ⚠ A RECOLOUR READS THE CARD'S GARMENT NOTE AND FIT (`designKindReadsTheGarmentNote(recolor)` is
 * true on the server), and the inventory says so — the one thing of the card that rides along.
 */
const PHOTOS = 'photos';
const GARMENT = 'garment';
const COLOUR = 'colour';

const NOT_SENT: readonly NotSentItem[] = [
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'cloth',
    reason: 'no fabric picture travels — this workflow recolours; re-clothing is Swap Fabrics',
  },
  {
    label: 'the bench',
    reason: 'no plate of the card travels — only the photographs above',
  },
];

/** `params.colour`, exactly as it leaves — the gate, the price words and the wire read this. */
function colourWire(band: GetDesignBandResponse, draft: Draft): common_DesignColourRecipe {
  const pick = colourOf(draft, COLOUR);
  return recolourWireColour(band, { ...EMPTY_RECIPE, code: pick.code, hex: pick.hex }, 0);
}

const photoIds = (draft: Draft) => mediaIdsOf(imagesOf(draft, PHOTOS));

const run: WorkflowRun = {
  sections: [
    {
      key: PHOTOS,
      title: 'Reference image',
      glyph: 'image',
      required: true,
      value: (draft) => slotCounter(imagesOf(draft, PHOTOS).length, RECOLOR_SOURCES_MAX),
      fields: [
        {
          type: 'images',
          key: PHOTOS,
          mode: 'grow',
          max: RECOLOR_SOURCES_MAX,
          purpose: 'change a color · photographs',
          /* Photographs of a garment only: a cloth picture would be recoloured as if it were a
             garment photo and charged as one call. Cloth is Swap Fabrics' (tile 5) — G-01, m-4. */
          sources: ['card', 'models', 'fittings'],
        },
      ],
    },
    {
      key: GARMENT,
      title: 'Garment to recolor',
      glyph: 'text',
      fields: [
        {
          type: 'prompt',
          key: GARMENT,
          label: 'Garment to recolor',
          placeholder: 'The cropped denim jacket',
          hint: 'which garment in the photographs gets the new colour; everything else stays as it is',
        },
      ],
    },
    {
      key: COLOUR,
      title: 'New color',
      glyph: 'colour',
      required: true,
      collapsible: true,
      defaultOpen: true,
      value: (draft) => <PantoneValue value={colourOf(draft, COLOUR)} />,
      fields: [{ type: 'pantone', key: COLOUR, placeholder: 'pick a Pantone' }],
    },
  ],

  validate: (draft, { band }) => {
    const ids = photoIds(draft);
    if (ids.length === 0) {
      return { reason: 'add at least one photograph to recolour', section: PHOTOS };
    }
    if (ids.length > RECOLOR_SOURCES_MAX) {
      return {
        reason: `at most ${RECOLOR_SOURCES_MAX} photographs in one run — take some out`,
        section: PHOTOS,
      };
    }
    if (!targetIsStated(colourWire(band, draft))) {
      return { reason: 'pick the new colour from Pantone', section: COLOUR };
    }
    return null;
  },

  wire: (draft, { band }) => ({
    kind: 'recolor',
    ask: textOf(draft, GARMENT).trim(),
    params: {
      ...emptyParams(),
      extraInputMediaIds: photoIds(draft),
      colour: colourWire(band, draft),
    },
  }),

  // «N pictures back · N paid calls, one per photograph · recoloured to 19-4052 TCX» — the ON MODEL
  // words, read off the colour that leaves.
  shape: (_draft, request) =>
    recolorShape((request.params.extraInputMediaIds ?? []).length, request.params.colour),

  inventory: (draft, request) => {
    const sent = request.params.extraInputMediaIds ?? [];
    const list = sent
      .map((id) => imagesOf(draft, PHOTOS).find((m) => (m.id ?? 0) === id))
      .filter((m): m is common_MediaFull => !!m);
    const colour = request.params.colour;
    const code = (colour?.code ?? '').trim();
    const hex = (colour?.hex ?? '').trim();
    return {
      kindWord: 'change a colour',
      intro: list.length
        ? `${list.length} photograph${list.length === 1 ? '' : 's'} travel, one paid call each: every call sees its own photograph and the words below, and nothing else.`
        : 'No photograph yet. Each one added is its own paid call, and each call sees only its own photograph and the words below.',
      groups: [
        {
          key: 'photos',
          label: 'photographs',
          aside: `${list.length} of ${RECOLOR_SOURCES_MAX}`,
          note: 'one call per photograph — each comes back as its own picture.',
          lines: pictureLines(list, (i) => `photograph ${i + 1}`),
          text: 'no photograph yet',
        },
        {
          key: 'garment',
          label: 'garment to recolor',
          aside: request.ask ? `${request.ask.length} characters` : 'nothing typed',
          words: request.ask,
          text: request.ask
            ? undefined
            : 'no words — the model recolours the garment it finds in each photograph',
        },
        {
          key: 'colour',
          label: 'new colour',
          aside: code || '—',
          text: code
            ? `Pantone ${code}${hex ? ` — the value sent beside it is ${hex}` : ' — no screen value is known for this code; the code alone travels'}`
            : 'no colour picked yet',
        },
        {
          key: 'card',
          label: 'from the card',
          text: 'the server adds this card’s garment description and fit to the words — the one thing of the card a recolour reads.',
        },
      ],
      notSent: NOT_SENT,
    };
  },

  results: {
    reps: ['onmodel'],
    // A recolour with a pictured cloth is Swap Fabrics' (C-07, the server's `designWorkflowOf`).
    match: matchesWorkflow('change_color'),
    selectable: true,
  },

  recall: (past, media) => {
    const said: string[] = [];
    let lost = 0;
    const list: common_MediaFull[] = [];
    for (const id of past.params?.extraInputMediaIds ?? []) {
      const found = media.get(id ?? 0);
      if (found) list.push(found);
      else lost++;
    }
    const recipe = past.params?.colour;
    const code = (recipe?.code ?? '').trim();
    const hex = (recipe?.hex ?? '').trim();
    /* THE PICKER SPEAKS PANTONE ONLY. A past ON MODEL run could carry a bare hex, a cloth or colour
       words; none of those can be shown on this form, so none of them is laid back silently — a
       value that travels but is not drawn is a hidden input. Each is said instead. */
    const book = pantoneColour(code);
    const colour = code
      ? { code: book.code, hex: book.hex || (hexIsPaintable(hex) ? hex : '') }
      : NO_PANTONE;
    if (!code && hex) said.push(`its colour ${hex} has no Pantone code — pick one`);
    if ((recipe?.fabrics ?? []).some((f) => (f.mediaId ?? 0) > 0)) {
      said.push('its cloth did not come along — this workflow recolours with a Pantone');
    }
    if ((recipe?.words ?? '').trim()) said.push('its colour words did not come along');
    return {
      draft: {
        ...EMPTY_DRAFT,
        texts: { [GARMENT]: (past.ask ?? '').trim() },
        images: { [PHOTOS]: list.slice(0, RECOLOR_SOURCES_MAX) },
        colours: { [COLOUR]: colour },
      },
      said,
      lost,
    };
  },
};

export const CHANGE_COLOR: Pick<WorkflowDef, 'gate' | 'run'> = {
  // A server that sends `playground_workflows` decides (C-08). One older than it has no capability
  // field for `recolor`: every server that speaks the design band has the door, and a route whose
  // key is not configured answers GENERATE with its own words (`RunRefusal`).
  gate: (band) => workflowOfferedOr(band, 'change_color', () => ({ available: true })),
  run,
};
