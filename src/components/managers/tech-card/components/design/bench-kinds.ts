import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

/**
 * THE BENCH-KIND VOCABULARY — the second axis of the bench, said once.
 *
 * This module exists because of a defect, not a preference — the same birth as `./views`. The bench
 * grew a second axis (view × kind, migration 0349): a render FRONT and a flat FRONT are two
 * different slots BOTH addressed by `view_key: front`. Three organs then spelled the rule «empty
 * kind reads as flat» each for itself (`benchKindOf` in `render/model.ts`, `benchRow` in
 * `history-recall.tsx`, and the refs of `bench.tsx`), while the two oldest readers —
 * `readBench`/`findSlot` in `bench-slot.tsx` — did not read the axis AT ALL, which is L-1 and L-5
 * in one family: organs written when one view meant one row kept believing it. One picker filed
 * every generation-history picture into the FLAT bench, fabric renders included (L-1), and the
 * studio bench echoed the RENDER row's CAS token against a flat write —
 * «slot is at rev 11, 4 was echoed» (L-5). A vocabulary spelled per organ drifts silently and by
 * construction; this is the one spelling.
 *
 * WHY THE KINDS ARE A CLIENT CONSTANT: the wire carries `kind` as an open string and the server's
 * refusal (`FailedPrecondition: wrong_kind`) is the nearest thing to an enumeration — the client
 * cannot read the list from anywhere, it can only agree with itself.
 */
export const BENCH_KINDS = ['flat', 'render'] as const;
export type BenchKind = (typeof BENCH_KINDS)[number];

/**
 * WHICH BENCH a stored slot row or a slot ref belongs to. Empty reads as `flat` — exactly as the
 * column's own DEFAULT does, so every row and every ref written before the second axis existed
 * keeps meaning the bench it meant.
 *
 * The parameter is deliberately the union of the two wire shapes whose `kind` IS a bench kind.
 * A `common_DesignPicture` also carries a `kind`, but that one names what the PICTURE is
 * (flat | render | threed | pattern), not a bench — for the picture→bench mapping see
 * `pictureBenchKind` below, which is partial on purpose.
 *
 * Returns an open string rather than `BenchKind`: an unknown kind from a newer server must compare
 * as itself, not be folded into a bench this bundle happens to know.
 */
export function benchKindOf(owner?: common_DesignBenchSlot | DesignBenchSlotRef | null): string {
  return (owner?.kind ?? '').trim().toLowerCase() || 'flat';
}

/**
 * THE BENCH THAT TAKES A PICTURE OF THIS KIND — or `null`, because not every kind has one, and
 * that is a fact of the contract rather than a gap of this map:
 *
 *   ''        → flat.  Pictures minted before the field existed, and hand uploads registered
 *               without a kind — the server reads both as flat.
 *   flat      → flat.
 *   render    → render.  (A recolor run's outputs arrive with `kind: render` — same word on the
 *               wire, same bench.)
 *   threed    → none. «A 3D frame has no slot to be put into (the bench refuses kind=threed)» —
 *               its mark is `selected`, not a slot.
 *   pattern   → none. The kind has a name of its own PRECISELY so that a repeating tile does not
 *               become selectable into a bench slot — «the front of the garment would be a square
 *               of cloth».
 *   anything newer → none. Guessing flat for a kind this bundle has not heard of is exactly the
 *               defect L-1 removes; the caller says why in place instead (`wrong_kind` is what the
 *               server would answer anyway).
 */
export function pictureBenchKind(
  picture?: Pick<common_DesignPicture, 'kind'> | null,
): BenchKind | null {
  const kind = (picture?.kind ?? '').trim().toLowerCase();
  if (!kind || kind === 'flat') return 'flat';
  if (kind === 'render') return 'render';
  return null;
}

/* ═══════════════════ THE REPRESENTATION AXIS — the same word on every screen ═══════════════════
 *
 * The bench axis above answers «which bench takes this plate» (a WRITE-side question with two
 * legal answers). This second axis answers a different one — «what KIND OF PICTURE am I looking
 * at» — and it has five answers, because that is how many the strip of representations switches
 * between. It lives here rather than in a module of its own for the reason the file already
 * states: a vocabulary spelled per organ drifts silently and by construction. Before this block
 * the rule existed in FOUR spellings — `runKindOf || declaredKind` inside `render/model.ts`, the
 * hand-made recolor subtraction in `kinds-strip.tsx`, `runKindByMediaId` in `artifacts-panel.tsx`
 * and `recolorRuns` in `onmodel/model.ts` — and the fourth missing copy of the FIRST axis is
 * already recorded as a shipped bug (L-1/L-5).
 */
