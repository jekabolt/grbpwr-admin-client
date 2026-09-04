import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

import { isPictureHidden } from './visibility';

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

/**
 * ═══ THE CARD'S GENERATIVE OUTPUTS OF ONE REPRESENTATION — WHOLE-CARD (H-9) ════════════════════
 *
 * Owner: «в RENDERS OF THIS CARD почему-то показывается только один рендер на бете хотя их было
 * несколько и не показываются те что мы сплитнули». The section's title claimed the CARD while its
 * reader walked `band.runs` — one page of the merged feed, twelve rows. Every run of any kind (a
 * flat re-trace, a 3D try, a pattern) pushed an older run off that window, so render runs left the
 * section one at a time and each one took its crops with it, because a crop inherits its parent's
 * `run_id` and therefore lives inside its parent's row.
 *
 * `GetDesignBandResponse.outputs` is the whole-card answer, and this is its one reader. Three
 * screens consume it — RENDERS/3D (`outputsOfKind`), PATTERNS (`patternOutputs`), ON MODEL
 * (`recolorOutputs`) — and a second spelling of any rule below would drift exactly the way the
 * kind axis drifted before this file existed.
 *
 * ⚠ `null` MEANS «THIS SERVER DID NOT STATE IT», AND THE CALLER MUST FALL BACK TO ITS PAGE WALK.
 * The gateway emits unpopulated fields, so a binary that knows the field always sends at least
 * `[]`; nothing at all is a rolled-back binary, for which the page-bound reading is still the only
 * answer available. An EMPTY list is folded into the same answer on purpose, and it is safe rather
 * than sloppy: this field is a SUPERSET of what a page walk can find, so when it is genuinely
 * empty the page walk finds nothing either. Deciding «stated» by `outputsTotal` instead would be
 * the trap the contract warns about — a zero there beside non-empty `runs` reads «this half of the
 * answer did not arrive», never «the card has no outputs».
 *
 * ⚠ THE SECTION IS CHOSEN BY THE RUN STAMP, NOT BY `picture.kind`. A recolour run's outputs
 * declare `kind: "render"` on the wire — that is true rather than a shortcut, the output IS a
 * photograph of the garment — so a picture-kind read files an ON MODEL result under RENDERS. Only
 * `run_kind` separates them, and off the feed page it is the only place that fact survives at all.
 * A row with no stamp (an uploaded plate, a parentless flatten) has no run to ask, and is
 * classified by its own kind through `pictureRepresentation`.
 *
 * ⚠ THE REAL RUN WINS OVER THE STAMP WHENEVER IT IS ON THE PAGE, and that is not tidiness. The
 * stamp carries four facts (id, kind, revision, colourway); the run object carries its attempts,
 * its params and its money. `pattern-outputs.tsx` reads `repeatOfRun(run)` and `seamWarningOf(run)`
 * off the run beside each tile — a measured seam is a warning about money already spent — and a
 * synthesised four-field literal would silence both. So on-page rows keep behaving exactly as they
 * do today, and only genuinely off-page rows degrade to the stamp: for those there is no row on
 * screen at all today, so nothing is lost that was ever shown.
 *
 * ⚠ THE ORDER IS REBUILT, AND IT IS LOAD-BEARING. `outputs` arrives newest picture id FIRST, whole
 * card. `threedResults` pairs a `.glb` with the raster that follows it in WRITE order — model
 * first, its poster next — so handing it a descending list would split every 3D result in two and
 * make the section count two models where the card has one. Rows are therefore grouped by run,
 * groups keep the descending order of their newest picture, and inside a group pictures ascend by
 * id. That is precisely the order the page walk produced (newest run first, pictures in creation
 * order), so every consumer sees the shape it already expects. A picture with no run is its own
 * group and keeps its place in the descending stream.
 *
 * ⚠ SAID OUT LOUD, BECAUSE IT IS A CHANGE OF ORDER AND NOT ONLY OF SCOPE: a group sorts by its
 * NEWEST PICTURE, not by its run. So a run whose sheet was cut yesterday comes back ahead of a run
 * that generated nothing since — the crop is newer than the neighbour's output, and «newest first»
 * is a claim about PICTURES here, which is what this list is a list of. The feed below still
 * orders by run, and the two lists therefore disagree about order on purpose.
 *
 * Hidden pictures are dropped here, as all three page walks drop them: the server ships them
 * carrying their flag and the client filters. `id <= 0` is dropped for the same reason it is
 * everywhere — nothing can be marked, zoomed or split against an id the card does not have.
 */
