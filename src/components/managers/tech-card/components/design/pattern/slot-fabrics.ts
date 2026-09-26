import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignAssetBinding,
  common_DesignRun,
  common_TechCardColorwayUsage,
} from 'api/proto-http/admin';
import { formatCompositionCell } from 'components/managers/materials/components/material-code';

import { sectionShort } from '../../bom-line-picker';
import {
  UNSET_PURPOSE,
  bomPurposeLabel,
  bomPurposeOrder,
  defaultRoleForPurpose,
  isRollGoodsSection,
} from '../../bom-purpose';
import { findPantone } from '../../pantone-swatches';
import { wireInt } from '../../wire-int';
import {
  ASSETS_PER_CARD_MAX,
  ASSET_NAME_MAX,
  assetById,
  clothShelf,
  normaliseHex,
} from '../assets/model';
import type { Gate } from '../render/model';
import { patternTwin } from './model';

/**
 * ═══ STEP 3 · PATTERN — THE FABRIC OF EVERY (COLOURWAY, SLOT), AS A PURE MODEL ════════════════
 *
 * Владелец (2026-09-26): «разбивка по СУЩЕСТВУЮЩИМ колорвеям; внутри колорвея — по слотам ткани
 * (white → outer, inner); на каждую пару — свотч из пантона и, по желанию, текстуры; и пометить
 * его так, чтобы он сам уехал в FABRIC RENDER».
 *
 * ЭТОТ ФАЙЛ НЕ ЧИТАЕТ ПРОВОД И НЕ ДЕРЖИТ СОСТОЯНИЯ. Три источника приходят к нему готовыми:
 *   · СЛОТЫ — строки формы `bomItems` (их читает ОДИН `useWatch` композитора, `studio-tab.tsx`,
 *     и раздаёт шагам 3 и 4 одним массивом — второе чтение формы развело бы два экрана о том, какие
 *     у изделия ткани);
 *   · КОЛОРВЕИ — `useColorwayChoice` композитора (одна ось на студию);
 *   · ПРИВЯЗКИ — `band.assetBindings`, одна строка на пару (колорвей, строка BOM). Это ЕДИНСТВЕННЫЙ
 *     источник ответа «чем одета пара». Легаси-колонка `design_asset.colorway_id` здесь не
 *     читается вовсе (ревью, S3): она про «ткань всего колорвея», и падать на неё назад значило бы
 *     показать в ячейке слота ткань, которую для этого слота никто не выбирал.
 *
 * ПИШЕТ ПРИВЯЗКУ ДВА МЕСТА, И ОБА — СЕРВЕР ИЛИ ЯВНЫЙ ЖЕСТ: посадка прогона, сделанного для пары
 * (`params.pattern.bom_item_id` + `params.colorway_id` — новейший свотч становится тканью пары
 * сам, клиент после прогона не пишет ничего), и `SetDesignAssetBinding` из карусели (`use for ▸`).
 */

/* ─────────────────────────── слоты ─────────────────────────── */

/**
 * СЛОТ ТКАНИ — СОХРАНЁННАЯ СТРОКА BOM РУЛОННОГО ТОВАРА. То же правило, по которому таблица
 * MATERIAL SLOTS относит строку к семейству `cloth` (`isRollGoodsSection`: ткань, подкладка,
 * дублерин, утеплитель) — второе определение «что такое ткань изделия» разошлось бы с первым молча.
 *
 * АДРЕС — `bomItemId`, серверный ключ строки. Привязка держит внешний ключ именно на него
 * (`tech_card_bom_item(id)`, ON DELETE CASCADE), поэтому строка, ни разу не сохранённая, слотом
 * здесь не считается: сослаться на неё серверу нечем. Такие строки только СЧИТАЮТСЯ
 * (`unsavedCount`) — экран говорит одной серой строкой, что их станет видно после сохранения.
 */
