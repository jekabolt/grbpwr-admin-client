import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';

import { normaliseViewKey, viewLabel } from '../views';

/**
 * THE COMPOSITE — one file that holds several views — and everything a screen is allowed to say
 * about it.
 *
 * THE THIRD SHAPE OF A FLAT RUN. `GENERATION — FLAT` asks in two independent organs: the matrix
 * says WHICH views, the layout switch says IN WHAT SHAPE they come back. Two or more ticks with
 * `one` is the third variant of W-4 — front, back and side drawn into a single picture — and this
 * module is the reading half of it: the arriving file declares which views were glued, the tile
 * says so, no slot will take it, and the crop modal cuts it into the N pictures the slots can read.
 *
 * THE FACT HAS EXACTLY ONE WRITER AND IT IS THE SERVER. `composite_views` is filled when a run's
 * output lands; nothing on this client may compose it. In particular NOT from `params.layout`: a
 * run that ASKED for `one` is not evidence about the FILE that came back — a provider may return
 * separate images for a composite ask, and a hand-brought sheet of three flats is a composite
 * nobody asked for. The request is an intention; `composite_views` is an observation, and only the
 * observation is allowed to drive a rule.
 *
 * SO WHAT HAPPENS WHILE NOTHING WRITES IT. Today, on beta, the column is empty on every row and
 * every reader below answers «not a composite». That is the DESIGNED degradation, not a gap being
 * papered over: the tile is an ordinary tile, the slot picker is offered, and the crop door still
 * opens (any picture may be cut — see `split-modal.tsx`), so a person who brings a 3-up sheet by
 * hand can still cut it by naming each frame. The moment the writer lands, the same tiles grow the
 * marks, the badge and the refusal — with no second code path and no client-side guess in between.
 *
 * `split_into` IS COUNTED, NOT STORED. There is no «how many pictures came out of this one» field
 * on the wire and there should not be: the crops already point at their parent through
 * `derived_from`, and a stored counter would be a second copy of that fact, free to disagree with
 * it the first time a crop is hidden or a split is repeated. The count below is over the band that
 * is on screen — which is the honest scope, because a paged-out crop is a crop this screen has not
 * been told about, and claiming a total it cannot see would be worse than under-counting.
 *
 * WHY THIS IS NOT IN `split-modal.tsx`. That file owns the CUT: the frames, the coordinates, the
 * write. `isComposite` lives there because it is the one rule the cut still consults. What is here
 * is the READING — what the feed prints on a tile — and two organs on two screens print it, so it
 * belongs to neither of them.
 *
 * Pure readers plus two presentational marks; no state, no queries.
 */

export type CompositeFacts = {
  /** The picture DECLARES it glues several views. Never inferred — see the header. */
  declared: boolean;
  /**
   * The declared views, normalised, IN THE ORDER THE SERVER GLUED THEM. An unrecognised key is
   * kept rather than dropped: `composite_views` is an open vocabulary, and a view this bundle has
   * not heard of is still a view the file contains.
   *
   * NOTHING IS DROPPED FROM THIS LIST, blanks included, so that `views.length` is the SAME number
   * `isComposite` answers on — one entry, one view, one frame the cut will need. A blank entry is
   * a view the file has and the server could not name; the marks below skip printing it, and the
   * count still says the picture holds it. Filtering here instead would let the badge and the
   * refusal disagree about the same file, which is the one outcome a shared reader exists to stop.
   */
  views: string[];
  /** How many pictures have been cut out of this one, counted from `derived_from` on the band. */
  splitInto: number;
};

export const NO_COMPOSITE: CompositeFacts = { declared: false, views: [], splitInto: 0 };

/**
 * How many pictures on this band came out of `parentId` — the whole line of descent, not the first
 * generation of it.
 *
 * ⚠ IT WAS DIRECT CHILDREN, AND THAT MADE ONE TILE PRINT TWO DIFFERENT COUNTS OF ONE CUT. The deck
 * below the tile counts the family TRANSITIVELY (`cropFamilies`, and it must: beta run 7 holds a
 * chain, 53 and 54 cut out of 52 cut out of the sheet). This counter fed the provenance tail six
 * pixels above that door and answered `split into 1` beside `▸ 3 cut pieces`. Two counters of one
 * fact, free to disagree, is exactly what the header of this file forbids — so there is now ONE
 * walk and this is a caller of it, not a second opinion.
 *
 * Walked here rather than through `bandPictures` in `band-feed.tsx` on purpose: the feed's tile
 * imports THIS module, and importing it back would close a module cycle.
 *
 * The pool is the WHOLE loaded band, runs and batches alike, which is wider than the run row the
 * deck reads — and the two still agree wherever both are drawn, because a crop inherits its
 * parent's `run_id` and therefore never leaves its parent's row. The extra reach only serves the
 * upload shelf, which has families but no deck.
 */
