import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import {
  mediaFullToViewerItem,
  mediaFullViewerSrc,
  type MediaViewerItem,
} from 'ui/components/media-viewer';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import type { TechCardFormData } from '../../schema';
import { isPickablePicture } from '../band-feed';
import {
  COLORWAY_NONE,
  benchKindOf,
  colorwayOf,
  pictureBenchKind,
  runRepresentation,
  type Representation,
} from '../bench-kinds';
import { displayDetailName, readBench, refBenchKind } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { EmptyState } from '../core';
import { clockStamp, pictureHandle, runHandle } from '../handles';
import { RecallBenchIntake, RecallDoors } from '../history-recall';
import { VectorModal } from '../modals';
import { usePickMode } from '../pick-mode';
import { PictureTile, useGalleryGroup } from '../picture-tile';
import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { SplitModal } from '../split-modal';
import { isModelUrl } from '../threed/media';
import { useDesignWrites } from '../use-design-band';
import { isPictureHidden, isRunArchived } from '../visibility';
import { isSilhouetteView, normaliseViewKey, viewLabel } from '../views';
import { compositeTail, cropFamilies, readComposite, splitVerb } from './composite';
import { CropDeck } from './crop-deck';
import { formatMoney } from './money';
import { CountPill, GapPill, RunPanel } from './run-panel';
import {
  expectedTileCount,
  fixSelectionOf,
  isCancelling,
  isRunLive,
  isTextRun,
  runOutcomeChip,
  runOutcomeNote,
  runOutputText,
  runStatus,
} from './run-state';
import { SlotPicker } from './slot-picker';
import { thumbUrl } from './thumb';
import { useElapsed, useGenerationWrites, useMoreHistory, useRunPolling } from './use-generation';

/**
 * THE GENERATION HISTORY — runs, and only runs. ONE organ on five steps.
 *
 * ═══ THE LAYOUT IS THE MOCK-UP'S `histBlock()` (`_core.js`), THE MECHANISM IS THE PRODUCT'S ═════
 * Top to bottom (r2 п.22, п.23, п.27 — три правки владельца поверх макета):
 *   · header  `GENERATION HISTORY · nothing here is deleted`  [2 PATTERN RUNS ▾]  ← И СВЁРТКА ТОЖЕ
 *   · row                                                          [· 0 ARCHIVED ▸]
 *   · body    rows of runs: the tiles of what came back, then the meta line
 *             `alina · 14:12 · $0.38` и под ней ряд дверей `recall ▸  + results ▸  meta ▸ … archive ▸`,
 *             then the pager `‹ newer · page N of M · older › … show all`
 *   · shelf   `ARCHIVED [N RUNS] [HIDE ▾]` + its rows, under the window, only while open.
 * Пилюль `RUN 7 · FLAT · DONE` больше нет (п.22): состояние — словом и только пока прогон не
 * закончен; номер и род не сказаны, потому что род задан шагом и не выбирается (п.27 — селект
 * KIND снят), а строку читают по часам и автору. Счётчик прогонов и дверь свёртки — ОДИН орган в
 * шапке (п.23): отдельной линейки `RUNS ─── HIDE ▾` больше нет.
 * ⚠ ЧИСЛО В ШАПКЕ СЧИТАЕТ РОД ЭТОГО ШАГА, А НЕ КАРТОЧКУ (ревью Codex r2) — разбор у `liveShown`.
 * В ряду под шапкой счётчиков больше нет вовсе (r3 п.8): осталась одна дверь архива.
 * The five steps differ in TWO values only: the kind of the step (`defaultRep`, now a hard filter)
 * and whether the RUNS fold starts open (`defaultOpen`: open on FLAT, closed on the four steps that
 * have their own outputs section above). The block itself is never collapsed: its header and the
 * shelf door are always on screen.
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
 * WHERE THE MOCK-UP'S FORM MEETS THE PRODUCT'S DATA, THE DATA WINS AND THE FORM STAYS: the tile's
 * top-left badge names the SIDE THE PLATE STANDS IN — a fact, never `ghost_view`, a guess (F-17);
 * `+ results ▸` replaces INPUT — REFERENCES with the run's outputs (J-4), it does not seat them
 * on the bench; a sheet says `N views` on its badge and `sheet of N` in its caption.
 */

/** How many run rows one page of the history holds. The owner's number (T-17). */
const PAGE = 3;
/**
 * Сколько СЕРВЕРНЫХ страниц дочитыватель окна берёт на одно положение окна. Разбор, почему
 * единица, — у `autofillBudget` в теле органа; коротко: окно короче страницы ровно на одну
 * страницу, и всё сверх неё — догадка о плотности, а не закрытие разрыва.
 */
const AUTOFILL_PAGES = 1;

/** The tile track of the outputs grid — the mock-up's `.fgrid` (`minmax(148px, 1fr)`). */
const TRACK = 148;

/* ────────────────────────────── reading ────────────────────────────── */

type SlotOfPicture = {
  ref: DesignBenchSlotRef;
  /**
   * THE SLOT'S FULL NAME, FOR PROSE: `front`, or `render · front` — a bench other than the flat one
   * says its name, because «FRONT» alone names two different slots. Read by `unmark`'s label and
   * title, where the sentence has to be unambiguous on its own («take this picture out of …»).
   * ⚠ NOT the badge — see `badge` below.
   */
  label: string;
  /**
   * THE WORD ON THE TILE'S BADGE — the side, and only the side (r3 п.33). Владелец, дословно: «в
   * истории на FABRIC RENDER в миниатюрах не писать род RENDER FRONT». Род здесь сказан ДВАЖДЫ до
   * того, как его прочтут: шаг, на котором открыта история, уже сузил её до своего рода, и подпись
   * под кадром печатает его словом (`render · front`). Третье повторение на самом кадре — шум, и
   * оно съедало ширину ярлыка, у которого есть свой потолок в примитиве.
   * ⚠ ЭТО ПОЛЕ, А НЕ `label.split()` У ВЫЗЫВАЮЩЕГО: два имени одного слота обязаны считаться там
   * же, где считается его адрес, иначе они разойдутся молча — ровно как разошлись роды верстаков.
   */
  badge: string;
  /** The caption's word for the place: `front`, `cuff (2)`. */
  place: string;
  rev: number;
};