/**
 * A RUN NOBODY STATED — every field of `common_DesignRun` explicitly absent.
 *
 * ⚠ SPELLED OUT RATHER THAN CAST, AND THE VERBOSITY IS THE POINT. The stamp of an off-page output
 * carries FOUR facts; a `{...} as common_DesignRun` would let the next field the contract grows
 * arrive silently as `undefined` inside an object the reader believes is a run. Written out, the
 * type checker stops on the day the contract grows, and a person decides whether the stamp should
 * carry the new fact too. The generated type already declares every field `| undefined`, so no
 * consumer is entitled to assume presence — this constant only makes that explicit at the seam.
 */
const RUN_NOT_STATED: common_DesignRun = {
  id: undefined,
  techCardId: undefined,
  kind: undefined,
  status: undefined,
  clientRequestId: undefined,
  profileName: undefined,
  profileVersion: undefined,
  ask: undefined,
  params: undefined,
  inputs: undefined,
  fitAtLaunch: undefined,
  rrev: undefined,
  requestedOutputs: undefined,
  attempts: undefined,
  priceEstimate: undefined,
  priceActual: undefined,
  currency: undefined,
  author: undefined,
  cancelRequestedAt: undefined,
  archivedAt: undefined,
  archivedBy: undefined,
  errorCode: undefined,
  lastError: undefined,
  outputText: undefined,
  createdAt: undefined,
  startedAt: undefined,
  completedAt: undefined,
  pictures: undefined,
  rerunOf: undefined,
  prompt: undefined,
  colorwayId: undefined,
};

/**
 * ═══ TWO QUESTIONS ABOUT `outputs`, AND THEY ARE NOT THE SAME QUESTION ═════════════════════════
 *
 * They were one function once, and the conflation was caught in review. The names below are
 * deliberately unlike each other so that a call site cannot pick the wrong one by looking.
 *
 * `serverStatesOutputs` — DID THIS BINARY SEND THE FIELD. The gateway emits unpopulated fields, so
 * a server that knows `outputs` always sends at least `[]`; nothing at all is a binary older than
 * the field. This is the question a CAPTION asks: «am I allowed to say <of this whole card>».
 *
 * `outputsCarryRows` — IS THERE ANYTHING IN IT TO READ. This is the question the READER asks, and
 * it folds «empty» in with «not stated» ON PURPOSE: the server's predicate for `outputs` is a
 * strict superset of everything the three page walks can reach, so when the field is empty the
 * page walk finds nothing either, and falling back costs nothing and risks nothing.
 *
 * ⚠ THE TWO ANSWERS DIVERGE IN EXACTLY ONE PLACE ON SCREEN, and it is worth naming because it was
 * a live defect: `OnModelOutputs` draws itself when a run is LIVE OR FAILED even with zero
 * pictures. There, and only there, a new server can be answering whole-card while the list is
 * empty — and the footnote must read the BINARY, not the list, or it tells the owner his paid
 * recolours are off the page when the truth is that none came back.
 */
export function serverStatesOutputs(band: GetDesignBandResponse): boolean {
  return Array.isArray(band.outputs);
}

export function outputsCarryRows(band: GetDesignBandResponse): boolean {
  return (band.outputs ?? []).length > 0;
}

/**
 * IS THIS RUN ON THE LOADED PAGE — i.e. is there anything to ASK it beyond its four stamped facts?
 *
 * ⚠ THE QUESTION EXISTS BECAUSE A STAMP IS NOT A RUN, AND ONE SCREEN ALREADY PAID FOR THE
 * DIFFERENCE. `cardOutputRows` hands back the real run object whenever the page holds it and a
 * four-field literal otherwise; on that literal `params`, `attempts`, `pictures` and every money
 * field are `undefined`, which reads as 0/empty at every call site that does not check. PATTERNS
 * read `params.pattern.repeat_mm` off it and wrote the resulting **0** onto the card's fabric —
 * an invented number that then feeds the render prompt. A value you cannot read is not a value,
 * and this predicate is how a screen tells the two apart before speaking or writing.
 */