export type ClothSlot = {
  bomItemId: number;
  /** Ключ строки формы — запасной путь сверки со строкой рецепта (`usage.bomLineKey`). */
  lineKey: string;
  /** Как слот назван человеком; пусто — роль по назначению, потом слово секции. */
  name: string;
  /** Сырой enum назначения (`TECH_CARD_BOM_PURPOSE_*`), пусто — не задано. */
  purpose: string;
  /** Подпись назначения («main material», «lining»…), пусто — назначение не задано. */
  purposeLabel: string;
  section: string;
  /** Состав и спецификация — то, что экран печатает серым под именем слота. */
  detail: string;
  /**
   * ЧТО ЕДЕТ К МОДЕЛИ О ТКАНИ СЛОТА: имя · состав · спецификация, не длиннее `SLOT_WORDS_MAX`.
   * Уезжает хвостом `params.colour.words` («Pantone … · outer · 100% cotton twill 300 gsm»): сервер
   * печатает это поле как «ткань словами», и отдельного поля под описание слота контракт не заводит.
   */
  words: string;
};

export type ClothSlots = {
  slots: ClothSlot[];
  /** Строки рулонного товара без `id` — на них пока нельзя сослаться. */
  unsavedCount: number;
};

/** Потолок слов слота — чтобы описание ткани не вытеснило из промпта сам цвет. */
export const SLOT_WORDS_MAX = 200;

/**
 * Форма строки, которую этот файл умеет читать, — структурно, а не `TechCardFormData`: чистой
 * модели не нужна вся zod-схема карточки, а читает она ровно семь полей.
 */
export type BomLineLike = {
  id?: unknown;
  lineKey?: string | null;
  section?: string | null;
  purpose?: string | null;
  name?: string | null;
  composition?: string | null;
  spec?: string | null;
};

/** Обрезка по кодовым точкам, с многоточием: промпт и имя не рвут букву пополам. */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

/**
 * СЛОТЫ ТКАНИ КАРТОЧКИ — в порядке назначений (`bomPurposeOrder`: основная → подкладка → …), а
 * внутри одного назначения в порядке BOM. Строки без назначения — последними: им место на экране
 * есть, но «верх изделия» они собой не открывают.
 *
 * ЗВАТЬ ЧЕРЕЗ `useWatch({ compute })` КОМПОЗИТОРА: результат — новый объект на каждый вызов, и
 * глубокое сравнение `compute` не пускает перерисовку студии, пока слоты по смыслу не изменились
 * (правка нормы расхода или строки ниток слоты не трогает).
 */
export function clothSlots(
  lines: readonly (BomLineLike | null | undefined)[] | null | undefined,
): ClothSlots {
  const rows: { slot: ClothSlot; order: number; at: number }[] = [];
  let unsavedCount = 0;
  (lines ?? []).forEach((line, at) => {
    if (!line || !isRollGoodsSection(line.section ?? undefined)) return;
    const bomItemId = wireInt(line.id);
    if (bomItemId <= 0) {
      unsavedCount += 1;
      return;
    }
    const section = (line.section ?? '').trim();
    const raw = (line.purpose ?? '').trim();
    const purpose = raw && raw !== UNSET_PURPOSE ? raw : '';
    const name =
      (line.name ?? '').trim() ||
      defaultRoleForPurpose(purpose) ||
      sectionShort(section) ||
      `slot ${bomItemId}`;
    /* СОСТАВ ЧИТАЕТСЯ ТЕМ ЖЕ ПЕЧАТНИКОМ, ЧТО В ТАБЛИЦЕ СЛОТОВ И НА БУМАГЕ: у привязанной к
       артикулу строки там JSON-снимок каталога, и сырые скобки в промпте были бы шумом. */
    const detail = [formatCompositionCell(line.composition ?? ''), (line.spec ?? '').trim()]
      .filter(Boolean)
      .join(' · ');
    const index = purpose
      ? bomPurposeOrder.indexOf(purpose as (typeof bomPurposeOrder)[number])
      : -1;
    rows.push({
      slot: {
        bomItemId,
        lineKey: (line.lineKey ?? '').trim(),
        name,
        purpose,
        purposeLabel: purpose ? bomPurposeLabel(purpose) : '',
        section,
        detail,
        words: clip([name, detail].filter(Boolean).join(' · '), SLOT_WORDS_MAX),
      },
      order: index < 0 ? bomPurposeOrder.length : index,
      at,
    });
  });
  rows.sort((a, b) => a.order - b.order || a.at - b.at);
  return { slots: rows.map((r) => r.slot), unsavedCount };
}