function countDerivedFrom(band: GetDesignBandResponse, parentId: number): number {
  if (parentId <= 0) return 0;
  const pool: common_DesignPicture[] = [];
  for (const run of band.runs ?? []) pool.push(...(run.pictures ?? []));
  for (const batch of band.batches ?? []) pool.push(...(batch.pictures ?? []));
  return (cropFamilies(pool).membersOf.get(parentId) ?? []).length;
}

export function readComposite(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): CompositeFacts {
  const views = (picture.compositeViews ?? []).map((view) => normaliseViewKey(view));
  if (!views.length) return NO_COMPOSITE;
  return { declared: true, views, splitInto: countDerivedFrom(band, picture.id ?? 0) };
}

/* ─────────────────────────── the family a cut leaves behind (H-10) ─────────────────────────── */

/**
 * ═══ A SHEET AND EVERYTHING CUT OUT OF IT, INSIDE ONE RUN ROW ══════════════════════════════════
 *
 * Owner: «мультивью и сплиты надо ка-то группировать что я вижу это так карточка с мультивью за
 * ней выглядывают кусочки заспличеные если нажимаешь то они в ленте показываются карточками».
 *
 * Today a run row draws the sheet and every crop as equal sibling tiles, because that is exactly
 * what they are on the wire: `SplitPicture` files a crop with its parent's `run_id`, so a sheet cut
 * into seven pieces is eight identical-looking cells in one row and nothing on screen says which
 * came out of which. The grouping is drawn from `derived_from` PAIRED WITH `derivation` — see
 * `isCutOut` below, which is the whole of J-1.
 *
 * ⚠ TRANSITIVE, AND THAT IS NOT A NICETY. Beta run 7 already holds a chain: pictures 53 and 54 were
 * cut out of 52, which was itself cut out of the sheet 22. A direct-children rule would count six
 * pieces where there are seven and leave the two grandchildren standing loose in the row beside a
 * deck that claims to hold everything cut from the sheet. The walk therefore climbs to the ROOT of
 * each picture's ancestry.
 *
 * ⚠ IT CLIMBS ONLY INSIDE THE LIST IT WAS GIVEN. A crop whose parent is not in this row — the
 * parent was cut from a picture of another run, or is off the loaded page — is a root of its own
 * here, which is the truthful answer for a screen that draws one row at a time: a deck may not
 * promise pieces of a sheet that is not on screen.
 *
 * A ROOT WITH NO DESCENDANTS IS NOT A FAMILY and is deliberately absent from the map. Nothing is
 * behind it, so it gets no deck, no door and no offset sheets — its composite mark and its split
 * corner already say what it is.
 *
 * HIDDEN MEMBERS STAY MEMBERS. The history is unfiltered by T-14 and shows a stamped picture with
 * its word; folding one away here would make the deck a second hiding place, and the count on the
 * door would stop matching the cards behind it.
 *
 * The cycle guard is not defensive dressing over a shape the server cannot produce: `derived_from`
 * points at a picture minted BEFORE this one, so a cycle is unreachable. It is here because this
 * walk is unbounded by construction and a malformed page must not take the whole tab white — there
 * is no error boundary over this tree.
 */
