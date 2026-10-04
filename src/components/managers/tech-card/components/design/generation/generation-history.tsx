import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
import { runRepresentation, type Representation } from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { EmptyState } from '../core';
import { pictureHandle, runHandle } from '../handles';
import { RecallBenchIntake, RecallDoors } from '../history-recall';
import { PictureTile, useGalleryGroup } from '../picture-tile';
import {
  RenderDoorsHost,
  RenderDoorsNotes,
  broughtGroup,
  hostPlates,
  useRenderStep,
} from '../render/render-tile';
import { SplitModal } from '../split-modal';
import { isPictureHidden, isRunArchived } from '../visibility';
import { viewLabel } from '../views';
import { closeSurface, openSurface, putOnBench, useBenchRun, type BenchKind } from './bench-store';
import { LiveTiles } from './live-tiles';
import { formatMoney } from './money';
import { CountPill, RunPanel } from './run-panel';
import { deckAfterZoom, deckOfRuns, outputPlan, runsGallery } from './run-gallery';
import { RunOutputs, runOutputsShown } from './run-outputs';
import { expectedTileCount, fixSelectionOf, isRunLive, runStamp, runStateWord } from './run-state';
import { REP_NOUN } from './run-tile';
import { thumbUrl } from './thumb';
import { useElapsed, useGenerationWrites, useMoreHistory, useRunPolling } from './use-generation';

/**
 * THE GENERATION HISTORY — runs, and only runs. ONE organ on five steps.
 *
 * ═══ THE LAYOUT IS THE MOCK-UP'S `histBlock()` (`_core.js`), THE MECHANISM IS THE PRODUCT'S ═════
 * Top to bottom (r2 п.22, п.23, п.27 — три правки владельца поверх макета):
 *   · header  `GENERATION HISTORY · nothing here is deleted`  [2 PATTERN RUNS ▾]  ← И СВЁРТКА ТОЖЕ
 *             (FLAT, 03.10: `GENERATION HISTORY   N RUNS` — plain text, no subtitle, no doors)
 *   · row                                                          [· 0 ARCHIVED ▸]
 *   · body    rows of runs: the tiles of what came back, then the meta line
 *             (the run standing on the workbench under GENERATE: «run N · on the bench ↑» in place
 *             of its tiles — one copy of them, O-53 review)
 *             `alina · 14:12 · $0.38` и под ней ряд дверей `recall ▸  + results ▸  meta ▸ … archive ▸`,
 *             then the pager `‹ newer · page N of M · older › … show all`
 *   · shelf   `ARCHIVED [N RUNS] [HIDE ▾]` + its rows, under the window, only while open.
 * Пилюль `RUN 7 · FLAT · DONE` больше нет (п.22): состояние — словом и только пока прогон не
 * закончен; номер и род не сказаны, потому что род задан шагом и не выбирается (п.27 — селект
 * KIND снят), а строку читают по часам и автору. Счётчик прогонов и дверь свёртки — ОДИН орган в
 * шапке (п.23): отдельной линейки `RUNS ─── HIDE ▾` больше нет.
 * ⚠ ЧИСЛО В ШАПКЕ СЧИТАЕТ РОД ЭТОГО ШАГА, А НЕ КАРТОЧКУ (ревью Codex r2) — разбор у `liveShown`.
 * В ряду под шапкой счётчиков больше нет вовсе (r3 п.8): осталась одна дверь архива.
 * The five steps differ in the kind of the step (`defaultRep`, now a hard filter); the RUNS fold
 * starts CLOSED on all five (`defaultOpen={false}`), because every step now has its own outputs
 * above it — FLAT the latest generation under GENERATE since 26.09 (O-53/O-54), the other four their
 * outputs section. The block itself is never collapsed: its header and the shelf door are always on
 * screen.
 *
 * What the mock-up shows as gestures the product does with ITS OWN RPC and rules, unchanged here:
 * NOTHING IS EVER DELETED and the generation is the unit that collapses (archive is a flag on the
 * run, reversible, `ArchiveRun`); THREE ROWS AT A TIME with the server's continuations read on
 * demand (`useMoreHistory`, `HistoryWindowAutofill`, «show all»); the band's whole-card aggregates
 * (`total_runs`, `archived_runs`) stand in the doors' `title`, where they are named as such, and
 * the numbers ON the doors count the population each door opens; NO RUN IS MEASURED AGAINST THE
 * CURRENT INPUTS (T-18); the tiles are `PictureTile` and the corner law is the primitive's; the
 * zoom walks ONE `useGalleryGroup` over every loaded picture; RECALL is two doors and a question
 * (`RecallDoors`, `history-recall.tsx`), and the bench intake stands OUTSIDE the fold, because a
 * host that unmounts drops the selection it was about to answer.
 *
 * ON FABRIC RENDER (27.09, O-63, D-62) THE ROWS ARE THE WORKBENCH'S: the studio's render scope stands
 * above this history there (`RenderStudio`), and a render run's tiles are the render tile with the
 * doors RENDERS OF THIS CARD had — `mark ▸`, `apply splitted`, `expand ▸`, `unmark ▸` — their rules
 * ONE hook over the plates this history shows (`RenderDoorsHost`), their refusal notes once at the
 * top of the block — the ones the workbench above does not print already (O-63 r2: one note per
 * reason on the step). The plates brought by hand that SIDES does not show stand here as well, as
 * one folded group after the shelf: `· N brought ▸` in the header line (`broughtGroup`).
 *
 * WHERE THE MOCK-UP'S FORM MEETS THE PRODUCT'S DATA, THE DATA WINS AND THE FORM STAYS: the tile's
 * top-left badge names the SIDE THE PLATE STANDS IN — a fact, never `ghost_view`, a guess (F-17);
 * `+ results ▸` replaces INPUT — REFERENCES with the run's outputs (J-4), it does not seat them
 * on the bench; a sheet says `N views` on its badge and carries no caption line.
 */

/** How many run rows one page of the history holds. The owner's number (T-17). */
const PAGE = 3;
/**
 * ═══ THE GRID HISTORY (FLAT, FABRIC RENDER) PACKS RUNS ACROSS THE WIDTH (T30, owner item 30) ═══
 * Owner: «в generation history большая часть это белый экран … может гридом». A run used to be a
 * row of 148px tracks holding its one or two pictures at the left and nothing after them. Now a run
 * is a GROUP — its tiles at a fixed narrow width, then its door — and the groups flow side by side
 * and wrap (`data-history-grid`). Tiles inside a group stand 4px apart, groups 24px apart: the gap
 * is what tells one run from the next, no rule and no label. A page holds what used to be three
 * rows of runs, now three rows of groups: one server page.
 */
const GRID_TILE_PX = 104;
const GRID_TILE_GAP = 4;
const GRID_PAGE = 12;
/**
 * Сколько СЕРВЕРНЫХ страниц дочитыватель окна берёт на одно положение окна. Разбор, почему
 * единица, — у `autofillBudget` в теле органа; коротко: окно короче страницы ровно на одну
 * страницу, и всё сверх неё — догадка о плотности, а не закрытие разрыва.
 */
const AUTOFILL_PAGES = 1;

/* ────────────────────────────── the row ────────────────────────────── */

