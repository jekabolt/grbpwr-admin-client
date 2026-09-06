import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignEditLayer,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';

import { VectorModal } from './modals';
import { DrawHalf, HALF_FACE, SLOT_HALVES, Reason } from './core';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { batchCaption, pictureHandle } from './handles';
import { mixedInputNote, provenanceLabel, readProvenance, slotProvenance } from './provenance';
import type { MediaViewerItem } from 'ui/components/media-viewer';
import { PictureTile } from './picture-tile';
import { selectPickablePictures } from './visibility';

/**
 * ONE BENCH SLOT — and the vocabulary of «what a slot is», which the three other organs of the
 * bench read from here rather than spelling a second time.
 *
 * A SLOT THAT WAS NEVER TOUCHED DOES NOT EXIST ON THE SERVER. `GetDesignBand` returns only the
 * rows that have been written; the four silhouette sides are born lazily by the first
 * `SetDesignBenchSlot`. So `slot` below is honestly nullable and `slotRev` is honestly 0 for an
 * untouched side — the CAS token a lazy first placement is required to send. Rendering four rows
 * that pretend to exist would make the first write carry a rev the server never minted.
 *
 * ADDRESSING. A silhouette side is addressed BY ITS VIEW KEY forever — before birth and after —
 * because `DesignBenchSlotRef.view_key` names the four sides for their whole life. A detail is
 * addressed by its minted `slot_id` from the moment it exists, and `view_key = detail` means
 * exactly one thing: MINT A NEW ONE (name required, expected_slot_rev 0). Never by name: renaming
 * a detail must not move its plate, and two details a human called the same thing are still two
 * slots.
 */

/**
 * THE VOCABULARY MOVED OUT, and it moved because it had been written three times.
 *
 * Three files declared the sides for themselves — this one, `split-modal.tsx` and the mint dialog,
 * which has since been removed with the sheet's versions. The keys agreed, so nothing failed a type
 * check, but the labels did not: the same side read `side L` here and `SIDE L` on the mint. That
 * third speller is gone now, and its copy went down with it rather than being rehomed — a
 * duplicate of a vocabulary is exactly what `./views` exists to end. `./views` is the only
 * spelling, and these re-exports exist so that the call sites inside this module keep reading the
 * way they did.
 */
export {
  SHEET_MIN_VIEWS,
  SILHOUETTE_VIEWS,
  isSilhouetteView,
  viewLabel,
  type SilhouetteView,
} from './views';
import {
  SILHOUETTE_VIEWS,
  isSilhouetteView,
  normaliseViewKey,
  viewLabel,
  type SilhouetteView,
} from './views';
import {
  COLORWAY_NONE,
  benchKindOf,
  benchRowMatches,
  pictureRepresentation,
  refColorwayFor,
  colorwayOf,
} from './bench-kinds';


/** Total over the vocabulary: an unknown key prints itself rather than becoming a wrong side. */
export type BenchRead = {
  /** All four sides, in a fixed order, present-or-not. */
  sides: { view: SilhouetteView; slot: common_DesignBenchSlot | null }[];
  /** Every detail slot, oldest first — the order they were minted in, which is stable. */
  details: common_DesignBenchSlot[];
};

/**
 * ONE BENCH's rows split into the two shapes the screen draws.
 *
 * A row whose `view_key` is not one of the four sides IS a detail — that is the only classification
 * the wire supports, and it deliberately does not test for the literal `detail`: `view_key=detail`
 * is the MINT verb, and a stored detail row is addressed by id from then on.
 *
 * ⚠ `kind` IS A FILTER, NOT DECORATION, AND ITS ABSENCE WAS A MEASURED DEFECT (L-5). This function
 * used to key the map by view alone; the moment a card held BOTH a flat front and a render front
 * (migration 0349, two rows per view), the LAST row of `band.bench` won — the server orders by
 * kind, so the render row overwrote the flat one. The studio bench then displayed the RENDER slot
 * under FRONT (rev 4, no picture) while every write from it addressed the FLAT bench, and the owner
 * got «slot is at rev 11, 4 was echoed» on an ordinary upload. Nothing showed it while nothing
 * wrote render slots; the 3D input writes them now. Same latent defect, same wording, as the one
 * `benchSides` (`render/model.ts`) fixed for the generative screens — the rule now has one
 * spelling, `benchKindOf` in `./bench-kinds`.
 *
 * The default is `flat` because that is what the contract fixes for an empty kind — every caller
 * written before the second axis existed keeps reading the bench it meant. Callers still spell it.
 *
 * ⚠ AND `colorwayId` IS THE THIRD AXIS, ADDED FOR THE SAME REASON AND WITH THE SAME EVIDENCE. The
 * render bench is now PER COLOURWAY (L-2), so a card with two coloured multiviews carries
 * `render/front@ROSSO` AND `render/front@OLIVE` — two rows, one view key, ONE map entry under the
 * old body, last row wins. That is L-5 exactly, one axis later, and this time both colliding rows
 * are plates of the same kind: nothing on screen would look wrong, the CAS token echoed back would
 * simply belong to the other colourway. The match is not spelled here — it is `benchRowMatches` in
 * `./bench-kinds`, the one place the three axes are compared, and the flat bench is exempted there
 * (L-4: one markup per card) rather than by a condition written out again in this file.
 */
export function readBench(
  band: GetDesignBandResponse,
  kind: string = 'flat',
  colorwayId: number = COLORWAY_NONE,
): BenchRead {
  const rows = band.bench ?? [];
  const byView = new Map<string, common_DesignBenchSlot>();
  const details: common_DesignBenchSlot[] = [];
  for (const row of rows) {
    if (!benchRowMatches(row, kind, colorwayId)) continue;
    const key = normaliseViewKey(row.viewKey);
    if (isSilhouetteView(key)) byView.set(key, row);
    else details.push(row);
  }
  details.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return {
    sides: SILHOUETTE_VIEWS.map((view) => ({ view, slot: byView.get(view) ?? null })),
    details,
  };
}