export function runIsOnPage(band: GetDesignBandResponse, run?: common_DesignRun | null): boolean {
  const id = run?.id ?? 0;
  if (id <= 0) return false;
  return (band.runs ?? []).some((r) => r.id === id);
}

export function cardOutputRows(
  band: GetDesignBandResponse,
  rep: Representation,
): { picture: common_DesignPicture; run: common_DesignRun }[] | null {
  if (!outputsCarryRows(band)) return null;
  const outputs = band.outputs ?? [];

  type Row = { picture: common_DesignPicture; run: common_DesignRun };
  const groups = new Map<string, Row[]>();
  const order: string[] = [];

  for (const output of outputs) {
    const picture = output.picture;
    if (!picture) continue;
    const pictureId = picture.id ?? 0;
    if (pictureId <= 0) continue;
    if (isPictureHidden(picture)) continue;

    const runKind = (output.runKind ?? '').trim().toLowerCase();
    const mine = runKind
      ? runRepresentation({ kind: runKind })
      : pictureRepresentation(band, picture);
    if (mine !== rep) continue;

    const runId = output.runId ?? 0;
    const run: common_DesignRun = (runId > 0 ? runOfPicture(band, picture) : null) ?? {
      ...RUN_NOT_STATED,
      id: runId,
      kind: runKind,
      rrev: output.runRrev,
      colorwayId: output.runColorwayId,
    };

    const key = runId > 0 ? `r${runId}` : `p${pictureId}`;
    const group = groups.get(key);
    if (group) {
      group.push({ picture, run });
    } else {
      groups.set(key, [{ picture, run }]);
      order.push(key);
    }
  }

  const rows: Row[] = [];
  for (const key of order) {
    const group = groups.get(key) ?? [];
    group.sort((a, b) => (a.picture.id ?? 0) - (b.picture.id ?? 0));
    rows.push(...group);
  }
  return rows;
}

/**
 * WHAT THE WHOLE-CARD LIST LEFT BEHIND, or `null` when it left nothing behind (and when this
 * server states no list at all).
 *
 * ⚠ THE CAP IS PER COLOURWAY — 60 newest of each — NEVER a whole-card ceiling, and the difference
 * is the whole reason this reader exists. A whole-card «newest 200» would drop the OLDEST pictures
 * of the card, so a colourway whose every picture is older than the cut would come back EMPTY,
 * which is the defect the field was added to kill, merely deferred. Per colourway that state is
 * unrepresentable.
 *
 * ⚠ AND THE CAPTION IS THEREFORE `outputs_total_by_colorway`, NEVER `outputs_total`. A section
 * showing one colourway that says «60 of 412» is lying: 412 is the whole card. The contract says
 * this in as many words; it is repeated here because this is the only place a screen could get it
 * wrong.
 *
 * `carried` counts what ARRIVED for that colourway, of every generative kind — not what the
 * calling section drew. That is deliberate: the cap is spent per colourway across kinds, so «are
 * older pictures missing from this colourway» is the only question the numbers can honestly
 * answer. A per-kind fraction would need a per-kind count the wire does not carry, and inventing
 * one from the capped list would understate by exactly the amount that was capped away.
 */
