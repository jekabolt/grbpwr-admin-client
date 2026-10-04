/**
 * PAINT THE PARTS · what a render run carries when parts are painted.
 *
 * The pack (MATERIALS) stays the source of the cloths; the saved, non-stale maps only add WHERE
 * each cloth goes. Outgoing `fabrics`, in this order (agreed with the prompt on the server):
 *   PACK ORDER, so CLOTH 1 (which takes the colourway's echo scalars) is the main cloth as ever:
 *   each pack cloth in place — painted slots as `mapHex` uses (`parts` = the named parts painted
 *   with that label on the saved maps, else the slot name); the first
 *   cloth with no painted slot is the REMAINDER (`parts: ''`, no mapHex: white on the map); other
 *   unpainted cloths keep their parts; free colours `{assetId 0, colourHex, mapHex}` last (their
 *   `parts` = the named parts painted with them, else '').
 * Maps travel only when that list has ≥ 2 uses and at least one `mapHex`; otherwise the run is
 * exactly the pack as before.
 *
 * GATE: every label on an outgoing map palette is claimed by exactly one use, or the run refuses
 * before money — a painted slot gone from the BOM, a slot without a cloth in this colourway, a
 * colour label without its plan row.
 */
import type {
  GetDesignBandResponse,
  common_DesignColourMap,
  common_DesignFabricUse,
} from 'api/proto-http/admin';

import { fabricUseOf } from '../assets/model';
import { sendableMaps, writeMap, type ColourPlanDoc } from '../colour-plan/model';
import { bindingsOf, type ClothSlot } from '../pattern/slot-fabrics';
import { boundClothsOf } from '../render/drafts';
import { slotLabels } from './map-model';

export type PaintRun =
  | { kind: 'none' }
  | { kind: 'refuse'; reason: string; next?: 'materials' }
  | {
      kind: 'maps';
      fabrics: common_DesignFabricUse[];
      fabricMediaId: number;
      colourMaps: common_DesignColourMap[];
    };

const colourUse = (
  label: string,
  colourHex: string,
  words = '',
  parts = '',
): common_DesignFabricUse => ({
  mapHex: label,
  assetId: 0,
  name: '',
  mediaId: 0,
  colourCode: '',
  colourHex,
  words,
  parts,
  kind: '',
  repeatMm: 0,
});

export function paintRun({
  band,
  plan,
  slots,
  colorwayId,
  colorwayLabel,
  partNames,
}: {
  band: GetDesignBandResponse;
  plan: ColourPlanDoc | undefined;
  slots: readonly ClothSlot[] | undefined;
  colorwayId: number;
  colorwayLabel: string;
  /** Label hex → part names painted with it on the saved maps (`PaintSession.partNames`). */
  partNames?: ReadonlyMap<string, string>;
}): PaintRun {
  if (!plan) return { kind: 'none' };
  const maps = sendableMaps(band, plan);
  if (maps.length === 0) return { kind: 'none' };

  const painted: string[] = [];
  for (const m of maps)
    for (const s of m.palette) if (!painted.includes(s.hex)) painted.push(s.hex);
  if (painted.length === 0) return { kind: 'none' };

  const list = (slots ?? []).filter((s) => s.bomItemId > 0);
  const labelOf = slotLabels(list.map((s) => s.bomItemId));
  const slotByLabel = new Map<string, ClothSlot>();
  for (const s of list) {
    const hex = labelOf.get(s.bomItemId);
    if (hex) slotByLabel.set(hex, s);
  }
  const bound = new Map(bindingsOf(band, colorwayId, list).map((b) => [b.slot.bomItemId, b.asset]));
  const where = colorwayLabel || 'this colourway';

  // Every painted label must resolve: a slot label to its slot's cloth in this colourway, any
  // other label ONLY to a free colour row (assetId 0 + colourHex). A plan row never sources an
  // asset — it could name a cloth that is not in this colourway's MATERIALS.
  const paintedSet = new Set(painted);
  const colourUses: common_DesignFabricUse[] = [];
  for (const hex of painted) {
    const slot = slotByLabel.get(hex);
    if (slot) {
      if (!bound.get(slot.bomItemId)?.id) {
        return {
          kind: 'refuse',
          reason: `${slot.name || 'a painted part'} has no cloth in ${where}`,
          next: 'materials',
        };
      }
      continue;
    }
    const row = plan.cloths.find((c) => c.hex === hex);
    if (row && row.assetId === 0 && row.colourHex) {
      colourUses.push(colourUse(hex, row.colourHex, row.words, partNames?.get(hex) ?? ''));
      continue;
    }
    return { kind: 'refuse', reason: 'a painted part lost its material · repaint it' };
  }

  // PACK ORDER (CLOTH 1 = the first pack cloth, as before maps): each pack cloth in place — its
  // painted slots as `mapHex` uses; the first cloth with no painted slot is the REMAINDER
  // (`parts: ''`, no mapHex); other unpainted cloths keep their parts. Free colours go last.
  const byAsset = new Map<number, ClothSlot[]>();
  for (const { slot, asset } of bindingsOf(band, colorwayId, list)) {
    const id = asset.id ?? 0;
    if (id <= 0) continue;
    byAsset.set(id, [...(byAsset.get(id) ?? []), slot]);
  }
  const pack = boundClothsOf(band, colorwayId, list);
  const fabrics: common_DesignFabricUse[] = [];
  let remainder = false;
  for (const c of pack) {
    const paintedSlots = (byAsset.get(c.assetId) ?? []).filter((sl) =>
      paintedSet.has(labelOf.get(sl.bomItemId) ?? ''),
    );
    if (paintedSlots.length > 0) {
      for (const sl of paintedSlots)
        fabrics.push(
          fabricUseOf(band, c.assetId, {
            parts: partNames?.get(labelOf.get(sl.bomItemId) ?? '') || sl.name,
            mapHex: labelOf.get(sl.bomItemId) ?? '',
          }),
        );
    } else if (!remainder) {
      remainder = true;
      fabrics.push(fabricUseOf(band, c.assetId, { parts: '' }));
    } else fabrics.push(fabricUseOf(band, c.assetId, { parts: c.parts }));
  }
  fabrics.push(...colourUses);

  if (fabrics.length < 2) return { kind: 'none' };
  return {
    kind: 'maps',
    fabrics,
    fabricMediaId: fabrics.find((f) => (f.mediaId ?? 0) > 0)?.mediaId ?? 0,
    colourMaps: maps.map(writeMap),
  };
}
