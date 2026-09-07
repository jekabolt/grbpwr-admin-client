import type {
  GetDesignBandResponse,
  common_DesignBatch,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';

import { benchKindOf, colorwayOf, pictureRepresentation, runRepresentation } from '../bench-kinds';
import type { Representation } from '../bench-kinds';
import { batchHandle, clockStamp, ordinalLetter, runHandle, shelfBatchOrdinals } from '../handles';
import { SAMPLE_WORD } from '../render/model';
import { pictureIsModel } from '../threed/media';
import { viewLabel } from '../views';
import { isPictureHidden } from '../visibility';
import { stepOfKind } from './chain';

/**
 * ═══ THE PICTURES OF THIS CARD, GROUPED THE WAY A PERSON REMEMBERS MAKING THEM ═════════════════
 *
 * Owner (TASKS-r4 п.2): «+ PICTURE» splits in two. The first half is the library — the product's
 * own `MediaSlot`, ⌘V and drop, media that never belonged to this card. The second half is THIS:
 * the pictures the card already has, «уже размеченные нами медиа (плиты верстака) или … история
 * генерации (+ сплиты + эдиты, СГРУППИРОВАННЫЕ)».
 *
 * This file is the reading half of that door: pure functions over ONE `GetDesignBandResponse`, no
 * React, no query, no wire write. The modal (`card-picture-picker.tsx`) draws what comes out and
 * decides nothing about WHICH pictures exist or WHERE they belong.
 *
 * ═══ THE FOUR RULES THE GROUPING IS MADE OF ═══════════════════════════════════════════════════
 *
 * 1. A FAMILY TRAVELS TOGETHER. A crop (`derivation === 'crop'`) and an edit (`'flatten'`) sit
 *    UNDER the picture they came from, wherever that picture is drawn — never as a loose sibling
 *    in some other group. The verb is read as a PAIR with `derived_from`, exactly as the wire's own
 *    comment demands and `generation/composite.tsx` already does for the history's decks: `''` with
 *    a parent id is a legacy row the server declined to classify, and it stands as a root of its
 *    own rather than being folded on a guess — SILENTLY, because not knowing the verb says nothing
 *    about the parent. «parent gone» is spent on ONE state only: the parent is not on this screen.
 *
 * 2. ONE PICTURE, ONE TILE. A bench plate IS a run's output — the same row, reached twice. The
 *    bench wins the tie, because «FLAT · FRONT» is what a person calls that picture; the run group
 *    it would otherwise appear in simply loses a tile.
 *
 * 3. WHAT CANNOT BE AN INPUT IS EITHER ABSENT OR SPOKEN. Hidden pictures are absent (the frozen
 *    rule of `visibility.ts`), a `.glb` is absent (it is not a picture and no prompt can read it),
 *    and a `display_only` row is PRESENT AND DIMMED with the reason the server would refuse it
 *    with. A door that silently drops a picture a person can see on another screen reads as a bug.
 *
 * 4. NO SECOND VOCABULARY. The kind of a run is named by `chain.ts` — the rail's own labels
 *    («flat», «pattern», «fabric render», «3d», «on model») — through `runRepresentation`; the
 *    address of a picture is `handles.ts` (`run 12 · b`, `upload 3`); the colourway is named by the
 *    caller, which is the only holder of the card's colourway refs. A kind this bundle has never
 *    heard of prints its own raw word rather than being guessed into a bucket (the L-1 defect).
 */

/** The verb that attached a tile to its parent. `''` on a root. */
export type CardPictureVerb = 'crop' | 'flatten' | '';

export type CardPictureTile = {
  picture: common_DesignPicture;
  /** Never absent: a picture whose media carries no address at all is dropped before this point. */
  media: common_MediaFull;
  /** `a`, `b`, … — the picture's position inside its run or upload, as `pictureHandle` spells it. */
  letter: string;
  /** The word on the frame: the view of a bench plate, otherwise the letter. */
  badge: string;
  /** Crops and edits of this picture, in the band's own order. */
  children: CardPictureTile[];
  childVerb: CardPictureVerb;
  /**
   * Why this picture may not be taken, in the words the screen prints. `''` = it may. The only
   * intrinsic refusal is `display_only`; the room left in the caller's list is the caller's own.
   */
  refusal: string;
  /**
   * It names a parent that is NOT on this screen — hidden, or on a page this band did not bring.
   *
   * ⚠ NOT «it is drawn as a root». A row the server declined to classify (`derivation: ''`) is a
   * root too, and its parent may be standing right beside it; saying «parent gone» over a picture
   * whose parent is one tile to the left is a statement a person can see is false, and a screen
   * that is caught lying once is read as guessing everywhere after.
   */
  orphan: boolean;
};

export type CardPictureGroup = {
  /** Stable across renders and unique in the list — a React key and a probe's handle. */
  key: string;
  label: string;
  tiles: CardPictureTile[];
} & (
  | { kind: 'bench'; benchKind: string; colorwayId: number }
  /**
   * `run` is `null` for a run that is NOT on the loaded page — `outputs` reaches the whole card
   * and the run page is twelve rows, so an older run arrives as its pictures alone. Nothing is
   * synthesised to fill the hole: a four-field literal wearing the type of a run would silence
   * every reader that asks it for its attempts, its params or its money (the lesson of
   * `cardOutputRows`). The id and the kind are stated separately because they are the two facts
   * an output DOES carry.
   */
  | { kind: 'run'; runId: number; runKind: string; run: common_DesignRun | null }
  | { kind: 'uploads'; batch: common_DesignBatch | null }
);

export type CardPictureOptions = {
  /**
   * Which representations to offer. Absent = every one, INCLUDING the pictures whose kind this
   * bundle cannot classify — «show everything» must not quietly mean «show the five I know».
   * Given, it is a filter: a picture the classifier answers `null` for is not a member of any
   * named representation and stays out.
   */
  reps?: readonly Representation[];
  /** The card's own name for a colourway. `''` for one it does not know. */
  colorwayName?: (colorwayId: number) => string;
  /** Injectable for a test; the clock stamps are otherwise the browser's own zone. */
  timeZone?: string;
};

const DISPLAY_ONLY_REFUSAL = 'display only · not an input';
const ORPHAN_NOTE = 'parent gone';

/** The words a tile prints under its frame for a picture whose parent this band cannot show. */
export function orphanNote(): string {
  return ORPHAN_NOTE;
}

/**
 * The word for a run's kind in a MIXED list.
 *
 * The rail's labels, not a third spelling of them: `stepOfKind` answers «fabric render» where the
 * generation history answers «render», and the history can afford the shorter word because its
 * section already fixes the kind. Here flats, patterns, renders and photographs stand in one
 * column, so the word has to carry the whole distinction on its own.
 *
 * The two flat-coloured kinds that are not a flat drawing keep saying their own word, exactly as
 * the history does (`kindWord`): a text draft is not a drawing, a vector redraw is not a fresh
 * sheet, and the picker is a record of what happened. A kind with no representation at all prints
 * ITSELF — the honest answer for a route this bundle predates.
 */
export function runWord(run?: Pick<common_DesignRun, 'kind'> | null): string {
  const kind = (run?.kind ?? '').trim().toLowerCase();
  if (kind === 'draft_idea') return 'draft';
  if (kind === 'vector') return 'vector';
  const rep = runRepresentation(run);
  return rep ? stepOfKind(rep).label : kind || 'run';
}

/**
 * The card these pictures belong to, read off the pictures themselves.
 *
 * `GetDesignBandResponse` states no card id of its own — the request carried it — but every
 * `DesignPicture` on it does. The picker needs it for ONE thing (the card's colourway names) and
 * has no prop to be told it by, so it asks the band. `0` when the band is empty, which is exactly
 * the state in which there is nothing to name.
 */
export function techCardIdOfBand(band: GetDesignBandResponse): number {
  for (const slot of band.bench ?? []) {
    const id = slot.picture?.techCardId ?? 0;
    if (id > 0) return id;
  }
  for (const run of band.runs ?? []) {
    for (const picture of run.pictures ?? []) {
      const id = picture.techCardId ?? 0;
      if (id > 0) return id;
    }
  }
  for (const batch of band.batches ?? []) {
    for (const picture of batch.pictures ?? []) {
      const id = picture.techCardId ?? 0;
      if (id > 0) return id;
    }
  }
  for (const output of band.outputs ?? []) {
    const id = output.picture?.techCardId ?? 0;
    if (id > 0) return id;
  }
  return 0;
}

/**
 * How many PICTURES a list of tiles stands for — the families counted in, not just their roots.
 *
 * The counter on a group's label answers «how many pictures are here», and a sheet with three
 * crops under it is four pictures on screen. Counting roots would print «1 picture» over five
 * frames, which is the kind of number a person stops trusting the second time they see it.
 */
export function countTiles(tiles: readonly CardPictureTile[]): number {
  let n = 0;
  for (const tile of tiles) n += 1 + countTiles(tile.children);
  return n;
}

/** Every tile of a group, roots and their families alike — for counting and for a probe. */
export function tilesOfGroups(groups: readonly CardPictureGroup[]): CardPictureTile[] {
  const out: CardPictureTile[] = [];
  const walk = (tiles: readonly CardPictureTile[]) => {
    for (const tile of tiles) {
      out.push(tile);
      walk(tile.children);
    }
  };
  for (const group of groups) walk(group.tiles);
  return out;
}

type Placement =
  | { kind: 'bench'; benchKind: string; colorwayId: number; view: string }
  | { kind: 'run'; runId: number; runKind: string }
  | { kind: 'uploads'; batchId: number };

const BENCH_ORDER = ['flat', 'render', 'threed'];

export function cardPictureGroups(
  band: GetDesignBandResponse,
  options: CardPictureOptions = {},
): CardPictureGroup[] {
  const colorwayName = options.colorwayName ?? (() => '');

  /* ── 1. the pool, in the band's own order, one row per picture id ───────────────────────────
     Bench first, so a plate keeps the bench's placement (rule 2); then the loaded run page, then
     the whole-card outputs (which reach further back than the page), then the upload shelf. */
  const byId = new Map<number, common_DesignPicture>();
  const order: number[] = [];
  const place = new Map<number, Placement>();
  const take = (picture: common_DesignPicture | undefined, placement: Placement) => {
    const id = picture?.id ?? 0;
    if (!picture || id <= 0 || byId.has(id)) return;
    byId.set(id, picture);
    order.push(id);
    place.set(id, placement);
  };

  for (const slot of band.bench ?? []) {
    const picture = slot.picture;
    if (!picture) continue;
    take(picture, {
      kind: 'bench',
      benchKind: benchKindOf(slot),
      colorwayId: colorwayOf(slot),
      view: (slot.detailName ?? '').trim() || viewLabel(slot.viewKey),
    });
  }
  for (const run of band.runs ?? []) {
    const runId = run.id ?? 0;
    const runKind = (run.kind ?? '').trim();
    for (const picture of run.pictures ?? []) take(picture, { kind: 'run', runId, runKind });
  }
  for (const output of band.outputs ?? []) {
    const picture = output.picture;
    const runId = output.runId ?? picture?.runId ?? 0;
    take(
      picture,
      runId > 0
        ? { kind: 'run', runId, runKind: (output.runKind ?? '').trim() }
        : { kind: 'uploads', batchId: output.batchId ?? picture?.batchId ?? 0 },
    );
  }
  for (const batch of band.batches ?? []) {
    const batchId = batch.id ?? 0;
    for (const picture of batch.pictures ?? []) take(picture, { kind: 'uploads', batchId });
  }

  /* ── 2. what is offered at all ──────────────────────────────────────────────────────────────
     Hidden: absent. `.glb`: absent. No address: absent — a tile with nothing to draw is a hole,
     and the person cannot tell it from a picture that failed to load. `display_only`: KEPT, and
     the reason travels with it. */
  const reps = options.reps;
  const kept = new Map<number, common_DesignPicture>();
  /**
   * ═══ ⚠ ONE MEDIA, ONE TILE — BECAUSE THE MEDIA IS WHAT IS PICKED ══════════════════════════════
   *
   * Rule 2 above says «one picture, one tile» and it was enforced by PICTURE id, while everything
   * downstream of this door is addressed by MEDIA id: `taken` is a set of media ids, the tile
   * toggles by `tile.media.id`, and the playground's table IS `freeform.items[]`, an FK on
   * `media(id)`. One media reached by two picture rows — the same file uploaded into two batches,
   * a plate filed a second time — therefore drew TWO frames that lit up and went out together,
   * over a counter that said one. A person cannot tell that from a broken toggle.
   *
   * WHICH ROW SURVIVES IS THE POOL'S OWN ORDER, so the priority of rule 2 is kept whole: the bench
   * comes first, so a plate keeps its «FLAT · FRONT» badge and its bench group, and the duplicate
   * loses its tile — exactly what the rule already promised for one row reached twice.
   *
   * DE-DUPLICATED HERE AND NOT IN THE POOL, and the order matters: a hidden row (or a `.glb`, or
   * one narrowed out by `reps`) must not claim the media and take a VISIBLE row down with it. Only
   * what survives the offer is allowed to stand for a media.
   */
  const standsFor = new Map<number, number>();
  const firstOfMedia = new Map<number, number>();
  for (const id of order) {
    const picture = byId.get(id)!;
    if (isPictureHidden(picture)) continue;
    if (pictureIsModel(picture)) continue;
    const media = picture.media;
    const item = media?.media;
    if (
      !media ||
      !(item?.thumbnail?.mediaUrl || item?.compressed?.mediaUrl || item?.fullSize?.mediaUrl)
    )
      continue;
    if (reps) {
      const rep = pictureRepresentation(band, picture);
      if (!rep || !reps.includes(rep)) continue;
    }
    const mediaId = media.id ?? 0;
    if (mediaId > 0) {
      const first = firstOfMedia.get(mediaId);
      if (first !== undefined) {
        standsFor.set(id, first);
        continue;
      }
      firstOfMedia.set(mediaId, id);
    }
    kept.set(id, picture);
  }

  /* ── 3. the families ────────────────────────────────────────────────────────────────────────
     A verb without a parent that is ON SCREEN is not a family link: the child stands as a root.
     Two ways a parent goes missing — a page this band did not bring, and somebody hiding it — and
     neither is a reason to hide a picture that exists; both are worth saying out loud, because a
     picture standing alone with no explanation reads as a picture that lost something. */
  const tiles = new Map<number, CardPictureTile>();
  /* A PARENT THAT LOST ITS TILE TO A TWIN IS NOT A PARENT THAT IS GONE. The de-duplication above
     drops a picture ROW while its media stays on screen under another row; reading `derived_from`
     raw would then print «parent gone» over a crop whose parent is one tile to the left — the
     exact statement rule 1 forbids, because it is one a person can see is false. */
  const parentOf = (picture: common_DesignPicture): number => {
    const named = picture.derivedFrom ?? 0;
    return named > 0 ? standsFor.get(named) ?? named : 0;
  };
  for (const [id, picture] of kept) {
    const verb = (picture.derivation ?? '').trim().toLowerCase();
    const parentId = parentOf(picture);
    /* TWO FACTS, NOT ONE, AND THEY FAIL SEPARATELY. «Is the parent on this screen» is what the
       WORDS are about; «do we know what was done to it» is what the NESTING is about. Read as one
       flag they collapse into the lie above: a legacy row with a visible parent came out «parent
       gone» because the verb was blank, which is a fact about the server, not about the parent. */
    const parentShown = parentId > 0 && kept.has(parentId);
    const attached = (verb === 'crop' || verb === 'flatten') && parentShown;
    const placement = place.get(id);
    const letter = ordinalLetter(picture.ordinal ?? 0);
    tiles.set(id, {
      picture,
      media: picture.media as common_MediaFull,
      letter,
      badge: placement?.kind === 'bench' && placement.view ? placement.view : letter,
      children: [],
      childVerb: attached ? (verb as CardPictureVerb) : '',
      refusal: picture.displayOnly ? DISPLAY_ONLY_REFUSAL : '',
      orphan: parentId > 0 && !parentShown,
    });
  }

  const roots: number[] = [];
  for (const id of order) {
    const tile = tiles.get(id);
    if (!tile) continue;
    const parentId = tile.childVerb ? parentOf(tile.picture) : 0;
    const parent = parentId > 0 ? tiles.get(parentId) : undefined;
    if (parent) parent.children.push(tile);
    else roots.push(id);
  }

  /* ── 4. the groups ──────────────────────────────────────────────────────────────────────────
     A root carries its family into whichever group the ROOT belongs to; a crop of a bench plate is
     drawn under that plate, not in the run row it inherited its `run_id` from. */
  const runsById = new Map<number, common_DesignRun>();
  for (const run of band.runs ?? []) if ((run.id ?? 0) > 0) runsById.set(run.id ?? 0, run);
  const batchesById = new Map<number, common_DesignBatch>();
  for (const batch of band.batches ?? [])
    if ((batch.id ?? 0) > 0) batchesById.set(batch.id ?? 0, batch);
  const shelf = shelfBatchOrdinals(band.batches ?? []);
  const stampOf = (at?: string | null) => clockStamp(at, { timeZone: options.timeZone });

  const groups = new Map<string, CardPictureGroup>();
  const groupOrder: string[] = [];
  const openGroup = (key: string, make: () => CardPictureGroup): CardPictureGroup => {
    const known = groups.get(key);
    if (known) return known;
    const born = make();
    groups.set(key, born);
    groupOrder.push(key);
    return born;
  };

  for (const id of roots) {
    const tile = tiles.get(id)!;
    const placement = place.get(id) ?? { kind: 'uploads' as const, batchId: 0 };
    if (placement.kind === 'bench') {
      const key = `bench:${placement.benchKind}:${placement.colorwayId}`;
      const named = colorwayName(placement.colorwayId).trim();
      openGroup(key, () => ({
        kind: 'bench',
        key,
        benchKind: placement.benchKind,
        colorwayId: placement.colorwayId,
        label: `${placement.benchKind} · ${named || SAMPLE_WORD}`,
        tiles: [],
      })).tiles.push(tile);
      continue;
    }
    if (placement.kind === 'run') {
      const key = `run:${placement.runId}`;
      const run = runsById.get(placement.runId) ?? null;
      openGroup(key, () => {
        /* The moment of an OFF-PAGE run is the moment of the picture standing in it: the output
           row carries no clock of its own, and a blank stamp beside a stamped neighbour reads as
           «this run has no time» rather than «this page did not bring it». */
        const stamp = run
          ? stampOf(run.completedAt ?? run.createdAt)
          : stampOf(tile.picture.createdAt);
        return {
          kind: 'run',
          key,
          runId: placement.runId,
          runKind: placement.runKind,
          run,
          label: [
            runHandle(placement.runId) || 'run',
            runWord(run ?? { kind: placement.runKind }),
            stamp,
          ]
            .filter(Boolean)
            .join(' · '),
          tiles: [],
        };
      }).tiles.push(tile);
      continue;
    }
    const key = `upload:${placement.batchId}`;
    const batch = batchesById.get(placement.batchId) ?? null;
    openGroup(key, () => {
      const stamp = stampOf(batch?.createdAt);
      return {
        kind: 'uploads',
        key,
        batch,
        label: [batchHandle(shelf.get(placement.batchId)), stamp].filter(Boolean).join(' · '),
        tiles: [],
      };
    }).tiles.push(tile);
  }

  /* ── 5. the order of the groups ─────────────────────────────────────────────────────────────
     The bench first and in the rail's own order (flat → render → threed), because those are the
     pictures a person has already NAMED; then the runs, newest first, which is how every other
     history on this screen reads; then the shelf, newest upload first. Within a group the tiles
     keep the band's order, which is creation order. */
  const rank = (key: string): [number, number, number] => {
    const group = groups.get(key)!;
    if (group.kind === 'bench') {
      const kindRank = BENCH_ORDER.indexOf(group.benchKind);
      return [0, kindRank < 0 ? BENCH_ORDER.length : kindRank, group.colorwayId];
    }
    if (group.kind === 'run') return [1, 0, -group.runId];
    return [2, 0, -(shelf.get(group.batch?.id ?? 0) ?? 0)];
  };
  return [...groupOrder]
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    })
    .map((key) => groups.get(key)!)
    .filter((group) => group.tiles.length > 0);
}
