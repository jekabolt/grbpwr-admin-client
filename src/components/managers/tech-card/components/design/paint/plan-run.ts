/**
 * PAINT THE PARTS · what a render run carries when parts are painted.
 *
 * The pack (MATERIALS) stays the source of the cloths; the saved, non-stale maps only add WHERE
 * each cloth goes. Outgoing `fabrics`, in this order (agreed with the prompt on the server):
 *   PACK ORDER, so CLOTH 1 (which takes the colourway's echo scalars) is the main cloth as ever:
 *   each pack cloth in place — painted slots as `mapHex` uses (`parts` = the named parts painted
 *   with that label on the saved maps, else the slot name); the first
 *   cloth with no painted slot is the REMAINDER (`parts: ''`, no mapHex: white on the map); other
 *   unpainted cloths DO NOT TRAVEL (QW3 — named only by their slot's words, the model would place
 *   them anywhere); free colours `{assetId 0, colourHex, mapHex}` last (their `parts` = the named
 *   parts painted with them, else '').
 * Maps travel only when that list has ≥ 2 uses and at least one `mapHex`; otherwise the run is
 * exactly the pack as before.
 *
 * R9 · HARDWARE (buttons, snaps, zips painted on PARTS with a hardware tile): one use per painted
 * hardware slot, after the free colours — `{assetId, mediaId (0 = words only), name, words,
 * kind: 'hardware', parts: '<where> · 2 on the front', NO mapHex}`. Its label never reaches the
 * model's map (the export rewrites it to the cloth around it, `exportLabels`); the mockup carries
 * it. It is no cloth: never counted toward the «≥ 2 uses», never the REMAINDER. The first
 * `MAX_RENDER_HARDWARE` in pack order send their picture, the rest go in words. A painted hardware
 * makes the maps travel with ONE cloth too: the mockup is where the model reads its place and size.
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
import { bindingsOf, boundAsset, type ClothSlot } from '../pattern/slot-fabrics';
import { boundClothsOf } from '../render/drafts';
import { slotLabels } from './map-model';

/** R9 · at most this many hardware pictures per render; the rest go in words. */
export const MAX_RENDER_HARDWARE = 2;

/** R9 · the kind a hardware use carries (the shelf's own word, `ASSET_HARDWARE`). */
export const HARDWARE_USE = 'hardware';

export const isHardwareUse = (f: Pick<common_DesignFabricUse, 'kind'>): boolean =>
  (f.kind ?? '').trim() === HARDWARE_USE;

export type PaintRun =
  | { kind: 'none' }
  | { kind: 'refuse'; reason: string; next?: 'materials' }
  | {
      kind: 'maps';
      fabrics: common_DesignFabricUse[];
      fabricMediaId: number;
      /** Palettes WITHOUT the hardware labels (the export rewrites those pixels at GENERATE). */
      colourMaps: common_DesignColourMap[];
      /** R9 · the views whose saved map carries hardware (their map is exported at GENERATE). */
      hardwareViews: string[];
      /** R9 · hardware label hex → its use's index in `fabrics`. */
      hardwareLabels: Map<string, number>;
    };