/* ─────────────────────────── рецепт колорвея для слота ─────────────────────────── */

/**
 * Строка рецепта, привязанная к ДЕТАЛИ кроя, — назначение материала, а не описание слота. Три
 * представления одной привязки (`pieceIndex` — explicit presence: 0 это настоящая деталь); тот же
 * предикат, что у `money-panel.tsx` и серверного `IsPieceMaterialAssignment`.
 */
function isPieceRow(u: common_TechCardColorwayUsage): boolean {
  return wireInt(u.pieceId) > 0 || !!(u.pieceLineKey ?? '').trim() || u.pieceIndex != null;
}

/**
 * СТРОКА РЕЦЕПТА ЭТОГО СЛОТА У ЭТОГО КОЛОРВЕЯ — гарментная (деталь не задана). Сверка по
 * `bomItemId`, запасной путь — `bomLineKey`: ровно как это делает таблица слотов
 * (`material-slots.tsx`, `blockersOf`) и вкладка BOM — чтение не всегда отдаёт ключ строки на
 * usage, а FK отдаёт всегда.
 */
export function slotUsageRow(
  colorway: common_AdminColorwayRef | null | undefined,
  slot: Pick<ClothSlot, 'bomItemId' | 'lineKey'>,
): common_TechCardColorwayUsage | undefined {
  const rows = (colorway?.usages ?? []).filter((u) => !isPieceRow(u));
  return (
    rows.find((u) => slot.bomItemId > 0 && wireInt(u.bomItemId) === slot.bomItemId) ??
    (slot.lineKey ? rows.find((u) => (u.bomLineKey ?? '').trim() === slot.lineKey) : undefined)
  );
}

export type SlotUsage = {
  /** Пантон строки рецепта, иначе пантон самого колорвея. Пусто — не назван нигде. */
  pantone: string;
  /** Цвет строки рецепта (слово или hex), иначе экранный hex колорвея (`devHex`). */
  color: string;
  /** Пантон ИМЕННО строки рецепта — чтобы пикер подписал, откуда он. */
  recipePantone: string;
};

/**
 * ЧЕМ КРАСИТ ЭТОТ СЛОТ ЭТОТ КОЛОРВЕЙ, ПО ТОМУ, ЧТО УЖЕ ЗАПИСАНО НА КАРТОЧКЕ. Заготовка, а не
 * решение: экран кладёт её в пикер значением по умолчанию, а человек меняет.
 */
export function slotUsage(
  colorway: common_AdminColorwayRef | null | undefined,
  slot: Pick<ClothSlot, 'bomItemId' | 'lineKey'>,
): SlotUsage {
  const row = slotUsageRow(colorway, slot);
  const recipePantone = (row?.pantone ?? '').trim();
  return {
    pantone: recipePantone || (colorway?.pantone ?? '').trim(),
    color: (row?.color ?? '').trim() || (colorway?.devHex ?? '').trim(),
    recipePantone,
  };
}

/** Раздел «from this card» пантон-пикера: пантон колорвея и пантон строки рецепта, подписанные. */
export function slotSuggestions(
  colorway: common_AdminColorwayRef | null | undefined,
  colorwayName: string,
  slot: Pick<ClothSlot, 'bomItemId' | 'lineKey' | 'name'>,
): { code: string; label: string }[] {
  const out: { code: string; label: string }[] = [];
  const own = (colorway?.pantone ?? '').trim();
  if (own) out.push({ code: own, label: `${colorwayName} · colourway` });
  const recipe = slotUsage(colorway, slot).recipePantone;
  if (recipe) out.push({ code: recipe, label: `${slot.name} · recipe` });
  return out;
}

/* ─────────────────────────── цвет, который уезжает к модели ─────────────────────────── */

/** Цвет свотча на проводе — ровно три поля `params.colour`, которые его несут. */
export type SwatchColour = { code: string; hex: string; words: string };

/** Код без хвоста системы: `18-1664 TCX` и `18-1664` — один цвет, `185 C` и `185` — тоже. */
function codeStem(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/\s+(tcx|tpx|tpg|tn|c|u|m)$/, '')
    .replace(/\s+/g, ' ');
}

