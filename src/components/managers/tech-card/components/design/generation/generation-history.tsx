import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import {
  mediaFullToViewerItem,
  mediaFullViewerSrc,
  type MediaViewerItem,
} from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import type { TechCardFormData } from '../../schema';
import { buildHideGuard, isPickablePicture } from '../band-feed';
import { displayDetailName, readBench } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { clockStamp, pictureHandle, runHandle } from '../handles';
import { RecallBenchIntake, RecallDoors } from '../history-recall';
import { VectorModal } from '../modals';
import { usePickMode } from '../pick-mode';
import { PictureTile, useGalleryGroup } from '../picture-tile';
import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { SplitModal } from '../split-modal';
import { useDesignWrites } from '../use-design-band';
import {
  isPictureHidden,
  isRunArchived,
  type HideBlockReason,
  type HideGuard,
} from '../visibility';
import { viewLabel } from '../views';
import { CompositeMarks, compositeTail, readComposite, splitVerb } from './composite';
import { formatMoney } from './money';
import { RunPanel } from './run-panel';
import {
  archiveBlockReason,
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

/** Which bench slot holds this picture, addressed the way a write to it must be addressed. */
function slotOfPicture(band: GetDesignBandResponse, pictureId: number): SlotOfPicture | null {
  if (!pictureId) return null;
  const bench = readBench(band);
  for (const side of bench.sides) {
    if ((side.slot?.pictureId ?? 0) === pictureId) {
      return {
        // `kind` names WHICH BENCH; empty is flat by the contract, which is the bench this history
        // unmarks from. Left empty rather than spelled — see the same note in `slot-picker.tsx`.
        ref: { viewKey: side.view, kind: undefined },
        label: viewLabel(side.view),
        rev: side.slot?.slotRev ?? 0,
      };
    }
  }
  for (const detail of bench.details) {
    if ((detail.pictureId ?? 0) === pictureId) {
      return {
        // A minted id already names its bench; `kind` is ignored beside a slot_id.
        ref: { slotId: detail.id, kind: undefined },
        label: displayDetailName(bench.details, detail),
        rev: detail.slotRev ?? 0,
      };
    }
  }
  return null;
}

/**
 * Why a WHOLE RUN may not be archived, in words. The picture-level half of this map went out with
 * the ✕ (T-14); what is left is the refusal the row itself states, and the reasons are still the
 * server's own tokens rather than a second vocabulary.
 */
const HIDE_BLOCK_LONG: Record<HideBlockReason, string> = {
  in_slot: 'a picture of this run stands in a bench slot — unmark it there first',
  live_run_input: 'a run that has not finished is reading a picture of this run',
  live_crop_parent: 'a crop cut from a picture of this run still exists',
};

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
  cardFit,
  runFit,
  disabled,
  galleryKey,
  galleryIndex,
  onSplit,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  cardFit: string;
  runFit: string;
  disabled?: boolean;
  /** The section's one gallery group — see `useGalleryGroup` below. */
  galleryKey: string;
  /** Where this picture stands in that group, or `undefined` if it has no showable address. */
  galleryIndex?: number;
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
  const badge = composite
    ? undefined
    : inSlot
      ? inSlot.label
      : picture.ghostView
        ? `probably ${viewLabel(picture.ghostView)}`
        : undefined;

  const overlays = (
    <>
      {composite && (
        // `CompositeMarks` positions itself against the nearest POSITIONED ancestor by `inset-x-0
        // top-0`. This box is that ancestor, and it exists to keep the right edge clear of the
        // quiet zoom button — at a 140px track «probably SIDE L» otherwise runs under it.
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
    const pickable = isPickablePicture(picture);
    return (
      <button
        type='button'
        onClick={pickable ? () => pick.resolve(pictureId) : undefined}
        aria-disabled={!pickable}
        title={
          pickable
            ? `put ${handle} into ${pick.target.label}`
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
      <SlotPicker band={band} techCardId={techCardId} picture={picture} className='h-[20px] w-full' />
    );
  }

  return (
    <div className='flex h-full w-full min-w-0 flex-col'>
      <PictureTile
        url={url}
        alt={handle}
        badge={badge}
        galleryGroup={galleryGroup}
        className={cn('w-full', hidden && 'opacity-40')}
        /* THE CUT IS OFFERED ON EVERY LIVE PICTURE, NOT ONLY ON A DECLARED COMPOSITE (T-8).
           `composite_views` is written by the server and is empty on every row today, so a door
           gated on it is a door nobody has ever seen — while the references block and the bench
           put the same cut on any picture at all. That was the «везде по разному» the owner named
           twice. `SplitDesignPicture` takes any band picture by contract, the parent survives the
           cut, and the verb below still reads the file: `split again` once crops exist. A stamped
           (hidden) picture keeps no doors, the way it keeps none anywhere else. */
        onSplit={
          !disabled && !hidden
            ? {
                onClick: () => onSplit(picture),
                // No ▸ in an aria-label: a screen reader spells the glyph out as its Unicode name.
                ariaLabel:
                  facts.splitInto > 0
                    ? `split ${handle} again`
                    : `split ${handle} into views`,
                title:
                  facts.splitInto > 0
                    ? `${splitVerb(facts)} cut another view out of this file`
                    : `${splitVerb(facts)} cut this file into pictures a slot can take`,
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
           состояние карточки, а не свойство плитки. */
        onEdit={
          !disabled
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
  guard,
  disabled,
  galleryKey,
  galleryIndexOf,
  onSplit,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  run: common_DesignRun;
  firstRunId: number | null;
  cardFit: string;
  guard: HideGuard;
  disabled?: boolean;
  galleryKey: string;
  /** picture id → its offset in the section's gallery group. Absent = no showable address. */
  galleryIndexOf: Map<number, number>;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const { archiveRun } = useGenerationWrites(techCardId);
  const [open, setOpen] = useState(false);

  const runId = run.id ?? 0;
  const archived = isRunArchived(run);
  const live = isRunLive(run);
  const elapsed = useElapsed(run.startedAt || run.createdAt);
  /**
   * EVERY PICTURE THE RUN PRODUCED, UNFILTERED (T-14). While the ✕ existed the row showed the
   * visible ones and counted the rest; with the verb gone there is no way back for a stamped
   * picture, so filtering it out here would make it disappear from the only screen that still
   * mentions it. The tile marks it instead.
   */
  const pictures = run.pictures ?? [];
  const archiveWhy = archiveBlockReason(run, guard);
  const price = formatMoney(run.priceActual ?? run.priceEstimate, run.currency);
  /**
   * WHAT THIS ROW WAS ASKED TO FIX, WHOLE. A fix may name several sides and a detail in one run, so
   * the caption counts the selection rather than showing its first member and quietly dropping the
   * rest — «fix: front» on a row that repaired three slots is the kind of caption that gets
   * believed.
   *
   * ⚠ THE SAME WIRE FIELDS NO LONGER MEAN «FIX» ON EVERY KIND. The owner removed the fix cycle
   * whole (S-15), and `fix_targets`/`fix_slot_ids` were INHERITED by the vector path: a machine
   * redraw narrows itself to the plate its editor was opened from (`use-trace-vector.ts`), or the
   * worker would redraw FRONT whatever the person was looking at. So on a `vector` row the
   * selection is an ADDRESS, not a repair — and the word the owner ordered out must not sign every
   * redraw. The pill below reads the kind: `redraw of front` on a vector row, and `fix: …` only on
   * the flat rows already frozen with it — history is a record, and those rows WERE fixes.
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
    <div className='space-y-1 border-b border-hairline pb-2 last:border-b-0'>
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
          ) : archiveWhy ? (
            // The reason lives in THIS line's own title — a greyed-out «archive» beside a row
            // whose pictures are all in a sheet reads as a broken control, not as a refusal.
            <Text size='nano' variant='label' component='span' title={HIDE_BLOCK_LONG[archiveWhy]}>
              archive is off
            </Text>
          ) : (
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

      {/* AN ARCHIVED ROW COLLAPSES TO ITS LINE. Its pictures are not hidden anywhere else — they
          simply stop taking up the screen until the row is unarchived. */}
      {!archived && live && (
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

      {!archived && !live && pictures.length > 0 && (
        <Tiles min={140}>
          {pictures.map((picture) => (
            <RunTile
              key={picture.id}
              band={band}
              techCardId={techCardId}
              picture={picture}
              cardFit={cardFit}
              runFit={(run.fitAtLaunch ?? '').trim()}
              disabled={disabled}
              galleryKey={galleryKey}
              galleryIndex={galleryIndexOf.get(picture.id ?? 0)}
              onSplit={onSplit}
            />
          ))}
        </Tiles>
      )}

      {/* A FAILED OR CANCELLED ROW WITH NOTHING UNDER IT SAYS NOTHING MORE (S-10): its own pill
          already states the outcome, and the price on the line already keeps the cost. */}
      {!archived &&
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

/* ────────────────────────────── the section ────────────────────────────── */

export function GenerationHistory({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}) {
  const speaks = serverSpeaksDesign();
  const more = useMoreHistory(techCardId, band);
  const live = useRunPolling(techCardId, band);

  const [archShown, setArchShown] = useState(false);
  const [page, setPage] = useState(0);
  /** The window off: every run this card has, and the server's continuations read to the end. */
  const [showAll, setShowAll] = useState(false);
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
  } | null>(null);

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
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (page !== 0) setPage(0);
    if (showAll) setShowAll(false);
    if (archShown) setArchShown(false);
    if (splitting) setSplitting(null);
  }

  const form = useFormContext<TechCardFormData>();
  const cardFit = (form?.watch('fit') ?? '').trim();

  const guard = useMemo(() => buildHideGuard(band), [band]);

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

  const visible = useMemo(
    () => runs.filter((run) => !isRunArchived(run) || archShown),
    [runs, archShown],
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
    for (const run of visible) {
      if (isRunArchived(run) || isRunLive(run)) continue;
      for (const picture of run.pictures ?? []) {
        const id = picture.id ?? 0;
        const media = picture.media;
        if (!id || indexOf.has(id) || !media || !mediaFullViewerSrc(media)) continue;
        indexOf.set(id, items.length);
        items.push(mediaFullToViewerItem(media));
      }
    }
    return { items, indexOf };
  }, [visible]);
  const galleryGroup = useGalleryGroup(gallery.items);

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

  // ABSENT, NOT AN EMPTY HEADER. A card that has never generated anything has no history, and a
  // titled block saying so would be a second, quieter version of the empty studio.
  if (totalRuns === 0 && runs.length === 0) return <></>;

  const liveRun = runs.find(isRunLive) ?? null;
  const pictureCount = runs.reduce((n, run) => n + (run.pictures ?? []).length, 0);
  const paged = visible.length > PAGE || more.hasMore;

  return (
    <Section
      id='design-history'
      title='generation history'
      question='— nothing is deleted; archive folds a whole generation away'
      collapsible
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
                // The list under the window changes length; starting again from the top is the only
                // reading of «page 1» that stays true after it.
                setPage(0);
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

      {/* ПРИЁМНИК РЕКОЛА ДЛЯ РЕНДЕРА И 3D (V-12в). Он живёт ЗДЕСЬ, а не на экране фабрик-рендера, по
          одной причине: история стоит на всех трёх вкладках, а экран рендера — только на своей, и
          жест начинается ровно там, где человек видит строку render-прогона, то есть в том числе на
          флэте. Видимого органа у него нет — он пишет в слоты верстака, которые показывает тот
          экран, на который рекол же и переключает. Приёмник флэта отдельный и монтируется блоком
          INPUT — REFERENCES: там у него есть карта разрешения media_id→файл, которой здесь нет. */}
      <RecallBenchIntake techCardId={techCardId} band={band} disabled={disabled || !speaks} />

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
            guard={guard}
            disabled={disabled || !speaks}
            galleryKey={galleryGroup.key}
            galleryIndexOf={gallery.indexOf}
            onSplit={(picture) => setSplitting({ picture, handle: pictureHandle(picture) })}
          />
        ))}
      </div>

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
                onClick={() => setPage(current - 1)}
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
                }}
                title='earlier runs'
              >
                {more.loading ? 'reading…' : 'older ›'}
              </Button>
              <span className='ml-auto'>
                <Button
                  variant='secondary'
                  size='xs'
                  onClick={() => setShowAll(true)}
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
  );
}