/**
 * ═══ DID THIS ROW DETACH FROM ITS PARENT BY A **CUT**? — J-1, and the whole of it ══════════════
 *
 * Owner, verbatim: «у нас сейчас колапсится в карточки даже если это был просто эдит мульивью а
 * колапсится в карточки должны быть только после сплита мультивью».
 *
 * ⚠ `derived_from` HAS TWO WRITERS AND THEY ARE DIFFERENT VERBS. `SplitPicture` files a CUT;
 * `FlattenEditLayer` files an EDIT. Both point the child at its parent, so a walk that reads only
 * `derived_from` calls an edited multiview a «cut piece» and folds the row into a deck of one —
 * the owner's complaint word for word. `layer_rev` cannot separate them and never could: a crop
 * COPIES its parent's rev verbatim, so the crop of an edited sheet arrives with exactly the
 * non-zero revision a flatten arrives with, and «edit, save, edit again» files two flattens whose
 * revs may coincide. The proto says this in as many words on the field itself.
 *
 * ═══ THE THIRD STATE IS A REFUSAL, NOT A GAP, AND IT DOES NOT FOLD ═══════════════════════════
 *
 * `derivation` has three readings, and only ONE of them opens a deck:
 *   · `'crop'`    — a cut. The row is a piece of its parent. FOLDS.
 *   · `'flatten'` — an edit. The row is a NEW STATE of its parent, not a piece of it, and it
 *                   stands beside it as an ordinary sibling card. Does not fold.
 *   · `''`        — the server was asked and DECLINED TO GUESS. Migration 0359's backfill could
 *                   not classify these rows because the parent they name is already gone
 *                   (`derived_from` carries no FK by design), so there was nothing to compare.
 *                   Measured on beta the day this landed: of 24 derived pictures, 18 `crop`,
 *                   4 `flatten`, **2 `''`**. Does not fold — see below.
 *
 * WHY `''` MUST NOT BE READ AS EITHER VERB. A deck is a CLAIM: «these cards are the pieces cut out
 * of this sheet». A row that cannot say which gesture made it cannot be used to make that claim,
 * and the honest direction of failure for an unknown is the flat one — the card stands where it
 * has always stood, visible, next to its parent. Folding it instead would hide a card behind a
 * door on a guess, which is the defect this whole change exists to remove, merely with a smaller
 * blast radius. Reading it as `flatten` would be the same guess wearing the other hat. THE SET CAN
 * ONLY SHRINK: every row minted from now on carries a verb, so `''` is a closed legacy population
 * of two, not a state the product keeps producing.
 *
 * ⚠ AND `undefined` IS A FOURTH THING — IGNORANCE, NOT REFUSAL. A server older than the column
 * omits the key entirely. It lands in the same branch («do not fold») and the outcome is right,
 * but the REASONS are not the same and a later reader must not collapse them: `''` is this server
 * telling us it does not know, `undefined` is a server that was never asked.
 *
 * NO LEGACY GUESS, AND THAT IS A DECISION WITH A PRICE NAMED. A `layer_rev`-based fallback for the
 * old server was considered and refused twice over. It is WRONG on «edit, save, edit again» — it
 * would call the second flatten a crop — so it reintroduces exactly J-1 under a fallback's name,
 * silently, on the one flow the owner reported. And the server itself, holding the same
 * `layer_rev` and more, DECLINED to apply that heuristic to the two rows above: a client that
 * guesses where the server refused is claiming a certainty the system does not have. The cost of
 * refusing is that a pre-column server draws NO decks at all — flatter than today, never false —
 * and by this project's deploy order (backend to beta and to prod ahead of the client) no such
 * server ever meets this code outside a rollback.
 *
 * PAIRED READ, ALWAYS. `derivation` is meaningless alone: `'crop'` on a row with no
 * `derived_from` is not a state the server can mint, and the climb below refuses it anyway by
 * checking the parent id one line later.
 */
export function isCutOut(picture: common_DesignPicture): boolean {
  return picture.derivation === 'crop';
}

export type CropFamilies = {
  /** Root picture id → every picture descended from it, in the row's own order. Roots with no
   *  descendants are absent. */
  membersOf: Map<number, common_DesignPicture[]>;
  /**
   * Member picture id → the id of the SHEET at the top of its ancestry. Roots are never keys here,
   * so `rootOf.has(id)` is also the answer to «is this picture somebody's piece».
   *
   * ⚠ THE ROOT, NOT THE PARENT, AND THE CHAIN IS WHY. In beta's run 7, picture 54's parent is 52
   * and its root is the sheet 22. A reader that folded a grandchild away by its PARENT would keep
   * it hidden while the deck it belongs to stands open.
   */
  rootOf: Map<number, number>;
};

export function cropFamilies(pictures: readonly common_DesignPicture[]): CropFamilies {
  const byId = new Map<number, common_DesignPicture>();
  for (const picture of pictures) {
    const id = picture.id ?? 0;
    if (id > 0) byId.set(id, picture);
  }

  const membersOf = new Map<number, common_DesignPicture[]>();
  const rootOf = new Map<number, number>();

  for (const picture of pictures) {
    const id = picture.id ?? 0;
    if (id <= 0) continue;
    // Climb to the root of this picture's ancestry WITHIN the list. `seen` stops a malformed
    // page dead rather than hanging the tab; the server cannot mint one.
    //
    // ⚠ THE CLIMB STOPS AT THE FIRST LINK THAT IS NOT A CUT (J-1). `isCutOut` is asked about the
    // node we are standing on, i.e. about ITS OWN link upward — so an edit ends the ancestry
    // rather than being walked through. That is what makes the owner's own order come out right:
    // sheet → EDIT → cut, cut. The two pieces climb one step to the edited sheet and stop there,
    // so the deck sits under the picture they were actually cut out of, and the edit stands as an
    // ordinary card beside the original instead of being folded away as a piece of it.
    let root = picture;
    const seen = new Set<number>([id]);
    for (;;) {
      if (!isCutOut(root)) break;
      const parentId = root.derivedFrom ?? 0;
      if (parentId <= 0 || seen.has(parentId)) break;
      const parent = byId.get(parentId);
      if (!parent) break;
      seen.add(parentId);
      root = parent;
    }
    const rootId = root.id ?? 0;
    if (rootId <= 0 || rootId === id) continue;
    rootOf.set(id, rootId);
    const members = membersOf.get(rootId);
    if (members) members.push(picture);
    else membersOf.set(rootId, [picture]);
  }

  return { membersOf, rootOf };
}

