import { adminService } from 'api/api';
import { extractFieldViolations } from 'utils/field-errors';
import { UNSET_PURPOSE } from './bom-purpose';

// ИНДЕКС РАЗМЕРОВ ВЫКРОЕК (Ф6.3) — публикация того, что кнопка «⌕ размеры в файлах» уже посчитала.
//
// Разбор DXF живёт и остаётся ТОЛЬКО здесь, в браузере: сервер файлы не парсит и парсить не будет.
// Без этой публикации у серверного гейта нет вообще никакого честного ответа на вопрос «есть ли
// выкройка на этот размер» — tech_card_size_pattern.size_id это АРТЕФАКТ ХРАНЕНИЯ (все листы
// карточки лежат под наименьшим размером ряда), поэтому проверка `sizes_in_dxf` читается UNKNOWN,
// пока сюда никто не нажал.
//
// Единица — СКОУП, а не лист, и это не вкусовщина: deriveBlockSizes НЕ ПОКОМПОНЕНТНА (порог «у
// основы имени ≥2 размерных хвоста» + частотный порог по всем основам), поэтому токены, посчитанные
// по каждому файлу отдельно, дают ДРУГОЙ ответ, чем по группе, а односоразмерный файл не даёт ни
// одного токена. Хранить по листу значило бы разойтись с кнопкой молча.

// НАЗВАНИЕ СКОУПА ТАК, КАК ЕГО ПИШЕТ СЕРВЕР.
//
// Клиент и сервер пишут назначение РАЗНЫМИ СЛОВАМИ: здесь это имя proto-энума
// («TECH_CARD_BOM_PURPOSE_MAIN»), в базе — строчное значение («main»), и bom-purpose.ts прямо
// говорит, что ключи различаются, а совпадает только РАЗБИЕНИЕ. Для группировки на экране этого
// достаточно; для этого RPC — нет: сервер сам собирает состав скоупа через entity.FabricScopeKey по
// СВОИМ строкам, и ключ, написанный не тем словом, не найдёт ни одного листа.
//
// Правило механическое (снять префикс, опустить регистр) и потому переживает новое назначение:
// все восемь сегодняшних значений — ровно строчный суффикс своего энума. Если конвенция когда-то
// нарушится, сервер ответит отказом «в этом скоупе нет листов», а не запишет чужой индекс: опасное
// направление здесь закрыто тем, что отпечаток набора листов считает СЕРВЕР.
const PURPOSE_PREFIX = 'TECH_CARD_BOM_PURPOSE_';

export function wireFabricPurpose(enumValue?: string): string {
  const v = (enumValue ?? '').trim();
  if (!v || v === UNSET_PURPOSE) return '';
  return (v.startsWith(PURPOSE_PREFIX) ? v.slice(PURPOSE_PREFIX.length) : v).toLowerCase();
}

/**
 * Ключ скоупа ОДНОГО ЛИСТА так, как его вычислит сервер: назначение, иначе строка BOM.
 *
 * Здесь СЫРОЕ поле, без разрешения через сегодняшний BOM. Это осознанно: серверный
 * `entity.FabricScopeKey(sh.fabric_purpose, sh.bom_line_key)` тоже сырой, а разрешение «лист привязан
 * к строке L, L потом разложили в назначение P» живёт только в отображении панели. Подставить сюда
 * разрешённый ключ значило бы назвать скоуп словом, под которым сервер этот лист не хранит.
 */
export function serverScopeKeyOfSheet(row: { fabricPurpose?: string; bomLineKey?: string }): string {
  const p = wireFabricPurpose(row.fabricPurpose);
  if (p) return p;
  return (row.bomLineKey ?? '').trim();
}

export type PublishSizeIndexResult =
  | { ok: true; resolvedSizeCount: number; tokenCount: number }
  | { ok: false; reason: string };

/**
 * Публикует размерные токены одного скоупа.
 *
 * Возвращает результат, а не бросает: индекс — ПОБОЧНАЯ ПОЛЬЗА аудита. Панель уже показала свой
 * ответ, и сорванная публикация не имеет права ни отменить его, ни выглядеть как провал проверки.
 *
 * Пустой набор токенов — ЗАКОННЫЙ вход и записывается как есть: «файлы не несут размерного
 * кодирования» это ОТВЕТ (один размер на файл не даёт ни одного токена), и не записать его значило
 * бы оставить гейт вечно говорящим «никто не проверял» на карточке, где проверку запускали.
 */
export async function publishPatternSizeIndex(input: {
  techCardId: number;
  /** Листы скоупа, как их видит панель: сырая привязка + стабильный line_key строки выкройки. */
  sheets: { lineKey?: string; fabricPurpose?: string; bomLineKey?: string }[];
  /** Нормализованные токены, посчитанные splitPiecesBySize по ВСЕМУ набору листов сразу. */
  sizeTokens: string[];
}): Promise<PublishSizeIndexResult> {
  const { techCardId, sheets, sizeTokens } = input;
  if (!techCardId) return { ok: false, reason: "the card isn't saved yet" };
  if (sheets.length === 0) return { ok: false, reason: 'no sheets in this scope' };

  // Один вызов = один скоуп. Панель группирует по РАЗРЕШЁННОМУ скоупу, и на полуразобранной
  // карточке одна группа законно объединяет несколько серверных скоупов (лист лежит на строке,
  // строку уже разложили в назначение). Публиковать такой пул под одним ключом нельзя ни в какую
  // сторону: под ключом назначения сервер не найдёт листы, привязанные к строке, а под ключом
  // строки токены пула ПЕРЕОЦЕНИЛИ бы покрытие подмножества файлов — ровно та подделка, ради
  // которой отпечаток считает сервер. Молчим и говорим почему.
  const keys = new Set(sheets.map(serverScopeKeyOfSheet));
  if (keys.size !== 1) {
    return {
      ok: false,
      reason:
        'the sheets in this group are bound differently (some to a purpose, some to a BOM line): bind them all to a purpose and the index will save',
    };
  }
  const scopeKey = [...keys][0];
  if (!scopeKey) return { ok: false, reason: 'the sheets are bound to nothing' };

  const sheetLineKeys = sheets.map((s) => (s.lineKey ?? '').trim()).filter(Boolean);
  if (sheetLineKeys.length !== sheets.length) {
    return { ok: false, reason: 'some sheets have no identifier — save the card' };
  }

  try {
    const res = await adminService.PutTechCardPatternSizeIndex({
      techCardId,
      scopeKey,
      sheetLineKeys,
      sizeTokens,
    });
    return {
      ok: true,
      resolvedSizeCount: res.resolvedSizeCount ?? 0,
      tokenCount: sizeTokens.length,
    };
  } catch (e) {
    // Сервер сверяет присланный список листов со СВОИМ составом скоупа и отвергает расхождение в
    // ОБЕ стороны. Самая частая причина расхождения бытовая: файл только что залили, а карточку ещё
    // не сохранили — на сервере этого листа просто нет. Скажем это словами, а не кодом причины.
    const v = extractFieldViolations(e);
    const stale = v.some(
      (x) =>
        x.description.startsWith('sheet_set_mismatch') ||
        x.description.startsWith('scope_has_no_sheets'),
    );
    if (stale) {
      return {
        ok: false,
        reason: 'the server has a different set of sheets — save the card and retry the check',
      };
    }
    return { ok: false, reason: e instanceof Error ? e.message : "the server didn't accept the index" };
  }
}