/**
 * A name collision between two details is LEGAL, and the display adds a `(2)` suffix rather than
 * the store mutating the name. Renaming one must not renumber the other, and the sheet cites a
 * detail by the name it was minted with.
 */
export function displayDetailName(
  details: readonly common_DesignBenchSlot[],
  slot: common_DesignBenchSlot,
): string {
  const name = (slot.detailName ?? '').trim() || 'detail';
  const same = details.filter((d) => ((d.detailName ?? '').trim() || 'detail') === name);
  if (same.length < 2) return name;
  return `${name} (${same.indexOf(slot) + 1})`;
}

/** A stable string identity for a slot ref — the key of the optimistic map and of pick targets.
 *  The bench kind is part of the identity: `front` names TWO slots since the second axis, and a
 *  key without the kind would hand a flat side's optimistic paint to the render side of the same
 *  name (or the reverse). */
export function slotRefKey(ref: DesignBenchSlotRef): string {
  if (ref.slotId) return `id:${ref.slotId}`;
  /* И КОЛОРВЕЙ ТОЖЕ ЧАСТЬ ЛИЧНОСТИ (L-2): `render/front` называет теперь по слоту НА КАЖДЫЙ
     колорвей карточки, и ключ без него отдал бы оптимистичную закраску стороны ROSSO стороне
     OLIVE того же имени. У флэта он всегда 0 — там оси нет (L-4), — поэтому старые ключи
     флэтового верстака не двигаются ни на байт. */
  return `view:${benchKindOf(ref)}:${refColorwayFor(ref.kind, colorwayOf(ref))}:${normaliseViewKey(ref.viewKey)}`;
}

/** The live row a ref addresses, or null when the slot has never been written. */
export function findSlot(
  band: GetDesignBandResponse,
  ref: DesignBenchSlotRef,
): common_DesignBenchSlot | null {
  const rows = band.bench ?? [];
  // A stored silhouette row carries BOTH an id and a view key; callers address it by the VIEW, so
  // matching on the id alone would miss every side and re-mint it with rev 0 on the next write.
  if (ref.slotId) return rows.find((row) => row.id === ref.slotId) ?? null;
  const view = normaliseViewKey(ref.viewKey);
  if (!view || view === 'detail') return null;
  // BOTH halves of the ref's address, view AND kind (L-5): `front` alone names two rows now, and
  // matching the wrong one made the optimistic overlay in `bench.tsx` compare its CAS token
  // against the other bench's revision.
  // ВСЕ ТРИ ПОЛОВИНЫ АДРЕСА — вид, верстак И колорвей (L-2). `front` называет теперь по строке на
  // каждый колорвей рендер-верстака, и матч по паре вернул бы первую попавшуюся: оптимистичная
  // накладка `bench.tsx` сравнивала бы свой CAS-токен с ревизией ЧУЖОГО ЦВЕТА. Сравнение — одно,
  // в `benchRowMatches`; второго разбора колорвея слота в дереве быть не должно.
  const kind = benchKindOf(ref);
  const colorwayId = colorwayOf(ref);
  return (
    rows.find(
      (row) => benchRowMatches(row, kind, colorwayId) && normaliseViewKey(row.viewKey) === view,
    ) ?? null
  );
}

/**
 * WHICH BENCH a ref actually addresses. For a view ref the answer is on the ref itself (empty =
 * flat, by the contract); for a minted id the ROW is the authority — the contract says `kind` is
 * IGNORED beside a slot_id, so reading the ref's word there would trust exactly the field the
 * server does not.
 */
export function refBenchKind(band: GetDesignBandResponse, ref: DesignBenchSlotRef): string {
  if (ref.slotId) return benchKindOf(findSlot(band, ref));
  return benchKindOf(ref);
}

/**
 * Every picture on the card that MAY be clicked into a FLAT slot — the name has always said so,
 * and since L-1 the body finally agrees with it.
 *
 * Three exclusions, all from the contract rather than from taste: a hidden picture must not be
 * reachable from any picker (`selectPickablePictures`, which has no reveal hatch on purpose); a
 * COMPOSITE has no single view — it must be split first, so it is not a candidate at all; and a
 * picture whose kind addresses ANOTHER bench (or none) is not a flat and would be refused
 * `wrong_kind` — or worse, accepted, which is how fabric renders ended up on the flat sheet.
 *
 * (Here stood «deliberately NOT filtered by kind: the generative machine is cut in this wave…».
 * The rationale outlived its cause: the machine ships, both benches are live, and the kinds this
 * filter reads are on production cards. The stale argument was defending the L-1 defect.)
 */
export function pickableFlats(band: GetDesignBandResponse): common_DesignPicture[] {
  const all: common_DesignPicture[] = [];
  for (const run of band.runs ?? []) all.push(...(run.pictures ?? []));
  for (const batch of band.batches ?? []) all.push(...(batch.pictures ?? []));
  /* РОД СПРАШИВАЕТСЯ У ТОГО ЖЕ КЛАССИФИКАТОРА, ЧТО И ВЕЗДЕ (G-1). `pictureBenchKind` отвечал на
     ЭТОТ вопрос верно, но своим чтением — по объявленному роду картинки, — и оставался пятым
     местом, где живёт правило. Свёртка замерена по всем нынешним родам и ничего не двигает:
     перекрасы и плитки отсеивались собственным родом и раньше. Разница появляется ровно в одном
     случае — кадр НЕИЗВЕСТНОГО ЭТОЙ СБОРКЕ рода прогона: он больше не считается флэтом. Так и
     задумано: догадка «флэт» для рода, о котором сборка не слышала, — это дефект L-1 под новым
     именем, а `pictureBenchKind` остаётся при своём вопросе (КАКОЙ ВЕРСТАК берёт плиту) и при
     своих читателях. */
  return selectPickablePictures(all).filter(
    (p) => (p.compositeViews ?? []).length === 0 && pictureRepresentation(band, p) === 'flat',
  );
}

