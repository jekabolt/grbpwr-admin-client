/**
 * PAINT THE PARTS · what a render run carries when parts are painted.
 *
 * The pack (MATERIALS) stays the source of the cloths; the saved, non-stale maps only add WHERE
 * each cloth goes. Outgoing `fabrics`, in this order (agreed with the prompt on the server):
 *   1. the REMAINDER — the first pack cloth (slot order) none of whose slots is painted, with
 *      `parts: ''` and no `mapHex`: white on the map is «every part the others do not claim»;
 *   2. every painted label as its own use with `mapHex` — a slot label wears that slot's bound
 *      asset in this colourway (`parts` = the slot's name), a colour label `{assetId 0, colourHex}`;
 *   3. the other unpainted pack cloths with their usual `parts`, no `mapHex`.
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

const colourUse = (label: string, colourHex: string): common_DesignFabricUse => ({
  mapHex: label,
  assetId: 0,
  name: '',
  mediaId: 0,
  colourCode: '',
  colourHex,
  words: '',
  parts: '',
  kind: '',
  repeatMm: 0,
});

export function paintRun({
  band,
  plan,
  slots,
  colorwayId,
  colorwayLabel,
}: {
  band: GetDesignBandResponse;
  plan: ColourPlanDoc | undefined;
  slots: readonly ClothSlot[] | undefined;
  colorwayId: number;
  colorwayLabel: string;
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

  const paintedUses: common_DesignFabricUse[] = [];
  const paintedAssets = new Set<number>();
  for (const hex of painted) {
    const slot = slotByLabel.get(hex);
    if (slot) {
      const asset = bound.get(slot.bomItemId);
      if (!asset?.id) {
        return {
          kind: 'refuse',
          reason: `${slot.name || 'a painted part'} has no cloth in ${where}`,
          next: 'materials',
        };
      }
      paintedAssets.add(asset.id);
      paintedUses.push(fabricUseOf(band, asset.id, { parts: slot.name, mapHex: hex }));
      continue;
    }
    const row = plan.cloths.find((c) => c.hex === hex);
    if (row && row.assetId === 0 && row.colourHex) {
      paintedUses.push(colourUse(hex, row.colourHex));
      continue;
    }
    return { kind: 'refuse', reason: 'a painted part lost its material · repaint it' };
  }

  const pack = boundClothsOf(band, colorwayId, list);
  const unpainted = pack.filter((c) => !paintedAssets.has(c.assetId));
  const fabrics: common_DesignFabricUse[] = [];
  const [remainder, ...rest] = unpainted;
  if (remainder) fabrics.push(fabricUseOf(band, remainder.assetId, { parts: '' }));
  fabrics.push(...paintedUses);
  for (const c of rest) fabrics.push(fabricUseOf(band, c.assetId, { parts: c.parts }));

  if (fabrics.length < 2) return { kind: 'none' };
  return {
    kind: 'maps',
    fabrics,
    fabricMediaId: fabrics.find((f) => (f.mediaId ?? 0) > 0)?.mediaId ?? 0,
    colourMaps: maps.map(writeMap),
  };
}