function RunRow({
  band,
  techCardId,
  run,
  cardFit,
  shelf,
  onBench,
  disabled,
  galleryKey,
  galleryIndexOf,
  openDeck,
  onDeck,
  onZoomPicture,
  onSplit,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  run: common_DesignRun;
  cardFit: string;
  /**
   * ЭТА СТРОКА СТОИТ НА ПОЛКЕ АРХИВА, А НЕ В ОКНЕ (J-22). Полка существует затем, чтобы посмотреть,
   * что в архиве лежит: строка на ней разворачивается, плитки приглушены (`dim`).
   */
  shelf?: boolean;
  /**
   * ЭТОТ ПРОГОН СТОИТ НА ВЕРСТАКЕ ПОД GENERATE (26.09, O-53 review, решение координатора): его
   * плитки живут там и только там. Строка держит свою мета-линию и двери (рекол, meta, архив), а на
   * месте плиток — одна тихая строка «run 12 · on the bench ↑». Две живые копии одних картинок
   * давали ряд просмотрщика с каждой дважды, две независимые колоды и две записи слота с одним и тем
   * же CAS-токеном (Codex, MAJOR 3); одна копия снимает все три в корне.
   */
  onBench?: boolean;
  disabled?: boolean;
  galleryKey: string;
  /** picture id → its offset in the section's gallery group. Absent = no showable address. */
  galleryIndexOf: Map<number, number>;
  /** THE ONE OPEN DECK OF THE WHOLE FEED, or `null` (H-10): «нажимаешь на другой мультивью старый
   *  колапсится обратно», and the other multiview is routinely in ANOTHER ROW. */
  openDeck: number | null;
  onDeck: (rootId: number) => void;
  onZoomPicture?: (pictureId: number) => void;
  onSplit: (picture: common_DesignPicture, views: readonly string[]) => void;
}) {
  const { archiveRun } = useGenerationWrites(techCardId);
  const [open, setOpen] = useState(false);

  const runId = run.id ?? 0;
  const archived = isRunArchived(run);
  /** РОД ПРОГОНА, СКАЗАННЫЙ ОДИН РАЗ НА СТРОКУ: якорь `data-rep`, пилюля рода и каждая плитка (E-12). */
  const rep = runRepresentation(run);
  /** Свёрнута — НЕ ТО ЖЕ САМОЕ, что заархивирована: в окне заархивированная строка не рисуется вовсе
   *  (архив исключён из `unfiltered`), на полке она показывает всё, ради чего полку и открыли. */
  const folded = archived && !shelf;
  const live = isRunLive(run);
  // The clock ticks only for a run in flight (review, MINOR): a finished row shows no elapsed time.
  const elapsed = useElapsed(live ? run.startedAt || run.createdAt : undefined);
  const price = formatMoney(run.priceActual ?? run.priceEstimate, run.currency);
  /**
   * WHAT THIS ROW WAS ASKED TO FIX, WHOLE — the selection is counted, not its first member. ⚠ The
   * same wire fields mean «redraw of …» on a frozen `vector` row and `fix: …` only on the flat rows
   * already frozen with it: the owner removed the fix cycle (S-15), and history is a record.
   */
  const fix = fixSelectionOf(run);
  const fixNames = [
    ...fix.views.map((view) => viewLabel(view)),
    ...fix.slotIds.map(() => 'a detail'),
  ].filter(Boolean);
  const isVector = (run.kind ?? '').trim().toLowerCase() === 'vector';
  const rerunOf = run.rerunOf ?? 0;
  const handle = runHandle(runId);
  /** Состояние строки словом, `null` — законченный без остатка прогон (r2 п.22). */
  const state = runStateWord(run, elapsed);
  /** КТО И КОГДА — то, по чему строку теперь и узнают, раз номер и род с неё сняты. */
  const stamp = runStamp(run);
  /**
   * ОГОВОРКИ САМОЙ СТРОКИ — тем же серым текстом, а не пилюлями рядом. Их две, и обе редкие:
   * что прогону велели перерисовать/починить, и чьим повтором он был (`rerun_of` — ребро сервера).
   */
  const notes = [
    ...(fixNames.length > 0
      ? [
          isVector
            ? `redraw of ${fixNames.join(', ')}`
            : `fix: ${fixNames.join(', ')} · from the slots`,
        ]
      : []),
    ...(rerunOf > 0 ? [`repeat of ${runHandle(rerunOf)}`] : []),
  ];

  /* ═══ WHAT CAME BACK — `RunOutputs` (`run-outputs.tsx`), the block the latest-generation
     workbench under GENERATE draws too. A folded row draws none of it; a row whose run stands on
     the workbench draws the pointer to it instead (`onBench`); the gap between either and the meta
     line exists only when there is something. */
  const pointer = !folded && !!onBench;
  const outputsShown = !folded && !onBench && runOutputsShown(run);
  const toBench = scrollToBench;

  return (
    /* ЯКОРЯ СТРОКИ (G-1): её прогон и её представление — по ним читают строку и проба, и человек в
       инспекторе; `data-rep` пуст ровно тогда, когда род прогона этой сборке неизвестен.
       ЛИНЕЙКА — МЕЖДУ СТРОКАМИ, А НЕ ПОД ПОСЛЕДНЕЙ (O-48, DESIGN.md «The Between-Rows Rule»):
       `#e6e6e6` рисуется, только когда СРАЗУ за строкой стоит другая строка прогона (`data-run` —
       та же метка соседства, что `data-row` у `Row`); последняя строка окна и полки кончается
       воздухом. */
    <div
      data-run={runId || undefined}
      data-rep={rep ?? ''}
      data-run-archived={archived ? '' : undefined}
      className='border-b border-hairline pb-2 [&:not(:has(+[data-run]))]:border-b-0'
    >
      {pointer && (
        <span className='flex flex-wrap items-center gap-1.5' data-run-on-bench={runId}>
          <Text size='micro' variant='label' component='span'>
            {handle} ·
          </Text>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            aria-label={`${handle} is on the bench under GENERATE — go to it`}
            title='its pictures stand under GENERATE — split, edit, zoom and the slot marks are there'
            onClick={toBench}
          >
            on the bench ↑
          </Button>
        </span>
      )}
      {outputsShown && (
        <RunOutputs
          band={band}
          techCardId={techCardId}
          run={run}
          rep={rep}
          cardFit={cardFit}
          elapsed={elapsed}
          dim={shelf}
          disabled={disabled}
          galleryKey={galleryKey}
          galleryIndexOf={galleryIndexOf}
          openDeck={openDeck}
          onDeck={onDeck}
          onZoomPicture={onZoomPicture}
          onSplit={onSplit}
        />
      )}

      {/* ═══ THE META LINE — ОДНА СПОКОЙНАЯ СТРОКА, ПОД НЕЙ РЯД ДВЕРЕЙ (r2 п.22) ═══════════════════
          Было: `RUN 7 · FLAT · DONE · repeat of RUN 5` — россыпь из четырёх-пяти пилюль впритык, и
          сразу за ними, тем же ростом, двери. Владелец: «эти все иконки надо убрать».

          Стало ДВА яруса и ни одной пилюли:
            · факт строки — серый текст `alina · 14:12 · $0.38`, состояние словом впереди и только
              пока прогон не «done» (`runStateWord`), продуктовые оговорки (перерисовка, правка,
              повтор) — тем же текстом через `·`;
            · жест — отдельный ряд `recall ▸ · + results ▸ · meta ▸ … archive ▸` с широким шагом.
          НОМЕР ПРОГОНА И ЕГО РОД СНЯТЫ НАМЕРЕННО: после п.27 история шага держит РОВНО ОДИН род,
          а строку читают по часам и автору. Номер никуда не делся — он в `data-run`, в
          `aria-label` каждой двери и в панели `meta ▸`, то есть везде, где его ищут глазами. */}
      <div className={cn('space-y-1.5', outputsShown || pointer ? 'mt-2.5' : undefined)}>
        {/* ЯКОРЬ ЭТОЙ СТРОКИ — `data-run-line`, а НЕ `data-run-meta`: последним уже помечена панель
            `meta ▸` (`run-panel.tsx`), и два разных органа под одним именем читались бы как один. */}
        <Text size='nano' variant='label' component='p' data-run-line={runId || undefined}>
          {state && (
            <>
              <span className='text-textColor' title={state.note}>
                {state.word}
              </span>
              {' · '}
            </>
          )}
          {/* ABSENT MONEY IS «NOT STATED», NEVER `$0.00` (`money.ts`): a finished row without a
              price is a row this account may not see the price of, and the word is simply absent. */}
          {stamp}
          {price && (
            <>
              {' · '}
              <span
                title={
                  run.priceActual
                    ? 'the sum of every paid attempt of this run'
                    : 'reserved against the day at dispatch; the actual sum arrives with the answer'
                }
              >
                {price}
              </span>
            </>
          )}
          {notes.length > 0 && ` · ${notes.join(' · ')}`}
        </Text>

        {/* РЯД ДВЕРЕЙ. Шаг между ними шире, чем был (`gap-x-3` против `gap-1.5`), потому что это
            РАЗНЫЕ жесты, а не одна группа: «не пихай кучу кнопок в одном месте».
            РЕКОЛ — ДВЕ ДВЕРИ И ВОПРОС ПЕРЕД НИМИ (V-12, V-13), и все три живут в
            `history-recall.tsx`, а не здесь: строка объявляет только МЕСТО жеста. Погашенная дверь
            несёт свою причину пилюлей ПЕРЕД собой. Кнопки RERUN здесь нет и не будет (T-10). */}
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
          <RecallDoors techCardId={techCardId} band={band} run={run} disabled={disabled} />

          <Button
            variant='secondary'
            size='xs'
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${open ? 'hide' : 'show'} what went into ${handle || 'this run'}`}
            title='what this run was given, what it sent and what it cost — launch-time copies'
          >
            {open ? 'meta ▾' : 'meta ▸'}
          </Button>

          {/* ARCHIVE IS THE ONE COLLAPSE VERB LEFT, AND IT TAKES THE WHOLE GENERATION (T-14). It is
              reversible and asks nothing. ⚠ No client-side refusal stands in front of it (J-22):
              `ArchiveRun` on the server is one UPDATE of `archived_at` and holds none of the
              preconditions the old `archiveBlockReason` copied from `HideDesignPicture`. Dark only
              on a run in flight — the state word above says why — and on a read-only card. */}
          <span className='ml-auto'>
            <Button
              variant='secondary'
              size='xs'
              disabled={disabled || live || archiveRun.isPending}
              onClick={() => archiveRun.mutate({ runId, archived: !archived })}
              aria-label={archived ? `put ${handle} back on the card` : `fold ${handle} away`}
              title={
                disabled || live
                  ? undefined
                  : archived
                    ? 'put this generation back into the window'
                    : 'fold this whole generation away · reversible, and it hides no picture from anywhere else'
              }
            >
              {archived ? 'unarchive' : 'archive ▸'}
            </Button>
          </span>
        </div>
      </div>

      {open && <RunPanel techCardId={techCardId} band={band} run={run} disabled={disabled} />}
    </div>
  );
}

/* ────────────────────────────── the flat grid row (03.10) ────────────────────────────── */

/**
 * ═══ FLAT: A RUN IS ITS PICTURES, AND ONE DOOR TO THE BENCH (03.10, owner items 9 and 10b) ═════
 *
 * Owner: «в GENERATION HISTORY не должно быть лишней инфы только картинки которые были сгенерены …
 * плиткой гридом и должна быть кнопка поместить на бенч … назначать слоты можно только из бенча на
 * клик по плитке он автоматом уходит в бенч ака LATEST GENERATION». So on FLAT a row is the grid of
 * what the run drew (the cards of `outputPlan`: the outputs and their edits; cut pieces stay behind
 * their sheet, as on the bench) and `put on bench`. No meta, no recall, no slot picker, no split or
 * edit corners: all of that lives on the bench. A press on any tile does what the door does.
 * The run that stands on the bench says `on bench` in the door's place, and its tiles take you up.
 */

/**
 * The pictures a FLAT history row shows — EVERY picture the run drew, its edits included. A hidden
 * one stays in its place, dimmed (03.10 gate FX3): the history is the run's record, and hiding a
 * picture must never make its run vanish from it.
 */
export function gridPicturesOf(run: common_DesignRun): common_DesignPicture[] {
  return outputPlan(run.pictures ?? [])
    .cards.map((card) => card.picture)
    .filter((picture) => (picture.id ?? 0) > 0);
}

/** A FLAT row has something to show: a run in flight, or at least one picture (hidden counts). */
const gridShows = (run: common_DesignRun): boolean =>
  isRunLive(run) || gridPicturesOf(run).length > 0;

const scrollToBench = () =>
  document
    .querySelector('[data-workbench]')
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });

function RunGridRow({
  techCardId,
  run,
  kind,
  onBench,
  disabled,
}: {
  techCardId: number;
  run: common_DesignRun;
  /** The step whose bench a press puts the run on (FLAT, FABRIC RENDER — T24). */
  kind: BenchKind;
  /** Its pictures stand on the bench now (the run the workbench shows). */
  onBench: boolean;
  /** No write from here: the card is read-only, or the server is silent — no `cancel` corner. */
  disabled?: boolean;
}) {
  const runId = run.id ?? 0;
  const live = isRunLive(run);
  const elapsed = useElapsed(live ? run.startedAt || run.createdAt : undefined);
  const pictures = useMemo(() => gridPicturesOf(run), [run]);
  const handle = runHandle(runId);
  const toBench = () => {
    if (!onBench) putOnBench(techCardId, runId, kind);
    scrollToBench();
  };

  /** Cells of the group: its pictures, then the reserved cells of a run in flight. */
  const reserved = live ? Math.max(1, expectedTileCount(run) - pictures.length) : 0;
  const cells = Math.max(1, pictures.length + reserved);

  return (
    /* THE GROUP (T30): as wide as its cells, never wider than the history; a run with many pictures
       wraps inside its own group. */
    <div
      data-run={runId || undefined}
      data-rep={kind}
      className='min-w-0 max-w-full space-y-1.5'
      style={{ width: cells * GRID_TILE_PX + (cells - 1) * GRID_TILE_GAP }}
    >
      <div
        className='grid [&>*]:min-w-0'
        style={{
          gridTemplateColumns: `repeat(auto-fill, ${GRID_TILE_PX}px)`,
          gap: GRID_TILE_GAP,
        }}
      >
        {pictures.map((picture) => (
          <div key={picture.id} className='min-w-0' data-picture={picture.id}>
            <PictureTile
              url={thumbUrl(picture.media)}
              alt={pictureHandle(picture)}
              className='w-full'
              dim={isPictureHidden(picture)}
              onOpen={toBench}
            />
          </div>
        ))}
        {/* A RUN IN FLIGHT: its reserved cells after whatever already came back, the first with the
            run's `cancel` corner (owner item 23, `live-tiles.tsx`). */}
        {live && (
          <LiveTiles
            techCardId={techCardId}
            run={run}
            count={reserved}
            disabled={disabled}
            wordOf={(i) => (i === 0 && !pictures.length ? elapsed || 'running' : 'reserved')}
          />
        )}
      </div>
      <div className='flex items-center' data-run-bench-door={runId || undefined}>
        {onBench ? (
          <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
            on bench
          </Text>
        ) : (
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            aria-label={`put every picture of ${handle} on the bench`}
            onClick={toBench}
          >
            put on bench
          </Button>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── the representation filter ────────────────────────────── */

/**
 * ═══ РОД НАД ИСТОРИЕЙ (G-1) — СУЖЕНИЕ СТРОК, А НЕ ПЛИТОК ══════════════════════════════════════
 * Кроп и правка наследуют `run_id` предка НА СЕРВЕРЕ, поэтому они уже рисуются ВНУТРИ строки своей
 * генерации — и сужение, отбирающее строки, уносит их вместе с ней по построению. Словарь —
 * `runRepresentation`, тот же, что у полосы представлений.
 *
 * ⚠ ВЫБОРОМ ЭТО БЫТЬ ПЕРЕСТАЛО (r2 п.27): род задаёт ШАГ (`defaultRep`), селекта нет. `all`
 * остаётся выразимым только в типе — ни один композитор его не передаёт.
 */
export type RepFilter = 'all' | Representation;

/** Слово рода во множественном числе — только для фраз о пустоте: `no archived flats …`. */
const REP_LABEL: Record<RepFilter, string> = {
  all: 'runs',
  flat: 'flats',
  pattern: 'patterns',
  render: 'renders',
  threed: '3D',
  onmodel: 'change a colour',
  playground: 'playground',
};

const repLabel = (rep: RepFilter): string => REP_LABEL[rep] ?? String(rep);

/** The word of the empty-window sentence: `no flat generations among the loaded runs`. */
const repWord = (rep: RepFilter): string => (rep === 'all' ? 'run' : REP_NOUN[rep]);

/**
 * The noun of a COUNT that is narrowed to one kind: `flat run`, `pattern run`, `3D run`. Singular;
 * the caller adds the `s`, because the plural of a FLOOR («2+ pattern runs») does not follow n.
 */
const repRunNoun = (rep: RepFilter): string => (rep === 'all' ? 'run' : `${REP_NOUN[rep]} run`);

/** `1 flat run` / `2+ pattern runs` — a count that admits when it is only a floor. */
const runCountWords = (rep: RepFilter, n: number, floor: boolean): string =>
  `${n}${floor ? '+' : ''} ${repRunNoun(rep)}${n === 1 && !floor ? '' : 's'}`;

/**
 * ═══ ОКНО КОРОЧЕ СВОЕЙ СТРАНИЦЫ — ОНО САМО ПРОСИТ НЕДОСТАЮЩЕЕ (B-1, D-3) ══════════════════════
 *
 * Лента страничится на СЕРВЕРЕ (12 прогонов страницей), а сужают её ДВА клиентских решения, о
 * которых сервер не знает: фильтр рода и вечное исключение архива. Сервер честно прислал полную
 * страницу, окно честно нарезало её по три — и обе честности вместе давали пустой экран под живым
 * пейджером («первая страница пустая потом я нажимаю на следующую страницу и возвращаюсь обратно
 * страницы появляютя»).
 *
 * ⚠ ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ЭФФЕКТ В ОРГАНЕ, И ЭТО НЕСУЩЕЕ. Он монтируется ВНУТРИ раскрытой
 * свёртки RUNS, поэтому у свёрнутой ленты его нет вовсе — а свёрнута она на четырёх вкладках из
 * пяти. Гейт сделан монтажом, а не флагом: ребёнок свёртки монтируется ровно тогда, когда на
 * строки смотрят.
 *
 * ⚠ ПОЧЕМУ ЭТО КОНЕЧНО — ЧЕТЫРЕ СТОРОЖА: `!loading` (запрос в полёте не порождает второго),
 * `hasMore` (гаснет сам), `have < want` (загруженное сравнивается с запрошенным, а не с
 * бесконечностью), `budget` (потолок числа запросов на положение окна — разбор у
 * `autofillBudget`). Зависимости — ЧИСЛА И ФЛАГИ; `fetchMore` и `onSpend` пересоздаются на каждом
 * рендере родителя и в них не входят.
 */
function HistoryWindowAutofill({
  want,
  have,
  hasMore,
  loading,
  budget,
  onSpend,
  fetchMore,
}: {
  want: number;
  have: number;
  hasMore: boolean;
  loading: boolean;
  budget: number;
  /** Списать страницу с бюджета. Зовётся ДО запроса: списывает НАМЕРЕНИЕ, а не удачу. */
  onSpend: () => void;
  fetchMore: () => void;
}) {
  useEffect(() => {
    if (have < want && hasMore && !loading && budget > 0) {
      // ПОРЯДОК НЕСУЩИЙ: списание идёт ПЕРВЫМ. `fetchMore` синхронно поднимает `loading` не всегда,
      // и списание после него оставляло бы кадр, в котором бюджет ещё цел, а запрос уже ушёл.
      onSpend();
      fetchMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, have, hasMore, loading, budget]);
  return null;
}

/* ────────────────────────────── the flat header fold (03.10, T22) ────────────────────────────── */

/**
 * The FLAT fold (T22). Owner, item 22: «GENERATION HISTORY по дефолту свернут во флетах». The block
 * starts folded on every visit (not remembered). Item 10b still holds («просто текстом сколько
 * ранов было и все»), so there is no button and no ▾: the header line itself, `history · N runs`
 * (T30: a sub-part of the workbench block), is the door. Mouse: the whole line; keyboard: Tab to it, Enter or Space.
 */
export const gridHistoryStartsOpen = false;

export function HistoryFoldHeader({
  open,
  count,
  floor,
  rep,
  anchorRef,
  onToggle,
}: {
  open: boolean;
  count: number;
  /** The feed has unread pages: the count is a floor (`4+ runs`). */
  floor: boolean;
  rep: RepFilter;
  /** The gallery group's anchor (O-54): mounted as long as the block is, folded or not. */
  anchorRef?: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
}) {
  return (
    <div
      role='button'
      tabIndex={0}
      aria-expanded={open}
      aria-controls='design-history-runs'
      data-history-fold={open ? 'open' : 'closed'}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (!e.repeat) onToggle();
      }}
      className='group cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
    >
      {/* T30: a SUB-PART of the workbench block, so its header is the block's sub-group line
          (`GroupLabel`, as `details` in FLAT SLOTS), not a second block title: `history · 4 runs`. */}
      <GroupLabel
        flush
        className={open ? undefined : '!mb-0'}
        lead={
          <div ref={anchorRef} data-rep-filter={rep} className='flex items-center'>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='whitespace-nowrap uppercase tracking-label group-hover:text-textColor'
              data-run-count={count}
            >
              {`· ${count}${floor ? '+' : ''} run${count === 1 && !floor ? '' : 's'}`}
            </Text>
          </div>
        }
      >
        <span className='group-hover:text-textColor'>history</span>
      </GroupLabel>
    </div>
  );
}

/* ────────────────────────────── the section ────────────────────────────── */

/**
 * T30: ON FLAT AND FABRIC RENDER (the grid, `sub`) THE HISTORY IS A SUB-PART OF THE WORKBENCH BLOCK
 * (`Workbench`, `studio.tsx`), not a block of its own: a block never holds another one, so its frame
 * is the workbench's and its header the sub-group line `history · N runs`. Every other step keeps
 * its own `Section`.
 */
function HistoryShell({
  sub,
  children,
  ...section
}: { sub: boolean } & React.ComponentProps<typeof Section>) {
  if (!sub) return <Section {...section}>{children}</Section>;
  return (
    <div id={section.id} data-workbench-history='' className='scroll-mt-20 space-y-stack'>
      {children}
    </div>
  );
}

export function GenerationHistory({
  band,
  techCardId,
  disabled,
  defaultRep = 'all',
  defaultOpen = true,
  match,
  scopeKey = '',
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ГДЕ ЛЕНТА ОТКРЫВАЕТСЯ, А НЕ ЧТО ЕЙ ПОКАЗЫВАТЬ (J-12, J-18, J-31): начальное положение фильтра и
   * точка возврата при смене карточки; все шесть положений достижимы.
   */
  defaultRep?: RepFilter;
  /**
   * ═══ РАСКРЫТА ЛИ СВЁРТКА RUNS, КОГДА ЭКРАН ТОЛЬКО ОТКРЫЛИ (E-21…E-23, макет `fold`) ═══════
   * Нет — на всех пяти шагах: у каждого над лентой стоит СВОЙ выход (на FLAT с 26.09 — последняя
   * генерация под GENERATE, O-53; владелец, O-54: «по дефолту GENERATION HISTORY должен быть
   * заколапшен»). ⚠ Это положение СВЁРТКИ, а не блока: шапка и ряд KIND
   * стоят всегда, орган остаётся смонтированным, опрос живого прогона (`useRunPolling`) идёт —
   * без него «making a tile…» стояло бы вечно и человек нажал бы GENERATE второй раз, то есть
   * заплатил бы дважды. И поэтому же `RecallBenchIntake` стоит СНАРУЖИ свёртки.
   */
  defaultOpen?: boolean;
  /**
   * WHICH ROWS, when the step's kind is not the whole answer (PLAYGROUND, C-01): given, it REPLACES
   * the kind filter for the window and the archive shelf; `defaultRep` still names the rows in
   * words. Pass a stable function (module constant or `useCallback`) — it is a memo dependency.
   */
  match?: (run: common_DesignRun) => boolean;
  /**
   * WHICH LIST `match` DRAWS, AS A STABLE NAME (PLAYGROUND: the registry key of the open workflow,
   * or `playground-room`). Every playground workflow shares one `defaultRep`, so a changed matcher
   * was invisible to the window's resets: the page stayed where another list left it and the
   * autofill budget spent on that list stayed spent — rows the server holds were never fetched
   * (G-01, Codex 4). A change of scope resets the page, the open deck and the budget; the fold stays
   * as the person left it. A name, not the function: identity says nothing about which list it is.
   */
  scopeKey?: string;
}) {
  const speaks = serverSpeaksDesign();
  const more = useMoreHistory(techCardId, band);
  useRunPolling(techCardId, band);

  const [archShown, setArchShown] = useState(false);
  const [page, setPage] = useState(0);
  /**
   * ═══ РОД ЭТОГО ШАГА — ЖЁСТКИЙ ФИЛЬТР, А НЕ ВЫБОР (r2 п.27) ═══════════════════════════════════
   * Владелец: «в истории PATTERN не должно быть сортировки по kind — только паттерны; так же во
   * флэтах, рендерах, 3D, on model». Селект KIND снят вместе со своим состоянием: история шага
   * показывает род своего шага и ничего больше. Все пять композиторов (`generation/studio.tsx` и
   * четыре ветки `studio-tab.tsx`) передают КОНКРЕТНЫЙ род, поэтому `all` с экрана недостижим —
   * положение фильтра осталось выразимым только в типе, ради `repLabel`/`repWord`.
   */
  const rep: RepFilter = defaultRep;
  /**
   * FLAT'S HISTORY IS A GRID (03.10, owner items 9 and 10b): each run its pictures and `put on
   * bench`, the header a plain «N runs» — no archived shelf (archived runs are not shown).
   * FABRIC RENDER too (T24, owner: «в фабрик рендере в GENERATION HISTORY должна быть по дизайну и
   * смыслу такая же как во флетах»): a press puts the run on the render bench; no render doors, no
   * brought group here — marking into a side lives on the bench. Every other step keeps its rows.
   */
  const grid = (rep === 'flat' || rep === 'render') && !match;
  /** The window off: every run this card has, and the server's continuations read to the end. */
  const [showAll, setShowAll] = useState(false);
  /**
   * Свёртка RUNS (макет: `fold('hist.'+kind, …)`). The grid (FLAT T22, FABRIC RENDER T24): folded on every
   * visit whatever the caller passes; its door is the header line (`HistoryFoldHeader`). Neither
   * `put on bench` nor a tile press touches it.
   */
  const foldDefault = grid ? gridHistoryStartsOpen : defaultOpen;
  /** Runs per page: three rows (T-17) — of runs, or, in the packed grid, of run groups (T30). */
  const pageSize = grid ? GRID_PAGE : PAGE;
  const [runsOpen, setRunsOpen] = useState(foldDefault);
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
    views: readonly string[];
  } | null>(null);
  /**
   * РАЗРЕЗ В ИСТОРИИ — ТОЖЕ ПОВЕРХНОСТЬ ПРОГОНА (`bench-store.ts`, O-53 review): пока он открыт,
   * верстак под GENERATE не меняет прогон, и строка под модалкой не превращается в «on the bench».
   */
  useEffect(() => {
    if (!splitting) return;
    return () => closeSurface(techCardId, 'split:history');
  }, [splitting, techCardId]);
  /**
   * ПРОГОН НА ВЕРСТАКЕ ПОД GENERATE (O-53 review): его строка здесь — без плиток, и в ряд
   * просмотрщика и в колоды эта лента его не берёт. 0 — верстака нет (другой шаг) или он пуст.
   */
  const benchRunId = useBenchRun(techCardId);
  /**
   * ОДНА ОТКРЫТАЯ КОЛОДА НА ВСЮ ЛЕНТУ (H-10): значение — id ЛИСТА, не индекс, потому что строки
   * перестраиваются от фильтра, страницы и дочитанных продолжений, а id картинки переживает всё.
   */
  const [openDeck, setOpenDeck] = useState<number | null>(null);
  /** One open deck for the whole feed (H-10): a press on another deck's door REWRITES the address. */
  const toggleDeck = (rootId: number) =>
    setOpenDeck((current) => (current === rootId ? null : rootId));

  /**
   * ═══ O-63 (D-62 п.3–4) · ON FABRIC RENDER: THE RENDER DOORS, AND THE BROUGHT PLATES ═══════════
   * The studio's render scope reaches this history on FABRIC RENDER only; there a render run's
   * tiles draw the render doors (`RunTile` → the render tile), and the plates brought by hand that
   * SIDES does not show form one more group, folded, after the shelf — «· N brought ▸». N counts
   * the cards of the group: a cut sheet is one, its pieces stand behind it.
   */
  const renderStep = useRenderStep();
  const rendersHere = rep === 'render' && !!renderStep && !grid;
  /**
   * The group as it is drawn (O-63 r3, `broughtGroup`): its pseudo-run, its cards with the decks of
   * the pieces off SIDES — climbed through the whole family, not through the group's list alone —
   * and each card's whole split, which `apply splitted` puts into the sides (O-63 r2, D-72 п.1).
   */
  const brought = useMemo(
    () => (rendersHere && renderStep ? broughtGroup(band, renderStep) : null),
    [rendersHere, renderStep, band],
  );
  const broughtCards = brought?.plan.cards.length ?? 0;
  const [broughtShown, setBroughtShown] = useState(false);
  /** Nothing brought left off SIDES — the group closes with its door. */
  if (broughtShown && !brought) setBroughtShown(false);
  /**
   * HOW EACH ROW IS DRAWN — the group's row by the group's own plan, every other by the history's
   * (`outputPlan` over the run's pictures): the viewer row, the deck memory and the render doors
   * read one plan per row, so none of them can disagree with the grid about a deck (H-10, E-4).
   */
  const planOf = useCallback(
    (run: common_DesignRun) =>
      brought && run === brought.run ? brought.plan : outputPlan(run.pictures ?? []),
    [brought],
  );

  /**
   * ВКЛАДКА СМЕНИЛАСЬ — ФИЛЬТР И СВЁРТКА ВОЗВРАЩАЮТСЯ К ЕЁ СОБСТВЕННОМУ ПОЛОЖЕНИЮ. В РЕНДЕРЕ, а не
   * в эффекте: эффект оставил бы один закоммиченный кадр, в котором вкладка уже новая, а сегмент
   * ещё чужой.
   */
  const shownDefaults = useRef(`${defaultRep}|${defaultOpen}`);
  const shownScope = useRef(scopeKey);
  if (shownDefaults.current !== `${defaultRep}|${defaultOpen}` || shownScope.current !== scopeKey) {
    // Only a new step folds the list back; a new scope inside one step keeps the fold.
    if (shownDefaults.current !== `${defaultRep}|${defaultOpen}` && runsOpen !== foldDefault) {
      setRunsOpen(foldDefault);
    }
    shownDefaults.current = `${defaultRep}|${defaultOpen}`;
    shownScope.current = scopeKey;
    if (page !== 0) setPage(0);
    if (openDeck !== null) setOpenDeck(null);
  }

  /**
   * КАРТОЧКА СМЕНИЛАСЬ — ОКНО ИСТОРИИ НАЧИНАЕТСЯ ЗАНОВО. Переход на соседнюю тех-карту НЕ
   * размонтирует этот блок; «страница 4», «показать все», раскрытая полка и фильтр — решения о
   * ЧУЖОЙ истории. В РЕНДЕРЕ — по тому же доводу, что и сброс курсора в `useMoreHistory`.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (page !== 0) setPage(0);
    if (showAll) setShowAll(false);
    if (archShown) setArchShown(false);
    if (broughtShown) setBroughtShown(false);
    if (splitting) setSplitting(null);
    if (openDeck !== null) setOpenDeck(null);
  }

  const form = useFormContext<TechCardFormData>();
  const cardFit = (form?.watch('fit') ?? '').trim();

  /**
   * The band's first page plus whatever continuations have been asked for, deduped by id: the
   * band's own page is re-read on every write, so its cursor can move under an already-fetched
   * continuation and the same run can legitimately arrive twice. The band's copy is the fresher.
   */
  const runs = useMemo(() => {
    const byId = new Map<number, common_DesignRun>();
    [...(band.runs ?? []), ...more.runs].forEach((run) => {
      const id = run.id ?? 0;
      if (!id) return;
      if (!byId.has(id)) byId.set(id, run);
    });
    return [...byId.values()].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [band.runs, more.runs]);

  const totalRuns = band.totalRuns ?? 0;
  const archivedRuns = band.archivedRuns ?? 0;

  /**
   * Загруженные живые строки БЕЗ фильтра рода. На экран это число больше не выходит (дробь «N of
   * M» снята вместе с ложью о карточке): оно СРАВНИВАЕТСЯ с серверным `total − archived` и говорит
   * ровно одно — прочитана ли своя популяция целиком (`liveFloor`).
   * ⚠ ЗААРХИВИРОВАННЫЕ СТРОКИ ОТСЮДА ИСКЛЮЧЕНЫ ВСЕГДА (J-22): архив живёт на СВОЕЙ полке ниже, окно
   * его не пагинирует, и «страница 1 из N» после нажатия «archived ▸» остаётся верной.
   */
  const unfiltered = useMemo(() => runs.filter((run) => !isRunArchived(run)), [runs]);

  /** ПОЛКА АРХИВА — тем же фильтром рода, что и окно. */
  const archivedLoaded = useMemo(() => runs.filter(isRunArchived), [runs]);
  const archivedRows = useMemo(
    () =>
      match
        ? archivedLoaded.filter(match)
        : rep === 'all'
          ? archivedLoaded
          : archivedLoaded.filter((run) => runRepresentation(run) === rep),
    [archivedLoaded, rep, match],
  );
  /**
   * ВСЁ, ЧТО НИЖЕ, ВЫВОДИТСЯ ИЗ `visible`: страницы, зажим окна, ряд просмотрщика, «show all» и
   * подпись пейджера. Поэтому фильтр стоит ЗДЕСЬ и ровно одной строкой.
   */
  const kindRuns = useMemo(
    () =>
      match
        ? unfiltered.filter(match)
        : rep === 'all'
          ? unfiltered
          : unfiltered.filter((run) => runRepresentation(run) === rep),
    [unfiltered, rep, match],
  );
  /** FLAT's grid draws only runs with something to show (pictures, or in flight). */
  const visible = useMemo(() => (grid ? kindRuns.filter(gridShows) : kindRuns), [grid, kindRuns]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  /**
   * THE WINDOW IS CLAMPED RATHER THAN TRUSTED, and the clamp is written back after the commit (the
   * effect below), because `reachable` blinks with `more.loading` and a write in the render body
   * jumped the window under the cursor. ONE PAGE OF OVERSHOOT IS LEGAL: pressing «older ›» on the
   * last local page asks the server for a page AND steps into it.
   */
  const current = Math.min(page, pageCount - 1);
  const reachable = pageCount - 1 + (more.hasMore || more.loading ? 1 : 0);
  const shown = showAll
    ? visible
    : visible.slice(current * pageSize, current * pageSize + pageSize);
  const onLastLocalPage = current >= pageCount - 1;

  /**
   * ОДИН РЯД ПРОСМОТРЩИКА НА ВСЮ ЗАГРУЖЕННУЮ ИСТОРИЮ (T-8): «в зум вью по всем картинкам из всех
   * генераций итерироваться не только этой». Ряд, который собирают САМИ ПЛИТКИ, кончался бы на
   * краю окна по три. ПОРЯДОК РЯДА — ПОРЯДОК ПОКАЗА, и обход ПОВТОРЯЕТ решение строки построчно:
   * корни в проводном порядке, куски ОТКРЫТОЙ колоды — сразу за своим корнем, куски закрытых —
   * нигде; полка идёт ПОСЛЕ окна, как в документе.
   *
   * ═══ …ТОЛЬКО ТЕ СТРОКИ, ЧТО НА ЭКРАНЕ, И ЯКОРЬ ГРУППЫ НЕ РАЗМОНТИРУЕТСЯ (26.09, O-54) ═══════
   * The group was anchored on the rows' wrapper INSIDE the fold, and `useGalleryGroup` registers
   * its node once per shape of the row. A fold opened after mount — every step but FLAT, and FLAT
   * too once it starts folded (O-54) — or closed and opened again left the group on no node or on
   * a detached one, and a history tile's zoom opened nothing. Measured before this change: render
   * step, fold opened → zoom → no viewer; FLAT, fold closed and reopened → the same.
   * The anchor is now the header's door line (`data-rep-filter`), mounted for as long as the block
   * is, and the row holds only the rows ON SCREEN: the window while the fold is open, the shelf
   * while it is open. What is folded away is not walked — the band's other organs (the references,
   * the latest generation under GENERATE, the flat slots) still are.
   * The run on the workbench under GENERATE is not walked HERE either (O-53 review): its row has no
   * tiles, and its pictures are in the row once — through the workbench's own group.
   */
  const gallery = useMemo(
    () =>
      runsGallery(
        [
          // FLAT's grid tiles do not zoom (a press sends the run to the bench): nothing to walk.
          ...[...(runsOpen && !grid ? visible : []), ...(archShown ? archivedRows : [])].filter(
            (run) => (run.id ?? 0) !== benchRunId,
          ),
          // O-63: the brought group, while it is open — last, as it stands.
          ...(broughtShown && brought ? [brought.run] : []),
        ],
        openDeck,
        planOf,
      ),
    [
      runsOpen,
      grid,
      visible,
      archShown,
      archivedRows,
      openDeck,
      benchRunId,
      broughtShown,
      brought,
      planOf,
    ],
  );
  const galleryGroup = useGalleryGroup(gallery.items);

  /** ЧЕЙ КУСОК ЭТА КАРТИНКА — на всю показанную историю, без оглядки на `openDeck` (E-4). */
  const deckOf = useMemo(
    () =>
      deckOfRuns(
        [
          ...[...visible, ...(archShown ? archivedRows : [])].filter(
            (run) => (run.id ?? 0) !== benchRunId,
          ),
          ...(broughtShown && brought ? [brought.run] : []),
        ],
        planOf,
      ),
    [visible, archShown, archivedRows, benchRunId, broughtShown, brought, planOf],
  );

  /**
   * ЗУМ ЧУЖОЙ КАРТОЧКИ СКЛАДЫВАЕТ ОТКРЫТУЮ КОЛОДУ (E-4): «после экспанда спличеных карточек при
   * зуме любой другой они должны обратно колапсится». Граница проходит по колоде: зум по самому
   * листу и по любому его куску — работа ВНУТРИ раскрытой группы.
   */
  const foldOnForeignZoom = (pictureId: number) =>
    setOpenDeck((current) => deckAfterZoom(current, pictureId, deckOf));

  /**
   * O-63: WHAT THE RENDER DOORS OF THIS HISTORY READ — the rows on screen (the window's page, the
   * shelf, the brought group; not the run on the workbench, whose tiles live there), each drawn by
   * its own plan, so the doors and the grid never disagree about a deck.
   */
  const hostRuns = useMemo(
    () =>
      rendersHere
        ? [
            ...[...(runsOpen ? shown : []), ...(archShown ? archivedRows : [])].filter(
              (run) => (run.id ?? 0) !== benchRunId,
            ),
            ...(broughtShown && brought ? [brought.run] : []),
          ]
        : [],
    [rendersHere, runsOpen, shown, archShown, archivedRows, benchRunId, broughtShown, brought],
  );
  const plates = useMemo(() => hostPlates(hostRuns.map(planOf)), [hostRuns, planOf]);
  /** A plate's run is its row's: a piece inherits the run of its sheet, a brought plate is id 0. */
  const runOf = useMemo(() => {
    const byId = new Map(hostRuns.map((run) => [run.id ?? 0, run] as const));
    return (picture: common_DesignPicture) => byId.get(picture.runId ?? 0) ?? hostRuns[0];
  }, [hostRuns]);
  const splitHere = (picture: common_DesignPicture, views: readonly string[]) => {
    openSurface(techCardId, 'split:history', picture.runId ?? 0);
    setSplitting({ picture, handle: pictureHandle(picture), views });
  };

  /** «SHOW ALL» READS THE SERVER'S PAGES TO THE END; `hasMore` goes false on its own. */
  useEffect(() => {
    if (showAll && more.hasMore && !more.loading) more.fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, more.hasMore, more.loading]);

  /**
   * ОТКРЫТАЯ ПОЛКА ДОЧИТЫВАЕТ ПРОДОЛЖЕНИЯ САМА (J-22): `N` в шапке — число по ВСЕЙ карточке, строки
   * приезжают страницей; полка обещала бы шесть строк и рисовала две.
   */
  useEffect(() => {
    if (archShown && archivedLoaded.length < archivedRuns && more.hasMore && !more.loading) {
      more.fetchMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archShown, archivedLoaded.length, archivedRuns, more.hasMore, more.loading]);

  /** ЗАЖИМ ОКНА ЗАПИСЫВАЕТСЯ НАЗАД — ПОСЛЕ КОММИТА (разбор у `reachable`). */
  useEffect(() => {
    if (page > reachable) setPage(reachable);
  }, [page, reachable]);

  /**
   * ═══ БЮДЖЕТ ДОЧИТЫВАНИЯ — ОДНА СЕРВЕРНАЯ СТРАНИЦА НА ОДНО ПОЛОЖЕНИЕ ОКНА ═══════════════════
   * Страница, приехавшая без единой подходящей строки, оставляла `have` тем же и `hasMore` истиной,
   * и дочитыватель шагал до начала истории. Окно просит три строки, сервер отдаёт двенадцать, и
   * весь разрыв, ради которого орган заведён, закрывается ОДНОЙ страницей; всё дальше — догадка о
   * плотности. Дальше читают ДВА нажатия — `older ›` и «show all», — и нажатие есть согласие на
   * трафик. Счётчик сбрасывается СМЕНОЙ ПОЛОЖЕНИЯ ОКНА: карточка + фильтр + страница; без карточки
   * бюджет перетекал бы к соседу (`StudioTab` не размонтируется на переходе).
   */
  const [autofillSpent, setAutofillSpent] = useState(0);
  const autofillSlot = `${techCardId}:${rep}:${scopeKey}:${current}`;
  const autofillSlotRef = useRef(autofillSlot);
  if (autofillSlotRef.current !== autofillSlot) {
    autofillSlotRef.current = autofillSlot;
    if (autofillSpent) setAutofillSpent(0);
  }
  const autofillBudget = AUTOFILL_PAGES - autofillSpent;

  /**
   * ═══ ЧИСЛО НА ДВЕРИ СЧИТАЕТ ТО, ЧТО ЭТА ДВЕРЬ ОТКРЫВАЕТ (D-3, ревью Codex r2) ═════════════════
   * ДО п.27 род был ВЫБОРОМ, и шапка честно говорила о карточке: `total_runs`/`archived_runs` —
   * серверный агрегат по всей ленте, а сужение стояло рядом и было видно. После п.27 род задан
   * ШАГОМ жёстко: тело свёртки — прогоны ОДНОГО рода, полка — архив того же рода, и «23 runs ▾»
   * над двумя строками паттерна перестало быть округлением. Это был другой факт под тем же словом.
   *
   * АГРЕГАТА ПО РОДУ НА ПРОВОДЕ НЕТ («AGGREGATES OVER THE WHOLE BAND» в `GetDesignBandResponse`),
   * поэтому число рода — это число ПРОЧИТАННЫХ строк своего рода. Оно ТОЧНО ровно тогда, когда
   * своя популяция прочитана целиком, и это проверяется, а не предполагается:
   *   · живые — когда лента дочитана до конца ИЛИ загруженных живых не меньше, чем `total −
   *     archived` (сервер сосчитал, и мы столько уже держим);
   *   · архивные — когда лента дочитана ИЛИ загруженных архивных не меньше `archived_runs`.
   * Иначе число — ПОЛ, и оно подписано `+`: тем же знаком, каким в этом же файле подписан пейджер
   * («page 1 of 3+»), и по тому же доводу — назвать число, которое придётся исправлять, хуже, чем
   * назвать нижнюю границу. Карточные итоги никуда не делись: они в `title` двери, где и названы
   * карточными. ⚠ `totalRuns > 0` в проверке живых — сторож против сервера, который агрегата не
   * считает вовсе: «0 − 0» тогда не должно читаться как «всё прочитано».
   */
  const liveShown = kindRuns.length;
  const liveFloor =
    more.hasMore && !(totalRuns > 0 && unfiltered.length >= totalRuns - archivedRuns);
  const archShownCount = archivedRows.length;
  const archFloor = more.hasMore && archivedLoaded.length < archivedRuns;
  const cardWide = `the card has ${totalRuns} generation${totalRuns === 1 ? '' : 's'} in all, ${archivedRuns} of them archived`;

  /**
   * ПУСТОЕ ОКНО НАЗЫВАЕТ СВОЮ ПРИЧИНУ — И ПОД `all` ТОЖЕ (B-1). «Читаю» говорится, ТОЛЬКО пока
   * действительно читается: читателей ровно три — «show all», полка и дочитыватель окна, пока цел
   * его бюджет. ⚠ Утверждение о полноте архива проверяется полнотой (`totalRuns === archivedRuns`),
   * а не наличием.
   */
  const stillReading =
    more.loading ||
    (more.hasMore &&
      (showAll || autofillBudget > 0 || (archShown && archivedLoaded.length < archivedRuns)));
  const allArchived =
    !grid && totalRuns > 0 && totalRuns === archivedRuns && unfiltered.length === 0;

  /** The door of the empty window: to the GENERATE row of this step, which stands above. */
  const goToRun = () => {
    const el = document.getElementById('design-input') ?? document.querySelector('[data-flat-run]');
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const rowsOf = (list: common_DesignRun[], shelf: boolean) =>
    list.map((run) =>
      grid && !shelf ? (
        <RunGridRow
          key={run.id}
          techCardId={techCardId}
          run={run}
          kind={rep === 'render' ? 'render' : 'flat'}
          onBench={!!benchRunId && (run.id ?? 0) === benchRunId}
          disabled={disabled || !speaks}
        />
      ) : (
        <RunRow
          key={run.id}
          band={band}
          techCardId={techCardId}
          run={run}
          cardFit={cardFit}
          shelf={shelf || undefined}
          onBench={!!benchRunId && (run.id ?? 0) === benchRunId}
          disabled={disabled || !speaks}
          galleryKey={galleryGroup.key}
          galleryIndexOf={gallery.indexOf}
          openDeck={openDeck}
          /* ОДИН ОТКРЫТЫЙ — ЗДЕСЬ И ЕСТЬ ЭТОТ ЗАКОН: нажатие на дверь другой колоды ПЕРЕПИСЫВАЕТ
           адрес; у состояния из одного значения второе открытое просто невыразимо. */
          onDeck={toggleDeck}
          onZoomPicture={foldOnForeignZoom}
          onSplit={splitHere}
        />
      ),
    );

  const paged = visible.length > pageSize || more.hasMore;

  /**
   * THE PAGER'S DOORS. In the grid (T30) they are words: `newer · page 1 of 2 · older`, `show all`
   * underlined, like `put on bench` above them — the pager is not a toolbar.
   */
  const pagerDoor = grid
    ? ({ variant: 'underline', className: 'text-labelColor hover:text-textColor' } as const)
    : ({ variant: 'secondary' } as const);
  const pagerDot = (
    <Text size='nano' variant='label' component='span' aria-hidden>
      ·
    </Text>
  );

  return (
    /* O-63: ON FABRIC RENDER the render doors of every row below read ONE host (`RenderDoorsHost`);
       its notes stand at the top of the block (`RenderDoorsNotes`) — those the workbench above does
       not print (O-63 r2). Any other step: a fragment. */
    <RenderDoorsHost
      off={!rendersHere}
      notes={false}
      band={band}
      techCardId={techCardId}
      disabled={disabled}
      pictures={plates.pictures}
      membersOf={plates.membersOf}
      wholeDecks={brought?.wholeDecks}
      openDeck={openDeck}
      /* Below the workbench on the step: a reason both show is printed above the workbench's
         tiles, and the doors here point at that note (O-63 r2, D-72 п.5). */
      order={1}
      onDeck={toggleDeck}
      runOf={runOf}
    >
      {/* ═══ ПРИЁМНИК РЕКОЛА СТОИТ СНАРУЖИ СВЁРТКИ (E-21…E-23) ═══════════════════════════════════
          Он `return null`. А внутри свёртки он стоять не может: свёрнутое тело РАЗМОНТИРУЕТСЯ, а
          этот орган объявляет себя домом жеста (`useRegisterRecallHost` для render и threed), и
          уборка последнего дома ВЫБРАСЫВАЕТ выбор. Человек нажал бы `recall ▸` на строке
          render-прогона, лента свернулась бы, плиты не приехали — и ни одна строка об этом не
          сказала бы. Разбор владения — в `history-recall.tsx`; здесь только место. */}
      <RecallBenchIntake techCardId={techCardId} band={band} disabled={disabled || !speaks} />
      <HistoryShell
        sub={grid}
        id='design-history'
        /* FLAT (T22): the header line is drawn below as the fold's door (`HistoryFoldHeader`). */
        title={grid ? undefined : 'generation history'}
        question={grid ? undefined : '· nothing here is deleted'}
        /* ═══ ОДИН ОРГАН СВОРАЧИВАНИЯ, И ОН СТОИТ ТАМ, ГДЕ СТОЯЛО ЧИСЛО (r2 п.23) ══════════════
           Владелец: «кнопка HIDE должна быть на месте „23 RUNS“ и выглядеть органично». Было ДВА
           органа об одном и том же: пилюля-счётчик в шапке и отдельная линейка `RUNS ─── HIDE ▾`
           под рядом KIND. Счётчик и дверь слиты в одну кнопку: число говорит, сколько их, стрелка —
           открыты ли они. Отдельной линейки больше нет.
           ЧИСЛО СЧИТАЕТ РОД ЭТОГО ШАГА — ровно те строки, которые дверь и открывает (разбор у
           `liveShown`); карточные итоги — в `title`.

           ═══ И ДВЕРЬ ПОЛКИ АРХИВА СТОИТ ЗДЕСЬ ЖЕ, СПРАВА ОТ НЕГО (r3b, M-3) ═══════════════════
           Она занимала СВОЙ ряд под шапкой, одна, прижатая `ml-auto` к правому краю: ряд из одной
           кнопки и пустоты, то есть 32 пикселя высоты, не сказавшие ни слова. Двери разные (одна
           открывает живые прогоны, другая — полку архива), и две разные двери в одной линейке —
           не «куча кнопок в одном месте», а две вещи, названные там, где на них смотрят. Ряда
           больше нет; якорь `data-rep-filter` переехал на обёртку линейки — по нему по-прежнему
           читают, каким родом сужена эта история.
           ⚠ ОБЁРТКА ОБЯЗАТЕЛЬНА: `Button` — блок, и без ряда `flex` вторая дверь падала бы под
           первую. И `collapsible` этой секции НЕ ставить — свёрнутая коробка не рисует `action`
           вовсе, а кнопка внутри кнопки невалидна (разбор в `ui/components/section.tsx`). */
        action={
          grid ? undefined : (
            /* ЯКОРЬ ГРУППЫ ПРОСМОТРЩИКА — ЭТА ЛИНЕЙКА (O-54): она стоит, пока стоит блок, свёрнут он
             или нет, и её место в полосе — место истории (разбор у `gallery`). */
            <div
              ref={galleryGroup.anchorRef}
              data-rep-filter={rep}
              className='flex flex-wrap items-center gap-1.5'
            >
              <>
                <Button
                  variant='underline'
                  size='xs'
                  className='whitespace-nowrap text-labelColor hover:text-textColor'
                  aria-expanded={runsOpen}
                  aria-controls='design-history-runs'
                  aria-label={`${runsOpen ? 'hide' : 'show'} the ${runCountWords(rep, liveShown, liveFloor)} of this card`}
                  onClick={() => setRunsOpen((v) => !v)}
                  title={
                    liveFloor
                      ? `the ${repRunNoun(rep)}s this screen has read so far — the feed has earlier pages it has not read, so the number is a floor. Card-wide: ${cardWide}.`
                      : `every ${repRunNoun(rep)} on this card. Card-wide: ${cardWide}.`
                  }
                >
                  {runCountWords(rep, liveShown, liveFloor)} {runsOpen ? '▾' : '▸'}
                </Button>
                <Button
                  variant='underline'
                  size='xs'
                  className='whitespace-nowrap text-labelColor hover:text-textColor'
                  aria-expanded={archShown}
                  aria-label={`${archShown ? 'hide' : 'open'} the shelf of ${archShownCount}${archFloor ? ' or more' : ''} archived ${repRunNoun(rep)}${archShownCount === 1 && !archFloor ? '' : 's'}`}
                  title={
                    archFloor
                      ? `the archived ${repRunNoun(rep)}s read so far — the shelf reads the rest when it opens. Card-wide: ${cardWide}.`
                      : `every archived ${repRunNoun(rep)} on this card. Card-wide: ${cardWide}.`
                  }
                  onClick={() => {
                    setArchShown((v) => !v);
                    // Колода складывается: на полке может стоять её же строка, и «одна открытая на всю
                    // ленту» — закон над лентой целиком. ⚠ `setPage(0)` здесь НЕТ (J-22): полка не
                    // меняет длину списка под окном, и сброс страницы съедал жест.
                    setOpenDeck(null);
                  }}
                >
                  · {`${archShownCount}${archFloor ? '+' : ''}`} archived ▸
                </Button>
              </>
              {/* O-63 (D-62 п.4): THE BROUGHT GROUP'S DOOR — beside the shelf's, in the same line
                (r3b, M-3: a door never gets a row of its own), only while something brought stands
                off SIDES. Its group opens after the shelf. */}
              {rendersHere && broughtCards > 0 && (
                <Button
                  variant='underline'
                  size='xs'
                  className='whitespace-nowrap text-labelColor hover:text-textColor'
                  aria-expanded={broughtShown}
                  data-brought-door={broughtCards}
                  aria-label={`${broughtShown ? 'hide' : 'open'} the ${broughtCards} brought render${broughtCards === 1 ? '' : 's'} that no side of SIDES shows`}
                  title='renders uploaded by hand (no run) that stand in no side SIDES shows — mark them into a side from here'
                  onClick={() => {
                    setBroughtShown((v) => !v);
                    setOpenDeck(null);
                  }}
                >
                  · {broughtCards} brought ▸
                </Button>
              )}
            </div>
          )
        }
      >
        {grid && (
          <HistoryFoldHeader
            open={runsOpen}
            count={liveShown}
            floor={liveFloor}
            rep={rep}
            anchorRef={galleryGroup.anchorRef}
            onToggle={() => setRunsOpen((v) => !v)}
          />
        )}
        {/* O-63: why a render door below is dark — one line per reason, above the rows (D-56′). */}
        <RenderDoorsNotes />

        {!speaks && (
          <CalloutBox tone='note'>
            this server does not speak the design band yet — the rows below are read-only.
          </CalloutBox>
        )}

        {/* ═══ РЯДА ПОД ШАПКОЙ БОЛЬШЕ НЕТ (r3b, M-3) ═════════════════════════════════════════════
            Здесь стоял счётчик «[3 PICTURES] loaded» (снят владельцем, r3 п.8: «не показывать» —
            число картинок это свойство ПАГИНАЦИИ, а не работы), а после него ряд остался с одной
            дверью `· N archived ▸` и пустотой слева. Дверь переехала в линейку заголовка, рядом с
            дверью прогонов; вместе с ней переехал якорь `data-rep-filter`. */}

        {/* ═══ СВЁРТКА RUNS — ЕЁ ДВЕРЬ СТОИТ В ШАПКЕ БЛОКА (r2 п.23) ══════════════════════════════
            Здесь была линейка `RUNS ──── HIDE ▾` — второй орган об одном и том же. Осталось только
            ТЕЛО: оно МОНТИРУЕТСЯ лишь пока открыто, и это тот самый гейт под дочитывателем
            (`HistoryWindowAutofill`) — свёрнутая лента не читает ничего. */}
        {runsOpen && (
          <div id='design-history-runs' className='space-y-stack'>
            {!showAll && (
              <HistoryWindowAutofill
                want={pageSize * (current + 1)}
                have={visible.length}
                hasMore={more.hasMore}
                loading={more.loading}
                budget={autofillBudget}
                onSpend={() => setAutofillSpent((n) => n + 1)}
                fetchMore={more.fetchMore}
              />
            )}

            {/* Место истории в ряду просмотрщика держит линейка шапки (якорь группы, O-54);
                порядок внутри — из списка группы. */}
            {grid ? (
              /* T30: the run groups pack across the width and wrap — runs flow, not one per row. */
              <div data-history-grid='' className='flex flex-wrap items-start gap-x-6 gap-y-4'>
                {rowsOf(shown, false)}
              </div>
            ) : (
              <div className='space-y-2'>{rowsOf(shown, false)}</div>
            )}

            {/* ПУСТОЕ ОКНО — СЛОВАМИ, НА МЕСТЕ СТРОК, с дверью, которая его наполняет (макет
                `histBody`): нет прогонов → к запуску; все в архиве → на полку; фильтр пуст →
                все роды. «reading earlier runs…» — продукт: страница ещё едет. */}
            {visible.length === 0 &&
              (stillReading ? (
                <Text size='micro' variant='label' component='p' data-probe='rep-empty'>
                  reading earlier runs…
                </Text>
              ) : allArchived ? (
                <EmptyState
                  action={
                    <Button variant='secondary' size='xs' onClick={() => setArchShown(true)}>
                      open the archived shelf above
                    </Button>
                  }
                >
                  <span data-probe='rep-empty'>every run on this card is archived</span>
                </EmptyState>
              ) : (
                /* ⚠ ЗДЕСЬ БЫЛА ДВЕРЬ «ALL RUNS» — она вела в положение фильтра, которого больше нет
                   (r2 п.27): история шага сужена его родом жёстко, и предлагать «покажи все роды»
                   значило бы обещать экран, которого не существует. Пустота теперь говорит одно и
                   то же в обоих случаях: этого рода среди прочитанных прогонов нет. */
                <EmptyState
                  action={
                    <Button variant='secondary' size='xs' onClick={goToRun}>
                      go to the run
                    </Button>
                  }
                >
                  <span data-probe='rep-empty'>
                    {rep !== 'all'
                      ? `no ${repWord(rep)} generations among the loaded runs`
                      : 'no runs to show'}
                  </span>
                </EmptyState>
              ))}

            {/* THE PAGER, AND THE DOOR THAT SWITCHES IT OFF (T-17): pages are for reading a long
                history down, `show all` is for searching it; `show all` ↔ `paged again` is ONE door
                in two positions. `page N of M` is a caption, never a button. Absent on one page. */}
            {paged && (
              <div className='flex flex-wrap items-center gap-1.5' data-history-pager=''>
                {showAll ? (
                  <>
                    {more.loading ? (
                      <Text size='nano' variant='label' component='span'>
                        reading earlier runs…
                      </Text>
                    ) : grid ? (
                      <Text size='nano' variant='label' component='span' className='uppercase'>
                        {visible.length} runs
                      </Text>
                    ) : (
                      <CountPill n={visible.length} noun='run' />
                    )}
                    <span className='ml-auto'>
                      <Button
                        {...pagerDoor}
                        size='xs'
                        onClick={() => {
                          setShowAll(false);
                          setPage(0);
                          setOpenDeck(null);
                        }}
                        aria-label={`go back to ${pageSize} runs a page`}
                      >
                        paged again
                      </Button>
                    </span>
                  </>
                ) : (
                  <>
                    <Button
                      {...pagerDoor}
                      size='xs'
                      disabled={current === 0}
                      onClick={() => {
                        setPage(current - 1);
                        setOpenDeck(null);
                      }}
                      aria-label='newer runs'
                    >
                      {grid ? 'newer' : '‹ newer'}
                    </Button>
                    {grid && pagerDot}
                    <Text size='nano' variant='label' component='span'>
                      page {current + 1} of {pageCount}
                      {/* The server has pages this client has not read, so the total is a floor
                          and says so rather than naming a number it would have to correct. */}
                      {more.hasMore ? '+' : ''}
                    </Text>
                    {grid && pagerDot}
                    <Button
                      {...pagerDoor}
                      size='xs'
                      disabled={(onLastLocalPage && !more.hasMore) || more.loading}
                      onClick={() => {
                        // READING A SERVER PAGE ALSO REVEALS ONE: fetching without advancing the
                        // window spent a click on nothing visible.
                        if (onLastLocalPage) more.fetchMore();
                        setPage(current + 1);
                        setOpenDeck(null);
                      }}
                      aria-label='earlier runs'
                    >
                      {more.loading ? 'reading…' : grid ? 'older' : 'older ›'}
                    </Button>
                    <span className='ml-auto'>
                      <Button
                        {...pagerDoor}
                        size='xs'
                        onClick={() => {
                          setShowAll(true);
                          setOpenDeck(null);
                        }}
                        aria-label={`show all ${visible.length} runs at once`}
                        title='drop the window and read every run this card has, server pages included'
                      >
                        show all
                      </Button>
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ ПОЛКА АРХИВА — ПОД ОКНОМ, после свёртки (J-22, макет `histShelfBody`) ══════════════
            Скрытое обязано лежать ниже того, что видно. Не блок — подгруппа: `GroupLabel` и под ней
            те же строки прогонов, развёрнутые (полку открывают, чтобы посмотреть), с приглушёнными
            плитками. Число на линейке — те же строки, что под ней (род этого шага); пока
            продолжения едут, оно — пол, и говорит об этом знаком `+`. */}
        {archShown && (
          <div data-archived-shelf={`${archShownCount}${archFloor ? '+' : ''}`}>
            <GroupLabel
              action={
                <span className='flex flex-wrap items-center gap-1.5'>
                  <CountPill
                    n={archShownCount}
                    noun={repRunNoun(rep)}
                    atLeast={archFloor}
                    title={
                      archFloor
                        ? `${archivedLoaded.length} of the card's ${archivedRuns} archived runs have been read so far; the shelf is reading the rest`
                        : undefined
                    }
                  />
                  <Button
                    variant='underline'
                    size='xs'
                    className='text-labelColor hover:text-textColor'
                    aria-expanded
                    aria-label='hide the archived shelf'
                    onClick={() => {
                      setArchShown(false);
                      setOpenDeck(null);
                    }}
                  >
                    hide ▾
                  </Button>
                </span>
              }
            >
              archived
            </GroupLabel>
            {archivedRows.length > 0 ? (
              <div className='space-y-2'>{rowsOf(archivedRows, true)}</div>
            ) : (
              <EmptyState
                action={
                  <Button variant='secondary' size='xs' onClick={() => setArchShown(false)}>
                    hide the shelf
                  </Button>
                }
              >
                <span data-probe='archived-empty'>
                  {archivedLoaded.length < archivedRuns && (more.hasMore || more.loading)
                    ? 'reading earlier runs…'
                    : rep === 'all'
                      ? 'nothing archived among the loaded runs'
                      : `no archived ${repLabel(rep)} among the loaded runs`}
                </span>
              </EmptyState>
            )}
          </div>
        )}

        {/* ═══ O-63 (D-62 п.4) · THE BROUGHT PLATES — ONE GROUP, AFTER THE SHELF ══════════════════
            Uploads that stand in no side SIDES shows — the plates RENDERS OF THIS CARD listed and no
            run's row holds. One pseudo-row «no run» drawn by the rows' own block (`RunOutputs` →
            the render tile), with the same doors, the same deck and the same viewer row. */}
        {broughtShown && brought && (
          <div data-brought-shelf={broughtCards}>
            <GroupLabel
              action={
                <Button
                  variant='underline'
                  size='xs'
                  className='text-labelColor hover:text-textColor'
                  aria-expanded
                  aria-label='hide the brought renders'
                  onClick={() => {
                    setBroughtShown(false);
                    setOpenDeck(null);
                  }}
                >
                  hide ▾
                </Button>
              }
            >
              brought
            </GroupLabel>
            <RunOutputs
              band={band}
              techCardId={techCardId}
              run={brought.run}
              plan={brought.plan}
              rep='render'
              cardFit={cardFit}
              elapsed=''
              disabled={disabled || !speaks}
              galleryKey={galleryGroup.key}
              galleryIndexOf={gallery.indexOf}
              openDeck={openDeck}
              onDeck={toggleDeck}
              onZoomPicture={foldOnForeignZoom}
              onSplit={splitHere}
            />
          </div>
        )}

        {splitting && (
          <SplitModal
            techCardId={techCardId}
            picture={splitting.picture}
            handle={splitting.handle}
            views={splitting.views}
            open
            /* Разрез в истории — раскладка склеенного листа на виды, а НЕ пополнение промпта
               (T-15): кадры получат вид и станут картинками полосы; ролей промпта сервер им не
               поставит. */
            forInput={false}
            onOpenChange={(open) => !open && setSplitting(null)}
          />
        )}
      </HistoryShell>
    </RenderDoorsHost>
  );
}
