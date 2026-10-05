/**
 * PAINT THE PARTS · T24 — THE ENGINE'S PICTURE CEILING, ASKED BEFORE GENERATE.
 *
 * A render carries, in ONE call: every bench plate, every card reference, the cloths' pictures and
 * the placed artworks' pictures (each picture once), then every colour map and every cloth mockup.
 * Beta run 72 sent 4 plates + 3 references + 4 maps + 4 mockups + 2 cloths = 17 to GPT Image 2,
 * which takes 16; the server now refuses that at the door (`too_many_pictures`), and this screen
 * makes it fit first.
 *
 * WHAT GIVES WAY: the mockups, and only them — a map is the run's statement of WHERE each cloth
 * goes, a mockup is an optional hint of scale per map. Dropped side_r, side_l, back, front (the
 * least looked-at side first). If the run still does not fit with no mockup at all, the gate
 * refuses with the server's own sentence and nothing launches.
 *
 * COUNTED EXACTLY AS THE SERVER COUNTS (`designImageCallImagesWithArtworks`): the inputs are a SET
 * (one picture named twice is sent once); maps and mockups are added one each.
 */
import type {
  DesignImageModel,
  GetDesignBandResponse,
  common_DesignColourMap,
  common_DesignFabricUse,
} from 'api/proto-http/admin';

import { benchRowMatches } from '../bench-kinds';
import { flatPictureIds, quadOfPlacement, type CanvasArtwork } from './artworks';
import { placementsOnPicture } from '../assets/model';

/** The order mockups give way in: the first is dropped first. */
export const MOCKUP_DROP_ORDER: readonly string[] = ['side_r', 'side_l', 'back', 'front'];

/** The engine a render runs on: it states no `image`, so the server's default row (else the first). */
export function renderEngine(band: GetDesignBandResponse): DesignImageModel | null {
  const rows = (band.imageModels ?? []).filter((m) => (m.slug ?? '').trim() !== '');
  return rows.find((m) => m.isDefault) ?? rows[0] ?? null;
}

/**
 * The pictures of a render that are not maps or mockups, as media ids (the server's
 * `designRunInputMediaRefs` + frozen artworks): the flat plates, the card's references, the
 * recipe's cloth pictures and the placed artworks' pictures.
 */
export function renderInputMediaIds(
  band: GetDesignBandResponse,
  colorwayId: number,
  recipe: { fabricMediaId?: number; fabrics?: readonly common_DesignFabricUse[] },
  artworks: readonly CanvasArtwork[],
): number[] {
  const out: number[] = [];
  out.push(recipe.fabricMediaId ?? 0);
  for (const f of recipe.fabrics ?? []) out.push(f.mediaId ?? 0);
  for (const row of band.bench ?? []) {
    if (benchRowMatches(row, 'flat', colorwayId)) out.push(row.picture?.media?.id ?? 0);
  }
  for (const r of band.references ?? []) out.push(r.mediaId ?? 0);
  if (artworks.length > 0) {
    const byAsset = new Map(artworks.map((a) => [a.assetId, a]));
    for (const pictureId of flatPictureIds(band).values()) {
      for (const p of placementsOnPicture(band, pictureId, [...byAsset.keys()])) {
        const a = byAsset.get(p.assetId ?? 0);
        if (a && quadOfPlacement(p)) out.push(a.asset.mediaId ?? 0);
      }
    }
  }
  return out;
}

/**
 * T27 · the sides that carry a placed artwork — the server adds ONE placement guide per such side
 * when it fits. The guide is what puts the artwork at its true size and place, so it outranks a
 * mockup: the mockups give way to make room for it (the server still drops a guide that does not fit).
 */
export function artworkGuideCount(
  band: GetDesignBandResponse,
  artworks: readonly CanvasArtwork[],
): number {
  if (artworks.length === 0) return 0;
  const assets = artworks.map((a) => a.assetId);
  let n = 0;
  for (const pictureId of flatPictureIds(band).values()) {
    if (placementsOnPicture(band, pictureId, assets).some((p) => quadOfPlacement(p))) n += 1;
  }
  return n;
}

export type MockupFit = {
  /** The views whose map takes its mockup (the rest go without). */
  keep: Set<string>;
  /** The views whose mockup was dropped to fit, in drop order. */
  dropped: string[];
  /** What the call will carry with the kept mockups. */
  total: number;
  /** The ceiling (0 = unknown, nothing is trimmed). */
  ceiling: number;
  /** Still over the ceiling with every mockup dropped: the gate refuses. */
  over: boolean;
};

/**
 * Which maps take a mockup so the call fits `ceiling`. `inputIds` may repeat and hold zeros (a set
 * is taken); `maps` are the outgoing maps (each wants a mockup).
 */
export function fitMockups(
  inputIds: readonly number[],
  maps: readonly Pick<common_DesignColourMap, 'mediaId' | 'view'>[],
  ceiling: number,
  /** Placement guides wanted (artworkGuideCount): room is made for them first, but they are
   *  optional — a run without them is not over the ceiling. */
  guides = 0,
): MockupFit {
  const inputs = new Set(inputIds.filter((id) => id > 0)).size;
  const sent = maps.filter((m) => (m.mediaId ?? 0) > 0);
  const keep = new Set(sent.map((m) => m.view ?? ''));
  const dropped: string[] = [];
  const total = () => inputs + sent.length + keep.size;
  if (ceiling > 0) {
    const rank = (v: string) => {
      const i = MOCKUP_DROP_ORDER.indexOf(v);
      return i < 0 ? -1 : i; // an unknown view gives way before side_r
    };
    const order = [...keep].sort((a, b) => rank(a) - rank(b));
    for (const v of order) {
      if (total() + guides <= ceiling) break;
      keep.delete(v);
      dropped.push(v);
    }
  }
  return { keep, dropped, total: total(), ceiling, over: ceiling > 0 && total() > ceiling };
}

/** The server's refusal, word for word in its first half (design_run_artworks.go). */
export function overCeilingSentence(fit: MockupFit, label: string): string {
  return (
    `this render would send ${fit.total} pictures and ${label || 'this model'} takes at most ` +
    `${fit.ceiling} — drop a reference or a cloth so it fits (every cloth mockup is already left out)`
  );
}
