import type { common_DesignPicture, common_DesignRun } from 'api/proto-http/admin';
import {
  mediaFullToViewerItem,
  mediaFullViewerSrc,
  type MediaViewerItem,
} from 'ui/components/media-viewer';

import { cropFamilies, isCutOut } from './composite';
import { isRunLive } from './run-state';

/**
 * ═══ THE VIEWER ROW AND THE DECKS OF A SET OF RUNS — PURE READERS, TWO HOSTS (26.09, O-53) ════════
 *
 * Moved out of `GenerationHistory`'s two memos unchanged, so the history and the latest-generation
 * workbench under GENERATE build their viewer row and read their decks by ONE rule. No React here:
 * the hosts memoise.
 */

/** One card of a row: the picture drawn on it and the pieces behind it (empty — no deck). */
export type OutputCard = {
  picture: common_DesignPicture;
  /** The pieces of its deck, in the row's own order. */
  members: common_DesignPicture[];
};

/** What a row puts on screen: its cards in order, and whose deck each piece stands in. */
export type OutputPlan = {
  cards: OutputCard[];
  /** piece id → the id of the card whose deck holds it (E-4: a zoom outside a deck folds it). */
  deckOf: Map<number, number>;
};

/**
 * ═══ THE CARDS OF ONE ROW — AND, ON THE WORKBENCH, ONLY THE HEADS OF REPLACEMENT CHAINS ══════════
 *
 * THE HISTORY (`heads` off) — every picture the run produced, byte for byte what the row always
 * drew: each root of `cropFamilies` in wire order, its deck the whole line of pieces cut out of it.
 *
 * THE WORKBENCH (`heads`, 27.09, O-53 phase 2) shows what stands NOW. An «overwrite» files the edit
 * as a sibling and stamps the original `replaced_by` (the proto calls the ids a CHAIN: an edit may
 * be overwritten in its turn, and the HEAD is the one link with nothing after it; every link is
 * filed under the same run row). So here:
 *   · a replaced picture is drawn as its chain's head, IN ITS PLACE — as a card, or as a piece in
 *     its sheet's deck — and the links after it are not drawn again where they were filed;
 *   · a deck is what was cut out of the picture ON the card: an overwritten sheet's old pieces (the
 *     server lets a sheet be overwritten only once they are all hidden) stay with the original, in
 *     the history, and the pieces cut out of a head stand behind the head;
 *   · a picture in `keep` is drawn as itself — an editor is open over it, and swapping the tile
 *     would unmount that editor mid-drawing; its head waits until the editor closes.
 * The history keeps showing every link (captioned «replaced by an edit», `run-tile.tsx`).
 *
 * The walk is bounded like `cropFamilies`' (the server cannot mint a cycle; a malformed page must
 * not hang the tab): every chain and every deck is walked with a `seen` set.
 */