/**
 * ═══ ПАНТОН СВОТЧА — КОД, ЭКРАННЫЙ HEX И ИМЯ СЛОВАМИ. ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ПРИБЛИЖЕНИЕ ЕДЕТ ═══
 *
 * Правило этого клиента (`pattern/model.ts` до этого круга, `pantone-swatches.ts`): hex списка
 * пантонов — ЭКРАННОЕ ПРИБЛИЖЕНИЕ, и в платный промпт он не едет, потому что сервер печатает его как
 * «the exact value is #…». ЗДЕСЬ ОНО ЕДЕТ НАМЕРЕННО (ревью, B2): у свотча нет фотографии, которая
 * несла бы цвет, а код пантона для image-модели — текстовый токен, цвета за которым у неё нет.
 * Hex, который модель может покрасить, лучше кода, который она не может прочесть; имя словами
 * («Pantone 18-1664 TCX Fiery Red») называет то же самое третий раз — языком, который она знает.
 *
 * ⚠ ТОЛЬКО ДЛЯ СВОТЧА. Режим «картинка → ткань» цвета не шлёт вовсе, и нигде больше экранный hex
 * списка на провод не попадает.
 *
 * ⚠ HEX БЕРЁТСЯ ТОЛЬКО У ТОГО ЖЕ КОДА. `findPantone` добирает префиксом (`18-16` найдёт первый
 * `18-16…`), и приблизительный цвет ЧУЖОГО пантона уехал бы в промпт как «точный». Совпадение
 * проверяется по коду без хвоста системы; не совпало — едут код и слова, без hex.
 */
export function swatchColour(code: string | null | undefined): SwatchColour | null {
  const c = (code ?? '').trim();
  if (!c) return null;
  const found = findPantone(c);
  const hit = found && codeStem(found.code) === codeStem(c) ? found : undefined;
  return {
    code: c,
    hex: hit?.hex ?? '',
    words: ['Pantone', c, hit?.name ?? ''].filter(Boolean).join(' '),
  };
}

/**
 * ЦВЕТ РЯДА — ТОТ, ЧТО УЕДЕТ ПО НАЖАТИЮ `generate`.
 *
 *   · `pick` задан — это выбор человека, и он главнее всего; `''` — человек СНЯЛ цвет, и тогда
 *     цвета нет вовсе (запасной путь ниже не подставляется за его спиной);
 *   · иначе — пантон рецепта или колорвея (`slotUsage().pantone`);
 *   · иначе — цвет рецепта / экранный hex колорвея (`slotUsage().color`): hex едет значением,
 *     слово — словами. Экран показывает его на месте пикера, так что уезжает ровно видимое.
 */
export function rowColour(pick: string | undefined, usage: SlotUsage): SwatchColour | null {
  if (pick !== undefined) return swatchColour(pick);
  const named = swatchColour(usage.pantone);
  if (named) return named;
  const color = usage.color.trim();
  if (!color) return null;
  const hex = normaliseHex(color);
  return hex ? { code: '', hex, words: '' } : { code: '', hex: '', words: color };
}

/** Есть ли у цвета хоть одно из трёх полей, которыми сервер снимает `no_colour`. */
export function colourIsStated(colour: SwatchColour | null | undefined): colour is SwatchColour {
  return !!colour && !!(colour.code.trim() || colour.hex.trim() || colour.words.trim());
}

/* ─────────────────────────── ворота ─────────────────────────── */

/** Повод полной полки — один на оба прогона шага и на нижнюю половину ячейки IMAGE TO FABRIC. */
export const SHELF_FULL_REASON = `this card already holds its ${ASSETS_PER_CARD_MAX} assets · delete a fabric in LAST FABRICS below first`;

/** Сервер не отвечает на маршруты полосы — одно предложение на все двери шага. */
export const SILENT_SERVER_REASON = 'this server does not answer the design routes';

/** Карточка только для чтения — слово то же, что у общего ряда GENERATE (`render/generate-row`). */
export const READ_ONLY_RUN_REASON =
  'this card is read-only for you — a run spends money, so it is one of the writes that stops here';

/** То же для записей полки и привязок: переименовать, удалить, надеть на слот. */
export const READ_ONLY_SHELF_REASON = 'this card is read-only for you — the fabrics are card data';