/**
 * WHY THE PICKER IS EMPTY, in words. Г12: a live door onto a band with nothing in it sends the
 * human to click on pictures that are not there, and the only way out is an Esc they have to know
 * about. The door says WHICH of the three reasons it is instead.
 */
export function pickEmptyReason(band: GetDesignBandResponse): string | null {
  const all: common_DesignPicture[] = [];
  for (const run of band.runs ?? []) all.push(...(run.pictures ?? []));
  for (const batch of band.batches ?? []) all.push(...(batch.pictures ?? []));
  if (pickableFlats(band).length > 0) return null;
  if (all.length === 0) return 'nothing to pick yet — add files first';
  const composites = all.filter((p) => (p.compositeViews ?? []).length > 0).length;
  if (composites === all.length) {
    return `nothing to pick yet — all ${all.length} pictures are composites; split one first`;
  }
  return `nothing to pick yet — every picture on this card is hidden, a composite, or not a flat`;
}

/** The current revision of an edit layer drawn over this exact media, if there is one. */
export function liveLayerRev(
  layers: readonly common_DesignEditLayer[] | undefined,
  mediaId?: number | null,
): number | undefined {
  if (!mediaId) return undefined;
  const layer = (layers ?? []).find((l) => l.baseMediaId === mediaId);
  return typeof layer?.rev === 'number' ? layer.rev : undefined;
}

/** The address of the file to draw. Thumbnail first — a bench frame is 200px wide, not 2000. */
export function pictureUrl(picture?: common_DesignPicture | null): string {
  const media = picture?.media?.media;
  return media?.thumbnail?.mediaUrl || media?.fullSize?.mediaUrl || '';
}

/**
 * The footer line of a filled slot: WHERE THE PLATE IS FROM, in the band's own address vocabulary.
 * Provenance label first (`uploaded`, `AI · run 5`, `provenance unknown`), then the handle
 * (`upload 3 · b`), then the batch's own stamp — author, weight, count — when the plate came by
 * hand. БЕЗ ВРЕМЕНИ ЗАГРУЗКИ (S-15, владелец: «оно не несет особо смысла»): часы остаются на
 * самой полке пачек (`batchCaption` не трогается — у него другие читатели), здесь сегмент-время
 * вырезается из готовой подписи.
 */
export function slotFootnote(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
  shelfOrdinals: Map<number, number>,
): string {
  const provenance = readProvenance(picture);
  const parts = [provenanceLabel(provenance)];
  const ordinal = picture.batchId ? shelfOrdinals.get(picture.batchId) : undefined;
  // НОМЕР ПРОГОНА ПЕЧАТАЛСЯ ДВАЖДЫ. `provenanceLabel` уже сказал «AI · run 5», а `pictureHandle`
  // возвращает «run 5 · a» — вместе выходило `AI · run 5 · run 5 · a`, и это видно на верстаке.
  // Тот же приём, что строкой ниже для `batchCaption`: второй раз одно и то же не говорится.
  const handle = pictureHandle(picture, { shelfOrdinal: ordinal });
  parts.push(provenance.runId === null ? handle : handle.replace(/^run \d+(\s·\s)?/, ''));
  const batch = (band.batches ?? []).find((b) => b.id === picture.batchId);
  if (batch) {
    // `batchCaption` opens with the word «uploaded», which `provenanceLabel` has already said —
    // and carries the clock (`14:41`), which this footnote deliberately does not (S-15). The clock
    // segment is recognised by its own shape, `HH:MM`, — the same spelling `clockStamp` mints —
    // so a future segment that merely CONTAINS digits is not eaten by mistake.
    const caption = batchCaption(batch)
      .split(' · ')
      .filter((segment) => segment !== 'uploaded' && !/^\d{2}:\d{2}$/.test(segment))
      .join(' · ');
    if (caption) parts.push(caption);
  }
  return parts.filter(Boolean).join(' · ');
}

/**
 * A control that is drawn and deliberately dead, WITH ITS REASON ATTACHED.
 *
 * The wave's own rule: what was cut is `data-inert` with a reason, never absence. A missing door
 * teaches the human that the flow does not exist; a dead one with a reason teaches that it is not
 * here YET, which is the true statement.
 */
export function InertDoor({
  label,
  reason,
  size = 'xs',
  className,
  reasonVisible = false,
}: {
  label: React.ReactNode;
  reason: string;
  /**
   * ⚠ РАЗМЕР ОТКАЗА — ЭТО РАЗМЕР ДВЕРИ, КОТОРУЮ ОН СОБОЙ ЗАМЕНЯЕТ, И ЭТО НЕ УКРАШЕНИЕ (F-1).
   *
   * Дверь была прибита к `xs` навсегда, а живая кнопка на её месте — `sm`. Значит на КАЖДОМ
   * экране, где ворота закрыты, орган стоял меньше себя самого и ПОДПРЫГИВАЛ, как только ворота
   * открывались: на PATTERN — MAKE A PATTERN ворота закрыты, пока не введено имя, поэтому там
   * человек почти всегда видел маленькую дверь, а на флэт-генерации — большую живую кнопку.
   * Ровно это владелец и назвал: «сделай кноку генерейт такого же размера как на флет генерации».
   *
   * Умолчание `xs` оставлено намеренно: остальные шестнадцать дверей на умолчании этого band'а стоят рядом
   * с `xs`-кнопками, и менять их размер значило бы чинить одну строку и сломать тридцать шесть.
   */
  size?: 'xs' | 'sm';
  className?: string;
  /**
   * Print the reason UNDER the door as well as in `title`. Off by default — the sixteen existing
   * doors stand in rows where a second line would push their neighbours; a screen that has the
   * room opts in. `title` stays either way, so a hover still reads it.
   */
  reasonVisible?: boolean;
}) {
  return (
    <span
      data-inert={reason}
      title={reason}
      className={cn(reasonVisible ? 'inline-flex flex-col items-start gap-0.5' : 'inline-flex', className)}
    >
      <Button variant='secondary' size={size} disabled>
        {label}
      </Button>
      {reasonVisible && <Reason>{reason}</Reason>}
    </span>
  );
}

