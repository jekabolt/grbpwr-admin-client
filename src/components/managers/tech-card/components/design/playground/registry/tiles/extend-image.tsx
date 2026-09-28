import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';

import type { NotSentItem } from '../../../core';
import { EXTEND_FORMAT_RATIOS, slotCounter } from '../../fields';
import {
  emptyParams,
  formatOf,
  formatSection,
  imagesOf,
  mediaIdsOf,
  overCompositeCap,
  pictureLines,
  runKindOffered,
  SOURCE_TOO_LARGE,
  workflowOffered,
} from '../common';
import { matchesWorkflow } from '../run-workflow';
import {
  EMPTY_DRAFT,
  type Draft,
  type Refusal,
  type WorkflowDef,
  type WorkflowRun,
} from '../types';

/**
 * ═══ TILE 9 · EXTEND IMAGE → kind `extend` (C-13, phase 3) ════════════════════════════════════════
 *
 * Owner: «Extend a fashion image into a new ratio, and the scene continues instead of being
 * cropped.» His 11.png: «Image to expand» REQUIRED (one slot + Reuse), «New final format» open, its
 * value on the header, nine ratios — no auto, with 9:21. No prompt, no AI model, no background.
 *
 * THE WIRE (the door: `designRefuseUnworkableExtend` / `designRefuseExtendTarget`, backend
 * design_fal_routes.go):
 *   kind 'extend', ask '' (the route has no prompt: `extend_takes_no_words`);
 *   params.extra_input_media_ids = [the one picture] (`one_source_picture`);
 *   params.extend = {aspect_ratio} — one of the nine, never auto (`extend_aspect_unknown`);
 *   no `freeform`, no `image` (`image_options_forbidden`: the outpaint route has no engine choice).
 * The server computes the per-side growth, caps the canvas at 3 megapixels and pastes the source's
 * own pixels back over the answer — «your pixels are kept» is a fact of the bytes, not a hope.
 *
 * GATED ON `run_kinds` (band 32) CONTAINING `extend`, strictly: a server older than phase 3 sends
 * no list and the tile stays dimmed «not on this server yet»; a list without `extend` = the route is
 * not wired (no key, or no bounded reserve) on this server.
 */
const IMAGE = 'image';

/** Draft key of the target proportion. */
export const EXTEND_FORMAT_KEY = 'format';

const FORMAT = formatSection({
  key: EXTEND_FORMAT_KEY,
  title: 'New final format',
  ratios: EXTEND_FORMAT_RATIOS,
  initial: '2:3',
  unbound: true,
  defaultOpen: true,
});

/** The server's floor on either side of the source (`designgen.WindowMinSourcePx`). */
export const EXTEND_MIN_SOURCE_PX = 64;
/** Within this relative distance a target IS the source's proportion (`extendSameRatioTolerance`). */
export const EXTEND_SAME_RATIO_TOLERANCE = 0.005;

/** width / height of a ratio word («2:3» → 0.667), or null when it is not a ratio. */
function ratioValue(ratio: string): number | null {
  const [a, b] = ratio.split(':').map(Number);
  return a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b) ? a / b : null;
}

/**
 * THE SERVER'S PREDICATE, IN TS (`designgen.ExtendTargetAddsNothing` → `extendGeometry`): a target
 * within 0.5 % of the picture's own proportion, or one that rounds to no new pixel, adds nothing —
 * the door refuses it (`target_aspect_must_extend`). `null` = not decidable here (no stated size, or
 * a ratio outside the nine: the door answers).
 */
export function extendTargetAddsNothing(w: number, h: number, ratio: string): boolean | null {
  const r = ratioValue(ratio);
  if (r === null || !(EXTEND_FORMAT_RATIOS as readonly string[]).includes(ratio)) return null;
  if (w <= 0 || h <= 0) return null;
  const src = w / h;
  if (Math.abs(r - src) / src <= EXTEND_SAME_RATIO_TOLERANCE) return true;
  const cw = r > src ? Math.round(h * r) : w;
  const ch = r > src ? h : Math.round(w / r);
  return cw <= w && ch <= h;
}

/** Which sides grow: a wider target grows left and right, a taller one top and bottom. */
function sidesOf(w: number, h: number, ratio: string): string {
  const r = ratioValue(ratio);
  if (r === null || w <= 0 || h <= 0) return 'on two opposite sides';
  return r > w / h ? 'on the left and the right' : 'at the top and the bottom';
}

/** The full-size pixel dimensions the media row states (0 = not stated). */
function sizeOf(media: common_MediaFull | undefined): { w: number; h: number } {
  const full = media?.media?.fullSize;
  return { w: full?.width ?? 0, h: full?.height ?? 0 };
}

const picture = (draft: Draft): common_MediaFull | undefined => imagesOf(draft, IMAGE)[0];
const one = (draft: Draft) => mediaIdsOf(imagesOf(draft, IMAGE)).slice(0, 1);

