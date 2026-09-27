import type { common_DesignRun } from 'api/proto-http/admin';

import { runRepresentation, type Representation } from '../../bench-kinds';
import { RETIRED_PRESET_WORD, notYet } from './common';
import { CHANGE_COLOR } from './tiles/change-color';
import { CREATE_EDIT } from './tiles/create-edit';
import { REMOVE_BACKGROUND } from './tiles/remove-background';
import { RETOUCH_ZONE } from './tiles/retouch-zone';
import type { WorkflowDef, WorkflowKey } from './types';

/**
 * ═══ THE TWELVE, IN THE OWNER'S GRID ORDER (00-OWNER-SPEC, tiles 1–12) ═════════════════════════
 *
 * Titles and one-line descriptions are the owner's own words. A workflow whose `run` is absent is
 * drawn dimmed with its reason and cannot be opened: phase 1 runs three of them on today's server
 * (Change a Color → `recolor`, Remove Background → `cutout`, Create or edit → `freeform/free`); the
 * other nine wait for the server to list them (`playground_workflows`, D8) or for their own route
 * (Extend → phase 3). Tile 6's description was cut off in the owner's message; the ending is the
 * adopted default (Q12).
 */
export const WORKFLOWS: readonly WorkflowDef[] = [
  {
    key: 'virtual_try_on',
    title: 'Virtual Try-On',
    blurb: 'Put your products on a model you supply.',
    gate: notYet,
  },
  {
    key: 'fabric_to_image',
    title: 'Fabric to Image',
    blurb: 'Extract a print or fabric pattern from any image.',
    gate: notYet,
  },
  {
    key: 'ghost_mannequin',
    title: 'Image to Ghost Mannequin',
    blurb: 'Turn any image into a ghost mannequin visual.',
    gate: notYet,
  },
  {
    key: 'change_color',
    title: 'Change a Color',
    blurb: 'Change a color on your fashion design.',
    ...CHANGE_COLOR,
  },
  {
    key: 'swap_fabrics',
    title: 'Swap Fabrics',
    blurb: 'Swap a fabric on a fashion design or any image.',
    gate: notYet,
  },
  {
    key: 'add_logo',
    title: 'Add a Logo',
    blurb:
      'Place your logo on a garment: upload the clothing image and the logo as a PNG, the AI sets it into the fabric realistically.',
    gate: notYet,
  },
  {
    key: 'design_variations',
    title: 'Create Design Variations',
    blurb: 'Create fashion design variations from a reference image.',
    gate: notYet,
  },
  {
    key: 'remove_background',
    title: 'Remove Background',
    blurb: 'Cut the subject out and keep it on a transparent background.',
    ...REMOVE_BACKGROUND,
  },
  {
    key: 'extend_image',
    title: 'Extend Image',
    blurb:
      'Extend a fashion image into a new ratio, and the scene continues instead of being cropped.',
    gate: notYet,
  },
  {
    key: 'retouch_zone',
    title: 'Retouch a Zone',
    blurb: 'Paint over part of a design and describe what should change there.',
    ...RETOUCH_ZONE,
  },
  {
    key: 'create_edit',
    title: 'Create or edit images',
    blurb: 'Create or edit any image from a text prompt or reference images.',
    ...CREATE_EDIT,
  },
  {
    key: 'image_to_3d',
    title: 'Image to 3D',
    blurb: 'Create a 3D model from your fashion design.',
    gate: notYet,
  },
];

export function workflowByKey(key: string | null | undefined): WorkflowDef | null {
  if (!key) return null;
  return WORKFLOWS.find((w) => w.key === key) ?? null;
}

/**
 * ═══ WHICH WORKFLOW A PAST RUN BELONGS TO — the recall address and the results label ════════════
 *
 * `recolor` is ON MODEL's kind and now Change a Color; `cutout` is Remove Background; `freeform`
 * is Create or edit — including the retired presets `add_hardware` / `repaint_parts` (Q17): their
 * pictures and words are recalled there and the intake says what did not come along (roles,
 * marked areas). A kind outside the room answers `null`.
 */
export type RoomKey = Extract<WorkflowKey, 'change_color' | 'remove_background' | 'create_edit'>;

export function workflowOfRun(run: Pick<common_DesignRun, 'kind'>): RoomKey | null {
  const kind = (run.kind ?? '').trim().toLowerCase();
  if (kind === 'recolor') return 'change_color';
  if (kind === 'cutout') return 'remove_background';
  if (kind === 'freeform') return 'create_edit';
  return null;
}

/** The preset a freeform run was bought under, or `''` where the run does not say (an off-page stub). */
export function freeformPresetOf(run: common_DesignRun): string {
  if (run.params === undefined) return '';
  return (run.params.freeform?.preset ?? '').trim();
}

/** The representations of the playground room: its own kinds and the recolours ON MODEL held (C-01). */
export const PLAYGROUND_ROOM: readonly Representation[] = ['playground', 'onmodel'];

/**
 * A run of the playground room — THE one predicate: the grid's results and the studio tab's
 * history on the grid both read it.
 */
export function inPlaygroundRoom(run: common_DesignRun): boolean {
  const rep = runRepresentation(run);
  return !!rep && PLAYGROUND_ROOM.includes(rep);
}

/** The word under a result in the room's view: which workflow made it. */
export function runWorkflowWord(run: common_DesignRun): string {
  const key = workflowOfRun(run);
  return retiredPresetWord(run) || (key ? ROOM_WORD[key] : '');
}

/**
 * The retired preset a freeform run was bought under, in words (Q17) — `''` for `free`, for a stub
 * that states no preset, and for every other kind. Create or edit shows these runs as its own, and
 * this word says which preset made one.
 */
export function retiredPresetWord(run: common_DesignRun): string {
  if (workflowOfRun(run) !== 'create_edit') return '';
  const preset = freeformPresetOf(run);
  if (!preset || preset === 'free') return '';
  return RETIRED_PRESET_WORD[preset] ?? preset.replace(/_/g, ' ');
}

/**
 * The room's words for what a run made. «change a colour» is the one the history and the picture
 * picker print for a recolour too (`runWord`, `REP_NOUN`), so the three places agree.
 */
const ROOM_WORD: Readonly<Record<RoomKey, string>> = {
  change_color: 'change a colour',
  remove_background: 'remove background',
  create_edit: 'create or edit',
};