/** `7 cut pieces` — the number the deck's door carries, because a fan of edges cannot be counted. */
export function cutPiecesWord(count: number): string {
  return `${count} cut piece${count === 1 ? '' : 's'}`;
}

/**
 * The tail of a tile's provenance line: `AI · run 7` becomes `AI · run 7 · 3 views · split into 3`.
 *
 * The split half appears only once a cut has happened, because «split into 0» is not a state — it
 * is the absence of one, and the footer already offers the door that changes it.
 */
export function compositeTail(facts: CompositeFacts): string {
  if (!facts.declared) return '';
  const n = facts.views.length;
  const head = ` · ${n} view${n === 1 ? '' : 's'}`;
  return facts.splitInto > 0 ? `${head} · split into ${facts.splitInto}` : head;
}

/**
 * `split into views ▸` before the first cut, `split again ▸` after one.
 *
 * READ FROM THE CHILDREN, and that is a correction. The verb used to be chosen by `derived_from`
 * ON THE COMPOSITE ITSELF, which answers a different question entirely — «was this picture cut out
 * of something else» — so a composite that had never been split said «split again» whenever it
 * happened to be a crop, and one that had been split three times still said «split into views».
 * Both readings are one field apart and neither is visible to a type checker.
 */
export function splitVerb(facts: CompositeFacts): string {
  return facts.splitInto > 0 ? 'split again ▸' : 'split into views ▸';
}

/**
 * ОДИН ТЕКСТ «MULTI-VIEW» НА КАРТИНКЕ — вместо стопки «probably FRONT / probably BACK / …» по
 * числу склеенных видов (T-13, круг 4). Владелец: перечисление трёх догадок на ОДНОЙ картинке
 * читается как три картинки — а этот файл ровно один. Поэтому на изображении стоит одно слово о
 * его природе, а НЕ список гипотез.
 *
 * Имена и порядок склеенных видов при этом не пропадают: порядок — в `title` (и он же сеет кадры
 * пресетов `2 across` / `3 across` в разрезе), счётчик — в хвосте провенанса (`compositeTail`), а
 * где какой вид СИДИТ, по-прежнему решает человек рамкой в сплите — провод несёт список, не
 * геометрию, и рисовать метку «на своей трети ширины» значило бы уверенно угадывать за него.
 */
export function CompositeMarks({ facts }: { facts: CompositeFacts }) {
  if (!facts.declared) return null;
  const named = facts.views.filter(Boolean).map((view) => viewLabel(view));
  return (
    <span
      // `inset-x-0`, NOT `left-0`. An absolute box positioned by one edge is shrink-to-fit, so
      // `max-w-full` on the mark below would resolve against the mark itself and `truncate`
      // would never fire. Pinning both edges gives the child the picture's width to be clipped
      // against; `items-start` keeps the mark as narrow as its own words.
      className='pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start'
      title={
        named.length
          ? `declares ${named.join(', ')} — where each one sits is decided in the split`
          : 'a multi-view file — which views it holds is decided in the split'
      }
    >
      <span className='max-w-full truncate bg-bgColor px-1 text-nano uppercase text-labelColor'>
        multi-view
      </span>
    </span>
  );
}

/**
 * БЕЙДЖ «N VIEWS GLUED» ПОГАШЕН (T-13, круг 4): на плитке остаётся ОДИН текст о мульти-виде — метка
 * `multi-view` сверху, — а счётчик видов и след разреза продолжают жить в хвосте провенанса
 * (`compositeTail`). Заодно это освобождает нижний-левый угол плитки, куда владелец велел ставить
 * сплит (T-7, примитив плитки).
 *
 * Экспорт сохранён и рисует НИЧЕГО: места монтажа (`generation-history.tsx`) принадлежат другой
 * ветке этого круга, и живой null дешевле, чем шов через чужой файл. Когда примитив плитки
 * усвоит метки, этот экспорт снимается вместе со своим монтажом.
 */
export function CompositeBadge(_props: { facts: CompositeFacts }) {
  return null;
}