const NOT_SENT: readonly NotSentItem[] = [
  {
    label: 'words',
    reason: 'the extend route takes no prompt — the server refuses one that has words',
  },
  {
    label: 'AI model',
    reason: 'the extend route draws with its own model — there is no model to choose',
  },
  { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
  {
    label: 'the card',
    reason: 'nothing of the card travels: no bench, no references, no description',
  },
];

/**
 * EVERY REFUSAL THE SCREEN CAN MAKE FOR FREE, in the door's order: the picture
 * (`one_source_picture`), the ratio (`extend_aspect_unknown`), then — only where the media row states
 * its size — the source's size (`source_too_large` over 18 MP, `source_too_small`) and a target that adds nothing
 * (`target_aspect_must_extend`). `null` = ready.
 */
export function extendRefusal(draft: Draft, band: GetDesignBandResponse): Refusal | null {
  if (one(draft).length === 0) return { reason: 'add the picture to extend', section: IMAGE };
  const ratio = formatOf(band, draft, FORMAT.field);
  const formatSectionKey = FORMAT.section.key;
  if (!(EXTEND_FORMAT_RATIOS as readonly string[]).includes(ratio))
    return { reason: 'pick the new final format', section: formatSectionKey };
  const { w, h } = sizeOf(picture(draft));
  if (overCompositeCap(w, h)) return { reason: SOURCE_TOO_LARGE, section: IMAGE };
  if (w > 0 && h > 0 && (w < EXTEND_MIN_SOURCE_PX || h < EXTEND_MIN_SOURCE_PX)) {
    return {
      reason: `this picture is ${w}×${h} px; an extend needs at least ${EXTEND_MIN_SOURCE_PX} px on each side`,
      section: IMAGE,
    };
  }
  if (extendTargetAddsNothing(w, h, ratio)) {
    return {
      reason: `this picture is already ${ratio} — pick another format`,
      section: formatSectionKey,
    };
  }
  return null;
}

const run: WorkflowRun = {
  sections: [
    {
      key: IMAGE,
      title: 'Image to expand',
      glyph: 'image',
      required: true,
      // «0/1» beside REQUIRED, as every picture section of the room counts its slots (C-12).
      value: (draft) => slotCounter(imagesOf(draft, IMAGE).length, 1),
      fields: [{ type: 'images', key: IMAGE, mode: 'grow', max: 1, purpose: 'extend' }],
    },
    FORMAT.section,
  ],

  validate: (draft, { band }) => extendRefusal(draft, band),

  wire: (draft, { band }) => ({
    kind: 'extend',
    ask: '',
    params: {
      ...emptyParams(),
      extraInputMediaIds: one(draft),
      extend: { aspectRatio: formatOf(band, draft, FORMAT.field) },
    },
  }),

  shape: () => '1 picture',

  inventory: (draft, request) => {
    const sent = request.params.extraInputMediaIds ?? [];
    const list = imagesOf(draft, IMAGE).filter((m) => sent.includes(m.id ?? 0));
    const ratio = request.params.extend?.aspectRatio ?? '';
    const { w, h } = sizeOf(list[0]);
    return {
      kindWord: 'extend image',
      intro:
        'One picture travels with its new final format, and nothing else. The scene continues instead of being cropped.',
      groups: [
        {
          key: 'pictures',
          label: 'picture',
          aside: `${list.length} of 1`,
          lines: pictureLines(list, () => 'the picture'),
          text: 'no picture yet',
        },
        {
          key: 'format',
          label: 'new final format',
          lines: [
            {
              key: 'ratio',
              name: 'format',
              text: w > 0 && h > 0 ? `${ratio} (the picture is ${w}×${h} px)` : ratio,
            },
          ],
        },
        {
          key: 'craft',
          label: 'what the server adds',
          text: `the picture is extended ${sidesOf(w, h, ratio)} to ${ratio}; your pixels are kept exactly; up to 3 megapixels.`,
        },
      ],
      notSent: NOT_SENT,
    };
  },

  results: { reps: ['playground'], match: matchesWorkflow('extend_image') },

  /**
   * «Run that again»: the picture from `extra_input_media_ids[0]` (while its snapshot still holds
   * it) and the target from `extend.aspect_ratio`. A ratio outside today's nine (a future server's)
   * keeps the tile's default and says so.
   */
  recall: (past, media) => {
    const id = past.params?.extraInputMediaIds?.[0] ?? 0;
    const found = id > 0 ? media.get(id) ?? null : null;
    const ratio = (past.params?.extend?.aspectRatio ?? '').trim();
    const known = (EXTEND_FORMAT_RATIOS as readonly string[]).includes(ratio);
    return {
      draft: {
        ...EMPTY_DRAFT,
        images: { [IMAGE]: found ? [found] : [] },
        choices: { [EXTEND_FORMAT_KEY]: known ? ratio : FORMAT.field.initial },
      },
      said:
        ratio && !known
          ? [`its format (${ratio}) is not offered here — ${FORMAT.field.initial} is set instead`]
          : [],
      lost: found || id <= 0 ? 0 : 1,
    };
  },
};

export const EXTEND_IMAGE: Pick<WorkflowDef, 'gate' | 'run'> = {
  // The route (band 32) first — its reason is the one said — then the tile list (band 28), as the
  // other phase-3 tile does (G-03 Fable n-1): the server lists `extend_image` iff it takes `extend`.
  gate: (band) => {
    const route = runKindOffered(band, 'extend');
    return route.available ? workflowOffered(band, 'extend_image') : route;
  },
  run,
};
