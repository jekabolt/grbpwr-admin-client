import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_MediaFull,
} from 'api/proto-http/admin';

import { clothShelf, fabricUseOf } from '../../../assets/model';
import type { NotSentItem } from '../../../core';
import { recolorShape, recolourWireColour, targetIsStated } from '../../../recolor/model';
import { EMPTY_RECIPE, wireColourSource } from '../../../render/model';
import { emptyParams, pictureLines, textOf, workflowOffered } from '../common';
import { ideaMediaIds } from '../../ideas-server';
import { matchesWorkflow } from '../run-workflow';
import { EMPTY_DRAFT, type Draft, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 5 · SWAP FABRICS → kind `recolor` with a cloth picture (C-07, D9, [Codex 5]) ════════════
 *
 * Owner: «Swap a fabric on a fashion design or any image.» 8.png: «Your images» REQUIRED with two
 * slots «Your design» and «New fabric», then «Garment to swap fabric on».
 *
 * The same door, body and money as Change a Color — a recolour whose target is a CLOTH PICTURE
 * instead of a Pantone (the server's `reclothCraft`: «the garment made of the cloth in image 2»):
 *
 *  · Your design → `params.extra_input_media_ids = [design]` — one photograph, one paid call.
 *  · New fabric → `params.colour.fabrics = [{media_id: fabric, …}]` AND `colour.fabric_media_id` =
 *    the same id. BOTH, and the echo is not decoration: the worker attaches the cloth from the
 *    scalar while the prompt is chosen from the list (`recolourWireColour`'s note) — a list without
 *    the echo buys a call that names an image 2 it never sent. A fabric of this card's shelf travels
 *    as its shelf row (`recolourWireColour`: name, kind, repeat); any other picture (an upload, a
 *    Fabric to Image result) as a bare cloth row named «fabric».
 *  · Garment to swap fabric on → `ask` (optional; the recolour reads it first).
 *  · No colour: `code`, `hex`, `words` stay empty — the door takes a pictured cloth as the target on
 *    its own (`designRefuseUnworkableRecolourCloth`, B-10's legal swap row), and that is what makes
 *    the server file the run under `swap_fabrics` (`designWorkflowOf`: recolor + a pictured cloth).
 *  · `colorwayId: 0` — the playground binds no colourway.
 *
 * Refused for free here, as the door would: no design, no fabric, and the same picture in both
 * (`cloth_is_also_a_photograph`).
 */
const IMAGES = 'images';
const DESIGN = 'design';
const FABRIC = 'fabric';
/** The Ideas key of this prompt (`ideas.ts`: swap_fabrics.garment). */
const GARMENT = 'garment';

const NOT_SENT: readonly NotSentItem[] = [
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'colour',
    reason: 'no Pantone travels — the fabric picture is the target, its own colour included',
  },
  { label: 'the bench', reason: 'no plate of the card travels — only the two pictures above' },
];

const slotOf = (draft: Draft, slot: string): common_MediaFull | null =>
  draft.slots[IMAGES]?.[slot] ?? null;
const idOf = (media: common_MediaFull | null) => media?.id ?? 0;

/**
 * `params.colour`, exactly as it leaves — the gate, the price words, the inventory and the wire read
 * this one object. Empty (`EMPTY_RECIPE` with no cloth) while no fabric is in its slot.
 */
function colourWire(band: GetDesignBandResponse, draft: Draft): common_DesignColourRecipe {
  const id = idOf(slotOf(draft, FABRIC));
  if (id <= 0) return recolourWireColour(band, EMPTY_RECIPE, 0);
  const shelf = clothShelf(band).find(
    (a) => (a.id ?? 0) > 0 && ((a.mediaId ?? 0) === id || (a.media?.id ?? 0) === id),
  );
  if (shelf) {
    const wired = recolourWireColour(band, EMPTY_RECIPE, shelf.id ?? 0);
    if ((wired.fabrics ?? [])[0]?.mediaId === id) return wired;
  }
  // Not a shelf row (or a row whose picture moved): the picture itself is the cloth.
  const built: common_DesignColourRecipe = {
    ...EMPTY_RECIPE,
    fabrics: [fabricUseOf(band, 0, { mediaId: id, name: 'fabric' })],
    fabricMediaId: id,
  };
  return { ...built, source: wireColourSource(built) };
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
            { key: DESIGN, label: 'Your design', sources: ['card', 'models', 'fittings'] },
            /* The shelf first, then this card's pictures — where a Fabric to Image result lands. */
            { key: FABRIC, label: 'New fabric', sources: ['fabrics', 'card'] },
          ],
          purpose: 'swap fabrics',
        },
      ],
    },
    {
      key: GARMENT,
      title: 'Garment to swap fabric on',
      glyph: 'text',
      fields: [
        {
          type: 'prompt',
          key: GARMENT,
          label: 'Garment to swap fabric on',
          placeholder: 'The cropped denim jacket',
          hint: 'which garment in the design gets the new fabric; everything else stays as it is',
          // C-15: what the server's Ideas look at.
          ideasFrom: (draft) => ({ mediaIds: ideaMediaIds(slotOf(draft, DESIGN)) }),
        },
      ],
    },
  ],

  validate: (draft, { band }) => {
    const design = idOf(slotOf(draft, DESIGN));
    const fabric = idOf(slotOf(draft, FABRIC));
    if (design <= 0) return { reason: 'add your design', section: IMAGES };
    if (fabric <= 0) return { reason: 'add the new fabric', section: IMAGES };
    if (design === fabric) {
      return {
        reason: 'the design and the fabric are the same picture: pick another fabric',
        section: IMAGES,
      };
    }
    if (!targetIsStated(colourWire(band, draft))) {
      return { reason: 'add the new fabric', section: IMAGES };
    }
    return null;
  },

  wire: (draft, { band }) => {
    const design = idOf(slotOf(draft, DESIGN));
    return {
      kind: 'recolor',
      ask: textOf(draft, GARMENT).trim(),
      params: {
        ...emptyParams(),
        extraInputMediaIds: design > 0 ? [design] : [],
        colour: colourWire(band, draft),
      },
    };
  },

  // «1 picture back · 1 paid call … · re-clothed in <fabric>» — read off the body. Always ONE: the
  // form has one design slot, and «each photograph is one paid call» (the empty-list words of the
  // many-photo recolour) would describe a list this tile does not have.
  shape: (_draft, request) => recolorShape(1, request.params.colour),

  inventory: (draft, request) => {
    const design = slotOf(draft, DESIGN);
    const fabric = slotOf(draft, FABRIC);
    const sentDesign = (request.params.extraInputMediaIds ?? [])[0] ?? 0;
    const cloth = (request.params.colour?.fabrics ?? [])[0];
    const designs = design && idOf(design) === sentDesign ? [design] : [];
    const fabrics = fabric && cloth && idOf(fabric) === (cloth.mediaId ?? 0) ? [fabric] : [];
    const shelf = (cloth?.assetId ?? 0) > 0;
    return {
      kindWord: 'swap fabrics',
      intro:
        designs.length && fabrics.length
          ? 'One paid call: your design is image 1, the new fabric image 2, with the words below. Your design comes back cut from the new fabric.'
          : 'One paid call carries your design (image 1) and the new fabric (image 2) with the words below.',
      groups: [
        {
          key: 'pictures',
          label: 'pictures',
          aside: `${designs.length + fabrics.length} of 2`,
          lines: [
            ...pictureLines(designs, () => 'your design'),
            ...pictureLines(fabrics, () =>
              shelf ? `new fabric · ${(cloth?.name ?? '').trim() || 'shelf fabric'}` : 'new fabric',
            ).map((line) => ({ ...line, number: designs.length + 1 })),
          ],
          text: 'no picture yet',
        },
        {
          key: 'garment',
          label: 'garment to swap fabric on',
          aside: request.ask ? `${request.ask.length} characters` : 'nothing typed',
          words: request.ask,
          text: request.ask
            ? undefined
            : 'no words — the model re-clothes the garment it finds in your design',
        },
        {
          key: 'cloth',
          label: 'the fabric row',
          text: cloth
            ? shelf
              ? `this card’s shelf fabric «${(cloth.name ?? '').trim() || 'shelf fabric'}»${(cloth.repeatMm ?? 0) > 0 ? `, its repeat ${cloth.repeatMm} mm` : ''} — its picture is image 2`
              : 'a picture that is not on this card’s shelf — it travels as a bare cloth named «fabric»'
            : 'no fabric yet',
        },
        {
          key: 'card',
          label: 'from the card',
          text: 'the server adds this card’s garment description and fit to the words — the one thing of the card a recolour reads — and its re-cloth paragraph: the same photograph, the garment cut from the cloth of image 2, nothing else changed.',
        },
      ],
      notSent: NOT_SENT,
    };
  },

  results: { reps: ['onmodel'], match: matchesWorkflow('swap_fabrics'), selectable: true },

  recall: (past, media) => {
    const said: string[] = [];
    let lost = 0;
    const photos = past.params?.extraInputMediaIds ?? [];
    const design = media.get(photos[0] ?? 0) ?? null;
    if ((photos[0] ?? 0) > 0 && !design) lost++;
    if (photos.length > 1) {
      said.push(
        `${photos.length - 1} more photograph${photos.length === 2 ? '' : 's'} of that run did not come along — this workflow swaps the fabric on one design`,
      );
    }
    const recipe = past.params?.colour;
    const clothId = (recipe?.fabrics ?? []).find((f) => (f.mediaId ?? 0) > 0)?.mediaId ?? 0;
    const fabric = media.get(clothId) ?? null;
    if (clothId > 0 && !fabric) lost++;
    if ((recipe?.code ?? '').trim() || (recipe?.hex ?? '').trim() || (recipe?.words ?? '').trim()) {
      said.push('its colour did not come along — this workflow swaps the fabric only');
    }
    return {
      draft: {
        ...EMPTY_DRAFT,
        texts: { [GARMENT]: (past.ask ?? '').trim() },
        slots: { [IMAGES]: { [DESIGN]: design, [FABRIC]: fabric } },
      },
      said,
      lost,
    };
  },
};

export const SWAP_FABRICS: Pick<WorkflowDef, 'gate' | 'run'> = {
  gate: (band) => workflowOffered(band, 'swap_fabrics'),
  run,
};