/**
 * ВОРОТА СВОТЧА — порядок проверки: сервер, цвет, полка. Все три сервер откажет и сам, бесплатно
 * (`no_colour`, `library_full`), — ворота только не дают нажать заведомо мёртвое.
 *
 * ⚠ ПОЛНАЯ ПОЛКА ТЕПЕРЬ ВОРОТА, А НЕ ПРИМЕЧАНИЕ, и это отмена прежнего правила шага. Раньше
 * упёршийся прогон шёл, оплачивался и падал в «made earlier, not kept», где его подбирала дверь
 * `keep it`. Той полосы больше нет (одна история — карусель), и оплаченная картинка, которой
 * некуда сесть, осталась бы только в ленте прогонов — без привязки и без двери к ней.
 */
export function swatchGate(
  colour: SwatchColour | null | undefined,
  shelfFull: boolean,
  serverSpeaks: boolean,
): Gate {
  if (!serverSpeaks) return { ok: false, reason: SILENT_SERVER_REASON };
  if (!colourIsStated(colour)) {
    return { ok: false, reason: 'a swatch is dyed from a colour · pick a Pantone for this slot' };
  }
  if (shelfFull) return { ok: false, reason: SHELF_FULL_REASON };
  return { ok: true };
}

/**
 * ВОРОТА «КАРТИНКА → ТКАНЬ» — сервер, ровно одна фотография (`one_source_picture` у сервера),
 * полка.
 */
export function imageGate(sourceMediaId: number, shelfFull: boolean, serverSpeaks: boolean): Gate {
  if (!serverSpeaks) return { ok: false, reason: SILENT_SERVER_REASON };
  if (!sourceMediaId || sourceMediaId <= 0) {
    return {
      ok: false,
      reason: 'a fabric is extracted from exactly one photograph · add it to the cell',
    };
  }
  if (shelfFull) return { ok: false, reason: SHELF_FULL_REASON };
  return { ok: true };
}

/* ─────────────────────────── привязки ─────────────────────────── */

/** Ключ пары (колорвей, слот) — один на весь шаг: ячейки, живые прогоны, счётчики. */
export const pairKey = (colorwayId: number, bomItemId: number): string =>
  `${colorwayId}:${bomItemId}`;

/** Пара, для которой запущен прогон. `null` — прогон не для пары (картинка → ткань, легаси). */
export function pairOfRun(run: common_DesignRun): string | null {
  const cw = wireInt(run.params?.colorwayId);
  const bom = wireInt(run.params?.pattern?.bomItemId);
  return cw > 0 && bom > 0 ? pairKey(cw, bom) : null;
}

/** Строка привязки пары. Строка с `assetId = 0` — не ткань (сервер её не держит, но и мы не верим). */
export function bindingOf(
  band: GetDesignBandResponse,
  colorwayId: number,
  bomItemId: number,
): common_DesignAssetBinding | undefined {
  return (band.assetBindings ?? []).find(
    (b) =>
      wireInt(b.colorwayId) === colorwayId &&
      wireInt(b.bomItemId) === bomItemId &&
      wireInt(b.assetId) > 0,
  );
}

/** Ткань пары — ассет привязки, найденный на полке. Нет на полке — нет и ткани. */
export function boundAsset(
  band: GetDesignBandResponse,
  colorwayId: number,
  bomItemId: number,
): common_DesignAsset | undefined {
  const b = bindingOf(band, colorwayId, bomItemId);
  return b ? assetById(band).get(wireInt(b.assetId)) : undefined;
}

/** Все ткани пар сразу, по `pairKey` — чтобы экран не искал полку заново в каждом ряду. */
export function boundAssetsByPair(band: GetDesignBandResponse): Map<string, common_DesignAsset> {
  const byId = assetById(band);
  const out = new Map<string, common_DesignAsset>();
  for (const b of band.assetBindings ?? []) {
    const asset = byId.get(wireInt(b.assetId));
    if (!asset) continue;
    out.set(pairKey(wireInt(b.colorwayId), wireInt(b.bomItemId)), asset);
  }
  return out;
}

