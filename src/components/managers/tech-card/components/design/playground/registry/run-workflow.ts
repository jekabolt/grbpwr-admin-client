import type { common_DesignRun } from 'api/proto-http/admin';

import { stampedWorkflowOf } from '../../bench-kinds';
import type { WorkflowKey } from './types';

/**
 * ═══ WHICH WORKFLOW A PAST RUN BELONGS TO — the recall address, the results label, the match ═════
 *
 * THE SERVER'S RULE, IN TS (`entity.DesignWorkflowOf`, B-01; the same CASE stamps
 * `DesignCardOutput.run_workflow`, B-07). One answer for every reader, so a picture is filed under
 * one tile on the grid, in its tile's results, in the history under it and in «run that again»:
 *
 *   · freeform → its preset's tile: tryon → Virtual Try-On, fabric_extract → Fabric to Image,
 *     ghost_mannequin → Image to Ghost Mannequin, add_logo → Add a Logo, variations → Create Design
 *     Variations, retouch → Retouch a Zone; `free` AND the retired presets (`add_hardware`,
 *     `repaint_parts`, Q17) → Create or edit;
 *   · recolor → Swap Fabrics when some cloth of `params.colour.fabrics` carries a picture, else
 *     Change a Color (the server's `designAnyClothWithPicture`);
 *   · cutout → Remove Background;
 *   · threed → Image to 3D (C-10, C-12): «run that again» on a 3D run opens tile 12 prefilled
 *     where STEP 5 has left the rail (`recallTargetKind`). Its models are not the room's pictures
 *     (`inPlaygroundRoom` reads representations, and a 3D run has its own), so the room's views
 *     never file one under a tile; only the recall and tile 12's own history read this answer;
 *   · extend → Extend Image; inpaint → Retouch a Zone (phase 3, C-13/C-14): the mask route is the
 *     same tile as the phase-2 window retouch — one tile, two routes, one shelf. Both are decided by
 *     the kind alone, so an off-page stub files exactly as its loaded run does.
 *
 * ⚠ AN OFF-PAGE STUB STATES NO PARAMS. Its answer is the server's stamp on the output
 * (`stampedWorkflowOf`, read beside the stub); a server older than the stamp leaves only the kind,
 * and then the kind's own tile answers (freeform → Create or edit, recolor → Change a Color) — the
 * phase-1 behaviour, never a flip between two tiles as the feed pages (G-01, m-3): a stub and its
 * loaded run give the same answer wherever the server stamps.
 */
export type RoomKey = WorkflowKey;

const ROOM_KEYS: readonly RoomKey[] = [
  'virtual_try_on',
  'fabric_to_image',
  'ghost_mannequin',
  'change_color',
  'swap_fabrics',
  'add_logo',
  'design_variations',
  'remove_background',
  'extend_image',
  'retouch_zone',
  'create_edit',
  'image_to_3d',
];

/** The freeform presets that have a tile of their own; every other preset is Create or edit's. */
const PRESET_WORKFLOW: Readonly<Record<string, RoomKey>> = {
  tryon: 'virtual_try_on',
  fabric_extract: 'fabric_to_image',
  ghost_mannequin: 'ghost_mannequin',
  add_logo: 'add_logo',
  variations: 'design_variations',
  retouch: 'retouch_zone',
};

const isRoomKey = (key: string): key is RoomKey => (ROOM_KEYS as readonly string[]).includes(key);

export function workflowOfRun(run: Pick<common_DesignRun, 'kind' | 'params'>): RoomKey | null {
  const kind = (run.kind ?? '').trim().toLowerCase();
  if (kind === 'threed') return 'image_to_3d';
  if (kind === 'extend') return 'extend_image';
  if (kind === 'inpaint') return 'retouch_zone';
  if (kind !== 'freeform' && kind !== 'recolor' && kind !== 'cutout') return null;
  if (kind === 'cutout') return 'remove_background';
  if (run.params === undefined) {
    const stamped = stampedWorkflowOf(run);
    if (isRoomKey(stamped)) return stamped;
    return kind === 'recolor' ? 'change_color' : 'create_edit';
  }
  if (kind === 'recolor') {
    const cloth = (run.params.colour?.fabrics ?? []).some((f) => (f.mediaId ?? 0) > 0);
    return cloth ? 'swap_fabrics' : 'change_color';
  }
  return PRESET_WORKFLOW[(run.params.freeform?.preset ?? '').trim()] ?? 'create_edit';
}

/** A results `match` for one workflow — the tiles' `ResultsDef.match` is exactly this. */
export const matchesWorkflow =
  (key: RoomKey) =>
  (run: common_DesignRun): boolean =>
    workflowOfRun(run) === key;

/** The preset a freeform run was bought under, or `''` where the run does not say (an off-page stub). */
export function freeformPresetOf(run: common_DesignRun): string {
  if (run.params === undefined) return '';
  return (run.params.freeform?.preset ?? '').trim();
}

/**
 * THE PICTURE A RETOUCH PAINTED ON — the window's `params.freeform.items[0].mediaId` (the one item
 * the door takes) or the mask route's `params.inpaint.sourceMediaId` (C-14) — or 0 where the run is
 * no retouch or does not say (an off-page stub carries no params). Read by
 * the results (a live retouch shown under the tile its picture came from, G-02 m-2) and by the
 * history's recall door (a retouch recalls only while that picture is still in its snapshot).
 */
export function retouchSourceId(run: Pick<common_DesignRun, 'kind' | 'params'>): number {
  if (run.params === undefined || workflowOfRun(run) !== 'retouch_zone') return 0;
  if ((run.kind ?? '').trim().toLowerCase() === 'inpaint')
    return run.params.inpaint?.sourceMediaId ?? 0;
  return run.params.freeform?.items?.[0]?.mediaId ?? 0;
}
