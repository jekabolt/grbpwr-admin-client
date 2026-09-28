import type { common_DesignRun, common_MediaFull } from 'api/proto-http/admin';

import { slotCounter } from '../../fields';
import { ideaMediaIds } from '../../ideas-server';
import {
  emptyParams,
  imagesOf,
  mediaIdsOf,
  pictureLines,
  textOf,
  workflowOffered,
} from '../common';
import { matchesWorkflow } from '../run-workflow';
import { EMPTY_DRAFT, type Draft, type WorkflowDef, type WorkflowRun } from '../types';

/**
 * ═══ TILE 13 · IMAGE TO VIDEO → kind `video` (B-32, backend runblob Kling image-to-video) ════════
 *
 * Owner, 28.09: «в runblob есть и видео и фото — делай и то и то». THE SHAPE IS THE 3D TILE'S
 * (owner's rule: simple UI, next to Image to 3D): one picture of the card, the words, GENERATE.
 * One five-second clip comes back and plays in its tile among the room's pictures.
 *
 * THE REQUEST (`design_video.go`, the door; `designgen/video.go`, the route):
 *
 *   · `params.video.source_media_id = id` — the ONE picture, read as the first frame. It must be
 *     this card's (or a fresh upload) and a PICTURE: the door's non-picture gate reads this field,
 *     so a .glb or an .mp4 named here is refused `input_not_a_picture`, free.
 *   · `ask` — the words, REQUIRED (`words_required`): Kling takes a prompt of 1–2500 characters and
 *     the route sends the ask VERBATIM — no craft paragraph, nothing of the card. What the box says
 *     is what the provider reads.
 *   · `duration: 5` — the one length the route sells today (the door refuses any other,
 *     `unknown_option`); said explicitly so the history reads «5 s» even when the default moves.
 *   · `model: ''` — the server FREEZES the slug from the panel's `video.generate` route row (else
 *     Kling's default) before the money; the client never names one.
 *   · `colorway_id: 0` — a clip files under no colourway, like every playground output.
 *
 * NO DOLLAR FIGURE ON THIS TILE (the 3D tile's rule, G-02 Codex 3): the server reserves the
 * configured ceiling (`RUNBLOB_VIDEO_CEILING_USD`) and books runblob's own price at submit; the
 * history shows what it cost.
 *
 * RESULTS ARE THE ROOM'S TILES (`reps: ['playground']`, narrowed to `video` runs): the clip's media
 * row has the .mp4 in every slot (no thumbnail — `UploadContentVideo`), and the picture tile draws
 * an .mp4 as a playing clip (`<video controls playsInline muted loop>`), the viewer plays it too.
 *
 * THE GATE. `image_to_video` in `playground_workflows`: the server lists it exactly when its kind
 * gate is open — runblob has a key. No key → the door would refuse `kind_not_available`, so the tile
 * is dimmed with the reason instead of leading to a refusal.
 */
const SOURCE = 'source';
const WORDS = 'words';

/** Kling's prompt ceiling (`designgen.VideoMaxPromptRunes`); the door refuses past it. */
const WORDS_MAX = 2500;
/** The one length the route sells (`designgen.VideoDurationSeconds`). */
const DURATION_S = 5;

const one = (draft: Draft) => mediaIdsOf(imagesOf(draft, SOURCE)).slice(0, 1);