/**
 * ЦИКЛ ПОЧИНКИ СНЯТ РЕШЕНИЕМ ВЛАДЕЛЬЦА (S-15: «FIX функциональность выпиливаем полностью»).
 *
 * Что именно ушло: дверь `fix ▸`, галки-шортлист (S-14 — они были ЕЁ органом, R-20), полосы
 * «fix is running / fix is in», сравнение и «put it in». Что осталось ЖИВЫМ, и это не остаток:
 * поля провода `fix_targets` / `fix_slot_ids` ЖИВЫ В КОНТРАКТЕ и читаются историей у уже
 * замороженных строк, а `fix-markup.tsx` и `generation/fix-context.tsx` стоят на диске ради
 * импортов формы генерации.
 *
 * ⚠ ДОВОД «ИМИ СУЖАЕТ СЕБЯ ВЕКТОРНЫЙ ПРОГОН» УМЕР ВМЕСТЕ СО СВОЕЙ ПРИЧИНОЙ (H-1, круг 14):
 * платный `kind='vector'` снят с клиента целиком, и с круга 14 КАЖДЫЙ клиентский писатель шлёт
 * оба поля пустыми. Читателем осталась только история (`run-state.ts`) — см.
 * `history-fingerprint.ts` про то, как замороженные fix-прогоны читаются дальше.
 */

export type BenchSlotProps = {
  band: GetDesignBandResponse;
  /** Нужен векторному редактору: слой пишется на карточку, а не на слот. */
  techCardId: number;
  /** The wire address of this slot — a view key for a side, a minted id for a detail. */
  slotRef: DesignBenchSlotRef;
  /** The stored row, or null for a side that has never been touched. */
  slot: common_DesignBenchSlot | null;
  /** Human name — FRONT, or the detail's DISPLAYED name (which may carry a `(2)` suffix). */
  label: string;
  /** What stands there right now, optimistic value included. */
  picture: common_DesignPicture | null;
  /** The CAS token the next write must echo. 0 = the slot does not exist yet. */
  slotRev: number;
  detail?: boolean;
  /** In the sheet minimum — an empty one is red and the mint is unreachable. */
  required?: boolean;
  /**
   * ПОЧЕМУ ЭТА СТОРОНА ОБЯЗАТЕЛЬНА — СЛОВАМИ ТОГО ЭКРАНА, КОТОРЫЙ ОТКАЗЫВАЕТ.
   *
   * Плита стоит теперь на ДВУХ верстаках, и требование у них разное по существу: у флэтов его
   * предъявляет ЛИСТ (`SHEET_MIN_VIEWS`, перед и спина), у рендер-слотов — ПРОВАЙДЕР 3D, которому
   * без фронта нечего строить (`no_front_render`, отказ до денег). Одна зашитая фраза «the sheet
   * needs it» на рендер-слоте была бы неправдой про орган, который ничего не печатает.
   */
  requiredNote?: string;
  /**
   * ═══ ВЕКТОРНЫЙ РЕДАКТОР — ОРГАН ФЛЭТА, А НЕ ВСЯКОЙ ПЛИТЫ (J-25) ═══════════════════════════════
   *
   * `false` снимает угол `edit ▸` и не монтирует `VectorModal` вовсе. Умолчание `true` — флэтовый
   * верстак не передаёт ничего и работает как работал.
   *
   * ПОЧЕМУ РЕНДЕР-СЛОТУ ЭТОТ УГОЛ НЕ ДАЁТСЯ. Редактор пишет СЛОЙ ШТРИХОВ над плитой
   * (`design_edit_layer`) и живёт понятием «плоская правка чертежа»: его кисть, трассировка и
   * «save as picture» рассчитаны на линию по белому. Над цветной фотографией ткани он не отказ
   * даёт, а молча делает не то, — и это ровно тот вид двери, которую владелец просил не рисовать.
   * Правка рендера — предмет отдельного круга (J-13), и её место в просмотрщике, а не здесь.
   */
  editable?: boolean;
  /** A write for this slot is in flight or its refetch has not landed. */
  saving?: boolean;
  /** Pick mode is armed FOR THIS SLOT. Armed only by the tile picker since J-15. */
  picking?: boolean;
  /** Writers frozen — by prop, never by `<fieldset disabled>`, which mutes clicks and nothing else. */
  disabled?: boolean;
  shelfOrdinals: Map<number, number>;
  onPlaceMedia: (media: common_MediaFull) => void;
  onCancelPick: () => void;
  onUnmark: () => void;
  /**
   * Кадр этой плиты для ОБЩЕГО просмотрщика студии (`PictureGalleryProvider`). Раньше здесь стоял
   * `onOpenViewer?: () => void` и открывал просмотрщик ВЕРСТАКА — свой, со своим рядом, поэтому
   * листание упиралось в край верстака. Теперь плитка регистрируется в один ряд на всю полосу, и
   * «дальше» уводит в референсы и историю, как и просил владелец (круг 4, пункт 8).
   */
  galleryItem?: MediaViewerItem;
  /* ⚠ ПРОПА `onSplit` У ПЛИТЫ БОЛЬШЕ НЕТ (F-18). Он вёл к углу «разрезать на виды», а плита,
     стоящая в слоте, заведомо одновидовая: композит сервер в слот не пускает вовсе
     (`store/design/bench.go` → `composite_plate`). Дверь обещала рез тому, у кого резать нечего.
     Единственные два вызывающих (`bench.tsx`) сняты тем же движением; оставленный проп был бы
     API, которого никто не вызывает, и приглашением вернуть орган обратно. Вырезать деталь из
     плиты по-прежнему можно — это `onCrop`, другая дверь с другим исходом. */
  /** Details only. */
  onRename?: (name: string) => void;
  onDelete?: () => void;
};