/** R9 · the words of a hardware slot: what the BOM line says of it, past its name. */
const hardwareWords = (slot: ClothSlot): string =>
  [slot.purposeLabel, slot.detail].filter((x) => x.trim()).join(' · ') || slot.words;

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
  hardware,
  hardwareParts,
}: {
  band: GetDesignBandResponse;
  plan: ColourPlanDoc | undefined;
  slots: readonly ClothSlot[] | undefined;
  colorwayId: number;
  colorwayLabel: string;
  /** Label hex → part names painted with it on the saved maps (`PaintSession.partNames`). */
  partNames?: ReadonlyMap<string, string>;
  /** R9 · the paintable hardware slots, in pack order (`isPaintableHardware`). */
  hardware?: readonly ClothSlot[];
  /** R9 · hardware label hex → where it sits and how many per view (`PaintSession.hardwareParts`). */
  hardwareParts?: ReadonlyMap<string, string>;
}): PaintRun {
  if (!plan) return { kind: 'none' };
  const maps = sendableMaps(band, plan);
  if (maps.length === 0) return { kind: 'none' };

  const painted: string[] = [];
  for (const m of maps)
    for (const s of m.palette) if (!painted.includes(s.hex)) painted.push(s.hex);
  if (painted.length === 0) return { kind: 'none' };

  const list = (slots ?? []).filter((s) => s.bomItemId > 0);
  const hwList = (hardware ?? []).filter((s) => s.bomItemId > 0);
  const labelOf = slotLabels(
    list.map((s) => s.bomItemId),
    hwList.map((s) => s.bomItemId),
  );
  const slotByLabel = new Map<string, ClothSlot>();
  for (const s of list) {
    const hex = labelOf.get(s.bomItemId);
    if (hex) slotByLabel.set(hex, s);
  }
  const hwByLabel = new Map<string, ClothSlot>();
  for (const s of hwList) {
    const hex = labelOf.get(s.bomItemId);
    if (hex && !slotByLabel.has(hex)) hwByLabel.set(hex, s);
  }
  const bound = new Map(bindingsOf(band, colorwayId, list).map((b) => [b.slot.bomItemId, b.asset]));
  const where = colorwayLabel || 'this colourway';

  // Every painted label must resolve: a slot label to its slot's cloth in this colourway, any
  // other label ONLY to a free colour row (assetId 0 + colourHex). A plan row never sources an
  // asset — it could name a cloth that is not in this colourway's MATERIALS.
  const paintedSet = new Set(painted);
  const colourUses: common_DesignFabricUse[] = [];
  for (const hex of painted) {
    if (hwByLabel.has(hex)) continue;
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
  // (`parts: ''`, no mapHex); other unpainted cloths stay home (QW3). Free colours go last.
  const byAsset = new Map<number, ClothSlot[]>();
  for (const { slot, asset } of bindingsOf(band, colorwayId, list)) {
    const id = asset.id ?? 0;
    if (id <= 0) continue;
    byAsset.set(id, [...(byAsset.get(id) ?? []), slot]);
  }
  const pack = boundClothsOf(band, colorwayId, list);
  const fabrics: common_DesignFabricUse[] = [];
  let remainder = false;
  // R9 · only hardware painted: the cloths travel exactly as the pack (nobody divided them).
  const clothPainted = painted.some((hex) => !hwByLabel.has(hex));
  for (const c of pack) {
    if (!clothPainted) {
      fabrics.push(fabricUseOf(band, c.assetId, { parts: c.parts }));
      continue;
    }
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
    }
  }
  fabrics.push(...colourUses);
  const cloths = fabrics.length;

  // R9 · one use per painted hardware slot, in pack order; the first MAX_RENDER_HARDWARE with a
  // picture send it. No mapHex: the label stays off the model's map.
  const hardwareLabels = new Map<string, number>();
  let pictures = 0;
  for (const slot of hwList) {
    const hex = labelOf.get(slot.bomItemId) ?? '';
    if (!hwByLabel.has(hex) || !paintedSet.has(hex)) continue;
    const asset = boundAsset(band, colorwayId, slot.bomItemId);
    const picture = (asset?.mediaId ?? 0) > 0 && pictures < MAX_RENDER_HARDWARE;
    if (picture) pictures += 1;
    hardwareLabels.set(hex, fabrics.length);
    fabrics.push({
      mapHex: '',
      assetId: asset?.id ?? 0,
      name: slot.name,
      mediaId: picture ? asset?.mediaId ?? 0 : 0,
      colourCode: '',
      colourHex: '',
      words: (asset?.note ?? '').trim() || hardwareWords(slot),
      parts: hardwareParts?.get(hex) || slot.name,
      kind: HARDWARE_USE,
      repeatMm: 0,
    });
  }

  if (cloths === 0 || (cloths < 2 && hardwareLabels.size === 0)) return { kind: 'none' };
  const hardwareViews = maps
    .filter((m) => m.palette.some((sw) => hwByLabel.has(sw.hex)))
    .map((m) => m.view);
  return {
    kind: 'maps',
    fabrics,
    fabricMediaId: fabrics.find((f) => !isHardwareUse(f) && (f.mediaId ?? 0) > 0)?.mediaId ?? 0,
    colourMaps: maps.map((m) => {
      const w = writeMap(m);
      return { ...w, palette: (w.palette ?? []).filter((sw) => !hwByLabel.has(sw.hex ?? '')) };
    }),
    hardwareViews,
    hardwareLabels,
  };
}