export const REPRESENTATIONS = ['flat', 'pattern', 'render', 'threed', 'onmodel'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

/**
 * `DesignKind` — the same five members under the name the studio's own state uses (`state.kind` of
 * the prototype). Declared here, re-exported by `kinds-strip.tsx` for its existing importers: one
 * union, two names, and the names cannot drift apart because there is only one declaration.
 *
 * ЕГО СОБСТВЕННЫЙ ДОВОД, ПЕРЕЕХАВШИЙ СЮДА ВМЕСТЕ С НИМ: `pattern` добавлен волной K-13 («вкладка
 * паттерн криейшен между FLAT — SHEET и FABRIC RENDER»). Он член ЭТОГО союза, а не отдельный экран
 * рядом: полоса представлений — единственное место, которое знает словарь видов, и вкладка, не
 * названная в нём, была бы вкладкой, до которой нельзя дойти. Читатели союза (`history-recall`)
 * сводят неизвестный вид к `flat` ветками `else`, и `recallTargetKind` никогда не возвращает
 * `pattern` — прогон-плитка не имеет входа, в который можно «кинуть» картинки, поэтому рекол ему
 * не предлагается.
 */
export type DesignKind = Representation;

/**
 * THE REPRESENTATION A RUN BELONGS TO, or `null` for a run kind this bundle has never seen.
 *
 *   flat | vector | draft_idea → 'flat'.  A machine redraw and a text draft are work ON the flat,
 *                                and the server agrees: `DesignPictureKindOfRun` files both under
 *                                `flat` (its `default` branch).
 *   render                     → 'render'.
 *   recolor                    → 'onmodel'.  ⚠ THIS IS THE WHOLE REASON THE RUN IS READ FIRST.
 *                                A recolor's outputs declare `kind: "render"` — the backend calls
 *                                that «правда, а не удобство» — so a picture-kind read alone
 *                                cannot tell a fabric render from a photograph of the thing on a
 *                                person. Only the RUN can.
 *   threed                     → 'threed'.
 *   pattern                    → 'pattern'.
 *   anything else              → null.  Guessing a bucket for a kind this bundle has not heard of
 *                                is the L-1 defect with a new name; the caller decides what to do
 *                                with «I cannot tell», in place, and says so.
 */
export function runRepresentation(
  run?: Pick<common_DesignRun, 'kind'> | null,
): Representation | null {
  switch ((run?.kind ?? '').trim().toLowerCase()) {
    case 'flat':
    case 'vector':
    case 'draft_idea':
      return 'flat';
    case 'render':
      return 'render';
    case 'recolor':
      return 'onmodel';
    case 'threed':
      return 'threed';
    case 'pattern':
      return 'pattern';
    default:
      return null;
  }
}

/**
 * The run a picture came out of, when that run is on the loaded page.
 *
 * `GetDesignBand` returns only the FIRST page of the feed, with each run's pictures already under
 * it — so a picture reached THROUGH `band.runs` always finds its run here. The ones that may not
 * are the plates reached through a bench slot: `slot.picture` is resolved server-side precisely
 * because it is routinely older than the page. Null therefore means «not on this page», never «no
 * run» — for that, read `runId`.
 *
 * MOVED HERE FROM `render/model.ts` (which re-exports it) so that the classifier below can live
 * beside the vocabulary it speaks instead of importing back up into the render section.
 */
export function runOfPicture(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): common_DesignRun | null {
  const runId = picture.runId ?? 0;
  if (runId <= 0) return null;
  return (band.runs ?? []).find((run) => run.id === runId) ?? null;
}

/**
 * THE REPRESENTATION OF A PICTURE — the run first, the picture's own kind as the fallback.
 *
 * ═══ WHY THIS NEEDS NO `derived_from` WALK, WHICH IS THE OWNER'S ACTUAL REQUIREMENT ════════════
 *
 * «каждый сплит или каждый эдит чего либо должен быть там же где и генерация и всегда
 * фильтроваться как часть генерации». It already is, and the evidence is in the store's own
 * INSERTs rather than in this client's hope:
 *
 *   · `SplitPicture` files every crop with `"kind": parent.Kind`, `"run": nullInt32(parent.RunId)`,
 *     `"batch": nullInt32(parent.BatchId)`, `"parent": parent.Id`;
 *   · `FlattenEditLayer` does the same — `kind = parent.Kind` whenever the layer has a base
 *     picture, with run/batch/colorway copied and `derived_from` set (only a drawing from NOTHING
 *     is born `flat`).
 *
 * So a crop of a render IS a render and hangs in the render's own row, and an edit of a flat IS a
 * flat — by construction, at write time, on the server. Ancestry is materialised; classifying a
 * derived picture is therefore the same act as classifying any other one.
 *
 * FALLBACK, and it is only reached when the run says nothing (off-page, a hand upload with no run
 * at all, or a run kind this bundle does not know):
 *   ''      → 'flat'   — the column's own DEFAULT, so every row minted before the field existed
 *                        keeps meaning what it meant;
 *   flat | render | threed | pattern → themselves;
 *   anything else → null.
 *
 * ⚠ PAGE-BOUND, SAID ONCE AND HONESTLY: a picture whose run fell off the loaded feed pages is
 * classified by its own kind, so an off-page RECOLOR crop answers 'render'. That is today's
 * behaviour of every neighbour this function replaces, and it does not change here. The history
 * filter itself is immune — a run row carries its own `kind`.
 */
export function pictureRepresentation(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): Representation | null {
  const fromRun = runRepresentation(runOfPicture(band, picture));
  if (fromRun) return fromRun;
  const kind = (picture.kind ?? '').trim().toLowerCase();
  if (!kind || kind === 'flat') return 'flat';
  if (kind === 'render') return 'render';
  if (kind === 'threed') return 'threed';
  if (kind === 'pattern') return 'pattern';
  return null;
}

/* ═══════════════════ THE COLOURWAY AXIS — the THIRD axis of the bench, said once ═══════════════
 *
 * L-2, the owner: «у фабрик-рендера 1 колорвей — там мультивью, из него сплитом стороны, и так на
 * каждый колорвей». So colourway A's FRONT and colourway B's FRONT are two different render slots,
 * occupied at the same time; the colourway is part of the slot's exclusivity key on the server.
 *
 * ⚠ IT LIVES HERE, BESIDE THE OTHER TWO, FOR THE REASON THIS FILE ALREADY EXISTS. The kind axis was
 * spelled three times and MISSING from a fourth reader, and that missing copy shipped as two
 * defects (L-1: every history picture filed onto the flat bench; L-5: a flat write echoing the
 * render row's CAS token). A third axis spelled per organ would repeat that word for word — and it
 * would repeat it on a bench where the two colliding rows are now `render/front@ROSSO` and
 * `render/front@OLIVE`, i.e. two plates of the same kind, which is far harder to notice on screen
 * than a line drawing standing where a colour render belongs.
 *
 * ═══ L-4 IS ENCODED HERE AND NOWHERE ELSE ══════════════════════════════════════════════════════
 *
 * «флэты — одна разметка»: the FLAT bench is one per card and takes no colourway. That is a
 * BOUNDARY the owner wrote down separately so it would not be «finished off» by symmetry, and the
 * server enforces it (a flat ref naming a colourway is refused `colorway_forbidden`). Encoding it
 * as a predicate — `benchScopesColorway` — is what keeps a caller from filtering the flat bench by
 * the picked colourway and making every drawing on the card disappear the moment somebody picks a
 * colour. That failure would read exactly like data loss.
 */

/** «NOT STATED» on a ref and on the band filter; «none» on a stored row. One spelling of zero. */
export const COLORWAY_NONE = 0;

/**
 * THE NAMED COLOURWAY-LESS BENCH, as `GetDesignBandRequest.bench_colorway_id` spells it.
 *
 * Declared for completeness of the vocabulary and DELIBERATELY NOT SENT by this bundle: the band
 * read is unfiltered (one query key per card) and the scoping happens here, in `benchRowMatches`.
 * See `use-design-band.ts` for the whole argument. It is written down so that the next reader of
 * this file learns that `-1` is a real, legal value of the FILTER and never of a slot ref — a ref
 * says 0 for the same bench.
 */
export const COLORWAY_BENCH_NONE = -1;

/**
 * THE COLOURWAY OF ANYTHING THAT CARRIES ONE — `product(id)`, 0 = none.
 *
 * ONE READER FOR SIX CARRIERS, and that is the point of putting it here: a bench slot, a slot ref,
 * a picture, a run, an upload item and a shelf asset all spell the field the same way and all mean
 * the same thing by it. Six per-organ parses is the shape L-5 already took once.
 *
 * Everything unusable answers 0, and the three unusable cases are genuinely one answer: an absent
 * field (a binary older than the axis), an explicit null off the wire (`EmitUnpopulated`), and a
 * negative number (which no stored row may carry — the server refuses it at every write door).
 * They all mean «this thing is not attributed to a colourway», which is the legacy bench.
 */
export function colorwayOf(owner?: { colorwayId?: number | null } | null): number {
  const id = owner?.colorwayId ?? COLORWAY_NONE;
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : COLORWAY_NONE;
}

/**
 * DOES THIS BENCH HAVE A COLOURWAY AXIS AT ALL? L-4, as a predicate.
 *
 * `flat` → no, and permanently: one drawing of the garment serves every colour, and a second copy
 * of it per colourway would be N markups of one picture drifting apart in silence.
 * Everything else → yes. `render` is what the owner named; an unknown bench from a newer server
 * answers yes too, because the alternative — silently unscoping a bench this bundle has not heard
 * of — is the L-1 defect wearing the third axis.
 */
export function benchScopesColorway(kind: string): boolean {
  return kind !== 'flat';
}

/**
 * ═══ THE ONE MATCH: does this stored row stand on the bench I am addressing? ═══════════════════
 *
 * BOTH halves, kind AND colourway, in ONE place. Every reader of the bench goes through this —
 * `benchSides` (the generative screens), `readBench`/`findSlot` (the flat studio, the tile picker,
 * the history's unmark). A second parse of a slot's colourway anywhere else is forbidden, and the
 * review of this wave is obliged to catch one: it would be the fourth copy that L-5 already cost.
 */
export function benchRowMatches(
  row: common_DesignBenchSlot | null | undefined,
  kind: string,
  colorwayId: number,
): boolean {
  if (!row) return false;
  if (benchKindOf(row) !== kind) return false;
  if (!benchScopesColorway(kind)) return true;
  return colorwayOf(row) === colorwayOf({ colorwayId });
}

/**
 * THE COLOURWAY HALF OF A SLOT REF, given the bench it addresses.
 *
 * A writer states its bench (`kind`) and the colourway currently picked; this returns what may
 * legally travel. On the flat bench that is ALWAYS 0 — not because we are being careful, but
 * because a positive value there is REFUSED (`colorway_forbidden`) rather than dropped, so a
 * caller that forwarded the picked colourway into a flat write would break the flat studio the
 * first time anybody chose a colour.
 *
 * 0 ON A RENDER REF IS NOT AN ABSENCE EITHER: it addresses the unattributed bench, which is where
 * every render made before this axis stands, and it stays permanently legal.
 */
export function refColorwayFor(kind: string | undefined, colorwayId: number): number {
  return benchScopesColorway(benchKindOf({ kind } as DesignBenchSlotRef))
    ? colorwayOf({ colorwayId })
    : COLORWAY_NONE;
}

/**
 * IS THIS COLOURWAY'S RENDER BENCH OCCUPIED — the 3D door, read off the server's own set.
 *
 * ⚠ NOT `has_fabric_render`, AND THE CONTRACT NOW SAYS SO IN CAPITALS. That flag counts PICTURES
 * on the card; this set counts OCCUPIED SLOTS, and the two legitimately disagree — a render that
 * was uploaded but never placed on a side sets the flag true and leaves the set empty, and a
 * client following the old rule opens the button straight into a `no_fabric_render` refusal.
 *
 * `undefined` IS NOT «EMPTY», and that distinction is the same one `has_fabric_render` already
 * carries: a binary older than the field answers without it, and reading its silence as «no bench
 * is occupied» would lock 3D on every card that server serves. Absence answers `true` here — say
 * nothing and let the server refuse if it must.
 */
export function renderBenchOccupied(
  renderBenchColorwayIds: number[] | undefined,
  colorwayId: number,
): boolean {
  if (!renderBenchColorwayIds) return true;
  return renderBenchColorwayIds.some(
    (id) => colorwayOf({ colorwayId: id }) === colorwayOf({ colorwayId }),
  );
}