/**
 * ═══ ОДНА ЯЧЕЙКА ПОЛОСЫ FLAT SLOTS — форма макета (`slotCell`, `_core.js`), данные продукта ═══
 *
 * Плита стоит в ГОРИЗОНТАЛЬНОЙ ПОЛОСЕ из шести ячеек по 138px (`.pstrip` макета), и у ячейки два
 * лица:
 *   · ЗАПОЛНЕННАЯ — сплошная чернильная рамка, кадр 1:1 без своей рамки, ПОДВАЛ (`.cap`) с именем
 *     стороны и звёздочкой обязательной; никакой полосы происхождения — она уехала в `title`
 *     подвала (`slotFootnote`), потому что макет её не рисует, а стереть факт нельзя;
 *   · ПУСТАЯ — ТА ЖЕ КОРОБКА (R2 п.24): пунктирная рамка, кадр 1:1, ТОТ ЖЕ подвал с именем
 *     стороны; внутри кадра — две половины, «from media» и «draw» (R2 п.16). Состояние
 *     показывается, а не рассказывается абзацем под полосой.
 *
 * ⚠ ЗАПОЛНИТЬ СЛОТ — ЭТО БИБЛИОТЕКА, ⌘V, БРОСОК ИЛИ РИСУНОК, а не «первый свободный флэт из пула»,
 * как в прототипе (`f:fill` там — названное упрощение, см. `steps/flat.md`). На проводе слот берёт
 * `picture_id` или `media_id` конкретной картинки; картинку полосы в слот кладёт пикер «— slot —»
 * под плиткой истории (`slot-picker.tsx`). Первые три жеста держит ОДИН орган — `MediaSlot`
 * админки; четвёртый — векторный редактор на чистой плате, и он пишет в ЭТОТ ЖЕ слот.
 *
 * ⚠ КЛИК ПО СТОЯЩЕЙ ПЛИТЕ НЕ СНИМАЕТ ЕЁ. Макет делает всю плиту кнопкой `f:take`; у продукта
 * поверхность плитки — закон углов `PictureTile` (владелец: «сделай везде одинаково … компонентом»):
 * поверхность открывает просмотрщик, снимает угол `✕`, правит угол `edit`. Снятие — запись с CAS
 * на сервер, и вешать её на голую поверхность, по которой промахиваются, значило бы платить
 * записью за каждый неточный клик. Строка под полосой называет ✕.
 */

/**
 * ═══ ПУСТАЯ ЯЧЕЙКА — ТА ЖЕ КОРОБКА, ЧТО ЗАПОЛНЕННАЯ (R2 п.24) ═══════════════════════════════════
 *
 * Владелец, дословно: «в FLAT SLOTS плейсхолдеры больше самих блоков тамбнейлов — сделай
 * одинакового размера». Раньше пустая ячейка была ОДНОЙ кнопкой ростом `minHeight: 138`, а
 * заполненная — рамкой с кадром 1:1 и подвалом под ним. Две разные разметки одной ячейки
 * расходились на высоту подвала, и лента стояла ступеньками.
 *
 * ТЕПЕРЬ РАЗМЕР НЕ «СОГЛАСОВАН», А ВЫВЕДЕН ИЗ ОДНОЙ РАЗМЕТКИ: рамка 1px, внутри неё кадр
 * `aspect-ratio: 1/1` (его ширина — ширина ячейки МИНУС рамка, ровно как у `PictureTile` в
 * заполненной ветке) и ОДИН И ТОТ ЖЕ подвал `SlotCap`. Совпадение проверяется измерением на
 * стенде, а не глазом: у обеих ветвей общий подвал и общая арифметика кадра.
 *
 * ═══ ДВЕ ПОЛОВИНЫ ОДНОЙ ПЛИТКИ (R2 п.16) ═══════════════════════════════════════════════════════
 *
 * Верх — слот медиа (клик в библиотеку, ⌘V, бросок файла, фотоглиф — всё внутри `MediaSlot`);
 * низ — «draw» в векторный редактор на чистой плате. Две двери В ОДНУ КОМНАТУ: обе кладут
 * картинку В ЭТОТ слот, и потому стоят на одной коробке, а не рядом с ней кнопками.
 *
 * ЛИНИЯ МЕЖДУ НИМИ ОДНА. Своей рамки у половин нет — рамку несёт коробка; иначе посередине встала
 * бы двойная линия из двух стыкующихся рамок (та же беда, которую в `8d29fd83` лечили заездом на
 * пиксель). Деление — строками грида, ИНЛАЙНОМ: стенд читает CSS готовой сборки, в котором
 * произвольного класса деления нет, а геометрия деления не должна зависеть от сканера классов.
 */
/**
 * ═══ ГЕОМЕТРИЯ ЯЧЕЙКИ — ОДНО НАПИСАНИЕ НА ВСЮ СТУДИЮ ═══════════════════════════════════════════
 *
 * Коробка ячейки FLAT SLOTS складывается из трёх слагаемых, и НИ ОДНО из них не число «на глаз»:
 * ширина ленты (`BENCH_CELL_PX`), кадр в этой ширине (`BENCH_FRAME_ASPECT`) и подвал `SlotCap`.
 * Замерено на стенде: 138 × 162 = 1px рамки + кадр 136 × 136 + подвал 24 + 1px рамки.
 *
 * ЭКСПОРТИРУЕТСЯ, ПОТОМУ ЧТО ЯЧЕЙКА ЕСТЬ НЕ ТОЛЬКО ЗДЕСЬ. Владелец (r2 п.25) велел ячейке
 * SOURCE PICTURE на шаге PATTERN быть «того же размера, что ячейки FLAT SLOTS»; повторить там
 * «138» и «1/1» руками значило бы завести вторую коробку, которая разъедется с этой молча — а
 * «одинакового размера» и есть ровно то утверждение, которое он проверяет глазами.
 * Ширина едет ИНЛАЙНОМ (`BENCH_CELL_STYLE`), а не классом: стенд читает CSS собранного бандла, в
 * котором произвольного класса, которого не было в дереве на момент сборки, не существует вовсе.
 */