/** R9 · a view as the prompt's view words say it (designgen `viewWord`). */
const VIEW_WORD: Record<string, string> = {
  front: 'front',
  back: 'back',
  side_l: 'left side',
  side_r: 'right side',
};

/**
 * R9 · the `parts` of a hardware use: where it sits (the named parts under it), then how many on
 * each view — `left front body · 2 on the front, 2 on the back`. Counts are per view (cuff buttons
 * on the front and the back are one physical set); the BOM quantity is never written from them.
 */
export function hardwarePartsText(
  places: readonly string[],
  counts: readonly { view: string; n: number }[],
): string {
  const per = counts
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} on the ${VIEW_WORD[c.view] ?? c.view.replace(/_/g, ' ')}`)
    .join(', ');
  return [[...new Set(places.filter(Boolean))].join(', '), per].filter(Boolean).join(' · ');
}

/**
 * R9 · WHAT THE MODEL GETS: one line per hardware use — `front button · 2 on the front · picture`
 * (`words` when its picture does not travel).
 */
export function hardwareModelLines(
  fabrics: readonly common_DesignFabricUse[] | undefined,
): string[] {
  return (fabrics ?? []).filter(isHardwareUse).map((f) => {
    const name = (f.name ?? '').trim().toLowerCase() || 'hardware';
    const parts = (f.parts ?? '').trim();
    return [
      name,
      parts && parts.toLowerCase() !== name ? parts : '',
      (f.mediaId ?? 0) > 0 ? 'picture' : 'words',
    ]
      .filter(Boolean)
      .join(' · ');
  });
}

/**
 * QW1 · the REMAINDER as the run will lay it (`paintRun`'s rule): the first pack cloth none of
 * whose slots is painted — its asset and the label of its first slot (the canvas's skin of it).
 * `painted` = the labels on the sides now. Nothing painted, or every cloth painted: null.
 */
export function remainderCloth({
  band,
  slots,
  colorwayId,
  painted,
}: {
  band: GetDesignBandResponse;
  slots: readonly ClothSlot[] | undefined;
  colorwayId: number;
  painted: ReadonlySet<string>;
}): { assetId: number; label: string } | null {
  if (painted.size === 0) return null;
  const list = (slots ?? []).filter((s) => s.bomItemId > 0);
  const labelOf = slotLabels(list.map((s) => s.bomItemId));
  const byAsset = new Map<number, ClothSlot[]>();
  for (const { slot, asset } of bindingsOf(band, colorwayId, list)) {
    const id = asset.id ?? 0;
    if (id > 0) byAsset.set(id, [...(byAsset.get(id) ?? []), slot]);
  }
  for (const c of boundClothsOf(band, colorwayId, list)) {
    const own = byAsset.get(c.assetId) ?? [];
    if (own.some((sl) => painted.has(labelOf.get(sl.bomItemId) ?? ''))) continue;
    return { assetId: c.assetId, label: labelOf.get(own[0]?.bomItemId ?? 0) ?? '' };
  }
  return null;
}