export function outputPlan(
  pictures: readonly common_DesignPicture[],
  opts: { heads?: boolean; keep?: ReadonlySet<number> } = {},
): OutputPlan {
  const families = cropFamilies(pictures);
  const cards: OutputCard[] = [];
  const deckOf = new Map<number, number>();

  if (!opts.heads) {
    for (const picture of pictures) {
      const id = picture.id ?? 0;
      if (families.rootOf.has(id)) continue;
      cards.push({ picture, members: families.membersOf.get(id) ?? [] });
    }
    for (const [member, root] of families.rootOf) deckOf.set(member, root);
    return { cards, deckOf };
  }

  const keep = opts.keep ?? new Set<number>();
  const byId = new Map<number, common_DesignPicture>();
  const at = new Map<number, number>();
  pictures.forEach((picture, i) => {
    const id = picture.id ?? 0;
    if (id > 0 && !byId.has(id)) {
      byId.set(id, picture);
      at.set(id, i);
    }
  });
  /** Edits that took another picture's place in this row — each is drawn in THAT place. */
  const replacements = new Set<number>();
  for (const picture of pictures) {
    const next = picture.replacedBy ?? 0;
    if (next > 0 && next !== picture.id && byId.has(next)) replacements.add(next);
  }
  /** The pieces cut straight out of each picture of the row, in wire order. */
  const cutsOf = new Map<number, common_DesignPicture[]>();
  for (const picture of pictures) {
    const parent = picture.derivedFrom ?? 0;
    if (!isCutOut(picture) || parent <= 0 || parent === picture.id || !byId.has(parent)) continue;
    const list = cutsOf.get(parent);
    if (list) list.push(picture);
    else cutsOf.set(parent, [picture]);
  }
  const headOf = (picture: common_DesignPicture): common_DesignPicture => {
    let head = picture;
    const seen = new Set<number>([picture.id ?? 0]);
    while (!keep.has(head.id ?? 0)) {
      const next = byId.get(head.replacedBy ?? 0);
      if (!next || seen.has(next.id ?? 0)) break;
      seen.add(next.id ?? 0);
      head = next;
    }
    return head;
  };
  const deckBehind = (card: common_DesignPicture): common_DesignPicture[] => {
    const found: { picture: common_DesignPicture; at: number }[] = [];
    const seen = new Set<number>([card.id ?? 0]);
    const walk = (node: common_DesignPicture) => {
      for (const piece of cutsOf.get(node.id ?? 0) ?? []) {
        const pieceId = piece.id ?? 0;
        if (seen.has(pieceId)) continue;
        seen.add(pieceId);
        const head = headOf(piece);
        const headId = head.id ?? 0;
        if (headId !== pieceId) {
          if (seen.has(headId)) continue;
          seen.add(headId);
        }
        // A head stands where the piece it replaced stood.
        found.push({ picture: head, at: at.get(pieceId) ?? 0 });
        walk(head);
      }
    };
    walk(card);
    return found.sort((a, b) => a.at - b.at).map((f) => f.picture);
  };

  const drawn = new Set<number>();
  for (const picture of pictures) {
    const id = picture.id ?? 0;
    // A piece stands in its sheet's deck; an edit that took a place stands in that place.
    if (families.rootOf.has(id) || replacements.has(id)) continue;
    const head = headOf(picture);
    const headId = head.id ?? 0;
    if (headId > 0) {
      if (drawn.has(headId)) continue;
      drawn.add(headId);
    }
    const members = deckBehind(head);
    for (const member of members) deckOf.set(member.id ?? 0, headId);
    cards.push({ picture: head, members });
  }
  return { cards, deckOf };
}

/**
 * THE WORKBENCH'S PLAN (03.10 gate FX4). By default the heads of replacement chains (`outputPlan`
 * with `heads`, an open editor's tile kept); a run put on the bench from the history (`whole`,
 * `benchShowsWhole`) stands with EVERY picture and edit it produced — its history row's own plan.
 */
export function benchPlan(
  pictures: readonly common_DesignPicture[],
  opts: { whole: boolean; keep?: ReadonlySet<number> },
): OutputPlan {
  return opts.whole ? outputPlan(pictures) : outputPlan(pictures, { heads: true, keep: opts.keep });
}

/**
 * ═══ AFTER THE CUT THE BENCH SHOWS THE PIECES, NOT THE SHEET (03.10, owner items 20 and 21) ══════
 *
 * Owner, verbatim: «после сплита мы должны показывать уже сплитнутые картинки» and «в окошке latest
 * generation не будет общей картинки со всеми вью». So on the FLAT bench a sheet that has been cut
 * leaves the row entirely: no tile, no deck, no thumbnail of it; its pieces stand in its place as
 * ordinary cards, in the deck's order, each with the full tile anatomy (slot, edit, delete). The
 * sheet stays where it always was, in GENERATION HISTORY, whose rows draw `outputPlan` unchanged.
 */