const run: WorkflowRun = {
  sections: [
    {
      key: SOURCE,
      title: 'Picture to animate',
      glyph: 'image',
      required: true,
      // «0/1» beside REQUIRED, as every picture section of the room counts its slots.
      value: (draft) => slotCounter(imagesOf(draft, SOURCE).length, 1),
      fields: [
        {
          type: 'images',
          key: SOURCE,
          mode: 'grow',
          max: 1,
          purpose: 'image to video · first frame',
          // This card's pictures and the fittings' photographs, as the 3D tile takes them.
          sources: ['card', 'fittings'],
        },
        {
          type: 'note',
          key: 'source-note',
          text: 'Read as the first frame. The clip keeps this picture’s shape (16:9, 9:16 or 1:1, whichever is nearest).',
        },
      ],
    },
    {
      key: WORDS,
      title: 'Describe the motion',
      glyph: 'text',
      required: true,
      fields: [
        {
          type: 'prompt',
          key: WORDS,
          label: 'Describe the motion',
          placeholder: 'The coat sways in a slow breeze; the camera holds still',
          hint: 'what moves in the five seconds — the garment, the model, the camera',
          maxLength: WORDS_MAX,
          // C-15: what the server's Ideas look at — the picture to animate.
          ideasFrom: (draft) => ({ mediaIds: ideaMediaIds(imagesOf(draft, SOURCE)[0]) }),
        },
      ],
    },
  ],

  validate: (draft) => {
    if (one(draft).length === 0) {
      return { reason: 'add the picture to animate', section: SOURCE };
    }
    if (!textOf(draft, WORDS).trim()) {
      return { reason: 'describe the motion', section: WORDS };
    }
    return null;
  },

  wire: (draft) => ({
    kind: 'video',
    ask: textOf(draft, WORDS).trim(),
    params: {
      ...emptyParams(),
      video: {
        sourceMediaId: one(draft)[0] ?? 0,
        duration: DURATION_S,
        // The server freezes the slug from its route row; a client that named one would sell a
        // choice the panel owns.
        model: '',
      },
    },
  }),

  // The row adds «priced by the server when the run starts» itself — no figure.
  shape: () => `1 clip · ${DURATION_S} s`,

  inventory: (draft, request) => {
    const sent = request.params.video?.sourceMediaId ?? 0;
    const list = imagesOf(draft, SOURCE).filter((m) => (m.id ?? 0) === sent);
    return {
      kindWord: 'image to video',
      intro: `One picture travels as the first frame, with the words below, verbatim. One ${DURATION_S}-second clip comes back — an .mp4.`,
      groups: [
        {
          key: 'pictures',
          label: 'picture to animate',
          aside: `${list.length} of 1`,
          lines: pictureLines(list, () => 'first frame'),
          text: 'no picture yet',
        },
        { key: 'words', label: 'the motion', words: request.ask || '(nothing yet)' },
        {
          key: 'clip',
          label: 'the clip',
          lines: [
            { key: 'duration', name: 'length', text: `${DURATION_S} seconds` },
            {
              key: 'shape',
              name: 'shape',
              text: 'the nearest of 16:9, 9:16 and 1:1 to the picture — decided by the server',
            },
            {
              key: 'model',
              name: 'model',
              text: 'the panel’s video route (the server freezes it)',
            },
          ],
        },
      ],
      notSent: [
        {
          label: 'the card',
          reason:
            'no references, no garment description, no fit: the picture and the words are the whole input',
        },
        {
          label: 'a craft paragraph',
          reason: 'the words above go to the provider as they are — nothing is added around them',
        },
      ],
    };
  },

  results: {
    reps: ['playground'],
    match: matchesWorkflow('image_to_video'),
  },

  /**
   * A clip run laid back: its picture (when the snapshot still carries it) and its words. The
   * duration and the frozen slug are the server's to set again — said only when the old run's
   * differ from what this tile sends, so nothing is dropped in silence.
   */
  recall: (past: common_DesignRun, media) => {
    const v = past.params?.video;
    const id = v?.sourceMediaId ?? 0;
    const said: string[] = [];
    let lost = 0;
    const list: common_MediaFull[] = [];
    if (id > 0) {
      const found = media.get(id);
      if (found) list.push(found);
      else lost++;
    } else {
      said.push('it named no picture — pick one for this tile');
    }
    if ((v?.duration ?? 0) > 0 && v?.duration !== DURATION_S) {
      said.push(`it was a ${v?.duration}-second clip — this tile makes ${DURATION_S}-second clips`);
    }
    if ((v?.model ?? '').trim()) {
      said.push(
        `it was made with ${v!.model!.trim()} — this run uses the panel’s current video route`,
      );
    }
    return {
      draft: { ...EMPTY_DRAFT, images: { [SOURCE]: list }, texts: { [WORDS]: past.ask ?? '' } },
      said,
      lost,
    };
  },
};

export const IMAGE_TO_VIDEO: Pick<WorkflowDef, 'gate' | 'run'> = {
  // Phase 2 contract [Codex 10]: the list names the tile, nothing else is read.
  gate: (band) => workflowOffered(band, 'image_to_video'),
  run,
};