export const BENCH_CELL_PX = 138;
export const BENCH_CELL_STYLE: React.CSSProperties = {
  width: BENCH_CELL_PX,
  flex: `0 0 ${BENCH_CELL_PX}px`,
};
export const BENCH_FRAME_ASPECT = '1/1';

/**
 * ⚠ `minHeight: 0` НА САМОМ КАДРЕ — ВТОРАЯ ПОЛОВИНА ТОЙ ЖЕ ПОЧИНКИ. Кадр стоит элементом
 * колоночного флекса (коробка ячейки), а у элемента флекса `min-height: auto`, то есть
 * содержательный минимум ПЕРЕБИВАЕТ `aspect-ratio`. Замерено: без нуля коробка вырастала до 366
 * при 162 у заполненной — «квадрат» проигрывал содержимому половин.
 */
const SLOT_FRAME: React.CSSProperties = {
  ...PLACEHOLDER_SURFACE,
  aspectRatio: BENCH_FRAME_ASPECT,
  minHeight: 0,
};
/*
 * ДВЕ ПОЛОВИНЫ ПЛЕЙСХОЛДЕРА (перо, лицо половины, деление коробки надвое) ЖИВУТ В `./core`
 * (`core/two-half-slot.tsx`): тот же орган стоит в INPUT — REFERENCES и во флэт-сторонах рендера,
 * и второе его начертание разъехалось бы с первым молча — так уже разъехалась кожа в волне r2.
 */

/**
 * ПОДВАЛ ЯЧЕЙКИ — имя стороны и звёздочка обязательной. ОДИН на обе ветви (заполненную и пустую):
 * именно он держит обещание «одна коробка», и вторая его копия сломала бы её молча.
 *
 * ЭКСПОРТИРУЕТСЯ ПО ТОМУ ЖЕ ДОВОДУ, ЧТО И `BENCH_CELL_STYLE` выше: подвал — ТРЕТЬЕ слагаемое
 * высоты 162, и ячейка SOURCE PICTURE (r2 п.25) без него была бы квадратом, который владелец
 * отменил. Второй подвал «такой же на вид» разошёлся бы с этим на пиксель подписи.
 */
export function SlotCap({
  label,
  required,
  requiredNote,
  title,
  trailing,
}: {
  label: string;
  required?: boolean;
  requiredNote?: string;
  title?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className='flex min-w-0 items-baseline gap-1 border-t border-hairline px-1.5 py-1'
      title={title || undefined}
      data-bench-cap={label}
    >
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className='min-w-0 truncate'
      >
        {label}
      </Text>
      {required && (
        <Text size='micro' component='span' className='text-error' title={requiredNote}>
          *
        </Text>
      )}
      {trailing}
    </div>
  );
}

/**
 * ПУСТАЯ ЯЧЕЙКА — коробка, две двери, подвал. Локальный орган этого файла; макетный `slotCell` в
 * пустом состоянии. Просится в `core`, если пустые ячейки понадобятся ещё одной полосе (у
 * рендер-верстака свой файл, `render/side-row.tsx`).
 */
function EmptyCell({
  label,
  required,
  requiredNote,
  purpose,
  disabled,
  picking,
  onPlaceMedia,
  onDraw,
}: {
  label: string;
  required?: boolean;
  requiredNote?: string;
  purpose: string;
  disabled?: boolean;
  picking?: boolean;
  onPlaceMedia: (media: common_MediaFull) => void;
  /** Есть — у ячейки вторая половина «draw». Нет — кадр целиком под слот медиа. */
  onDraw?: () => void;
}) {
  const take = (media: common_MediaFull[]) => {
    const first = media[0];
    if (first?.id) onPlaceMedia(first);
  };
  const halved = !disabled && !!onDraw;
  return (
    <div
      data-bench-empty={label}
      /* Обе половины подписаны одинаково на всех шести ячейках («from media» / «draw»), и на слух
         они неразличимы. Имя стороны даёт группа — оно же напечатано в подвале. */
      role='group'
      aria-label={`${label} — empty slot`}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden border border-dashed',
        picking ? 'border-textColor' : 'border-borderColor',
      )}
    >
      <div
        style={{ ...SLOT_FRAME, ...(halved ? SLOT_HALVES : {}) }}
        className={cn(!halved && 'flex items-center justify-center')}
      >
        {disabled ? (
          <Text size='micro' variant='uppercase' tracking='label' component='span'>
            empty
          </Text>
        ) : (
          <>
            {/* ВЕРХНЯЯ ПОЛОВИНА — слот медиа как он есть: клик в библиотеку, ⌘V, бросок и
                фотоглиф живут ВНУТРИ примитива, и второго их написания здесь не заводится.
                Рамка снята (`border-0`): её несёт коробка ячейки.

                ⚠ ОБЁРТКА С `minHeight: 0` НЕСУЩАЯ, А НЕ УБОРКА. У элемента грида
                `min-height: auto`, а внутри стоит кнопка со СВОИМИ пропорциями (`4/5`): её
                содержательная высота растягивала строку, строка растягивала кадр, и «квадрат
                1:1» превращался в 340 пикселей — замерено на стенде (366 против 162 у
                заполненной ячейки). С нулевым минимумом высоту строки задаёт ТОЛЬКО пропорция
                кадра, а `h-full` кнопки разрешается уже об неё. */}
            <div style={{ minHeight: 0, overflow: 'hidden' }} className='min-w-0'>
              <MediaSlot
                label='from media'
                purpose={purpose}
                aspectRatio={['Custom']}
                allowMultiple={false}
                showVideos={false}
                onSelect={take}
                sizeClassName='h-full w-full'
                className='border-0'
              />
            </div>
            {onDraw && (
              <DrawHalf
                anchor={label}
                label='draw'
                ariaLabel={`draw ${label}`}
                title='opens the picture editor on a blank plate; what you draw takes this slot'
                onClick={onDraw}
              />
            )}
          </>
        )}
      </div>
      <SlotCap label={label} required={required} requiredNote={requiredNote} />
    </div>
  );
}

