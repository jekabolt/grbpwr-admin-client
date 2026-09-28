import type { common_DesignRun } from 'api/proto-http/admin';

import { runRepresentation, type Representation } from '../../bench-kinds';
import { RETIRED_PRESET_WORD } from './common';
import { freeformPresetOf, workflowOfRun, type RoomKey } from './run-workflow';
import { ADD_LOGO } from './tiles/add-logo';
import { CHANGE_COLOR } from './tiles/change-color';
import { CREATE_EDIT } from './tiles/create-edit';
import { DESIGN_VARIATIONS } from './tiles/design-variations';
import { EXTEND_IMAGE } from './tiles/extend-image';
import { FABRIC_TO_IMAGE } from './tiles/fabric-to-image';
import { GHOST_MANNEQUIN } from './tiles/ghost-mannequin';
import { IMAGE_TO_3D } from './tiles/image-to-3d';
import { REMOVE_BACKGROUND } from './tiles/remove-background';
import { RETOUCH_ZONE } from './tiles/retouch-zone';
import { SWAP_FABRICS } from './tiles/swap-fabrics';
import { VIRTUAL_TRY_ON } from './tiles/virtual-try-on';
import type { WorkflowDef } from './types';

/**
 * ═══ THE TWELVE, IN THE OWNER'S GRID ORDER (00-OWNER-SPEC, tiles 1–12) ═════════════════════════
 *
 * Titles and one-line descriptions are the owner's own words. Eleven of them run (phase 2); each is
 * live where its gate passes — on a server that lists it in `playground_workflows` (D8; Image to 3D
 * also needs `threed_options`), and on a server older than that list only the three today's routes
 * serve (Change a Color → `recolor`, Remove Background → `cutout`, Create or edit →
 * `freeform/free`). Extend Image (phase 3, C-13) runs on its own route and is live only where
 * `run_kinds` (band 32) lists `extend`; elsewhere it is drawn dimmed with its reason. Tile 6's description was cut off in the owner's message; the ending
 * is the adopted default (Q12).
 */
export const WORKFLOWS: readonly WorkflowDef[] = [
  {
    key: 'virtual_try_on',
    title: 'Virtual Try-On',
    blurb: 'Put your products on a model you supply.',
    ...VIRTUAL_TRY_ON,
  },
  {
    key: 'fabric_to_image',
    title: 'Fabric to Image',
    blurb: 'Extract a print or fabric pattern from any image.',
    ...FABRIC_TO_IMAGE,
  },
  {
    key: 'ghost_mannequin',
    title: 'Image to Ghost Mannequin',
    blurb: 'Turn any image into a ghost mannequin visual.',
    ...GHOST_MANNEQUIN,
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
    ...SWAP_FABRICS,
  },
  {
    key: 'add_logo',
    title: 'Add a Logo',
    blurb:
      'Place your logo on a garment: upload the clothing image and the logo as a PNG, the AI sets it into the fabric realistically.',
    ...ADD_LOGO,
  },
  {
    key: 'design_variations',
    title: 'Create Design Variations',
    blurb: 'Create fashion design variations from a reference image.',
    ...DESIGN_VARIATIONS,
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
    ...EXTEND_IMAGE,
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
    ...IMAGE_TO_3D,
  },
];

export function workflowByKey(key: string | null | undefined): WorkflowDef | null {
  if (!key) return null;
  return WORKFLOWS.find((w) => w.key === key) ?? null;
}

// Which workflow a past run belongs to — the server's rule in TS, one answer for every reader.
export {
  freeformPresetOf,
  matchesWorkflow,
  retouchSourceId,
  workflowOfRun,
  type RoomKey,
} from './run-workflow';

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
  virtual_try_on: 'virtual try-on',
  fabric_to_image: 'fabric to image',
  ghost_mannequin: 'ghost mannequin',
  change_color: 'change a colour',
  swap_fabrics: 'swap fabrics',
  add_logo: 'add a logo',
  design_variations: 'design variation',
  remove_background: 'remove background',
  extend_image: 'extend image',
  retouch_zone: 'retouch a zone',
  create_edit: 'create or edit',
  image_to_3d: 'image to 3d',
};