/**
 * ТКАНИ КОЛОРВЕЯ ПО ЕГО СЛОТАМ — то, чем засевается подача FABRIC RENDER (B6). Только слоты из
 * списка (сохранённые строки рулонного товара этой формы) и только ассеты, стоящие на полке; в
 * порядке слотов, чтобы «CLOTH 1» промпта была основной тканью, а не последней привязанной.
 */
export function bindingsOf(
  band: GetDesignBandResponse,
  colorwayId: number,
  slots: readonly ClothSlot[],
): { slot: ClothSlot; asset: common_DesignAsset }[] {
  const byPair = boundAssetsByPair(band);
  const out: { slot: ClothSlot; asset: common_DesignAsset }[] = [];
  for (const slot of slots) {
    const asset = byPair.get(pairKey(colorwayId, slot.bomItemId));
    if (asset) out.push({ slot, asset });
  }
  return out;
}

/** Пары, которые носят этот ассет, — для ярлыка плитки карусели и вопроса перед удалением. */
export function pairsOfAsset(
  band: GetDesignBandResponse,
  assetId: number,
): { colorwayId: number; bomItemId: number }[] {
  if (assetId <= 0) return [];
  return (band.assetBindings ?? [])
    .filter((b) => wireInt(b.assetId) === assetId)
    .map((b) => ({ colorwayId: wireInt(b.colorwayId), bomItemId: wireInt(b.bomItemId) }));
}

/* ─────────────────────────── карусель ─────────────────────────── */

/**
 * ПОСЛЕДНИЕ ТКАНИ КАРТОЧКИ — полка `fabric` + `pattern` (`clothShelf`, то же определение «ткани»,
 * что у сетки CLOTHS рендера), новейшие первыми. «Новее» — по `id`: строка полки заводится
 * вставкой, и больший ключ — это более поздняя вставка на любом бинаре, тогда как `createdAt`
 * старый бинарь мог не прислать.
 */
export function recentFabrics(band: GetDesignBandResponse, max = 12): common_DesignAsset[] {
  return [...clothShelf(band)].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, max);
}

/* ─────────────────────────── имена ─────────────────────────── */

/**
 * ═══ ИМЕНА МИНТЯТСЯ, А НЕ НАБИРАЮТСЯ (D5) ════════════════════════════════════════════════════
 *
 * Поля NAME на шаге больше нет: свотч слота называется `<колорвей> · <слот>`, двойник без
 * регистра получает ` 2`, ` 3`, всё вместе не длиннее колонки (`ASSET_NAME_MAX`). Переименовать —
 * на плитке карусели.
 *
 * ⚠ ЗАНЯТЫМ СЧИТАЕТСЯ ТОЛЬКО ИМЯ НА ПОЛКЕ, А НЕ ИМЯ ЖИВОГО ПРОГОНА, И ЭТО ПРО ДЕНЬГИ. Имя входит
 * в отпечаток прогона (`useStartDesignRun`): прогон, чей ответ потерялся в сети, появляется в полосе
 * ЖИВЫМ, и учти мы его имя — повторное нажатие намятило бы ` 2`, отпечаток бы сменился, и сервер
 * честно купил бы вторую картинку вместо того, чтобы вернуть первую. Полка же меняется только
 * ПОСЛЕ посадки, то есть тогда, когда новое нажатие и правда новое намерение.
 */
export function mintSlotName(
  band: GetDesignBandResponse,
  colorwayName: string,
  slotName: string,
): string {
  const base = [colorwayName.trim(), slotName.trim()].filter(Boolean).join(' · ') || 'swatch';
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    const suffix = n === 1 ? '' : ` ${n}`;
    const name = `${Array.from(base)
      .slice(0, ASSET_NAME_MAX - suffix.length)
      .join('')
      .trimEnd()}${suffix}`;
    if (!patternTwin(band, name)) return name;
  }
  return Array.from(base).slice(0, ASSET_NAME_MAX).join('');
}

/** `fabric N` — первое свободное на всей полке (имя, занятое любой строкой, не переиспользуется). */
export function mintFabricName(band: GetDesignBandResponse): string {
  const taken = new Set(
    (band.assets ?? []).map((a) => (a.name ?? '').trim().toLowerCase()).filter(Boolean),
  );
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    if (!taken.has(`fabric ${n}`)) return `fabric ${n}`;
  }
  return `fabric ${(band.assets ?? []).length + 1}`;
}