export function BenchSlot(props: BenchSlotProps) {
  const [vectorOpen, setVectorOpen] = useState(false);
  const {
    band,
    techCardId,
    slotRef,
    slot,
    label,
    picture,
    slotRev,
    detail,
    required,
    requiredNote = 'the sheet needs it',
    editable = true,
    saving,
    picking,
    disabled,
    shelfOrdinals,
    onPlaceMedia,
    onCancelPick,
    onUnmark,
    galleryItem,
    onRename,
    onDelete,
  } = props;

  const provenance = picture ? slotProvenance({ picture }) : null;
  const url = pictureUrl(picture);

  /**
   * A DRAWING SITS OVER THIS PLATE — and the sentence it deserves depends on where the plate came
   * from. Both branches read the same fact (there is an edit layer whose base is this media, at a
   * revision the plate does not contain) and they are mutually exclusive by construction:
   *
   *   the plate IS a flattening (`layerRev > 0`) and the layer has moved past it → it has gone
   *     STALE: the picture is an older rasterisation of a drawing that has since changed.
   *   the plate was never flattened (`layerRev === 0`) → nothing is stale; the marks are data, not
   *     ink. A run, the fabric render, the printed sheet and a minted version read the PICTURE —
   *     for them the marks do not exist until `edit → save as picture` runs them through the
   *     canvas.
   */
  const layerRev = liveLayerRev(band.layers, picture?.media?.id);
  const layerOverPlate = provenance && typeof layerRev === 'number';

  const stale =
    layerOverPlate && provenance.layerRev > 0 && layerRev! > provenance.layerRev
      ? 'the edit layer has moved on — this picture is an older flattening'
      : null;

  const unflattened =
    layerOverPlate && provenance.layerRev === 0
      ? 'edit marks sit on a layer over this plate — a run reads the plate alone until «save as picture» presses them in'
      : null;

  const mixedNote = provenance ? mixedInputNote(provenance) : null;
  const footnote = picture ? slotFootnote(band, picture, shelfOrdinals) : '';

  return (
    // `group` is load-bearing: the quiet organs of the plate (the corner buttons of `PictureTile`,
    // the «remove slot» door) reveal on hover of the whole cell, not of the frame alone.
    <div className='group flex h-full min-w-0 flex-col gap-1' data-bench-slot={label}>
      {url && picture ? (
        /* ═══ ЗАПОЛНЕННАЯ — рамка на ЯЧЕЙКЕ, кадр без своей (`border-0`), подвал под кадром ═══ */
        <div
          className={cn(
            'flex min-w-0 flex-col overflow-hidden border',
            picking ? 'border-2 border-textColor' : 'border-textColor',
          )}
        >
          {/* Углы — закон примитива (`PictureTile`): ✕ очищает слот, edit открывает векторный
              редактор, zoom — общий просмотрщик студии. `contain`, не `cover`: плита — ЧЕРТЁЖ, и
              кроп съедает контур изделия, ради которого лист и печатают. Угла `split` у плиты
              нет (F-18): композит в слот не встаёт вовсе, сервер отвечает `composite_plate`. */}
          <PictureTile
            url={url}
            alt={label}
            aspect='1/1'
            fit='contain'
            className='border-0'
            gallery={galleryItem}
            onRemove={
              !disabled
                ? {
                    onClick: onUnmark,
                    ariaLabel: `unmark ${label}`,
                    title: 'unmark — take this plate off the slot; it stays in the history',
                    disabled: saving,
                  }
                : undefined
            }
            onEdit={
              !disabled && editable
                ? {
                    onClick: () => setVectorOpen(true),
                    ariaLabel: `edit ${label} — draw over the plate`,
                  }
                : undefined
            }
          />
          {/* ПОДВАЛ — имя стороны и звёздочка; происхождение плиты (`AI · run 5 · a`) уехало в
              `title`: макет его не печатает, а факт остаётся в одном наведении. Тот же орган, что
              у пустой ветки, — этим и держится «одна коробка». */}
          <SlotCap
            label={label}
            required={required}
            requiredNote={requiredNote}
            title={footnote}
            trailing={
              saving ? (
                <Text size='nano' variant='label' component='span' className='ml-auto uppercase'>
                  saving…
                </Text>
              ) : null
            }
          />
        </div>
      ) : (
        <EmptyCell
          label={label}
          required={required}
          requiredNote={requiredNote}
          purpose={`design bench · ${label}`}
          disabled={disabled}
          picking={picking}
          onPlaceMedia={onPlaceMedia}
          /* НИЖНЯЯ ПОЛОВИНА ПИШЕТ В ЭТОТ ЖЕ СЛОТ: редактор получает `slotRef` и `slotRev` ячейки,
             то есть `kind:'flat'`, `colorwayId: 0`, адрес одним членом oneof и живой CAS-токен.
             Там, где редактора нет по существу (`editable={false}` — рендер-слоты), нет и
             половины: дверь, которая молча делает не то, хуже отсутствующей. */
          onDraw={!disabled && editable ? () => setVectorOpen(true) : undefined}
        />
      )}

      {/* ⚠ ВЕТКА `picking` ОСТАВЛЕНА, НО ВЗВЕСТИ ЕЁ БОЛЬШЕ НЕЧЕМ (J-15): `pick.start` звали ровно три
          двери, все три сняты. Пикер плитки режим НЕ взводит — он пишет в слот напрямую. Ветка
          сохранена вместе с самим `PickModeProvider` (он же владеет Esc) как названный след. */}
      {!disabled && picking && (
        <div>
          <button
            type='button'
            onClick={onCancelPick}
            className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            <Text size='nano' variant='label' component='span'>
              choosing — click a picture in the band · cancel
            </Text>
          </button>
        </div>
      )}

      {detail && onRename && (
        <DetailNameField name={(slot?.detailName ?? '').trim()} disabled={disabled} onRename={onRename} />
      )}

      {/* ДВЕРЬ СНОСА СЛОТА ДЕТАЛИ — другой глагол, чем ✕ (крестик очищает слот, эта кнопка сносит
          сам слот), и рядом с плитой их путать нельзя. Появление — той же формулой прозрачности,
          что у углов плитки: коробка на месте, полоса не дёргается под курсором. */}
      {!disabled && detail && onDelete && (
        <span
          className={cn(
            'flex flex-wrap items-center gap-1.5',
            'opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100',
            '[@media(hover:none)]:opacity-100 motion-reduce:transition-none',
          )}
        >
          <Button
            variant='secondary'
            size='xs'
            title='remove this detail slot — not just its picture'
            onClick={onDelete}
          >
            remove slot
          </Button>
        </span>
      )}

      {/* Векторный редактор монтируется у плиты, дверь — угол `edit` справа снизу. `editable`
          снимает и дверь, и МОНТАЖ: модалка держит своё состояние холста и подписки на клавиши.
          ⚠ У ПУСТОГО СЛОТА ОН ТОЖЕ ЖИВЁТ, но только пока открыт: `base={null}` — заявленный режим
          «рисунок с нуля» (слой с `base_media_id = 0`), а `slot` тот же, поэтому сплющенная
          картинка встаёт РОВНО В ЭТУ ячейку. Держать его смонтированным под закрытой дверью
          значило бы отбирать оконные клавиши у страницы. */}
      {!disabled && editable && (picture || vectorOpen) && (
        <VectorModal
          open={vectorOpen}
          onOpenChange={setVectorOpen}
          techCardId={techCardId}
          band={band}
          base={picture ?? null}
          slot={{ ref: slotRef, label, slotRev }}
          disabled={disabled}
        />
      )}

      {/* Оговорки — только когда они есть: в покое под ячейкой ничего не стоит (макет). */}
      {mixedNote && (
        <Text size='nano' variant='label' component='span'>
          {mixedNote}
        </Text>
      )}
      {stale && (
        <Text size='nano' component='span' className='text-warning'>
          {stale}
        </Text>
      )}
      {unflattened && (
        <Text size='nano' variant='label' component='span'>
          {unflattened}
        </Text>
      )}
    </div>
  );
}

