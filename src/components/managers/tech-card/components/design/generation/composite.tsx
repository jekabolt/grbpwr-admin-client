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
 * How many pictures on this band point at `parentId`.
 *
 * Walked here rather than through `bandPictures` in `band-feed.tsx` on purpose: the feed's tile
 * imports THIS module, and importing it back would close a module cycle for the sake of four
 * lines. A duplicated ten-line walk is cheaper than a cycle that fails at load time.
 */
function countDerivedFrom(band: GetDesignBandResponse, parentId: number): number {
  if (parentId <= 0) return 0;
  let n = 0;
  for (const run of band.runs ?? []) {
    for (const picture of run.pictures ?? []) {
      if ((picture.derivedFrom ?? 0) === parentId) n += 1;
    }
  }
  for (const batch of band.batches ?? []) {
    for (const picture of batch.pictures ?? []) {
      if ((picture.derivedFrom ?? 0) === parentId) n += 1;
    }
  }
  return n;
}

export function readComposite(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): CompositeFacts {
  const views = (picture.compositeViews ?? []).map((view) => normaliseViewKey(view));
  if (!views.length) return NO_COMPOSITE;
  return { declared: true, views, splitInto: countDerivedFrom(band, picture.id ?? 0) };
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