export function outputsHorizon(
  band: GetDesignBandResponse,
  /**
   * ⚠ ОБЯЗАТЕЛЕН, И ЭТО ЗАМЕНА КОММЕНТАРИЯ НА ТИП. Раньше он был необязательным, и на `undefined`
   * функция падала обратно на `outputs_total` — число ВСЕЙ КАРТОЧКИ, которым контракт прямо
   * запрещает подписывать суженную секцию. Запрет держался абзацем выше и ничем больше: сегодня
   * до той ветки никто не доходит, а завтра ею становится первый, кто смонтирует `OutputsSection`
   * без колорвея, — и подпись соврёт молча, ровно тем числом, о котором предупреждает контракт.
   * Отсутствующего колорвея у этого вопроса просто не бывает: горизонт ПО ОПРЕДЕЛЕНИЮ про одну
   * секцию, а секция всегда чья-то. Вызывающий без колорвея обязан не звать её вовсе.
   */
  colorwayId: number,
): { total: number; carried: number } | null {
  const outputs = band.outputs ?? [];
  if (!outputsCarryRows(band)) return null;
  const cw = colorwayOf({ colorwayId });
  const total = (band.outputsTotalByColorway ?? {})[String(cw)] ?? 0;
  const carried = outputs.filter((output) => colorwayOf(output.picture) === cw).length;
  return total > carried ? { total, carried } : null;
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

/* ─────────────────── ЧЕЙ ПРОГОН СТОИТ В СЛОТЕ — ШТАМП САМОГО СЛОТА (круг 15) ─────────────────── */

/**
 * ═══ ПОЧЕМУ ЭТИ ТРИ ЧИТАТЕЛЯ ЗАВЕДЕНЫ, И ЧТО БЕЗ НИХ БЫЛО СЛОМАНО ═════════════════════════════
 *
 * Плита слота ЗАКОННО старше первой страницы ленты: `GetDesignBand` отдаёт двенадцать прогонов
 * (`design.DefaultRunPageLimit`), а слот несёт разрешённую картинку любой давности. Поэтому
 * `runOfPicture(band, slot.picture)` на всякой карточке с историей отвечает `null`, и всё, что
 * выведено из него, тихо становится нулём.
 *
 * ЦЕНА ЭТОГО БЫЛА ОПЛАЧЕННОЙ, А НЕ КОСМЕТИЧЕСКОЙ. Сторож 3D («four sides of ONE revision»)
 * собирал ревизии как `runOfPicture(...)?.rrev ?? 0` и отбрасывал нули — то есть на карточке с
 * историей множество ревизий схлопывалось в ПУСТОЕ и `revs.length > 1` не мог стать истинным
 * НИКОГДА. Поворотный стол, склеенный из переда r3 и спины r7, закрывался как `done`. Сторож,
 * накормленный нулями, хуже отсутствующего: он читается как покрытие.
 *
 * ПОЭТОМУ ОТВЕТ ЕДЕТ НА САМОМ СЛОТЕ (`run_kind`, `run_rrev`), и читается он ЗДЕСЬ, один раз, а не
 * четырьмя выражениями по экранам. Контракт говорит, почему поля стоят на слоте, а не на картинке:
 * картинка, добытая любым другим путём, приезжает рядом с фактами своего прогона
 * (`DesignCardOutput` их уже несёт), и верстак — ЕДИНСТВЕННОЕ место, где плита приходит оторванной
 * от прогона.
 *
 * ⚠ ОТСУТСТВИЕ ≠ НОЛЬ. Шлюз печатает незаполненные поля, поэтому сервер, знающий поле, ВСЕГДА
 * шлёт число; ответ БЕЗ поля — это бинарь старше поля, и там единственный доступный ответ —
 * прежний постраничный поиск. Прочитать молчание старого сервера как «у этой плиты нет ревизии»
 * значило бы вернуть ровно тот дефект, ради которого поле и заведено, — молча.
 */
export function serverStatesSlotRun(slot?: common_DesignBenchSlot | null): boolean {
  return typeof slot?.runRrev === 'number';
}

/**
 * РОД ПРОГОНА, ИЗ КОТОРОГО ВЫШЛА ПЛИТА СЛОТА: `render | threed | pattern | recolor`, либо `''`,
 * когда прогона нет вовсе (принесено руками, либо «плоская» правка без основы).
 *
 * ⚠ ЭТО НЕ ТОТ ЖЕ ВОПРОС, ЧТО `picture.kind`, И НА РЕНДЕР-ВЕРСТАКЕ РАЗНИЦА ОПЛАЧЕНА. Перекрас
 * (ON MODEL) рождает кадры, чей СОБСТВЕННЫЙ род — `render`, и это правда: на выходе фотография
 * изделия. Значит кроп такого выхода законно встаёт в рендер-слот, сервер его принимает
 * (`picture.kind == slot.kind`), и от фабрик-рендера он там неотличим — а 3D построит тело по
 * фотографии тела. Единственное поле, в котором это различие выживает, — вот это.
 *
 * ⚠ И `pictureRepresentation` ЗДЕСЬ НЕ ГОДИТСЯ, хотя отвечает на похожий вопрос: он ищет прогон
 * ТОЙ ЖЕ постраничной картой (`runOfPicture`) и на плите старше страницы отвечает по роду самой
 * картинки, то есть у перекраса — `render`. Ровно тот случай, который надо различить.
 */
export function slotRunKind(slot?: common_DesignBenchSlot | null): string {
  return (slot?.runKind ?? '').trim().toLowerCase();
}

/**
 * РЕВИЗИЯ РЕНДЕРА ПЛИТЫ СЛОТА — `design_run.rrev`, счётчик фабрик-рендер-прогонов карточки.
 *
 * `0` — ревизии нет, и это ТРИ разных законных состояния под одним числом: прогона нет
 * (принесено руками), род прогона ревизии не минтит (её минтит только `render`), либо сервер
 * старше поля и ответить нечем. Первые два молчат по существу; третий отличается предикатом
 * `serverStatesSlotRun` и разбирается вызывающим — здесь ему подставляется постраничный поиск,
 * единственное, что на таком бинаре вообще доступно.
 */
export function slotRunRrev(
  band: GetDesignBandResponse,
  slot?: common_DesignBenchSlot | null,
): number {
  if (serverStatesSlotRun(slot)) {
    const stamped = slot?.runRrev ?? 0;
    return Number.isFinite(stamped) && stamped > 0 ? Math.trunc(stamped) : 0;
  }
  // СТАРЫЙ БИНАРЬ: постраничный поиск — не «запасной путь получше», а ЕДИНСТВЕННЫЙ здесь
  // возможный. Он по-прежнему врёт нулём на плите старше страницы, и это ровно то поведение,
  // которое у такого сервера было вчера; заменить его нечем, и делать вид, что заменили, нельзя.
  const picture = slot?.picture;
  return picture ? (runOfPicture(band, picture)?.rrev ?? 0) : 0;
}

/**
 * ═══ ГДЕ ЭТА ПЛИТА УЖЕ СТОИТ — ОТВЕТ, БЕЗ КОТОРОГО ЭКРАН РИСУЕТ ДВЕРЬ В ОТКАЗ ═════════════════
 *
 * Сервер отвергает постановку картинки, которая УЖЕ занимает какой-нибудь слот ЭТОЙ КАРТОЧКИ, —
 * `ErrDesignPictureAlreadyInSlot`, — и отказ этот не косметический, а требуемый для
 * КОРРЕКТНОСТИ: у `design_bench_slot` два уникальных ключа, и `INSERT … ON DUPLICATE KEY UPDATE`
 * правит ТУ строку, на которой столкнулся. Плита, стоящая в `back`, при вставке во `front`
 * столкнулась бы по `uq_design_bench_picture` — то есть по строке `back`, — и апсерт починил бы
 * не тот слот.
 *
 * ⚠ ГРАНИЦА — КАРТОЧКА, А НЕ ВЕРСТАК. Проверка идёт по `(tech_card_id, picture_id)` и не
 * различает ни рода, ни колорвея: плита, стоящая во ФРОНТЕ ROSSO, не встанет ни в спину ROSSO, ни
 * куда-либо на флэтовом верстаке. Поэтому и здесь обходится ВСЯ полоса верстака, без сужения:
 * сужать значило бы предлагать дверь, за которой отказ, — ровно то, ради чего этот читатель и
 * заведён.
 *
 * Возвращается сама строка, а не «да/нет»: экран обязан НАЗВАТЬ сторону, в которой плита стоит,
 * иначе «нельзя» читается как поломка.
 */
export function slotHolding(
  band: GetDesignBandResponse,
  pictureId: number,
): common_DesignBenchSlot | null {
  if (!pictureId || pictureId <= 0) return null;
  for (const row of band.bench ?? []) {
    if ((row.pictureId ?? 0) === pictureId) return row;
  }
  return null;
}