/**
 * Which bench slot holds this picture, addressed the way a write to it must be addressed.
 *
 * THE ROW ITSELF NAMES ITS BENCH (L-1/L-5). This walks the raw rows: whatever bench the picture
 * actually stands on — its own, or the wrong one placed by the old defect — the unmark addresses
 * THAT row, with THAT row's kind and CAS token, which is the only ref the server will not refuse.
 * The kind is spelled from the row, never guessed from the picture.
 */
function slotOfPicture(band: GetDesignBandResponse, pictureId: number): SlotOfPicture | null {
  if (!pictureId) return null;
  for (const row of band.bench ?? []) {
    if ((row.pictureId ?? 0) !== pictureId) continue;
    const view = normaliseViewKey(row.viewKey);
    if (isSilhouetteView(view)) {
      const kind = benchKindOf(row);
      return {
        /* И КОЛОРВЕЙ БЕРЁТСЯ У САМОЙ СТРОКИ, А НЕ У ЭКРАНА (L-2): снятие адресует ТУ строку, в
           которой плита стоит, — со всеми тремя половинами её адреса. Разбор — один, `colorwayOf`
           в `../bench-kinds`. */
        ref: { viewKey: view, kind, colorwayId: colorwayOf(row) },
        // The flat bench keeps its bare labels — the look every tile has always had; any other
        // bench says its name, because «FRONT» alone now names two different slots. That is the
        // PROSE name; the badge on the tile carries the side alone (r3 п.33).
        label: kind === 'flat' ? viewLabel(view) : `${kind} · ${viewLabel(view)}`,
        badge: viewLabel(view),
        place: viewLabel(view),
        rev: row.slotRev ?? 0,
      };
    }
    const name = displayDetailName(readBench(band, benchKindOf(row)).details, row);
    return {
      // A minted id already names its bench AND its colourway; both are ignored/deferred to beside
      // a slot_id, so 0 here is «not stated» and lets the row's own value stand.
      ref: { slotId: row.id, kind: undefined, colorwayId: COLORWAY_NONE },
      // Именованная деталь рода не носила никогда — её имя и есть её адрес.
      label: name,
      badge: name,
      place: name,
      rev: row.slotRev ?? 0,
    };
  }
  return null;
}

/** The word for a run's kind on its own line: `flat · pattern · render · 3D · on model`. */
const REP_NOUN: Record<Representation, string> = {
  flat: 'flat',
  pattern: 'pattern',
  render: 'render',
  threed: '3D',
  onmodel: 'on model',
};

function kindWord(run: Pick<common_DesignRun, 'kind'>, rep: Representation | null): string {
  const kind = (run.kind ?? '').trim().toLowerCase();
  // The two flat-coloured kinds that are not a flat drawing say their own word: a text draft is
  // not a drawing and a vector redraw is not a fresh sheet, and the history is a record.
  if (kind === 'draft_idea') return 'draft';
  if (kind === 'vector') return 'vector';
  return rep ? REP_NOUN[rep] : kind || 'run';
}

/* ────────────────────────────── the tile ────────────────────────────── */

/**
 * A run's output. THE PICTURE ITSELF IS `PictureTile` AND NOTHING ELSE (T-8): the file says WHICH
 * roles the picture has (`onSplit`, `onEdit`, a place in the gallery) and the primitive decides
 * where they sit. The tile is handed its OFFSET in a row the section assembled from the whole
 * loaded history (`galleryIndex`) — that is what makes the arrow leave the page it was opened from.
 *
 * WHAT IS LOCAL IS THE CAPTION AND THE FOOTER, the mock-up's `histTile`: `flat · front` under the
 * frame, then `UNMARK` for a plate a slot reads (И-1 — neither a ✕ nor a picker), the slot picker
 * for a free picture, nothing under a sheet (its one door is the split in the corner).
 */