/**
 * The detail's name field. Renaming goes through `SetDesignBenchSlot` with the slot's CURRENT
 * picture echoed back — the RPC's `picture_id` is not optional and 0 means UNMARK, so a rename that
 * forgot to carry the plate would silently empty the slot it was renaming.
 */
function DetailNameField({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled?: boolean;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  // The server's name wins whenever it changes underneath — somebody else may have renamed it.
  useEffect(() => setValue(name), [name]);
  const commit = () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    onRename(next);
  };
  return (
    <Input
      value={value}
      disabled={disabled}
      aria-label='detail name'
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

/**
 * The cell that MINTS a detail — and the name comes before the picture, which is the whole rule of
 * this cell. A detail slot is addressed by id and cited by name on a printed sheet; a nameless one
 * would be born with nothing to call it and the server refuses it
 * (`FailedPrecondition:detail_name_required`). So the door does not open until the field has a word
 * in it: it says so and puts the caret where the answer goes.
 *
 * ONE DOOR, NOT TWO, SINCE J-15 — «or mark from the band» was the second, and it went with its
 * twins on the slots themselves.
 *
 * ФОРМА — ТА ЖЕ ЯЧЕЙКА ПОЛОСЫ, что у пустой стороны (`EmptyCell`): с именем — живой слот на три
 * жеста, без имени — та же пунктирная коробка, которая зовёт к полю имени под собой.
 */
export function NewDetailCell({
  disabled,
  onPlaceMedia,
}: {
  disabled?: boolean;
  onPlaceMedia: (media: common_MediaFull, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [bad, setBad] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const named = name.trim();

  const demandName = () => {
    setBad(true);
    inputRef.current?.focus();
  };

  return (
    <div className='flex h-full min-w-0 flex-col gap-1' data-bench-slot='new detail'>
      {named && !disabled ? (
        <EmptyCell
          label={named}
          purpose={`design bench · ${named}`}
          onPlaceMedia={(media) => {
            onPlaceMedia(media, named);
            setName('');
            setBad(false);
          }}
        />
      ) : (
        /* ТА ЖЕ КОРОБКА, ЧТО У ВСЯКОЙ ЯЧЕЙКИ ЛЕНТЫ (R2 п.24): рамка, кадр 1:1, подвал. Двери
           внутри кадра нет — сначала имя: безымянный слот сервер отвергает
           (`detail_name_required`), и кнопка, которая нажимается и молча ничего не делает,
           читается как сломанная. */
        <div
          className={cn(
            'flex min-w-0 flex-col overflow-hidden border border-dashed',
            bad ? 'border-error' : 'border-borderColor',
          )}
        >
          <button
            type='button'
            disabled={disabled}
            onClick={demandName}
            aria-label='name the detail first'
            style={SLOT_FRAME}
            className={cn(HALF_FACE, bad && 'text-error', disabled && 'cursor-default')}
          >
            <span className='leading-tight'>name it, then fill it</span>
          </button>
          <SlotCap label='+ detail' />
        </div>
      )}

      <Input
        ref={inputRef}
        value={name}
        disabled={disabled}
        placeholder='name this detail'
        aria-invalid={bad || undefined}
        aria-label='new detail name'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setName(e.target.value);
          if (e.target.value.trim()) setBad(false);
        }}
      />
    </div>
  );
}
