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
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import type { ViewSwitchOption } from 'ui/components/view-switch';

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
import { CompositeMarks, compositeTail, cropFamilies, readComposite, splitVerb } from './composite';
import { CropDeck } from './crop-deck';
import { formatMoney } from './money';
import { RunPanel } from './run-panel';
import {
  expectedTileCount,
  fixSelectionOf,
  isCancelling,
  isRunLive,
  runOutcomeNote,
} from './run-state';
import { SlotPicker } from './slot-picker';
import { thumbUrl } from './thumb';
import { useElapsed, useGenerationWrites, useMoreHistory, useRunPolling } from './use-generation';

/**
 * THE GENERATION HISTORY — runs, and only runs.
 *
 * NOTHING IS EVER DELETED HERE, AND THE GENERATION IS THE UNIT THAT COLLAPSES. Archiving folds a
 * whole run row away — presentational, reversible, and refused while any of its pictures is
 * protected. There is NO per-picture hide any more (T-14): «каждую отдельную картинку в генерации
 * не нужно иметь возможности хайдить … а архив всю генерацию». So a row shows everything its run
 * produced, including a picture still carrying the old `hidden_at` stamp — that stamp is read by
 * every picker, so the tile says the word rather than dropping the picture out of the row with
 * nothing on screen to explain the gap.
 *
 * RUNS ONLY, BECAUSE UPLOADS ARE NOT RUNS. A hand-brought file has no run row and no price; it
 * belongs on the uploads shelf, which is its own block. The wire ships both halves of the merged
 * feed and this organ reads one of them — the shelf reads the other, from the same band.
 *
 * THREE ROWS AT A TIME, AND THE HEADER'S SUMS ARE NOT PAGED (T-17). The pager walks pages and the
 * `show all` beside it drops the window entirely, reading the server's continuations to the end —
 * both, because «next» is for reading down a long history and «all» is for searching one. The
 * counts in the header are `total_runs` / `archived_runs`, aggregates over the WHOLE band: counting
 * the rows on screen would make the header lie by exactly the amount that is not on screen, and it
 * would lie MORE the more history a card has.
 *
 * NO RUN IS MEASURED AGAINST THE CURRENT INPUTS (T-18). The `earlier — inputs have changed` divider
 * and the fingerprint behind it are gone on the owner's order: «каждый ран самостоятельный просто
 * мы можем для удобства копировать промпты». A row states what it was given — through `recall` —
 * and is never declared stale by a comparison with a card that has moved on since.
 *
 * THE ASK IS NOT PRINTED (T-3). `run.ask` was the caption of every line here; the owner took the
 * field out of the flat form and out of the history with it. What was actually sent is not lost —
 * `run.prompt` is the worker's own stored dispatch text and the run panel shows it per row, which
 * is the only reason removing the ask is safe.
 *
 * THE TILES DO NOT OWN THEIR VIEWER, AND THEY DO NOT OWN THE ROW EITHER (T-8). Every picture is a
 * `PictureTile`, so the corner law is the primitive's (badge left, zoom and ✕ right, split BOTTOM
 * LEFT). The row the zoom walks is ONE `useGalleryGroup` over every loaded picture of every run —
 * not over the tiles that happen to be mounted. Built out of mounted tiles it would end at the edge
 * of the page, i.e. T-17 would take back exactly what T-8 gives: «по всем картинкам из всех
 * генераций». See the group where it is declared, in the section below.
 *
 * RECALL ASKS, CLEARS AND ROUTES (V-12/V-13). The row draws no recall logic of its own any more —
 * it mounts `RecallDoors`, and that organ owns all three of the owner's new statements: a question
 * before the gesture, because it now REPLACES the flat prompt instead of topping it up; two doors,
 * because «the pictures it was given» and «the pictures it produced» are different pictures and the
 * old single door quietly handed back generated plates; and routing by the run's own kind, because
 * a fabric render's input lives in INPUT — FLATS OF THIS CARD and not in the flat prompt. What T-10
 * removed stays removed: no «recalled — run N» panel, no inventory of the snapshot, no rerun door —
 * a run starts only from GENERATION — FLAT → GENERATE.
 *
 * AND THE PICTURES CAN BE DRAWN ON WITHOUT LEAVING (V-10, K-6). EVERY picture of every run carries
 * the primitive's `edit` corner — a composite and a picture wearing an old `hidden` stamp included,
 * because the editor never touches its base: saving files a NEW picture that inherits this run's id,
 * so the edit lands in THIS row beside the artefact it came from and can be marked into a slot like
 * any other. The one thing that closes the corner is a released card, which is a state of the CARD.
 */

/** How many run rows one page of the history holds. The owner's number (T-17). */
const PAGE = 3;

/* ────────────────────────────── reading ────────────────────────────── */

type SlotOfPicture = { ref: DesignBenchSlotRef; label: string; rev: number };

/**
 * Which bench slot holds this picture, addressed the way a write to it must be addressed.
 *
 * THE ROW ITSELF NAMES ITS BENCH (L-1/L-5). This used to read one kind-blind `readBench` and write
 * `kind: undefined` — i.e. whichever row the collision handed over, unmarked as FLAT. Now it walks
 * the raw rows: whatever bench the picture actually stands on — its own, or the wrong one placed
 * by the old defect — the unmark addresses THAT row, with THAT row's kind and CAS token, which is
 * the only ref the server will not refuse. The kind is spelled from the row, never guessed from
 * the picture: for a misplaced plate the two disagree, and the row is where the plate stands.
 */
function slotOfPicture(band: GetDesignBandResponse, pictureId: number): SlotOfPicture | null {
  if (!pictureId) return null;
  for (const row of band.bench ?? []) {
    if ((row.pictureId ?? 0) !== pictureId) continue;
    const view = normaliseViewKey(row.viewKey);
    if (isSilhouetteView(view)) {
      const kind = benchKindOf(row);
      return {
        /* ═══ И КОЛОРВЕЙ БЕРЁТСЯ У САМОЙ СТРОКИ, А НЕ У ЭКРАНА (L-2) ═════════════════════════
           Это ровно тот же довод, что двумя строками выше про род: снятие адресует ТУ строку, в
           которой плита стоит, — со всеми тремя половинами её адреса. Подставить сюда выбранный
           в студии колорвей значило бы отправить снятие в верстак ДРУГОГО цвета: сервер отдал бы
           `slot_rev_mismatch` (или, что хуже, честно опустошил бы чужую сторону), а человек
           видел бы, что плитка «не снимается». Разбор — один, `colorwayOf` в `../bench-kinds`. */
        ref: { viewKey: view, kind, colorwayId: colorwayOf(row) },
        // The flat bench keeps its bare labels — the look every tile has always had; any other
        // bench says its name, because «FRONT» alone now names two different slots.
        label: kind === 'flat' ? viewLabel(view) : `${kind} · ${viewLabel(view)}`,
        rev: row.slotRev ?? 0,
      };
    }
    return {
      // A minted id already names its bench AND its colourway; both are ignored/deferred to beside
      // a slot_id, so 0 here is «not stated» and lets the row's own value stand.
      ref: { slotId: row.id, kind: undefined, colorwayId: COLORWAY_NONE },
      // `(2)` suffixes are per-bench — the siblings are the details of THIS row's bench.
      label: displayDetailName(readBench(band, benchKindOf(row)).details, row),
      rev: row.slotRev ?? 0,
    };
  }
  return null;
}

/* ЗДЕСЬ СТОЯЛ `HIDE_BLOCK_LONG` — словарь причин, по которым строке ОТКАЗЫВАЛИ в архивации.
   Он снят вместе с самим отказом (J-22): причины были скопированы у `HideDesignPicture`, а
   `ArchiveRun` ни одной из них не держит. Словарь без читателя объяснял бы запрет, которого нет. */

function TileAction({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      title={label}
      className='cursor-pointer text-nano uppercase tracking-label text-labelColor underline hover:text-textColor'
    >
      {children}
    </button>
  );
}

/* ────────────────────────────── the tile ────────────────────────────── */