export function piecesInPlace(plan: OutputPlan): OutputPlan {
  if (!plan.cards.some((card) => card.members.length > 0)) return plan;
  const cards: OutputCard[] = [];
  for (const card of plan.cards) {
    if (!card.members.length) cards.push(card);
    else for (const piece of card.members) cards.push({ picture: piece, members: [] });
  }
  return { cards, deckOf: new Map() };
}

/**
 * THE PICTURES OF ONE RUN IN THE ORDER ITS ROW SHOWS THEM — every card in order, the pieces of the
 * OPEN deck right after their sheet, the pieces of closed decks nowhere (H-10). The order of the
 * viewer row IS the order of the screen (T-8), so this is the one place that order is spelled —
 * from the row's `plan` (`outputPlan`; the history's by default).
 */
export function displayPictures(
  run: common_DesignRun,
  openDeck: number | null,
  plan: OutputPlan = outputPlan(run.pictures ?? []),
): common_DesignPicture[] {
  const out: common_DesignPicture[] = [];
  for (const card of plan.cards) {
    out.push(card.picture);
    if (openDeck === (card.picture.id ?? 0)) out.push(...card.members);
  }
  return out;
}

/**
 * ОДИН РЯД ПРОСМОТРЩИКА НА ВСЕ ПЕРЕДАННЫЕ ПРОГОНЫ (T-8): «в зум вью по всем картинкам из всех
 * генераций итерироваться не только этой». Ряд, который собирают САМИ ПЛИТКИ, кончался бы на краю
 * окна по три. ПОРЯДОК РЯДА — ПОРЯДОК ПОКАЗА (`displayPictures`), прогоны — в порядке списка;
 * живой прогон картинок ещё не держит и пропускается; картинка без адреса в ряд не встаёт.
 * `indexOf` — смещение каждой картинки в ряду, по нему плитка открывает группу.
 */
export function runsGallery(
  runs: readonly common_DesignRun[],
  openDeck: number | null,
  /** The plan each row is drawn by — the workbench's heads; absent, the history's own. */
  planOf?: (run: common_DesignRun) => OutputPlan,
): { items: MediaViewerItem[]; indexOf: Map<number, number> } {
  const items: MediaViewerItem[] = [];
  const indexOf = new Map<number, number>();
  const put = (picture: common_DesignPicture) => {
    const id = picture.id ?? 0;
    const media = picture.media;
    if (!id || indexOf.has(id) || !media || !mediaFullViewerSrc(media)) return;
    indexOf.set(id, items.length);
    items.push(mediaFullToViewerItem(media));
  };
  for (const run of runs) {
    if (isRunLive(run)) continue;
    for (const picture of displayPictures(run, openDeck, planOf?.(run))) put(picture);
  }
  return { items, indexOf };
}

/** ЧЕЙ КУСОК ЭТА КАРТИНКА — piece id → its sheet's id, over the given runs, open deck or not (E-4). */
export function deckOfRuns(
  runs: readonly common_DesignRun[],
  planOf?: (run: common_DesignRun) => OutputPlan,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const run of runs) {
    const plan = planOf ? planOf(run) : outputPlan(run.pictures ?? []);
    for (const [memberId, rootId] of plan.deckOf) out.set(memberId, rootId);
  }
  return out;
}

/**
 * ЗУМ ЧУЖОЙ КАРТОЧКИ СКЛАДЫВАЕТ ОТКРЫТУЮ КОЛОДУ (E-4): «после экспанда спличеных карточек при
 * зуме любой другой они должны обратно колапсится». Граница проходит по колоде: зум по самому
 * листу и по любому его куску — работа ВНУТРИ раскрытой группы. The next value of the host's
 * `openDeck` after `pictureId` was zoomed.
 */
export function deckAfterZoom(
  current: number | null,
  pictureId: number,
  deckOf: ReadonlyMap<number, number>,
): number | null {
  if (current === null || !pictureId) return current;
  if (pictureId === current) return current;
  return deckOf.get(pictureId) === current ? current : null;
}