function RunTile({
  band,
  techCardId,
  picture,
  rep,
  cardFit,
  runFit,
  dim,
  disabled,
  galleryKey,
  galleryIndex,
  deckMemberOf,
  onOpen,
  onZoom,
  onSplit,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  /** The kind of the RUN this tile stands in — the row knows it, the picture does not (E-12). */
  rep: Representation | null;
  cardFit: string;
  runFit: string;
  /** Приглушить кадр: строка стоит на полке архива и на неё смотрят, а не работают ею (J-22). */
  dim?: boolean;
  disabled?: boolean;
  galleryKey: string;
  galleryIndex?: number;
  /** The sheet this piece was cut out of, when the tile stands in an OPEN deck (H-10). */
  deckMemberOf?: number;
  /** The frame's surface unfolds a closed deck instead of zooming (J-2); only the sheet has it. */
  onOpen?: () => void;
  onZoom?: (pictureId: number) => void;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const pick = usePickMode();
  const { setBenchSlot } = useDesignWrites(techCardId);
  /** Правка прямо в истории (V-10): состояние у плитки — редактор открыт над КОНКРЕТНОЙ картинкой. */
  const [editing, setEditing] = useState(false);

  const pictureId = picture.id ?? 0;
  const hidden = isPictureHidden(picture);
  // WHAT THIS FILE DECLARES ABOUT ITSELF — see `composite.tsx`. Nothing here infers compositeness
  // from what the run ASKED for.
  const facts = readComposite(band, picture);
  const composite = facts.declared;
  const provenance = readProvenance(picture);
  const handle = pictureHandle(picture);
  const inSlot = slotOfPicture(band, pictureId);
  const mixed = mixedInputNote(provenance);
  const word = kindWord({ kind: picture.kind }, rep);

  /**
   * `fit slim ≠ card oversized` — the run copied the card's fit at launch, and the card has moved
   * since. Both values must be stated for the badge to mean anything.
   */
  const fitMismatch = !!runFit && !!cardFit && runFit !== cardFit;

  const url = thumbUrl(picture.media);

  /**
   * ЭТО ФАЙЛ 3D, И У НЕГО НЕТ НИ РАЗРЕЗА, НИ ПРАВКИ (E-32): разрез режет ЛИСТ НА ВИДЫ — у сборки
   * видов нет; правка рождает СИБЛИНГА в строке прогона — растр, выдающий себя за выход сборки.
   * Прогон считается целиком: и `.glb`, и его растровая миниатюра приезжают с родом `threed`.
   */
  const threedFile = (picture.kind ?? '').trim().toLowerCase() === 'threed' || isModelUrl(url);
  /** Плитка ткани: ни в один слот не встаёт и об этом не объясняется (r3 п.20, `footer` ниже). */
  const patternTile = (picture.kind ?? '').trim().toLowerCase() === 'pattern' || rep === 'pattern';
  const galleryGroup = galleryIndex == null ? undefined : { key: galleryKey, index: galleryIndex };

  /**
   * ONE BADGE — the mock-up's top-left tag. A plate a slot reads wears its SIDE and nothing else
   * (r3 п.33 — the bench's own name lives in the prose, `inSlot.label`); a sheet wears `N views`;
   * a picture standing nowhere wears nothing. ⚠ NOT `ghost_view`: «A guess, never a fact» by
   * contract, and a plate STANDING in front and a plate the machine merely guessed as front must
   * not wear the same word (F-17). The guess is kept where it is useful — as the ORDER of the slot
   * picker below.
   */
  const badge = composite ? `${facts.views.length} views` : inSlot ? inSlot.badge : undefined;
  const place = composite
    ? `sheet of ${facts.views.length}`
    : inSlot
      ? inSlot.place
      : 'not standing';

  // `flat · front` — the mock-up's `picName`. The address (`run 7 · b`), the provenance and the
  // composite tail ride in the title: the row already says which run, and the caption is one line.
  //
  // ⚠ У ПЛИТКИ ТКАНИ ВТОРОЙ ПОЛОВИНЫ НЕТ (r3 п.20, вторая половина того же пункта). «pattern · not
  // standing» — то же самое утверждение, что и снятая фраза «стоит не в слоте», сказанное мельче:
  // паттерн НЕ СТОИТ НИГДЕ ПО УСТРОЙСТВУ, и «не стоит» под каждым кадром ленты — это не факт о
  // работе, а повторение определения. Остаётся род, который на смешанной ленте ещё различает кадры.
  const caption = (
    <>
      <Text
        size='micro'
        component='p'
        className='mt-1 truncate'
        title={`${handle} · ${provenanceLabel(provenance)}${compositeTail(facts)}${mixed ? ` · ${mixed}` : ''}`}
      >
        {patternTile && !inSlot ? word : `${word} · ${place}`}
      </Text>
      {fitMismatch && (
        // Слово, а не только цвет: система обязана читаться в монохроме, и «≠» здесь несёт смысл
        // сама по себе. Обе величины названы — расхождение без второй половины ничего не значит.
        <Text size='nano' component='p' className='truncate uppercase text-error'>
          fit {runFit} ≠ card {cardFit}
        </Text>
      )}
    </>
  );

  /**
   * PICK MODE TAKES THE TILE OVER, and the picture keeps its skin while it does. The tile becomes
   * one button, so the frame is handed NO gallery and no corner roles — a button may not contain
   * buttons. THE ARMED SLOT'S BENCH GATES THE CLICK (L-1): a fabric render must not land in a flat
   * slot however it travels.
   */
  if (pick.target) {
    const targetKind = refBenchKind(band, pick.target.slot);
    const kindOk = pictureBenchKind(picture) === targetKind;
    const pickable = isPickablePicture(picture) && kindOk;
    return (
      <button
        type='button'
        data-picture={pictureId || undefined}
        data-deck-member={deckMemberOf || undefined}
        onClick={pickable ? () => pick.resolve(pictureId) : undefined}
        aria-disabled={!pickable}
        title={
          pickable
            ? `put ${handle} into ${pick.target.label}`
            : !kindOk
              ? `${pick.target.label} is a ${targetKind} slot — benches do not mix, and this picture is not a ${targetKind}`
              : composite
                ? 'a composite holds several views — split it first'
                : 'hidden pictures are not offered'
        }
        className={cn(
          'flex h-full w-full min-w-0 flex-col text-left',
          pickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
        )}
      >
        {/* `w-full` НЕСУЩЕЕ: обёртка здесь — <button>, а у кнопки UA-раскладка не растягивает
            детей по поперечной оси, и кадр с одним лишь `aspect-ratio` схлопнулся бы. */}
        <PictureTile url={url} alt={handle} badge={badge} selected={pickable} className='w-full' />
        {caption}
      </button>
    );
  }

  let footer: React.ReactNode = null;
  if (hidden) {
    /**
     * A STATE, NOT AN ORGAN. Hiding one picture is gone (T-14) and so is its undo; what is left is
     * a stamp some earlier session wrote, which every picker still obeys.
     */
    footer = (
      <Pill
        tone='mut'
        title='hidden in an earlier session, before per-picture hiding was removed — pickers and slots still skip it. Runs are archived whole now.'
      >
        hidden
      </Pill>
    );
  } else if (inSlot) {
    // И-1: a plate that a slot reads carries neither a ✕ nor a picker — both would be refused — so
    // the one honest door is the one that undoes the placement. Full width, as the mock-up's.
    footer = (
      <Button
        variant='secondary'
        size='xs'
        className='w-full'
        disabled={disabled || setBenchSlot.isPending}
        onClick={() =>
          setBenchSlot.mutate({
            slot: inSlot.ref,
            // 0 is UNMARK: empty the slot without deleting it. A different act from deleting a
            // detail slot, and it has to stay different.
            pictureId: 0,
            expectedSlotRev: inSlot.rev,
          })
        }
        aria-label={`take ${handle} off ${inSlot.label}`}
        title={disabled ? undefined : `take this picture out of ${inSlot.label}`}
      >
        unmark
      </Button>
    );
  } else if (!composite && !patternTile) {
    // NO SLOT PICKER UNDER A COMPOSITE, AND THAT IS THE RULE: a slot holds one view and that file
    // holds several, so its only door is the split in the corner. `rep` — the RUN'S kind — is
    // load-bearing (E-12): a recolour's outputs say «render» on the wire.
    // ⚠ И НИ ПИКЕРА, НИ ФРАЗЫ ПОД ПЛИТКОЙ ПАТТЕРНА (r3 п.20). Владелец, дословно: «в истории на
    // PATTERN убрать текст a repeating tile stands in no slot — it is cloth, not a view». Пикер
    // рисовал на её месте объяснение, почему двери нет, — по общему правилу волны «никогда не
    // отсутствие, никогда мёртвый орган». Правило верно там, где человек ИЩЕТ дверь; здесь он её
    // не ищет: шаг называется PATTERN, и ни одна плитка на нём в слот не встаёт, так что фраза
    // повторялась под КАЖДЫМ кадром ленты, одна и та же. Объяснение живёт там, где оно ещё нужно,
    // — у 3D-кадра и у снимка на модели, где рядом СТОЯТ плитки, у которых дверь есть.
    // `min-h`, not `h`: one branch of the picker draws a phrase, not a control, and a fixed height
    // painted it over the next row's meta line (measured on beta, tab ALL, 1400 wide).
    footer = !disabled && (
      <SlotPicker
        band={band}
        techCardId={techCardId}
        picture={picture}
        rep={rep}
        className='min-h-[20px] w-full'
      />
    );
  }

  return (
    <div
      className='flex h-full w-full min-w-0 flex-col'
      data-picture={pictureId || undefined}
      data-deck-member={deckMemberOf || undefined}
    >
      <PictureTile
        url={url}
        alt={handle}
        badge={badge}
        onOpen={onOpen}
        onZoom={onZoom && pictureId ? () => onZoom(pictureId) : undefined}
        galleryGroup={galleryGroup}
        /* ПРИГЛУШАЕТСЯ СНИМОК, А НЕ ПЛИТКА (K-6): прозрачность на всей плитке глушила бы и дверь
           `edit` до 1.6:1. Слово «hidden» под кадром состояние держит и без заливки. */
        dim={hidden || dim}
        className='w-full'
        /* РЕЗ ПРЕДЛАГАЕТСЯ НА ЖИВОЙ И ЕЩЁ НЕ РАЗРЕЗАННОЙ КАРТИНКЕ. Этот экран и есть то место, где
           человек ОБЪЯВЛЯЕТ свой лист многовидовым (полосы входов показывают колоды только для
           машинных композитов). У уже разрезанной угла нет (F-8). У файла 3D — тем более (E-32). */
        onSplit={
          !disabled && !hidden && !threedFile && facts.splitInto === 0
            ? {
                onClick: () => onSplit(picture),
                ariaLabel: `split ${handle} into views`,
                title: `${splitVerb(facts)} cut this file into pictures a slot can take`,
              }
            : undefined
        }
        /* ПРАВКА (V-10, K-6) стоит на КАЖДОМ сгенерированном растре — склейке и картинке со
           старым штампом `hidden` тоже: редактор рождает СИБЛИНГА в той же строке прогона, база не
           трогается. Единственное исключение — файл 3D (E-32): предмета нет. */
        onEdit={
          !disabled && !threedFile
            ? {
                onClick: () => setEditing(true),
                ariaLabel: `edit ${handle} — draw over this picture`,
                title:
                  'draw over this picture — saving makes a NEW picture in this same run row; the original is never overwritten' +
                  (composite
                    ? '. This file holds several views at once, so the edit keeps them together — cut it into views first if you want them apart'
                    : '') +
                  (hidden
                    ? '. This one carries an old hidden stamp; the picture your edit makes does not'
                    : ''),
              }
            : undefined
        }
      />
      {caption}
      {footer && <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5'>{footer}</div>}

      {/* Редактор монтируется только раскрытым. `slot` НЕ ПЕРЕДАЁТСЯ НАРОЧНО: плитка истории — не
          слот верстака, и результат правки не обязан никуда вставать. */}
      {editing && (
        <VectorModal
          open
          onOpenChange={setEditing}
          techCardId={techCardId}
          band={band}
          base={picture}
          slot={null}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/* ────────────────────────────── the row ────────────────────────────── */

/**
 * СОСТОЯНИЕ ПРОГОНА — СЛОВОМ, И ТОЛЬКО ПОКА О НЁМ ЕСТЬ ЧТО СКАЗАТЬ (r2 п.22).
 *
 * Владелец о ряде пилюль на строке: «RUN 30 · FLAT · DONE — эти все иконки надо убрать». Пилюли
 * состояния больше нет; `null` здесь означает «прогон кончился ровно так, как его просили» — такая
 * строка молчит вовсе, о её исходе говорят её же картинки под ней. Все остальные положения
 * (`running 0:12`, `reserved`, `retrying · CODE`, `cancelling…`, `failed · CODE`, `cancelled`,
 * `done · 1 of 2` — доставлено меньше, чем просили) остаются словом в мета-строке.
 *
 * ⚠ ДВА ЧТЕНИЯ ОДНОГО ИСХОДА (D-4): слово — усечённый `runOutcomeChip` (текст провайдера бывает до
 * 4 000 знаков и увёл бы страницу вбок), `title` — целый `runOutcomeNote`.
 */
function runStateWord(
  run: common_DesignRun,
  elapsed: string,
): { word: string; note?: string } | null {
  const status = runStatus(run);
  const note = runOutcomeNote(run);
  const chip = runOutcomeChip(run);
  if (isRunLive(run)) {
    const failedOnce = !!((run.errorCode ?? '').trim() || (run.lastError ?? '').trim());
    const word = isCancelling(run)
      ? 'cancelling…'
      : status === 'pending' && !failedOnce
        ? 'reserved'
        : chip;
    const clock = status === 'running' || failedOnce ? elapsed : '';
    return {
      word: clock ? `${word} ${clock}` : word,
      note: isCancelling(run) ? undefined : note,
    };
  }
  // «done» без остатка — единственное молчаливое состояние; «done · 1 of 2» это уже недостача.
  if (status === 'done' && note === 'done') return null;
  return { word: chip, note };
}

function RunRow({
  band,
  techCardId,
  run,
  cardFit,
  shelf,
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
  disabled?: boolean;
  galleryKey: string;
  /** picture id → its offset in the section's gallery group. Absent = no showable address. */
  galleryIndexOf: Map<number, number>;
  /** THE ONE OPEN DECK OF THE WHOLE FEED, or `null` (H-10): «нажимаешь на другой мультивью старый
   *  колапсится обратно», and the other multiview is routinely in ANOTHER ROW. */
  openDeck: number | null;
  onDeck: (rootId: number) => void;
  onZoomPicture?: (pictureId: number) => void;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const { archiveRun } = useGenerationWrites(techCardId);
  const [open, setOpen] = useState(false);
  /**
   * Развёрнут ли ОТВЕТ текстового прогона (D-2). Отдельно от `open`: та дверь показывает, что
   * прогону ДАЛИ, эта — что он ВЕРНУЛ. Свой `useState`, а не `<details>`: свёрнутый `<details>`
   * меряется как видимый, и проба «текста на экране нет» зеленела бы на закрытом экране.
   */
  const [textOpen, setTextOpen] = useState(false);

  const runId = run.id ?? 0;
  const archived = isRunArchived(run);
  /** РОД ПРОГОНА, СКАЗАННЫЙ ОДИН РАЗ НА СТРОКУ: якорь `data-rep`, пилюля рода и каждая плитка (E-12). */
  const rep = runRepresentation(run);
  /** Свёрнута — НЕ ТО ЖЕ САМОЕ, что заархивирована: в окне заархивированная строка не рисуется вовсе
   *  (архив исключён из `unfiltered`), на полке она показывает всё, ради чего полку и открыли. */
  const folded = archived && !shelf;
  const live = isRunLive(run);
  const elapsed = useElapsed(run.startedAt || run.createdAt);
  /** EVERY PICTURE THE RUN PRODUCED, UNFILTERED (T-14): a stamped picture is marked, never dropped. */
  const pictures = run.pictures ?? [];
  /** Which pictures of this row were cut out of which (H-10), from `derived_from`, inside this row. */
  const families = useMemo(() => cropFamilies(pictures), [pictures]);
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
  const status = runOutcomeNote(run);
  /** ПРОГОН, КОТОРЫЙ ОТВЕЧАЕТ СЛОВАМИ (D-2): черновик идеи возвращает текст, не картинки. */
  const textRun = isTextRun(run);
  const outputText = runOutputText(run);
  const rerunOf = run.rerunOf ?? 0;
  const handle = runHandle(runId);
  const expected = expectedTileCount(run);
  const noPictures = !live && !textRun && pictures.length === 0;
  /** Состояние строки словом, `null` — законченный без остатка прогон (r2 п.22). */
  const state = runStateWord(run, elapsed);
  /** КТО И КОГДА — то, по чему строку теперь и узнают, раз номер и род с неё сняты. */
  const stamp =
    [(run.author ?? '').trim(), clockStamp(run.createdAt)].filter(Boolean).join(' · ') ||
    'author not stated';
  /**
   * ОГОВОРКИ САМОЙ СТРОКИ — тем же серым текстом, а не пилюлями рядом. Их две, и обе редкие:
   * что прогону велели перерисовать/починить, и чьим повтором он был (`rerun_of` — ребро сервера).
   */
  const notes = [
    ...(fixNames.length > 0
      ? [isVector ? `redraw of ${fixNames.join(', ')}` : `fix: ${fixNames.join(', ')} · from the slots`]
      : []),
    ...(rerunOf > 0 ? [`repeat of ${runHandle(rerunOf)}`] : []),
  ];

  /* ═══ WHAT CAME BACK — the mock-up's `histOutputs` ═══════════════════════════════════════════
     A run in flight: dashed cells, `running 0:12` in the first while it runs, `reserved` in the
     rest — the same grammar as an intake slot, NOT a button (nothing to press). A text run: its
     draft, folded. Pictures: one grid, the open deck's pieces as ordinary cards right after their
     sheet (H-10). Nothing at all: the dashed pill `nothing came back`. A failed or cancelled row
     with nothing under it says nothing more: its pill already states the outcome (S-10). */
  let outputs: React.ReactNode = null;
  if (folded) {
    outputs = null;
  } else if (textRun) {
    outputs = (
      <div data-run-text={runId}>
        {live ? (
          <Text size='micro' variant='label' component='p'>
            writing the draft — {elapsed}
          </Text>
        ) : outputText ? (
          <>
            <Button
              variant='secondary'
              size='xs'
              data-run-text-toggle={runId}
              onClick={() => setTextOpen((v) => !v)}
              aria-expanded={textOpen}
            >
              {textOpen ? 'hide the draft ▾' : 'read the draft ▸'} · {outputText.length} characters
            </Button>
            {textOpen && (
              /* ПРОЗА МЕРИТСЯ СТРОКОЙ, А НЕ БЛОКОМ: `max-w-[75ch]` + `break-words` держат любой
                 ответ модели внутри колонки; страницу вбок этот орган не двигает (D-4). */
              <Text
                size='micro'
                component='p'
                className='mt-1 max-w-[75ch] whitespace-pre-wrap break-words bg-bgZebra px-2 py-1.5'
              >
                {outputText}
              </Text>
            )}
          </>
        ) : (
          status === 'done' && (
            <GapPill title='the run finished and stored no text'>finished with no text</GapPill>
          )
        )}
      </div>
    );
  } else if (live && expected > 0) {
    outputs = (
      <Tiles min={TRACK}>
        {Array.from({ length: expected }, (_, i) => (
          <Tile
            key={i}
            dashed
            media={
              <div
                className='flex w-full items-center justify-center bg-bgSecondary'
                style={{ aspectRatio: '4 / 5' }}
              >
                <Text
                  size='nano'
                  variant='label'
                  component='span'
                  className='uppercase tracking-label'
                >
                  {i === 0 && runStatus(run) === 'running' ? `running ${elapsed}` : 'reserved'}
                </Text>
              </div>
            }
          />
        ))}
      </Tiles>
    );
  } else if (!live && pictures.length > 0) {
    outputs = (
      /* ОДИН ГРИД, А НЕ ГРИД В ГРИДЕ (H-10): куски открытой колоды встают обычными карточками в тот
         же ряд, сразу за своим листом. Фрагмент не создаёт DOM-узла, поэтому `[&>*]:min-w-0` у
         `Tiles` по-прежнему достаётся самим плиткам. */
      <Tiles min={TRACK}>
        {pictures.map((picture) => {
          const pictureId = picture.id ?? 0;
          // Кусок рисуется ТОЛЬКО под своим листом.
          if (families.rootOf.has(pictureId)) return null;
          const members = families.membersOf.get(pictureId) ?? [];
          const deckOpen = openDeck === pictureId;
          const tile = (
            <RunTile
              band={band}
              techCardId={techCardId}
              picture={picture}
              rep={rep}
              cardFit={cardFit}
              runFit={(run.fitAtLaunch ?? '').trim()}
              dim={shelf}
              disabled={disabled}
              galleryKey={galleryKey}
              galleryIndex={galleryIndexOf.get(pictureId)}
              /* ПЕРВЫЙ КЛИК АНКОЛАПСИТ, ВТОРОЙ ОТКРЫВАЕТ ЗУМ (J-2): роль только у листа СВЁРНУТОЙ
                 колоды; у раскрытой лист — обычная карточка ряда. */
              onOpen={members.length && !deckOpen ? () => onDeck(pictureId) : undefined}
              onZoom={onZoomPicture}
              onSplit={onSplit}
            />
          );
          if (!members.length) return <Fragment key={pictureId}>{tile}</Fragment>;
          return (
            <Fragment key={pictureId}>
              <CropDeck
                rootId={pictureId}
                count={members.length}
                peeks={members.map((member) => ({
                  id: member.id ?? 0,
                  url: thumbUrl(member.media),
                  alt: pictureHandle(member),
                }))}
                /* ШИРИНА ОДНОЙ ДОРОЖКИ через собственную коробку колоды: свёрнутая занимает ДВЕ
                   дорожки (`span 2`) с 8px зазора между ними. Кадр — `4/5` `PictureTile`. */
                sheetWidth='calc((100% - 8px) / 2)'
                frameAspect='4/5'
                style={deckOpen ? undefined : { gridColumn: 'span 2' }}
                open={deckOpen}
                onToggle={() => onDeck(pictureId)}
              >
                {tile}
              </CropDeck>
              {deckOpen &&
                members.map((member) => (
                  <RunTile
                    key={member.id}
                    band={band}
                    techCardId={techCardId}
                    picture={member}
                    rep={rep}
                    cardFit={cardFit}
                    runFit={(run.fitAtLaunch ?? '').trim()}
                    dim={shelf}
                    disabled={disabled}
                    galleryKey={galleryKey}
                    galleryIndex={galleryIndexOf.get(member.id ?? 0)}
                    deckMemberOf={pictureId}
                    onZoom={onZoomPicture}
                    onSplit={onSplit}
                  />
                ))}
            </Fragment>
          );
        })}
      </Tiles>
    );
  } else if (noPictures && !(status.startsWith('failed') || status.startsWith('cancelled'))) {
    outputs = <GapPill title='the run finished and returned no picture'>nothing came back</GapPill>;
  }

  return (
    /* ЯКОРЯ СТРОКИ (G-1): её прогон и её представление — по ним читают строку и проба, и человек в
       инспекторе; `data-rep` пуст ровно тогда, когда род прогона этой сборке неизвестен. Нижняя
       линейка у КАЖДОЙ строки — макет: `border-bottom: 1px #e6e6e6`. */
    <div
      data-run={runId || undefined}
      data-rep={rep ?? ''}
      data-run-archived={archived ? '' : undefined}
      className='border-b border-hairline pb-2'
    >
      {outputs}

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
      <div className={cn('space-y-1.5', outputs ? 'mt-2.5' : undefined)}>
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
  onmodel: 'on model',
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

/* ────────────────────────────── the section ────────────────────────────── */

export function GenerationHistory({
  band,
  techCardId,
  disabled,
  defaultRep = 'all',
  defaultOpen = true,
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
   * На FLAT — да (лента там и есть выход); на pattern, fabric render, 3D и on model — нет: у них над
   * лентой стоит СВОЙ раздел выходов. ⚠ Это положение СВЁРТКИ, а не блока: шапка и ряд KIND
   * стоят всегда, орган остаётся смонтированным, опрос живого прогона (`useRunPolling`) идёт —
   * без него «making a tile…» стояло бы вечно и человек нажал бы GENERATE второй раз, то есть
   * заплатил бы дважды. И поэтому же `RecallBenchIntake` стоит СНАРУЖИ свёртки.
   */
  defaultOpen?: boolean;
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
  /** The window off: every run this card has, and the server's continuations read to the end. */
  const [showAll, setShowAll] = useState(false);
  /** Свёртка RUNS (макет: `fold('hist.'+kind, …)`). */
  const [runsOpen, setRunsOpen] = useState(defaultOpen);
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
  } | null>(null);
  /**
   * ОДНА ОТКРЫТАЯ КОЛОДА НА ВСЮ ЛЕНТУ (H-10): значение — id ЛИСТА, не индекс, потому что строки
   * перестраиваются от фильтра, страницы и дочитанных продолжений, а id картинки переживает всё.
   */
  const [openDeck, setOpenDeck] = useState<number | null>(null);

  /**
   * ВКЛАДКА СМЕНИЛАСЬ — ФИЛЬТР И СВЁРТКА ВОЗВРАЩАЮТСЯ К ЕЁ СОБСТВЕННОМУ ПОЛОЖЕНИЮ. В РЕНДЕРЕ, а не
   * в эффекте: эффект оставил бы один закоммиченный кадр, в котором вкладка уже новая, а сегмент
   * ещё чужой.
   */
  const shownDefaults = useRef(`${defaultRep}|${defaultOpen}`);
  if (shownDefaults.current !== `${defaultRep}|${defaultOpen}`) {
    shownDefaults.current = `${defaultRep}|${defaultOpen}`;
    if (runsOpen !== defaultOpen) setRunsOpen(defaultOpen);
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
      rep === 'all'
        ? archivedLoaded
        : archivedLoaded.filter((run) => runRepresentation(run) === rep),
    [archivedLoaded, rep],
  );
  /**
   * ВСЁ, ЧТО НИЖЕ, ВЫВОДИТСЯ ИЗ `visible`: страницы, зажим окна, ряд просмотрщика, «show all» и
   * подпись пейджера. Поэтому фильтр стоит ЗДЕСЬ и ровно одной строкой.
   */
  const visible = useMemo(
    () => (rep === 'all' ? unfiltered : unfiltered.filter((run) => runRepresentation(run) === rep)),
    [unfiltered, rep],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  /**
   * THE WINDOW IS CLAMPED RATHER THAN TRUSTED, and the clamp is written back after the commit (the
   * effect below), because `reachable` blinks with `more.loading` and a write in the render body
   * jumped the window under the cursor. ONE PAGE OF OVERSHOOT IS LEGAL: pressing «older ›» on the
   * last local page asks the server for a page AND steps into it.
   */
  const current = Math.min(page, pageCount - 1);
  const reachable = pageCount - 1 + (more.hasMore || more.loading ? 1 : 0);
  const shown = showAll ? visible : visible.slice(current * PAGE, current * PAGE + PAGE);
  const onLastLocalPage = current >= pageCount - 1;

  /**
   * ОДИН РЯД ПРОСМОТРЩИКА НА ВСЮ ЗАГРУЖЕННУЮ ИСТОРИЮ (T-8): «в зум вью по всем картинкам из всех
   * генераций итерироваться не только этой». Ряд, который собирают САМИ ПЛИТКИ, кончался бы на
   * краю окна по три. ПОРЯДОК РЯДА — ПОРЯДОК ПОКАЗА, и обход ПОВТОРЯЕТ решение строки построчно:
   * корни в проводном порядке, куски ОТКРЫТОЙ колоды — сразу за своим корнем, куски закрытых —
   * нигде; полка идёт ПОСЛЕ окна, как в документе.
   */
  const gallery = useMemo(() => {
    const items: MediaViewerItem[] = [];
    const indexOf = new Map<number, number>();
    const put = (picture: common_DesignPicture) => {
      const id = picture.id ?? 0;
      const media = picture.media;
      if (!id || indexOf.has(id) || !media || !mediaFullViewerSrc(media)) return;
      indexOf.set(id, items.length);
      items.push(mediaFullToViewerItem(media));
    };
    for (const run of [...visible, ...(archShown ? archivedRows : [])]) {
      if (isRunLive(run)) continue;
      const pictures = run.pictures ?? [];
      const families = cropFamilies(pictures);
      for (const picture of pictures) {
        const id = picture.id ?? 0;
        if (families.rootOf.has(id)) continue;
        put(picture);
        if (openDeck === id) for (const member of families.membersOf.get(id) ?? []) put(member);
      }
    }
    return { items, indexOf };
  }, [visible, archShown, archivedRows, openDeck]);
  const galleryGroup = useGalleryGroup(gallery.items);

  /** ЧЕЙ КУСОК ЭТА КАРТИНКА — на всю показанную историю, без оглядки на `openDeck` (E-4). */
  const deckOf = useMemo(() => {
    const out = new Map<number, number>();
    for (const run of [...visible, ...(archShown ? archivedRows : [])]) {
      const families = cropFamilies(run.pictures ?? []);
      for (const [memberId, rootId] of families.rootOf) out.set(memberId, rootId);
    }
    return out;
  }, [visible, archShown, archivedRows]);

  /**
   * ЗУМ ЧУЖОЙ КАРТОЧКИ СКЛАДЫВАЕТ ОТКРЫТУЮ КОЛОДУ (E-4): «после экспанда спличеных карточек при
   * зуме любой другой они должны обратно колапсится». Граница проходит по колоде: зум по самому
   * листу и по любому его куску — работа ВНУТРИ раскрытой группы.
   */
  const foldOnForeignZoom = (pictureId: number) =>
    setOpenDeck((current) => {
      if (current === null || !pictureId) return current;
      if (pictureId === current) return current;
      return deckOf.get(pictureId) === current ? current : null;
    });

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
  const autofillSlot = `${techCardId}:${rep}:${current}`;
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
  const liveShown = visible.length;
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
  const allArchived = totalRuns > 0 && totalRuns === archivedRuns && unfiltered.length === 0;

  /** The door of the empty window: to the GENERATE row of this step, which stands above. */
  const goToRun = () => {
    const el = document.getElementById('design-input') ?? document.querySelector('[data-flat-run]');
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const rowsOf = (list: common_DesignRun[], shelf: boolean) =>
    list.map((run) => (
      <RunRow
        key={run.id}
        band={band}
        techCardId={techCardId}
        run={run}
        cardFit={cardFit}
        shelf={shelf || undefined}
        disabled={disabled || !speaks}
        galleryKey={galleryGroup.key}
        galleryIndexOf={gallery.indexOf}
        openDeck={openDeck}
        /* ОДИН ОТКРЫТЫЙ — ЗДЕСЬ И ЕСТЬ ЭТОТ ЗАКОН: нажатие на дверь другой колоды ПЕРЕПИСЫВАЕТ
           адрес; у состояния из одного значения второе открытое просто невыразимо. */
        onDeck={(rootId) => setOpenDeck((current) => (current === rootId ? null : rootId))}
        onZoomPicture={foldOnForeignZoom}
        onSplit={(picture) => setSplitting({ picture, handle: pictureHandle(picture) })}
      />
    ));

  const paged = visible.length > PAGE || more.hasMore;

  return (
    <>
      {/* ═══ ПРИЁМНИК РЕКОЛА СТОИТ СНАРУЖИ СВЁРТКИ (E-21…E-23) ═══════════════════════════════════
          Он `return null`. А внутри свёртки он стоять не может: свёрнутое тело РАЗМОНТИРУЕТСЯ, а
          этот орган объявляет себя домом жеста (`useRegisterRecallHost` для render и threed), и
          уборка последнего дома ВЫБРАСЫВАЕТ выбор. Человек нажал бы `recall ▸` на строке
          render-прогона, лента свернулась бы, плиты не приехали — и ни одна строка об этом не
          сказала бы. Разбор владения — в `history-recall.tsx`; здесь только место. */}
      <RecallBenchIntake techCardId={techCardId} band={band} disabled={disabled || !speaks} />
      <Section
        id='design-history'
        title='generation history'
        question='· nothing here is deleted'
        /* ═══ ОДИН ОРГАН СВОРАЧИВАНИЯ, И ОН СТОИТ ТАМ, ГДЕ СТОЯЛО ЧИСЛО (r2 п.23) ══════════════
           Владелец: «кнопка HIDE должна быть на месте „23 RUNS“ и выглядеть органично». Было ДВА
           органа об одном и том же: пилюля-счётчик в шапке и отдельная линейка `RUNS ─── HIDE ▾`
           под рядом KIND. Счётчик и дверь слиты в одну кнопку: число говорит, сколько их, стрелка —
           открыты ли они. Отдельной линейки больше нет.
           ЧИСЛО СЧИТАЕТ РОД ЭТОГО ШАГА — ровно те строки, которые дверь и открывает (разбор у
           `liveShown`); карточные итоги — в `title`. */
        action={
          <Button
            variant='secondary'
            size='xs'
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
        }
      >
        {!speaks && (
          <CalloutBox tone='note'>
            this server does not speak the design band yet — the rows below are read-only.
          </CalloutBox>
        )}

        {/* ═══ THE SHELF DOOR — единственный орган этого ряда ═════════════════════════════════════
            Здесь стоял ещё счётчик «[3 PICTURES] loaded». Владелец (r3 п.8), дословно: «6 PICTURES
            loaded — не показывать». И это не только вкус: число картинок под прочитанными строками
            — свойство ПАГИНАЦИИ, а не работы. Оно менялось само собой от нажатия «show all» или от
            дочитывателя окна, ничего не сообщая о карточке, и стояло третьим числом подряд под
            двумя, которые говорят о деле (счётчик прогонов в шапке и число архива на двери). Факт
            не потерян: сколько картинок принёс прогон, видно в самой его строке.
            `data-rep-filter` остаётся якорем: по нему читают, каким родом эта история сужена. */}
        <div data-rep-filter={rep} className='flex flex-wrap items-center gap-2'>
          <span className='ml-auto'>
            <Button
              variant='secondary'
              size='xs'
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
          </span>
        </div>

        {/* ═══ СВЁРТКА RUNS — ЕЁ ДВЕРЬ СТОИТ В ШАПКЕ БЛОКА (r2 п.23) ══════════════════════════════
            Здесь была линейка `RUNS ──── HIDE ▾` — второй орган об одном и том же. Осталось только
            ТЕЛО: оно МОНТИРУЕТСЯ лишь пока открыто, и это тот самый гейт под дочитывателем
            (`HistoryWindowAutofill`) — свёрнутая лента не читает ничего. */}
        {runsOpen && (
          <div id='design-history-runs' className='space-y-stack'>
            {!showAll && (
              <HistoryWindowAutofill
                want={PAGE * (current + 1)}
                have={visible.length}
                hasMore={more.hasMore}
                loading={more.loading}
                budget={autofillBudget}
                onSpend={() => setAutofillSpent((n) => n + 1)}
                fetchMore={more.fetchMore}
              />
            )}

            {/* ЯКОРЬ ГРУППЫ просмотрщика: место истории в полосе — между референсами сверху и
                верстаком снизу; порядок внутри — из списка группы. */}
            <div ref={galleryGroup.anchorRef} className='space-y-2'>
              {rowsOf(shown, false)}
            </div>

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
                (
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
                )
              ))}

            {/* THE PAGER, AND THE DOOR THAT SWITCHES IT OFF (T-17): pages are for reading a long
                history down, `show all` is for searching it; `show all` ↔ `paged again` is ONE door
                in two positions. `page N of M` is a caption, never a button. Absent on one page. */}
            {paged && (
              <div className='flex flex-wrap items-center gap-1.5'>
                {showAll ? (
                  <>
                    {more.loading ? (
                      <Text size='nano' variant='label' component='span'>
                        reading earlier runs…
                      </Text>
                    ) : (
                      <CountPill n={visible.length} noun='run' />
                    )}
                    <span className='ml-auto'>
                      <Button
                        variant='secondary'
                        size='xs'
                        onClick={() => {
                          setShowAll(false);
                          setPage(0);
                          setOpenDeck(null);
                        }}
                        aria-label='go back to three runs a page'
                      >
                        paged again
                      </Button>
                    </span>
                  </>
                ) : (
                  <>
                    <Button
                      variant='secondary'
                      size='xs'
                      disabled={current === 0}
                      onClick={() => {
                        setPage(current - 1);
                        setOpenDeck(null);
                      }}
                      aria-label='newer runs'
                    >
                      ‹ newer
                    </Button>
                    <Text size='nano' variant='label' component='span'>
                      page {current + 1} of {pageCount}
                      {/* The server has pages this client has not read, so the total is a floor
                          and says so rather than naming a number it would have to correct. */}
                      {more.hasMore ? '+' : ''}
                    </Text>
                    <Button
                      variant='secondary'
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
                      {more.loading ? 'reading…' : 'older ›'}
                    </Button>
                    <span className='ml-auto'>
                      <Button
                        variant='secondary'
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
                    variant='secondary'
                    size='xs'
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

        {splitting && (
          <SplitModal
            techCardId={techCardId}
            picture={splitting.picture}
            handle={splitting.handle}
            open
            /* Разрез в истории — раскладка склеенного листа на виды, а НЕ пополнение промпта
               (T-15): кадры получат вид и станут картинками полосы; ролей промпта сервер им не
               поставит. */
            forInput={false}
            onOpenChange={(open) => !open && setSplitting(null)}
          />
        )}
      </Section>
    </>
  );
}