/**
 * A run's output. THE PICTURE ITSELF IS `PictureTile` AND NOTHING ELSE (T-8).
 *
 * The owner asked twice, and the second time in anger: «сделай везде одинаково включая кнопку сплит
 * нахуя ты делаешь везде по разному может сделать это компонентом». So this file no longer draws a
 * frame, a hover organ or a viewer of its own — it says WHICH roles the picture has (`onSplit`,
 * a place in the gallery) and the primitive decides where they sit.
 *
 * THE TILE DOES NOT PUT ITSELF IN THE GALLERY ROW; it is handed its OFFSET in a row the section
 * assembled from the whole loaded history (`galleryIndex`). That is what makes the arrow leave the
 * page it was opened from. `undefined` means this picture has no address the viewer could show, and
 * then the tile promises no zoom at all rather than opening on an empty stage.
 *
 * WHAT IS STILL LOCAL IS THE FOOTER, and only the footer: a picture standing in a slot offers
 * `unmark` (И-1 — neither a ✕ nor a picker, both would be refused), a free flat offers the slot
 * picker, and a composite offers nothing under the frame because its one door is the split in the
 * corner. Those are placements the primitive deliberately has no prop for, which is why they live
 * BELOW the frame rather than fighting the corners for a spot.
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
  /**
   * РОД ПРОГОНА, В СТРОКЕ КОТОРОГО СТОИТ ЭТА ПЛИТКА. Его знает строка и НЕ знает картинка: выходы
   * перекраса подписаны на проводе словом `render` (разбор — в `slot-picker.tsx`, E-12). `null` —
   * род, которого эта сборка не знает; тогда о картинке судят по ней самой.
   */
  rep: Representation | null;
  cardFit: string;
  runFit: string;
  /** Приглушить кадр: строка стоит на полке архива и на неё смотрят, а не работают ею (J-22). */
  dim?: boolean;
  disabled?: boolean;
  /** The section's one gallery group — see `useGalleryGroup` below. */
  galleryKey: string;
  /** Where this picture stands in that group, or `undefined` if it has no showable address. */
  galleryIndex?: number;
  /**
   * THE SHEET THIS PIECE WAS CUT OUT OF, when the tile is standing in an OPEN deck (H-10). It
   * changes nothing about the tile — a piece is an ordinary card with every corner role it always
   * had — and exists so that the deck's members are addressable from the outside: a probe that
   * cannot tell a member from a sibling cannot prove that a closed deck holds its pieces back.
   */
  deckMemberOf?: number;
  /**
   * ПОВЕРХНОСТЬ КАДРА ОТКРЫВАЕТ НЕ ЗУМ, А ЭТО (J-2). Ставится ТОЛЬКО листом СВЁРНУТОЙ колоды:
   * первое нажатие раскрывает её, и лишь у раскрытой карточки поверхность снова принадлежит
   * просмотрщику. Угловая кнопка `zoom` не трогается ни в одном из двух состояний — см.
   * `PictureTile.onOpen`, где эта роль и живёт.
   */
  onOpen?: () => void;
  /**
   * ЭТА ПЛИТКА ТОЛЬКО ЧТО УВЕЛА РЯД В ПРОСМОТРЩИК (E-4). Лента складывает открытую колоду, если
   * зумнули не её лист и не её кусок; плитка о колодах не знает и знать не должна — см.
   * `PictureTile.onZoom`, где эта роль объявлена извещением, а не дверью.
   */
  onZoom?: (pictureId: number) => void;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const pick = usePickMode();
  const { setBenchSlot } = useDesignWrites(techCardId);
  /**
   * ПРАВКА ПРЯМО В ИСТОРИИ — V-10, дословно: «добавить функцию эдита в GENERATION HISTORY снизу
   * слева что бы была кнопка эдит на ховер и там при эдите оно сохранялось в ту же строку где
   * сгенеренный артефакт и потом можно было бы его замаркать».
   *
   * СОСТОЯНИЕ ЖИВЁТ У ПЛИТКИ, а не у строки: редактор открыт НАД КОНКРЕТНОЙ картинкой, и один
   * флаг на строку означал бы, что открытие второй плитки молча меняет предмет правки.
   */
  const [editing, setEditing] = useState(false);

  const pictureId = picture.id ?? 0;
  const hidden = isPictureHidden(picture);
  // WHAT THIS FILE DECLARES ABOUT ITSELF — see `composite.tsx`. `declared` is false on every row
  // until the server writes `composite_views`, and every branch below then reads as an ordinary
  // picture. Nothing here infers compositeness from what the run ASKED for.
  const facts = readComposite(band, picture);
  const composite = facts.declared;
  const provenance = readProvenance(picture);
  const handle = pictureHandle(picture);
  const inSlot = slotOfPicture(band, pictureId);
  const mixed = mixedInputNote(provenance);

  /**
   * `fit slim ≠ card oversized` — the run copied the card's fit at launch, and the card has moved
   * since. Drawn on the OUTPUT because that is the picture somebody is about to put on a sheet.
   * Both values must be stated for the badge to mean anything, so an unstated fit draws nothing
   * rather than «≠ ».
   */
  const fitMismatch = !!runFit && !!cardFit && runFit !== cardFit;

  const url = thumbUrl(picture.media);

  /**
   * ═══ ЭТО ФАЙЛ 3D, И У НЕГО НЕТ НИ РАЗРЕЗА, НИ ПРАВКИ (E-32) ═══════════════════════════════
   *
   * Владелец, дословно: «в GENERATION HISTORY для 3д файлов на ховер не должно быть split и edit».
   *
   * ПОЧЕМУ ОБА ГЛАГОЛА, А НЕ ОДИН. Разрез (`SplitDesignPicture`) режет ЛИСТ НА ВИДЫ — у сборки
   * видов нет вовсе, а у её постера вид ровно один; резать нечего ни в том, ни в другом случае.
   * Правка (`FlattenDesignEditLayer`) рождает СИБЛИНГА, наследующего `run_id` базы, — то есть
   * рисование поверх постера завело бы в строке 3D-прогона обычный растр, который потом
   * называется выходом сборки. Оба глагола не «неудобны», а не имеют предмета.
   *
   * ПРОГОН СЧИТАЕТСЯ ЦЕЛИКОМ, А НЕ ПО ОДНОЙ СТРОКЕ. Маршрут возвращает ДВЕ картинки — сам `.glb`
   * и растровую миниатюру, — и обе приезжают с родом `threed` (`threed/media.ts`). Гейт по одному
   * лишь `isModelUrl` закрыл бы двери на модели и оставил их на постере, то есть выполнил бы
   * просьбу ровно наполовину и незаметно: видимая плитка прогона — как раз постер.
   *
   * `isModelUrl` при этом остаётся ВТОРОЙ половиной условия, а не украшением: род на проводе —
   * поле строки, и историческая (или принесённая руками) строка с `.glb` в медиа, но без рода,
   * всё равно остаётся файлом модели.
   */
  const threedFile = (picture.kind ?? '').trim().toLowerCase() === 'threed' || isModelUrl(url);
  /**
   * WHERE THIS PICTURE STANDS IN THE BAND'S ROW. The frame itself is composed by the section, once
   * for the whole history; here there is only the offset. Handing the primitive a `gallery` frame
   * INSTEAD would put the picture in the row a second time — the group already holds it — and the
   * arrow would walk past the same file twice.
   */
  const galleryGroup = galleryIndex == null ? undefined : { key: galleryKey, index: galleryIndex };

  /**
   * ONE BADGE, THREE MUTUALLY EXCLUSIVE CASES — the primitive writes the top-left corner once, so
   * the caller must hand it one word. A composite has no single view and therefore no badge at all;
   * it wears its marks over the picture instead, one per view it declares.
   */
  /* ⚠ ЯРЛЫК НАЗЫВАЕТ ТОЛЬКО ФАКТ — СТОРОНУ, В КОТОРОЙ ПЛИТА СТОИТ (F-17).
     Владелец: «в GENERATION HISTORY не пиши probably». Слово убрано вместе с тем, что оно
     оговаривало, и это не буквоедство: `ghost_view` по контракту — «A guess, never a fact — a
     human confirms it by putting the plate into a slot», а комментарий пикера добавляет, что на
     фронте и спине она «routinely wrong». Оставить слово нельзя — просил владелец; оставить одно
     ИМЯ СТОРОНЫ, сняв слово, было бы хуже всего: плита, СТОЯЩАЯ во фронте, и плита, которую
     машина лишь угадала фронтом, носили бы посимвольно одинаковый ярлык, а разница между ними
     стоит денег — подтверждённая не та сторона уезжает в оплаченный прогон.
     Догадка не потеряна и осталась ровно тем, чем была полезна: ПОРЯДКОМ в пикере слотов —
     угаданная сторона стоит первой. Порядок сокращает путь и ничего не утверждает. */
  const badge = composite ? undefined : inSlot ? inSlot.label : undefined;

  const overlays = (
    <>
      {composite && (
        // `CompositeMarks` positions itself against the nearest POSITIONED ancestor by `inset-x-0
        // top-0`. This box is that ancestor, and it exists to keep the right edge clear of the
        // quiet zoom button — at a 140px track a view label otherwise runs under it.
        <span className='pointer-events-none absolute inset-y-0 left-0 right-14'>
          <CompositeMarks facts={facts} />
        </span>
      )}
      {/* ⚠ РАСХОЖДЕНИЕ ПОСАДКИ УЕХАЛО ИЗ УГЛА В ПОДПИСЬ, и это не перестановка ради красоты. Правый
          нижний угол принадлежит роли `edit` примитива, и с V-10 у этой плитки такая роль ПОЯВИЛАСЬ:
          два предмета в одном углу — это либо наезд, либо кнопка под ярлыком, который её глушит.
          Само заявление не ослабло: оно и было текстом, а не органом, и в подписи стоит рядом с
          происхождением — там, где читают факты о файле. */}
    </>
  );

  // `AI · run 7 · 3 views · split into 3` — the prototype's caption for a composite, and the
  // ordinary provenance line for everything else. The tail is empty unless the file declares views.
  const caption = (
    <>
      <Text size='micro' className='mt-1 truncate font-bold uppercase' title={handle}>
        {handle}
      </Text>
      <Text size='micro' variant='label' className='truncate'>
        {provenanceLabel(provenance)}
        {compositeTail(facts)}
        {mixed ? ` · ${mixed}` : ''}
      </Text>
      {fitMismatch && (
        // Слово, а не только цвет: система обязана читаться в монохроме, и «≠» здесь несёт смысл
        // сама по себе. Обе величины названы — расхождение без второй половины ничего не значит.
        <Text size='nano' component='span' className='truncate uppercase text-error'>
          fit {runFit} ≠ card {cardFit}
        </Text>
      )}
    </>
  );

  /**
   * PICK MODE TAKES THE TILE OVER, and the picture keeps its skin while it does. The tile becomes
   * one button, so the frame is handed NO gallery and no corner roles — without them `PictureTile`
   * renders not a single button of its own, and a button may not contain buttons. Same rule, same
   * reason, as the feed's tile.
   */
  if (pick.target) {
    /**
     * THE ARMED SLOT'S BENCH GATES THE CLICK (L-1). Pick mode is the OTHER door of the same verb
     * the tile's picker speaks, and the invariant does not care which end the gesture started
     * from: a fabric render must not land in a flat slot however it travels. The armed ref's
     * bench comes from the ref itself (or from its row, for a minted id); the picture's comes
     * from its own kind — and a kind with no bench matches no target at all.
     */
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
        {/* `w-full` НЕСУЩЕЕ, а не уборка: обёртка здесь — <button>, а у кнопки UA-раскладка не
            растягивает детей по поперечной оси, и кадр с одним лишь `aspect-ratio` схлопнулся бы
            по ширине содержимого. Тот же довод, что у `Tile`, где его несёт сама подложка media. */}
        <PictureTile
          url={url}
          alt={handle}
          badge={badge}
          selected={pickable}
          className='w-full'
        >
          {overlays}
        </PictureTile>
        {caption}
      </button>
    );
  }

  let footer: React.ReactNode = null;
  if (hidden) {
    /**
     * A STATE, NOT AN ORGAN. Hiding one picture is gone (T-14) and so is its undo; what is left is
     * a stamp some earlier session wrote, which every picker still obeys. The word says why the
     * picture is not offered anywhere, and promises no door that does not exist.
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
    // the one honest door is the one that undoes the placement.
    footer = !disabled && (
      <TileAction
        onClick={() =>
          setBenchSlot.mutate({
            slot: inSlot.ref,
            // 0 is UNMARK: empty the slot without deleting it. A different act from deleting a
            // detail slot, and it has to stay different.
            pictureId: 0,
            expectedSlotRev: inSlot.rev,
          })
        }
        label={`take this picture out of ${inSlot.label}`}
      >
        unmark
      </TileAction>
    );
  } else if (!composite) {
    // NO SLOT PICKER UNDER A COMPOSITE, AND THAT IS THE RULE, NOT AN OMISSION: a slot holds one
    // view and that file holds several, so its only door is the split in the corner.
    footer = !disabled && (
      /* `rep` — РОД ПРОГОНА, И ОН ЗДЕСЬ НЕСУЩИЙ (E-12): выходы перекраса подписаны на проводе
         словом `render`, поэтому без него пикер предлагал бы фотографии на человеке четыре
         стороны верстака фабрик-рендера — и оттуда её читала бы платная сборка 3D. Разбор целиком
         у `ONMODEL_NO_SLOT` в `slot-picker.tsx`. */
      <SlotPicker
        band={band}
        techCardId={techCardId}
        picture={picture}
        rep={rep}
        className='h-[20px] w-full'
      />
    );
  }

  return (
    /* ЯКОРЯ ПЛИТКИ: своя картинка и — у куска — свой лист. `data-picture` есть у КАЖДОЙ плитки, и
       это не только для проб: порядок ряда просмотрщика обязан совпадать с порядком показа, а
       сравнить два порядка можно только тогда, когда у нарисованного кадра есть имя. */
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
        /* ЛЕНТА СКЛАДЫВАЕТ КОЛОДУ, ЕСЛИ ЗУМНУЛИ ЧУЖУЮ КАРТОЧКУ (E-4). Плитка отдаёт свой id и
           ничего не решает; решает секция, у которой на руках адрес открытой колоды. */
        onZoom={onZoom && pictureId ? () => onZoom(pictureId) : undefined}
        galleryGroup={galleryGroup}
        /* ПРИГЛУШАЕТСЯ СНИМОК, А НЕ ПЛИТКА (K-6). Класс стоял на всей плитке, и это было
           безобидно ровно до тех пор, пока у скрытой плитки не появилось двери: прозрачность
           наследуется и ребёнком не отменяется, так что `edit` выходил серым по белому около
           1.6:1. Слово «hidden» под кадром состояние держит и без заливки. */
        dim={hidden || dim}
        className='w-full'
        /* ═══ РЕЗ ПРЕДЛАГАЕТСЯ НА ЖИВОЙ И ЕЩЁ НЕ РАЗРЕЗАННОЙ КАРТИНКЕ ════════════════════════
           ⚠ ЗДЕСЬ СТОЯЛО «`composite_views` пуст на каждой строке сегодня» — ЭТО БОЛЬШЕ НЕВЕРНО.
           Замер базы беты: непусто у 18 картинок из 73, и все восемнадцать — выходы прогонов; у
           принесённых человеком — никогда. Довод «дверь, гейтованная на него, никем не видена»
           умер, а вывод из него — нет, и вот почему он остаётся: этот экран и есть то место, где
           человек ОБЪЯВЛЯЕТ свой лист многовидовым. Полосы входов показывают колоды только для
           машинных композитов; закрой дверь и здесь — и лист, принесённый руками, станет
           неразрезаемым вовсе.
           ⚠ А ВОТ У УЖЕ РАЗРЕЗАННОЙ КАРТИНКИ УГЛА НЕТ (F-8, дословно: «на уже заспличеных
           картинках на ховер сплит писать не нужно»). Подпись «split … again» вместе с ним ушла:
           она и была признанием, что орган предлагает второй раз то, что уже сделано.
           Помеченная (скрытая) картинка дверей не держит — как не держит их нигде. */
        /* ⚠ `!threedFile` — E-32, разбор у объявления. Роль без обработчика примитив не рисует
           вовсе, поэтому на 3D-плитке этого угла физически нет, а не «есть, но серый». */
        onSplit={
          !disabled && !hidden && !threedFile && facts.splitInto === 0
            ? {
                onClick: () => onSplit(picture),
                // No ▸ in an aria-label: a screen reader spells the glyph out as its Unicode name.
                /* Ветка «again» снята вместе со своим состоянием: угол теперь появляется только
                   у НЕразрезанной картинки, и подпись, описывающая второй рез, описывала бы то,
                   чего на этом кадре уже не бывает. */
                ariaLabel: `split ${handle} into views`,
                title: `${splitVerb(facts)} cut this file into pictures a slot can take`,
              }
            : undefined
        }
        /* ПРАВКА (V-10). ЗАКОН УГЛОВ ОСТАЁТСЯ ЗАКОНОМ: владелец просит орган «снизу слева на
           ховер», и «на ховер снизу» здесь — про то, что орган тихий и нижний, а КАКОЙ из двух
           нижних углов чей, решено кругом раньше и решено НАВСЕГДА («сплит должна быть снизу слева
           я уже второй раз это прошу»). Сплит остаётся слева, правка встаёт справа — ровно так же,
           как на плите верстака и в референсах. Одна плитка, нарушившая раскладку, вернула бы ту
           самую «везде по разному», из-за которой углы вообще переехали в примитив.

           ЧТО ЭТА ДВЕРЬ ДЕЛАЕТ С АРТЕФАКТОМ. Ничего с ним самим: слой правки — третий объект рядом
           с базой, и «сохранить» рождает НОВУЮ картинку-сиблинга с `derived_from`. Сиблинг
           наследует `run_id` базы, то есть встаёт В ТУ ЖЕ СТРОКУ ПРОГОНА — это и есть «сохранялось
           в ту же строку где сгенеренный артефакт», и это свойство контракта, а не наша уборка.
           Замаркать её потом можно обычным пикером под кадром: она такая же картинка полосы.

           ═══ ДВЕРЬ СТОИТ НА КАЖДОМ СГЕНЕРИРОВАННОМ МЕДИА (K-6) ══════════════════════════════
           Владелец, дословно: «в GENERATION HISTORY для всех медиа сгенерированных сделать
           возможность эдитить их». Здесь стояло `!disabled && !hidden && !composite`, то есть
           ДВА исключения; оба сняты, и оба — по разбору, а не оптом.

           СКЛЕЙКА. Довод был: «у неё нет одного вида, рисование поверх дало бы такую же
           нерасслаиваемую склейку». Это довод о ВКУСЕ результата, а не о том, что жест невозможен:
           редактор работает от `base_media_id`, а склейка — такое же медиа, как любое другое.
           Резать её сперва по-прежнему разумно, и об этом говорит заголовок двери; запрещать за
           человека то, что он вправе сделать, — не то же самое, что предупредить.

           ШТАМП `hidden`. Правило «у скрытой картинки дверей нет» держится там, где дверь
           действует НА САМУ картинку: разрез плодит её обрезки, пикер ставит её в слот — и то и
           другое пикеры потом отказываются видеть. Правка не действует на картинку вовсе: по
           контракту `FlattenDesignEditLayer` рождает СИБЛИНГА, наследующего `run_id` базы, а
           штампа `hidden_at` у новорождённой картинки нет. То есть правка — единственный жест,
           которым старый штамп вообще снимается с работы: из скрытой картинки достают живую.

           Что НЕ изменилось: `disabled`. Выпущенная карточка не заводит новых картинок, и это
           состояние карточки, а не свойство плитки.

           ⚠ И ПОЯВИЛОСЬ РОВНО ОДНО НОВОЕ ИСКЛЮЧЕНИЕ — ФАЙЛ 3D (E-32). Оно НЕ ИЗ ТОГО ЖЕ РЯДА, что
           два снятых выше: те запрещали жест, который РАБОТАЕТ (склейку можно рисовать, скрытую
           картинку можно править). Здесь предмета нет вовсе — редактор работает от растра, а
           `.glb` растром не является; на постере же он сработал бы и завёл бы в строке сборки
           обычную картинку, выдающую себя за её выход. Разбор — у `threedFile`. */
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
      >
        {overlays}
      </PictureTile>
      {caption}
      {footer && <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5'>{footer}</div>}

      {/* Редактор монтируется только раскрытым: он тянет слой правки и растр, и полсотни спящих
          копий на странице истории — это полсотни лишних деревьев ради одной открытой.
          `slot` НЕ ПЕРЕДАЁТСЯ НАРОЧНО: плитка истории — не слот верстака, и результат правки не
          обязан никуда вставать. Машинная векторизация внутри редактора при этом честно откажет
          («the machine reads the bench»), потому что читает она именно слот; рисование поверх
          работает целиком. */}
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

function RunRow({
  band,
  techCardId,
  run,
  firstRunId,
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
  firstRunId: number | null;
  cardFit: string;
  /**
   * ЭТА СТРОКА СТОИТ НА ПОЛКЕ АРХИВА, А НЕ В ОКНЕ (J-22). Заархивированная строка в окне свёрнута
   * в свою строку — это правило T-14 и оно остаётся. Полка же существует РОВНО ЗАТЕМ, чтобы
   * посмотреть, что в архиве лежит, и строка на ней разворачивается: плитки рисуются приглушённо
   * (`dim`), потому что смотреть на них можно, а работать этой карточкой уже не собираются.
   */
  shelf?: boolean;
  disabled?: boolean;
  galleryKey: string;
  /** picture id → its offset in the section's gallery group. Absent = no showable address. */
  galleryIndexOf: Map<number, number>;
  /**
   * THE ONE OPEN DECK OF THE WHOLE FEED, or `null` (H-10). The row is handed the state rather than
   * holding it, because the owner's law is «нажимаешь на другой мультивью старый колапсится
   * обратно» and the other multiview is routinely in ANOTHER ROW. A per-row flag would keep one
   * deck open in every row at once and satisfy the sentence only by accident, on a card with one
   * run.
   */
  openDeck: number | null;
  onDeck: (rootId: number) => void;
  /** Зум по картинке этой строки — лента решает, складывать ли открытую колоду (E-4). */
  onZoomPicture?: (pictureId: number) => void;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const { archiveRun } = useGenerationWrites(techCardId);
  const [open, setOpen] = useState(false);

  const runId = run.id ?? 0;
  const archived = isRunArchived(run);
  /**
   * РОД ПРОГОНА, СКАЗАННЫЙ ОДИН РАЗ НА СТРОКУ. Его читают и якорь `data-rep`, и каждая плитка
   * (E-12): выходы перекраса подписаны на проводе словом `render`, и второе прочтение этого
   * вопроса ниже по файлу разошлось бы с первым молча.
   */
  const rep = runRepresentation(run);
  /**
   * СВЁРНУТА — НЕ ТО ЖЕ САМОЕ, ЧТО ЗААРХИВИРОВАНА. В окне заархивированная строка показывает одну
   * свою строку (T-14); на полке архива она показывает всё, ради чего полку и открыли.
   */
  const folded = archived && !shelf;
  const live = isRunLive(run);
  const elapsed = useElapsed(run.startedAt || run.createdAt);
  /**
   * EVERY PICTURE THE RUN PRODUCED, UNFILTERED (T-14). While the ✕ existed the row showed the
   * visible ones and counted the rest; with the verb gone there is no way back for a stamped
   * picture, so filtering it out here would make it disappear from the only screen that still
   * mentions it. The tile marks it instead.
   */
  const pictures = run.pictures ?? [];
  /**
   * WHICH PICTURES OF THIS ROW WERE CUT OUT OF WHICH (H-10). Read from `derived_from`, transitive,
   * inside this row only — see `cropFamilies`. A row with no cut in it produces two empty
   * collections and every tile below is drawn exactly as it was before this wave.
   */
  const families = useMemo(() => cropFamilies(pictures), [pictures]);
  const price = formatMoney(run.priceActual ?? run.priceEstimate, run.currency);
  /**
   * WHAT THIS ROW WAS ASKED TO FIX, WHOLE. A fix may name several sides and a detail in one run, so
   * the caption counts the selection rather than showing its first member and quietly dropping the
   * rest — «fix: front» on a row that repaired three slots is the kind of caption that gets
   * believed.
   *
   * ⚠ THE SAME WIRE FIELDS NO LONGER MEAN «FIX» ON EVERY KIND. The owner removed the fix cycle
   * whole (S-15), and `fix_targets`/`fix_slot_ids` were then INHERITED by the vector path, which
   * narrowed a machine redraw to the plate its editor was opened from. That path was itself
   * removed in H-1 (round 14), so NOTHING in this client writes those fields today — but the
   * frozen `vector` rows that DO carry them are still on screen, and on them the selection is an
   * ADDRESS, not a repair. The word the owner ordered out must not sign a redraw. The pill below
   * reads the kind: `redraw of front` on a vector row, and `fix: …` only on the flat rows already
   * frozen with it — history is a record, and those rows WERE fixes.
   */
  const fix = fixSelectionOf(run);
  const fixNames = [
    ...fix.views.map((view) => viewLabel(view)),
    ...fix.slotIds.map(() => 'a detail'),
  ].filter(Boolean);
  const isVector = (run.kind ?? '').trim().toLowerCase() === 'vector';
  const status = runOutcomeNote(run);

  const rerunOf = run.rerunOf ?? 0;

  const handle = runHandle(runId);
  /**
   * THE LINE NO LONGER PRINTS THE ASK (T-3). `runCaption` answers with `run.ask` when the row has
   * one, and the owner took that field off the screen everywhere, history included. What is left is
   * the one caption that is a fact about the ROW rather than a copy of a prompt: the run that
   * started this card. It is claimed only when the whole history is on screen — see `firstRunId`.
   */
  const caption = firstRunId && runId && runId === firstRunId ? 'from references' : '';
  const meta = [handle, caption, (run.author ?? '').trim(), clockStamp(run.createdAt), price]
    .filter(Boolean)
    .join(' · ');

  return (
    /* ЯКОРЯ СТРОКИ (G-1): её прогон и её представление. Они не украшение — по ним читают строку и
       проба, и человек, отлаживающий фильтр в инспекторе; `data-rep` пуст ровно тогда, когда род
       прогона этой сборке неизвестен, то есть отвечает тем же `null`, что и классификатор. */
    <div
      data-run={runId || undefined}
      data-rep={rep ?? ''}
      data-run-archived={archived ? '' : undefined}
      className='space-y-1 border-b border-hairline pb-2 last:border-b-0'
    >
      <div className='flex flex-wrap items-baseline gap-2'>
        <button
          type='button'
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className='min-w-0 cursor-pointer text-left'
          title='what this run was given, what it sent and what it cost — launch-time copies'
        >
          <Text
            size='micro'
            variant={archived ? 'label' : 'default'}
            component='span'
            className='uppercase tracking-label'
          >
            {open ? '▾' : '▸'} {meta}
          </Text>
        </button>

        {fixNames.length > 0 &&
          (isVector ? (
            <Pill tone='mut' title='which plate the machine was asked to redraw as vector curves'>
              redraw of {fixNames.join(', ')}
            </Pill>
          ) : (
            <Pill tone='mut'>fix: {fixNames.join(', ')} · from the slots</Pill>
          ))}
        {/* THE LINEAGE OF A RERUN, READ FROM THE ROW ITSELF. `rerun_of` is the server's own edge —
            it says whose frozen snapshot this run was assembled from — so «why do these two rows
            have the same inputs and different pictures» is answerable from the history alone,
            without opening either panel. */}
        {rerunOf > 0 && <Pill tone='mut'>repeat of {runHandle(rerunOf)}</Pill>}
        {live && (
          <Pill tone='attention'>{isCancelling(run) ? 'cancelling…' : `${status} ${elapsed}`}</Pill>
        )}
        {!live && status !== 'done' && (
          <Pill tone={status.startsWith('failed') ? 'warn' : 'mut'}>{status}</Pill>
        )}
        {archived && <Pill tone='mut'>archived</Pill>}

        {/* РЕКОЛ — ДВЕ ДВЕРИ И ВОПРОС ПЕРЕД НИМИ (V-12, V-13), и все три живут в `history-recall.tsx`,
            а не здесь. Строка истории объявляет только МЕСТО жеста; что он берёт (референсы против
            результата), куда кладёт (флэт, фабрик-рендер, 3D) и что при этом уничтожает — вопросы
            одного механизма, и второй его экземпляр в раскрытой панели прогона разошёлся бы с этим
            на первой же правке. Чипа «recalled» здесь нет и не будет: выбор потребляется приёмником
            в том же тике, и подсветка горела бы ровно один кадр. */}
        <RecallDoors techCardId={techCardId} band={band} run={run} disabled={disabled} />

        {/* Ни кнопки RERUN, ни «THE PICTURES IT WAS GIVEN» здесь по-прежнему нет (T-10): прогон
            запускается только из GENERATION — FLAT → GENERATE. */}

        {/* ARCHIVE IS THE ONE COLLAPSE VERB LEFT, AND IT TAKES THE WHOLE GENERATION (T-14). */}
        <span className='ml-auto'>
          {archived ? (
            <button
              type='button'
              disabled={disabled || archiveRun.isPending}
              onClick={() => archiveRun.mutate({ runId, archived: false })}
              className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor disabled:cursor-not-allowed'
            >
              unarchive
            </button>
          ) : (
            /* ⚠ ЗДЕСЬ СТОЯЛ КЛИЕНТСКИЙ ЗАПРЕТ «archive is off», И ЭТО БЫЛ ЗАПРЕТ, КОТОРОГО НЕТ НА
               СЕРВЕРЕ (J-22). Он звал `archiveBlockReason` — копию предусловий `HideDesignPicture`
               («картинка стоит в слоте», «вход живого прогона», «родитель видимого кропа») — и
               гасил дверь на любой строке, хоть одна картинка которой под них подходит.

               `ArchiveRun` (`internal/store/design/pictures.go` на origin/beta) не держит ни
               одного из них: это один UPDATE флага `archived_at` плюс перечитывание строки, и его
               собственный комментарий говорит «It does NOT hide the row's pictures». Ни в
               `apisrv/admin/design_band.go`, ни в rbac второго условия тоже нет.
               То есть клиент отказывал в том, что сервер разрешает: на карточке, где лист
               разрезали или плиту поставили в слот, вместо двери стояло серое слово. */
            !disabled &&
            !live && (
              <button
                type='button'
                disabled={archiveRun.isPending}
                onClick={() => archiveRun.mutate({ runId, archived: true })}
                title='fold this whole generation away — reversible, and it hides no picture from anywhere else'
                className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor disabled:cursor-not-allowed'
              >
                archive ▸
              </button>
            )
          )}
        </span>
      </div>

      {open && <RunPanel techCardId={techCardId} band={band} run={run} disabled={disabled} />}

      {/* AN ARCHIVED ROW COLLAPSES TO ITS LINE IN THE WINDOW, and unfolds on the archived shelf —
          the one place opened in order to look at it. Its pictures are not hidden anywhere else. */}
      {!folded && live && (
        <Tiles min={140}>
          {Array.from({ length: expectedTileCount(run) }, (_, i) => (
            <Tile
              key={i}
              dashed
              media={
                <div
                  className='flex w-full items-center justify-center bg-bgSecondary'
                  style={{ aspectRatio: '4 / 5' }}
                >
                  <Text size='nano' variant='label' component='span'>
                    {i === 0 ? `running ${elapsed}` : 'reserved'}
                  </Text>
                </div>
              }
              name={i === 0 ? runHandle(runId) : ''}
              sub={i === 0 ? (run.author ?? '').trim() : ''}
            />
          ))}
        </Tiles>
      )}

      {!folded && !live && pictures.length > 0 && (
        /* ═══ ОДИН ГРИД, А НЕ ГРИД В ГРИДЕ (H-10) ══════════════════════════════════════════════
           Куски открытой колоды встают ОБЫЧНЫМИ карточками в тот же ряд, сразу за своим листом:
           у них те же углы, тот же пикер под кадром и то же место в ряду просмотрщика, что и у
           любой плитки. Вложенная сетка была бы блоком в блоке — в этой системе такого нет, — и
           заодно отобрала бы у кусков ширину дорожки. Фрагмент не создаёт DOM-узла, поэтому
           `[&>*]:min-w-0` у `Tiles` по-прежнему достаётся самим плиткам. */
        <Tiles min={140}>
          {pictures.map((picture) => {
            const pictureId = picture.id ?? 0;
            // Кусок рисуется ТОЛЬКО под своим листом. Здесь он пропускается, иначе открытая
            // колода показала бы его дважды, а закрытая — вопреки собственной двери.
            if (families.rootOf.has(pictureId)) return null;
            const members = families.membersOf.get(pictureId) ?? [];
            const open = openDeck === pictureId;
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
                /* ПЕРВЫЙ КЛИК АНКОЛАПСИТ, ВТОРОЙ ОТКРЫВАЕТ ЗУМ (J-2). Роль отдаётся ТОЛЬКО листу
                   СВЁРНУТОЙ колоды: у раскрытой лист — обычная карточка ряда, и её поверхность
                   обязана вести туда же, куда ведёт поверхность любого куска, а карточка без
                   колоды вовсе не знает о её существовании. */
                onOpen={members.length && !open ? () => onDeck(pictureId) : undefined}
                onZoom={onZoomPicture}
                onSplit={onSplit}
              />
            );
            // Лист, из которого ничего не вырезано, колодой не становится: за ним ничего нет.
            if (!members.length) return <Fragment key={pictureId}>{tile}</Fragment>;
            return (
              <Fragment key={pictureId}>
                <CropDeck
                  rootId={pictureId}
                  count={members.length}
                  /* НАСТОЯЩИЕ КУСКИ, А НЕ ПУСТЫЕ КРАЯ (J-2). Веер режется по `DECK_PEEK_MAX` внутри
                     самой колоды — здесь список отдаётся целиком, чтобы порядок веера был порядком
                     ряда, а не вторым мнением о нём. */
                  peeks={members.map((member) => ({
                    id: member.id ?? 0,
                    url: thumbUrl(member.media),
                    alt: pictureHandle(member),
                  }))}
                  /* ШИРИНА ОДНОЙ ДОРОЖКИ, СКАЗАННАЯ ЧЕРЕЗ СОБСТВЕННУЮ КОРОБКУ КОЛОДЫ. Свёрнутая
                     колода занимает ДВЕ дорожки `Tiles` (`span 2`), а между ними лежит 8px зазора
                     этой сетки (`gap-2`), поэтому одна дорожка — это `(100% - 8px) / 2`. Считать
                     её из `min={140}` было бы неправдой: дорожка `1fr` и почти всегда шире. */
                  sheetWidth='calc((100% - 8px) / 2)'
                  /* Кадр плитки ленты — `4/5` по умолчанию `PictureTile`. Куски рисуются ОДНИМИ
                     КАДРАМИ, без подписи, и обязаны совпасть с кадром листа до пикселя. */
                  frameAspect='4/5'
                  /* ⚠ ДВЕ ДОРОЖКИ РЕЗЕРВИРУЮТСЯ, А НЕ ЗАНИМАЮТСЯ ВПРИТЫК, И ЭТО ОТВЕТ НА «не так
                     компактно». Веер из трёх третей кончается ровно на `2W`, то есть на 8px раньше
                     правого края второй дорожки: этот остаток — тот самый зазор сетки, и он не даёт
                     последнему куску прислониться к соседней плитке. У колоды из одного-двух кусков
                     справа остаётся грунт — по правилу «зазор и есть разделитель» это законная
                     пустота, а не дыра. */
                  style={open ? undefined : { gridColumn: 'span 2' }}
                  open={open}
                  onToggle={() => onDeck(pictureId)}
                >
                  {tile}
                </CropDeck>
                {open &&
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
      )}

      {/* A FAILED OR CANCELLED ROW WITH NOTHING UNDER IT SAYS NOTHING MORE (S-10): its own pill
          already states the outcome, and the price on the line already keeps the cost. */}
      {!folded &&
        !live &&
        pictures.length === 0 &&
        !(status.startsWith('failed') || status === 'cancelled') && (
          <Text size='micro' variant='label'>
            no pictures under this row
          </Text>
        )}
    </div>
  );
}

/* ────────────────────────────── the representation filter ────────────────────────────── */

/**
 * ═══ ФИЛЬТР РОДА НАД ИСТОРИЕЙ (G-1) ═══════════════════════════════════════════════════════════
 *
 * Владелец: «в GENERATION HISTORY сделай фильтр с возможностью отфильтровать только флеты, только
 * рендеры только 3д и так далее. так же ВАЖНО что каждый сплит или каждый эдит чего либо должен
 * быть там же где и генерация и всегда фильтроваться как часть генерации по тому же механизму».
 *
 * ЭТО ФИЛЬТР СТРОК, А НЕ ПЛИТОК, И ВТОРОЕ ТРЕБОВАНИЕ ЗАКРЫВАЕТСЯ ИМЕННО ЭТИМ. Кроп и правка
 * наследуют `run_id` предка НА СЕРВЕРЕ (`SplitPicture`, `FlattenEditLayer` копируют его вместе с
 * родом), поэтому они уже рисуются ВНУТРИ строки своей генерации — и фильтр, отбирающий строки,
 * уносит их вместе с ней по построению. Ни одной строки кода про производные кадры здесь нет и
 * быть не должно: их отдельная обработка означала бы второе мнение о том, где они живут.
 *
 * СЛОВАРЬ — `runRepresentation`, ТОТ ЖЕ, ЧТО У ПОЛОСЫ ПРЕДСТАВЛЕНИЙ И У СПИСКОВ ФЛЭТОВ. Подписи
 * скопированы у `ARTIFACT_KINDS` и у ячеек полосы, чтобы три поверхности спрягали один язык.
 *
 * ПРОГОН РОДА, КОТОРОГО ЭТА СБОРКА НЕ ЗНАЕТ (`runRepresentation` → `null`), ВИДЕН ТОЛЬКО ПОД
 * `all`. Он не пропадает молча и не приписывается к ведру наугад — угадывание ведра и есть дефект,
 * от которого `bench-kinds` избавляется.
 */
export type RepFilter = 'all' | Representation;

const REP_FILTERS: readonly ViewSwitchOption<RepFilter>[] = [
  { value: 'all', label: 'all', hint: 'every generation this card has, newest first' },
  {
    value: 'flat',
    label: 'flats',
    hint: 'the drawings the floor sews from — a machine redraw and a text draft are work on the flat, and crops and edits of a flat filter with it',
  },
  { value: 'pattern', label: 'patterns', hint: 'repeating tiles' },
  {
    value: 'render',
    label: 'renders',
    hint: 'runs that coloured the flats — crops and edits of a render filter with it',
  },
  { value: 'threed', label: '3D', hint: '3D models' },
  {
    value: 'onmodel',
    label: 'on model',
    hint: 'the garment recoloured on a photograph — its outputs say «render» on the wire, so this segment reads the run',
  },
];

const repLabel = (rep: RepFilter): string =>
  REP_FILTERS.find((o) => o.value === rep)?.label ?? String(rep);

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
   * ГДЕ ЛЕНТА ОТКРЫВАЕТСЯ, А НЕ ЧТО ЕЙ ПОКАЗЫВАТЬ (J-12, J-18, J-31).
   *
   * Одна и та же лента стоит на пяти вкладках, и владелец просил, чтобы на каждой она открывалась
   * на СВОЁМ роде — «с возможностью переключить». Поэтому это НАЧАЛЬНОЕ положение сегмента и точка
   * возврата при смене карточки, а не фильтр: переключатель остаётся живым и все шесть его
   * сегментов достижимы. `'all'` по умолчанию — вкладка FLAT, где лента и родилась.
   */
  defaultRep?: RepFilter;
  /**
   * ═══ РАЗВЁРНУТА ЛИ ЛЕНТА, КОГДА ЭКРАН ТОЛЬКО ОТКРЫЛИ (E-21, E-22, E-23) ═══════════════════
   *
   * Владелец назвал ЧЕТЫРЕ вкладки — pattern, fabric render, 3D и on model, — и ровно на них у
   * ленты над головой стоит СВОЙ раздел выходов («… of this card»), который показывает те же
   * картинки крупнее и ближе к работе. Свёрнутая лента там возвращает экрану его собственную
   * работу; развёрнутая уводила её на два экрана вниз. На FLAT такого раздела нет вовсе — лента
   * там и есть выход, — поэтому её положение по умолчанию не тронуто.
   *
   * ⚠ ЭТО ПОЛОЖЕНИЕ БЛОКА, А НЕ ЕГО ЖИЗНЬ. Сворачивается только СОДЕРЖИМОЕ `Section`; сам орган
   * остаётся смонтированным, поэтому опрос живого прогона (`useRunPolling`) продолжает идти, а
   * шапка продолжает называть его словом «RUN N now». Это несущее: без опроса «making a tile…»
   * стояло бы вечно, человек решил бы, что прогон потерян, и нажал GENERATE ВТОРОЙ РАЗ — то есть
   * заплатил дважды за одно.
   *
   * ⚠ И ПОЭТОМУ ЖЕ `RecallBenchIntake` ВЫНЕСЕН ИЗ СКЛАДЫВАЕМОЙ ЧАСТИ — см. его вызов ниже.
   */
  defaultOpen?: boolean;
}) {
  const speaks = serverSpeaksDesign();
  const more = useMoreHistory(techCardId, band);
  const live = useRunPolling(techCardId, band);

  const [archShown, setArchShown] = useState(false);
  const [page, setPage] = useState(0);
  /**
   * КАКОЕ ПРЕДСТАВЛЕНИЕ ПОКАЗАНО. Состояние ПРЕХОДЯЩЕЕ и намеренно НЕ сохраняемое — ровно как
   * `archShown` и `page`: это способ смотреть, а не свойство карточки, и человек, вернувшийся
   * назавтра к отфильтрованной истории, прочитал бы её как потерю прогонов.
   */
  const [rep, setRep] = useState<RepFilter>(defaultRep);
  /** The window off: every run this card has, and the server's continuations read to the end. */
  const [showAll, setShowAll] = useState(false);
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
  } | null>(null);
  /**
   * ═══ ОДНА ОТКРЫТАЯ КОЛОДА НА ВСЮ ЛЕНТУ — И ПОЭТОМУ ОНА ЖИВЁТ ЗДЕСЬ (H-10) ══════════════════
   *
   * Владелец: «если нажимаешь на другой мультивью старый колапсится обратно». «Другой мультивью»
   * почти никогда не лежит в той же строке — это соседний прогон, — так что закон формулируется
   * над ЛЕНТОЙ, а не над строкой. Флаг внутри `RunRow` держал бы по колоде в каждой строке разом
   * и совпадал бы с просьбой только на карточке с одним прогоном.
   *
   * Значение — id ЛИСТА (корневой картинки), а не индекс: строки перестраиваются от фильтра,
   * страницы и дочитанных продолжений, а id картинки переживает всё это.
   */
  const [openDeck, setOpenDeck] = useState<number | null>(null);

  /**
   * КАРТОЧКА СМЕНИЛАСЬ — ОКНО ИСТОРИИ НАЧИНАЕТСЯ ЗАНОВО.
   *
   * Клиентский переход на соседнюю тех-карту НЕ размонтирует этот блок: если полоса соседа уже в
   * кэше, родитель не показывает «loading…» вовсе и просто перерисовывает нас с новым
   * `techCardId`. Тогда «страница 4», «показать все» и раскрытая полка архива — решения о ЧУЖОЙ
   * истории — переезжали на новую карточку и открывали её на странице, которой у неё, может быть,
   * и нет. `splitting` в этом же списке и по более простой причине: модалка держит картинку
   * прогона прежней карточки, и резать её, стоя на другой, нельзя.
   *
   * В РЕНДЕРЕ, А НЕ В ЭФФЕКТЕ — по тому же доводу, что и сброс курсора в `useMoreHistory`: эффект
   * оставляет один закоммиченный кадр со старым состоянием и новой карточкой, а в этом кадре
   * эффект «показать все» ниже успевает попросить у сервера продолжение, которого никто не хотел.
   */
  /**
   * ВКЛАДКА СМЕНИЛАСЬ — СЕГМЕНТ ВОЗВРАЩАЕТСЯ К ЕЁ СОБСТВЕННОМУ ПОЛОЖЕНИЮ.
   *
   * Сегодня переход между вкладками разносит эти ленты по РАЗНЫМ позициям дерева, поэтому React и
   * так монтирует новую с начальным состоянием. Сравнение стоит здесь на случай, когда это
   * перестанет быть правдой (композитор сведёт ветки в одну), — и стоит В РЕНДЕРЕ, по тому же
   * доводу, что и сброс карточки ниже: эффект оставил бы один закоммиченный кадр, в котором
   * вкладка уже новая, а сегмент ещё чужой.
   */
  const shownDefaultRep = useRef(defaultRep);
  if (shownDefaultRep.current !== defaultRep) {
    shownDefaultRep.current = defaultRep;
    if (rep !== defaultRep) setRep(defaultRep);
    if (page !== 0) setPage(0);
    if (openDeck !== null) setOpenDeck(null);
  }

  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (page !== 0) setPage(0);
    if (showAll) setShowAll(false);
    if (archShown) setArchShown(false);
    // Фильтр — решение о ЧУЖОЙ истории: сосед не должен унаследовать сужение, которое человек
    // сделал руками на предыдущей карточке. Возврат — к `defaultRep` ВКЛАДКИ, а не к `'all'`:
    // иначе смена карточки молча отменяла бы J-12/J-18/J-31 и открывала соседа на «all».
    if (rep !== defaultRep) setRep(defaultRep);
    if (splitting) setSplitting(null);
    // Колода — тоже решение о ЧУЖОЙ карточке, и вдобавок её ключ (id картинки) у соседа означает
    // другую картинку или не означает ничего. Сосед обязан открыться со сложенными колодами.
    if (openDeck !== null) setOpenDeck(null);
  }

  const form = useFormContext<TechCardFormData>();
  const cardFit = (form?.watch('fit') ?? '').trim();

  /**
   * The band's first page plus whatever continuations have been asked for, deduped by id: the
   * band's own page is re-read on every write, so its cursor can move under an already-fetched
   * continuation and the same run can legitimately arrive twice.
   */
  const runs = useMemo(() => {
    const byId = new Map<number, common_DesignRun>();
    [...(band.runs ?? []), ...more.runs].forEach((run) => {
      const id = run.id ?? 0;
      if (!id) return;
      // The band's copy is the fresher one — it is re-read on every write, the continuation is not.
      if (!byId.has(id)) byId.set(id, run);
    });
    return [...byId.values()].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [band.runs, more.runs]);

  const totalRuns = band.totalRuns ?? 0;
  const archivedRuns = band.archivedRuns ?? 0;

  /**
   * `from references` may be claimed only when the whole history is on screen — otherwise «the
   * oldest row I was given» is not «the oldest row there is», and the caption would name the wrong
   * run as the one that started the card.
   */
  const firstRunId =
    runs.length >= totalRuns && runs.length ? (runs[runs.length - 1].id ?? null) : null;

  /**
   * Загруженные строки БЕЗ фильтра рода — знаменатель дроби «N из M» и ничего больше.
   *
   * ⚠ ЗААРХИВИРОВАННЫЕ СТРОКИ ОТСЮДА ИСКЛЮЧЕНЫ ВСЕГДА, И ЭТО ПОЧИНКА J-22, А НЕ УЖЕСТОЧЕНИЕ.
   * Раньше нажатие «· N archived ▸» ВПУСКАЛО их в этот список — то есть в ОКНО по три строки, на
   * их месте по номеру прогона, — и тем же нажатием сбрасывало окно на первую страницу. На
   * карточке, где заархивированный прогон четвёртый по свежести, человек нажимал кнопку и не
   * видел ровно ничего: строка уезжала на вторую страницу. Теперь архив живёт на СВОЕЙ полке
   * (ниже), окно его не пагинирует, и «страница 1 из N» после нажатия остаётся верной.
   */
  const unfiltered = useMemo(() => runs.filter((run) => !isRunArchived(run)), [runs]);

  /**
   * ═══ ПОЛКА АРХИВА: ВСЁ, ЧТО ЗААРХИВИРОВАНО И ЗАГРУЖЕНО ═══════════════════════════════════
   *
   * Тем же фильтром рода, что и окно — сегмент над лентой это «как я смотрю на эту карточку», и
   * полка, игнорирующая его, показывала бы под «renders» заархивированные флэты.
   */
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
   * подпись пейджера. Поэтому фильтр стоит ЗДЕСЬ и ровно одной строкой — второй предикат, дописанный
   * ниже по течению, развёл бы зум с экраном (ряд листал бы то, чего на странице нет).
   *
   * ЗНАМЕНАТЕЛЬ БЕРЁТСЯ ИЗ `unfiltered`, А НЕ ИЗ `runs`: свёрнутая полка архива уже убрала строки с
   * экрана, и «1 из 6» на карточке, где четыре свёрнуты, сравнивало бы разное с разным.
   */
  const visible = useMemo(
    () => (rep === 'all' ? unfiltered : unfiltered.filter((run) => runRepresentation(run) === rep)),
    [unfiltered, rep],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  /**
   * THE WINDOW IS CLAMPED RATHER THAN TRUSTED. `page` survives things that shorten the list — the
   * archived rows being folded away again, a row archiving under the cursor — and a window past the
   * end would draw an empty history over a card that has one.
   */
  const current = Math.min(page, pageCount - 1);
  /**
   * AND THE CLAMP IS WRITTEN BACK, ONCE THE OVERSHOOT CAN NO LONGER COME TRUE.
   *
   * Clamping only for the draw leaves `page` holding a number the list no longer has, and that
   * number comes back the moment the list grows again: fold the archived rows away on page 5,
   * unfold them, and the window jumps to page 5 without anybody asking for it.
   *
   * ONE PAGE OF OVERSHOOT IS LEGAL AND MUST SURVIVE, which is why this is not a plain `min`.
   * Pressing «older ›» on the last local page asks the server for a page AND steps into it, so
   * between the click and the answer `page` is deliberately one beyond the end. Anything past that
   * one page — or any overshoot at all once the server has nothing left to send — is the residue of
   * a list that shrank, and is dropped.
   */
  const reachable = pageCount - 1 + (more.hasMore || more.loading ? 1 : 0);
  if (page > reachable) setPage(reachable);
  const shown = showAll ? visible : visible.slice(current * PAGE, current * PAGE + PAGE);
  const onLastLocalPage = current >= pageCount - 1;

  /**
   * ОДИН РЯД ПРОСМОТРЩИКА НА ВСЮ ЗАГРУЖЕННУЮ ИСТОРИЮ — ЗДЕСЬ ЖИВЁТ T-8.
   *
   * Владелец, пункт 8: «что бы можно было в зум вью по всем картинкам из всех генераций
   * итерироваться не только этой». Пунктом 17 он же просил окно по три прогона. Ряд, который
   * собирают САМИ ПЛИТКИ, отменяет первое вторым: смонтированы только плитки текущей страницы, и
   * при четырёх прогонах по одной картинке из зума нельзя дойти до четвёртой — стрелка упирается
   * не в конец истории, а в край окна.
   *
   * Поэтому ряд объявляется ОДНОЙ группой (`useGalleryGroup`) на весь загруженный список и висит
   * на якоре-контейнере строк: место группы в полосе задаёт якорь, порядок внутри — сам список.
   * Плитки внутри группы своих кадров не регистрируют, а получают СМЕЩЕНИЕ, поэтому картинка стоит
   * в ряду ровно один раз.
   *
   * ПОРЯДОК РЯДА — ПОРЯДОК ПОКАЗА, и это обязательство: `visible` уже отсортирован (новые сверху),
   * страницы режут его же, значит «дальше» ведёт туда, куда ведёт взгляд, и через край страницы
   * тоже. По той же причине из ряда выпадает всё, чего на экране нет ни на какой странице:
   * заархивированная строка свёрнута в строку (её плитки не рисуются вовсе), живая строка ещё
   * рисует заглушки, а кадр без адреса просмотрщик всё равно выбросил бы — и тогда смещения
   * разъехались бы с рядом, а панель приписала бы одному файлу сведения другого.
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
    /* ПОРЯДОК РЯДА — ПОРЯДОК ПОКАЗА, поэтому полка идёт ПОСЛЕ окна: в документе она стоит под
       строками окна и над пейджером. Строки полки развёрнуты и их плитки на экране есть, значит
       они обязаны быть и в ряду — иначе «дальше» с плитки полки уводило бы на чужой кадр. */
    for (const run of [...visible, ...(archShown ? archivedRows : [])]) {
      if (isRunLive(run)) continue;
      const pictures = run.pictures ?? [];
      /**
       * ⚠ ЭТОТ ОБХОД — КОПИЯ ОБХОДА СТРОКИ, И ЭТО ТРЕБОВАНИЕ, А НЕ СОВПАДЕНИЕ (разбор ревью).
       *
       * «ПОРЯДОК РЯДА — ПОРЯДОК ПОКАЗА» стоит абзацем выше как обязательство. Пока здесь шёл
       * ПРОВОДНОЙ порядок `run.pictures`, а строка ставила куски сразу за их листом, два порядка
       * совпадали ровно до тех пор, пока каждый кроп лежал в массиве вплотную к своему листу.
       * Прогон, вернувший две картинки прежде чем одну из них разрезали, ломает это молча:
       * замерено — строка рисует [760, 761, 762, 763, 765], а ряд листал [760, 765, 761, 762,
       * 763], и «дальше» с листа уводило на чужой кадр. Адрес кадра при этом оставался верным, то
       * есть ошибка была невидима на клик и видима только на стрелку.
       *
       * Поэтому обход здесь ПОВТОРЯЕТ решение строки построчно: корни в проводном порядке, куски
       * ОТКРЫТОЙ колоды — сразу за своим корнем, куски закрытых — нигде (их нет на экране, по
       * тому же правилу, по которому в ряд не попадает свёрнутая заархивированная строка).
       */
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

  /**
   * ═══ ЧЕЙ КУСОК ЭТА КАРТИНКА — КАРТА НА ВСЮ ПОКАЗАННУЮ ИСТОРИЮ (E-4) ═══════════════════════
   *
   * Читается ровно одним вопросом: «зумнули ЧУЖУЮ карточку или свою?». Отвечать на него по одной
   * строке нельзя — открытая колода лежит в какой-то одной строке, а зумят из любой.
   *
   * ⚠ СОБИРАЕТСЯ БЕЗ ОГЛЯДКИ НА `openDeck`, В ОТЛИЧИЕ ОТ РЯДА ВЫШЕ. Ряд перечисляет то, что НА
   * ЭКРАНЕ, и куски закрытых колод в него не входят; здесь же нужен состав КАЖДОЙ колоды, потому
   * что вопрос задаётся о колоде, которая как раз открыта. Зависимость от `openDeck` заодно
   * пересобирала бы карту на каждом раскрытии впустую.
   */
  const deckOf = useMemo(() => {
    const out = new Map<number, number>();
    for (const run of [...visible, ...(archShown ? archivedRows : [])]) {
      const families = cropFamilies(run.pictures ?? []);
      for (const [memberId, rootId] of families.rootOf) out.set(memberId, rootId);
    }
    return out;
  }, [visible, archShown, archivedRows]);

  /**
   * ═══ ЗУМ ЧУЖОЙ КАРТОЧКИ СКЛАДЫВАЕТ ОТКРЫТУЮ КОЛОДУ (E-4) ══════════════════════════════════
   *
   * Владелец, дословно: «после экспанда спличеных карточек при зуме любой другой они должны
   * обратно колапсится».
   *
   * «ЛЮБОЙ ДРУГОЙ» ЧИТАЕТСЯ БУКВАЛЬНО, И ГРАНИЦА ПРОХОДИТ ПО КОЛОДЕ, А НЕ ПО КАРТОЧКЕ. Зум по
   * САМОМУ листу и по любому его куску — это работа ВНУТРИ раскрытой группы, и складывать её там
   * было бы не выполнением просьбы, а поломкой: куски уходят из документа, ряд просмотрщика
   * пересобирается под открытым окном, и человек, ткнувший в кусок, оказывается на соседнем кадре.
   *
   * ЗАКОН ТОТ ЖЕ И ЖИВЁТ ТАМ ЖЕ, ЧТО «ОДНА ОТКРЫТАЯ НА ВСЮ ЛЕНТУ»: состояние из одного значения,
   * и второе открытое в нём невыразимо. Здесь просто ещё один повод его обнулить.
   */
  const foldOnForeignZoom = (pictureId: number) =>
    setOpenDeck((current) => {
      if (current === null || !pictureId) return current;
      if (pictureId === current) return current;
      return deckOf.get(pictureId) === current ? current : null;
    });

  /**
   * «SHOW ALL» READS THE SERVER'S PAGES TO THE END. One fetch would not be «all»: the history is
   * paged on the wire too, and the button promises every run rather than every run that happens to
   * have arrived. The pull repeats only while a page is not already in flight, and `hasMore` goes
   * false on its own, so the chain terminates.
   */
  useEffect(() => {
    if (showAll && more.hasMore && !more.loading) more.fetchMore();
    // `fetchMore` is rebuilt on every render of the hook; depending on it would run this effect on
    // every render instead of on the three facts that actually decide anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, more.hasMore, more.loading]);

  /**
   * ═══ ОТКРЫТАЯ ПОЛКА ДОЧИТЫВАЕТ ПРОДОЛЖЕНИЯ САМА — ВТОРАЯ ПОЛОВИНА ПОЧИНКИ J-22 ════════════
   *
   * `N` в шапке — `band.archivedRuns`, число ПО ВСЕЙ КАРТОЧКЕ; строки же приезжают страницей
   * ленты в 12 прогонов. Заархивированный прогон старше этой страницы считался в `N` и не
   * загружался НИКОГДА: полка обещала бы шесть строк и рисовала две, без единого слова о том,
   * куда делись остальные. Цикл тот же, что у «show all», и по той же причине конечен:
   * `hasMore` гаснет сам, а условие сравнивает загруженное с обещанным.
   */
  useEffect(() => {
    if (archShown && archivedLoaded.length < archivedRuns && more.hasMore && !more.loading) {
      more.fetchMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archShown, archivedLoaded.length, archivedRuns, more.hasMore, more.loading]);

  // ABSENT, NOT AN EMPTY HEADER. A card that has never generated anything has no history, and a
  // titled block saying so would be a second, quieter version of the empty studio.
  if (totalRuns === 0 && runs.length === 0) return <></>;

  /**
   * ЧТО ПОЛКА ГОВОРИТ О СЕБЕ. `archivedRuns` — число ВСЕЙ КАРТОЧКИ, строки приезжают страницами.
   * Пока продолжения дочитываются, полка говорит об этом; когда страницы кончились, а строк
   * всё равно меньше обещанного, она называет ДРОБЬ, а не число, которого показать не может.
   */
  const shelfNote =
    archivedLoaded.length >= archivedRuns
      ? `${archivedRuns} run${archivedRuns === 1 ? '' : 's'}`
      : more.hasMore || more.loading
        ? 'reading earlier runs…'
        : `${archivedLoaded.length} of ${archivedRuns} loaded`;

  const liveRun = runs.find(isRunLive) ?? null;
  const pictureCount = runs.reduce((n, run) => n + (run.pictures ?? []).length, 0);
  const paged = visible.length > PAGE || more.hasMore;

  return (
    <>
    {/* ═══ ПРИЁМНИК РЕКОЛА СТОИТ СНАРУЖИ СКЛАДЫВАЕМОЙ ЧАСТИ (E-21…E-23) ═══════════════════════
        Он `return null` — ни коробки, ни отступа, ни строки в раскладке `SectionStack`, — поэтому
        физически это тот же экран, что и раньше.

        А НЕ СТОЯТЬ ЗДЕСЬ ОН БОЛЬШЕ НЕ МОЖЕТ, И ЭТО НЕ УБОРКА. `Section` не прячет содержимое, а
        РАЗМОНТИРУЕТ его (`{isOpen && children}`), а этот орган объявляет себя домом жеста
        (`useRegisterRecallHost` для render и threed) и потребляет отложенный выбор. Отсюда,
        изнутри свёрнутой ленты, цепочка рвалась бы ровно посередине и молча: `recall ▸` на строке
        render-прогона переключает студию на вкладку FABRIC RENDER, лента там теперь свёрнута,
        приёмник не смонтирован — и уборка последнего дома этого рода ВЫБРАСЫВАЕТ выбор
        (`recalled.delete`). Человек нажал, экран переключился, плиты не приехали, и ни одна
        строка на экране об этом не сказала.

        Разбор владения — в `history-recall.tsx`; здесь только место. */}
    <RecallBenchIntake techCardId={techCardId} band={band} disabled={disabled || !speaks} />
    <Section
      id='design-history'
      title='generation history'
      question='— nothing is deleted; archive folds a whole generation away'
      collapsible
      defaultOpen={defaultOpen}
      /* ⚠ ЖИВОЙ ПРОГОН ПЕРЕЖИВАЕТ СВЁРТКУ, И ЭТО ЕДИНСТВЕННОЕ ИСКЛЮЧЕНИЕ ИЗ F-2 — РАДИ ДЕНЕГ.
         Свёрнутая лента показывает только имя и стрелку (F-2), но прогон, который идёт прямо
         сейчас, назван и там: невидимый прогон — это второй платёж, потому что человек нажмёт
         GENERATE ещё раз. Счётчик прогонов и серая клауза свёртку НЕ переживают: они отвечают на
         вопрос, который в свёрнутом виде не задают. */
      collapsedNote={
        liveRun ? (
          <Text size='micro' component='span' className='uppercase tracking-label text-warning'>
            {runHandle(liveRun.id)} now
          </Text>
        ) : null
      }
      action={
        <div className='flex flex-wrap items-baseline gap-2'>
          {liveRun && (
            <Text size='micro' component='span' className='uppercase tracking-label text-warning'>
              {runHandle(liveRun.id)} now
            </Text>
          )}
          <Text size='micro' variant='label' component='span'>
            {totalRuns} run{totalRuns === 1 ? '' : 's'} · {pictureCount} pictures shown
          </Text>
          {archivedRuns > 0 && (
            <button
              type='button'
              onClick={() => {
                setArchShown((v) => !v);
                // Колода складывается: на полке ниже может стоять её же строка, и «одна открытая
                // на всю ленту» — закон над лентой целиком, а не над окном.
                setOpenDeck(null);
                // ⚠ `setPage(0)` ЗДЕСЬ БОЛЬШЕ НЕТ, И ЭТО ПОЛОВИНА ПОЧИНКИ J-22. Полка не меняет
                // длину списка под окном — окно её не пагинирует вовсе, — поэтому сбрасывать
                // страницу не за чем. А раньше именно этот сброс и съедал жест: человек нажимал
                // «archived ▸», окно прыгало на первую страницу, и заархивированная строка,
                // стоявшая четвёртой, оказывалась на второй.
              }}
              aria-expanded={archShown}
              className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
            >
              · {archivedRuns} archived {archShown ? '▾' : '▸'}
            </button>
          )}
        </div>
      }
    >
      {live && (
        <Text size='nano' variant='label' component='p'>
          a run is in flight — this block re-reads the card every few seconds until it lands
        </Text>
      )}

      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the rows below are read-only.
        </CalloutBox>
      )}

      {/* ПРИЁМНИК РЕКОЛА ДЛЯ РЕНДЕРА И 3D (V-12в) СТОЯЛ ЗДЕСЬ и переехал НАД `Section` — довод
          у самого вызова. Причина, по которой он принадлежит ИМЕННО ЭТОМУ органу, не изменилась:
          история стоит на всех пяти вкладках, а экран рендера — только на своей, и жест
          начинается ровно там, где человек видит строку render-прогона, то есть в том числе на
          флэте. Видимого органа у него нет — он пишет в слоты верстака, которые показывает тот
          экран, на который рекол же и переключает. Приёмник флэта отдельный и монтируется блоком
          INPUT — REFERENCES: там у него есть карта разрешения media_id→файл, которой здесь нет. */}

      {/* ═══ ФИЛЬТР РОДА — СПИСОК, А НЕ ПОЛОСА СЕГМЕНТОВ (J-3) ═══════════════════════════════════
          Владелец, дословно: «в REPRESENTATION фильтре должно быть дропдаун списком а не
          кнопками».

          ЧТО ЭТО МЕНЯЕТ ПО СУЩЕСТВУ, А НЕ ПО ВКУСУ. `ViewSwitch` — примитив «покажи все положения
          сразу», и он честен там, где положений два-три: полоса тогда СОСТОЯНИЕ, читаемое одним
          взглядом. Здесь положений ШЕСТЬ, и они стоят в `lead` шапки рядом со счётом «N of M
          loaded runs»; на ноутбучной ширине шесть сегментов переносились и растаскивали строку
          шапки на два ряда. Список занимает одну коробку постоянной ширины, и вопрос «как я смотрю
          на эти данные» задаётся ровно там же, где задавался.

          ⚠ И ТОЛЬКО ЗДЕСЬ. У ARTIFACTS стоит такой же переключатель с тем же словом, но там он
          стоит В ПАРЕ со вторым (`layout`), и превратить в список ОДИН из двух соседей значило бы
          нарисовать на одной строке две грамматики одного вопроса — то самое «везде по разному».
          Пара переезжает целиком или не переезжает вовсе, а владелец назвал GENERATION HISTORY.

          ПОДСКАЗКИ СЕГМЕНТОВ (`hint`) ПЕРЕЕХАЛИ НА ТРИГГЕР, А НЕ ПРОПАЛИ. У пункта списка нет
          места для второй строки — `SelectItem` заворачивает ярлык в `<p>`, — но подсказка
          описывает ВЫБРАННОЕ положение, и на триггере она читается тем же наведением, что и
          раньше на сегменте. Чего действительно нет — подсказок у НЕвыбранных положений; их
          заменяет фраза `rep-empty` ниже, которая называет, чего именно нет.

          `data-rep-filter` — ЯКОРЬ НА ОБЁРТКЕ, А НЕ НА ТРИГГЕРЕ. Примитив списка не пробрасывает
          произвольные атрибуты в `Select.Trigger`, а лезть в общий примитив ради одного якоря
          значит менять восемьдесят списков админки ради одной пробы. Обёртка несёт и якорь, и
          постоянную ширину. */}
      <GroupLabel
        flush
        lead={
          <div
            data-rep-filter={rep}
            title={REP_FILTERS.find((option) => option.value === rep)?.hint}
            className='w-[136px]'
          >
            <Select
              name='representation'
              placeholder='representation'
              value={rep}
              items={REP_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
              onValueChange={(next) => {
                // ПУСТОТА СЮДА НЕ ДОЕДЕТ — примитив её гасит сам (`offersEmptyOption`), потому что
                // пустого пункта в списке нет. Но сузить тип нечем, и молча привести чужую строку
                // к `RepFilter` значило бы записать в фильтр положение, которого не существует.
                const hit = REP_FILTERS.find((option) => option.value === next);
                if (!hit) return;
                setRep(hit.value);
                // Тот же довод, что у полки архива: список под окном меняет длину, и «страница 1» —
                // единственное прочтение окна, которое остаётся верным после этого.
                setPage(0);
                // И колода складывается вместе с окном: её строка после сужения может уехать с
                // экрана вовсе, а состояние «открыта» пережило бы это и вернулось при возврате
                // фильтра — открытой без единого нажатия.
                setOpenDeck(null);
              }}
              fullWidth
            />
          </div>
        }
        action={
          rep === 'all' ? undefined : (
            <Text size='micro' variant='label' component='span'>
              {/* АГРЕГАТЫ В ШАПКЕ СЕКЦИИ (`{totalRuns} runs`) СЧИТАЮТ ВСЮ КАРТОЧКУ И НЕ ВРУТ ОТ
                  ФИЛЬТРА — поэтому число «сколько показано из скольких» стоит здесь, у самого
                  переключателя, и говорит про ЗАГРУЖЕННЫЕ строки, а не про историю целиком. */}
              {visible.length} of {unfiltered.length} loaded run{unfiltered.length === 1 ? '' : 's'}
              {more.hasMore ? ' …' : ''}
            </Text>
          )
        }
      >
        representation
      </GroupLabel>

      {/* ЯКОРЬ ГРУППЫ. Он задаёт МЕСТО истории в полосе просмотрщика — между референсами сверху и
          верстаком снизу, — а внутренний порядок ряда берётся из списка группы, а не из того,
          сколько плиток сейчас смонтировано. */}
      <div ref={galleryGroup.anchorRef} className='space-y-2'>
        {shown.map((run) => (
          <RunRow
            key={run.id}
            band={band}
            techCardId={techCardId}
            run={run}
            firstRunId={firstRunId}
            cardFit={cardFit}
            disabled={disabled || !speaks}
            galleryKey={galleryGroup.key}
            galleryIndexOf={gallery.indexOf}
            openDeck={openDeck}
            /* ОДИН ОТКРЫТЫЙ — ЗДЕСЬ И ЕСТЬ ЭТОТ ЗАКОН, ОДНОЙ СТРОКОЙ. Нажатие на дверь другой
               колоды не «закрывает ту и открывает эту» двумя действиями, а ПЕРЕПИСЫВАЕТ адрес: у
               состояния из одного значения второе открытое просто невыразимо. */
            onDeck={(rootId) => setOpenDeck((current) => (current === rootId ? null : rootId))}
            onZoomPicture={foldOnForeignZoom}
            onSplit={(picture) => setSplitting({ picture, handle: pictureHandle(picture) })}
          />
        ))}
      </div>

      {/* ПУСТОЙ ОТВЕТ ФИЛЬТРА — СЛОВАМИ, НА МЕСТЕ СТРОК. Пустое место под живым переключателем
          читается как поломка; фраза называет, ЧЕГО нет, и — когда сервер держит ещё страницы —
          куда идти за остальным. Блок при этом не сворачивается: он существует потому, что у
          карточки есть прогоны, а не потому, что этот сегмент их нашёл. */}
      {rep !== 'all' && visible.length === 0 && (
        <Text size='micro' variant='inactive' component='p' data-probe='rep-empty'>
          no {repLabel(rep)} generations among the loaded runs
          {more.hasMore ? ' — show all reads the rest of the history' : ''}
        </Text>
      )}

      {/* ═══ ПОЛКА АРХИВА — J-22, «кнопка ARCHIVED не работает» ══════════════════════════════
          ГДЕ СТОИТ И ПОЧЕМУ ИМЕННО ЗДЕСЬ. Под строками окна и НАД пейджером: пейджер — это
          закрывающая черта окна (1px ink, нижняя ступень лестницы правил), и полка, поставленная
          под ним, читалась бы как продолжение страниц. Она не страница: окно её не пагинирует.

          ЧТО ЭТО ЗА ОРГАН ПО СИСТЕМЕ. Не блок — блока в блоке в этой системе нет. Это подгруппа:
          `GroupLabel` (1px #ccc, вторая ступень лестницы) и под ней те же строки прогонов, что и
          в окне, с той же внутренней волосяной чертой. Ни рамки, ни заливки, ни отступа своего —
          отбивка сверху принадлежит самой подписи группы.

          ПОЧЕМУ СТРОКИ РАЗВЁРНУТЫ. «Свёрнута в свою строку» (T-14) — правило ОКНА, где архив
          мешает работе. Полку открывают ровно затем, чтобы посмотреть, что в архиве лежит;
          свёрнутые строки здесь означали бы «открой полку, чтобы не увидеть». Плитки приглушены
          (`dim`), потому что это уже не рабочий материал. */}
      {archShown && archivedRuns > 0 && (
        <div data-archived-shelf={archivedRuns}>
          <GroupLabel
            action={
              <Text size='micro' variant='label' component='span'>
                {shelfNote}
              </Text>
            }
          >
            archived
          </GroupLabel>
          {archivedRows.length > 0 ? (
            <div className='space-y-2'>
              {archivedRows.map((run) => (
                <RunRow
                  key={run.id}
                  band={band}
                  techCardId={techCardId}
                  run={run}
                  firstRunId={firstRunId}
                  cardFit={cardFit}
                  shelf
                  disabled={disabled || !speaks}
                  galleryKey={galleryGroup.key}
                  galleryIndexOf={gallery.indexOf}
                  openDeck={openDeck}
                  onDeck={(rootId) => setOpenDeck((current) => (current === rootId ? null : rootId))}
                  onZoomPicture={foldOnForeignZoom}
                  onSplit={(picture) => setSplitting({ picture, handle: pictureHandle(picture) })}
                />
              ))}
            </div>
          ) : (
            /* ПУСТОЙ ОТВЕТ — СЛОВАМИ, а не пустым местом под живой подписью: тот же закон, что у
               сегмента родов выше. Причин ровно две, и они разные: сегмент сузил полку до рода,
               которого в архиве нет, — или строки ещё едут со следующей страницы ленты. */
            /* `label` (#666), НЕ `inactive` (#ccc): на белом это 1.6:1, то есть фраза, которая
               существует ровно затем, чтобы полка не выглядела пустым местом, сама была бы
               невидима. DESIGN.md §6. */
            <Text size='micro' variant='label' component='p' data-probe='archived-empty'>
              {archivedLoaded.length < archivedRuns
                ? 'reading earlier runs…'
                : rep === 'all'
                  ? 'nothing archived among the loaded runs'
                  : `no archived ${repLabel(rep)} among the loaded runs`}
            </Text>
          )}
        </div>
      )}

      {/* THE PAGER, AND THE DOOR THAT SWITCHES IT OFF (T-17). Both, because they answer different
          questions: the pages are for reading a long history down, `show all` is for searching it.
          The rule under the whole thing is the ladder's closing total — 1px ink — because the line
          closes the rows above it rather than opening a group. */}
      {paged && (
        <div className='flex flex-wrap items-center gap-2 border-t border-textColor pt-1.5'>
          {showAll ? (
            <>
              <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
                {more.loading
                  ? 'reading earlier runs…'
                  : `all ${visible.length} run${visible.length === 1 ? '' : 's'}`}
              </Text>
              <span className='ml-auto'>
                <Button
                  variant='secondary'
                  size='xs'
                  onClick={() => {
                    setShowAll(false);
                    setPage(0);
                    setOpenDeck(null);
                  }}
                  title='back to three runs a page'
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
                title='newer runs'
              >
                ‹ newer
              </Button>
              <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
                page {current + 1} of {pageCount}
                {/* The server has pages this client has not read, so the total is a floor and says
                    so rather than naming a number it would have to correct on the next click. */}
                {more.hasMore ? '+' : ''}
              </Text>
              <Button
                variant='secondary'
                size='xs'
                disabled={(onLastLocalPage && !more.hasMore) || more.loading}
                onClick={() => {
                  // READING A SERVER PAGE ALSO REVEALS ONE. Fetching without advancing the window
                  // spent a click on nothing visible: the rows arrived, the button changed its
                  // wording, and the human had to press it a second time to actually see them.
                  if (onLastLocalPage) more.fetchMore();
                  setPage(current + 1);
                  setOpenDeck(null);
                }}
                title='earlier runs'
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
                  title='drop the window and read every run this card has, server pages included'
                >
                  show all
                </Button>
              </span>
            </>
          )}
        </div>
      )}

      {/* ЗДЕСЬ СТОЯЛА ЗАПАСНАЯ КОПИЯ `RecalledRunPrompt` с `host={false}` — «показать промпт, пока
          настоящий дом не смонтирован». Дома у промпта больше нет: рекол ничего не показывает, он
          КЛАДЁТ картинки и слова во вход (T-10), а копия с `host={false}` по своему же контракту
          инертна — не объявляет себя приёмником и ничего не принимает, то есть рисовала ровно
          ничего. Ответ жесту теперь даёт сам вход, а там, где входа на экране нет, чипа нет тоже
          (см. `recallable` в строке). */}

      {splitting && (
        <SplitModal
          techCardId={techCardId}
          picture={splitting.picture}
          handle={splitting.handle}
          open
          /* Разрез в истории — раскладка склеенного листа на виды, а НЕ пополнение промпта:
             владелец (T-15) «в INPUT — REFERENCES не должны уходить все флеты если мы их явно
             туда сами не добавим». Кадры получат вид и станут картинками полосы; ролей промпта
             сервер им не поставит. */
          forInput={false}
          onOpenChange={(open) => !open && setSplitting(null)}
        />
      )}
    </Section>
    </>
  );
}
