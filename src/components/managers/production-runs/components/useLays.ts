import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_MaterialUnit,
  common_ProductionLayActualMethod,
  common_ProductionLayCheck,
  common_ProductionLayCheckStatus,
  common_ProductionRunLayInsert,
  common_TechCardMarkerInsert,
} from 'api/proto-http/admin';
import { productionRunKeys, updateRunErrorMessage } from './useProductionRuns';

// План настилов прогона (Ф4). Ключ живёт ПОД detail(runId) — по образцу useMaterialPlan
// (useProductionRuns.ts:115-121) — так что всё, что уже инвалидирует детальную страницу
// (приёмка, реверс, выдача материалов), заодно освежает и настилы.
export const layKeys = {
  list: (runId: number) => [...productionRunKeys.detail(runId), 'lays'] as const,
};

export function useRunLays(runId: number, enabled: boolean) {
  return useQuery({
    queryKey: layKeys.list(runId),
    queryFn: () => adminService.ListProductionRunLays({ runId }),
    enabled,
  });
}

// Радиус поражения записи настила — ровно три ключа, и каждый назван вслух.
//
// detail(runId) СЕЙЧАС является префиксом двух других (React Query матчит ключи по префиксу), то
// есть одного вызова хватило бы. Три перечислены явно не для повтора, а чтобы сужение detail() в
// будущем — или переезд плана материалов на собственный корень — не уронило инвалидацию молча:
//   lays         — сохранённый настил вернулся с новым lock_version, снимком и чеками;
//   materialPlan — потребность пары (колорвей, слот) переключилась NORM → LAYS (§7.3), то есть
//                  таблица «нужные материалы» показывает другие числа, чем секунду назад;
//   detail       — статус/актуалы прогона читаются рядом на той же странице.
function invalidateLayWrite(
  qc: ReturnType<typeof useQueryClient>,
  runId: number,
) {
  qc.invalidateQueries({ queryKey: layKeys.list(runId) });
  qc.invalidateQueries({ queryKey: [...productionRunKeys.detail(runId), 'materialPlan'] });
  qc.invalidateQueries({ queryKey: productionRunKeys.detail(runId) });
}

// Сохранение ОДНОГО настила. `expectedLockVersion` — PRESENCE, А НЕ ВЕЛИЧИНА (§3.2): у
// существующего настила отсутствие поля это ОТКАЗ, а не last-write-wins, поэтому на правке версия
// обязана быть числом, а на создании — именно `undefined`. Здесь она необязательна в типе, и это
// единственное место во всём модуле, где 0 не означает «выключить блокировку».
export type SaveLayInput = {
  runId: number;
  lay: common_ProductionRunLayInsert;
  expectedLockVersion?: number;
  reaffirmQuantities: boolean;
};

export function useSaveLay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveLayInput) =>
      adminService.SaveProductionRunLay({
        runId: input.runId,
        lay: input.lay,
        expectedLockVersion: input.expectedLockVersion,
        reaffirmQuantities: input.reaffirmQuantities,
      }),
    onSuccess: (_d, v) => invalidateLayWrite(qc, v.runId),
    // Отказ (409/412) оставляет экран на версии, которую сервер только что отверг — перечитываем и
    // на ошибке тоже, тем же приёмом, что useUpdateRunSection (useProductionRuns.ts:51-54).
    onError: (_e, v) => invalidateLayWrite(qc, v.runId),
  });
}

export function useDeleteLay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runId: number; layKey: string }) =>
      adminService.DeleteProductionRunLay({ runId: input.runId, layKey: input.layKey }),
    onSuccess: (_d, v) => invalidateLayWrite(qc, v.runId),
  });
}

// КОПИЯ маркера в прогон (§5.5). Секция настила не может ссылаться на карточный маркер — это
// решение, а не ограничение: раскройный маркер фиксирует условия ЭТОГО прогона и умирает вместе с
// ним по FK CASCADE, тогда как ссылка на норму молча пересняла бы условия при следующей пересъёмке.
// Цена названа в спеке: один клик и дубликат блоба.
//
// Делается двумя существующими RPC без единой правки в tech-card: читаем исходный маркер целиком
// (GetTechCardMarker отдаёт summary + layout) и записываем его обратно с `production_run_id`.
// Имя несёт номер прогона, потому что уникальность имени маркера — по (карточка, size_key, run_key)
// (§14 п.1): без суффикса копия нормы в ПЕРВЫЙ прогон ещё пройдёт, а во второй уже нет.
export function useCopyMarkerToRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: number; techCardId: number; sourceMarkerId: number }) => {
      const src = await adminService.GetTechCardMarker({ id: input.sourceMarkerId });
      const s = src.marker?.summary;
      const layout = src.marker?.layout;
      if (!s || !layout) throw new Error('Исходная раскладка не читается — копировать нечего');
      // Каждое поле передаётся ЯВНО, включая undefined: генерированные типы запроса не
      // опциональны (§14 п.15), и пропуск поля здесь — ошибка компиляции, а не «поле по умолчанию».
      const marker: common_TechCardMarkerInsert = {
        // Копия УЖЕ СОХРАНЁННОЙ раскладки в прогон: она полная по построению (неполную сервер не
        // принял бы), и согласие на черновик к копированию отношения не имеет.
        isDraft: false,
        sizeId: s.sizeId,
        name: `${(s.name ?? 'раскладка').trim()} · PR-${input.runId}`,
        source: s.source,
        bomLineKey: s.bomLineKey,
        fabricWidthCm: s.fabricWidthCm,
        gapCm: s.gapCm,
        edgeMarginCm: s.edgeMarginCm,
        allowCrossGrain: s.allowCrossGrain,
        sets: s.sets,
        usedLengthCm: s.usedLengthCm,
        efficiencyPct: s.efficiencyPct,
        placedCount: s.placedCount,
        totalCount: s.totalCount,
        layout,
        selvedgeCm: s.selvedgeCm,
        colorwayId: s.colorwayId,
        seamAllowanceMm: s.seamAllowanceMm,
        contourAllowanceMm: s.contourAllowanceMm,
        contourLayer: s.contourLayer,
        grainLayer: s.grainLayer,
        allowFlip: s.allowFlip,
        // Собственно смысл всей операции. НЕИЗМЕНЯЕМО после создания — поэтому копия, а не правка.
        productionRunId: input.runId,
      };
      return adminService.SaveTechCardMarker({ id: 0, techCardId: input.techCardId, marker });
    },
    // Список раскройных маркеров прогона едет внутри ListProductionRunLays.run_markers — то есть
    // новый маркер виден только после инвалидации ЭТОГО ключа.
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: layKeys.list(v.runId) });
    },
  });
}

// Отказы записи настила.
//
// 409 отдаёт ДОСЛОВНО ту же копию, что прогон (`updateRunErrorMessage`): «изменено в другом окне —
// обновите страницу» — один факт, одно предложение, независимо от того, чья версия разошлась.
// 400/412 — это отказавшая проверка годности (`lay_marker_scope`, `lay_mode_parity`) или
// терминальный статус прогона; их текст сервер пишет для оператора, поэтому он идёт как есть.
export function layErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  const msg = e instanceof Error ? e.message : '';
  if (status === 409) return updateRunErrorMessage(e);
  if (status === 400 || status === 412) return msg || 'Настил не принят в текущем состоянии партии';
  if (status === 404) return 'Настил не найден — возможно, он уже удалён';
  return msg || 'Не удалось сохранить настил';
}

// ─────────────────────────────────────────────────────────────────────────────
// СЛОВАРЬ ТРЁХЗНАЧНОГО СТАТУСА — один на все три места, где Ф4 показывает вердикт
// (клетка покрытия, список проверок настила, высота стопки).
//
// UNKNOWN — не «ок» и не «плохо», а СВОЯ категория со своим словом и серым тоном: «не смогли
// проверить» и «проверили, всё хорошо» — разные предложения, и прото говорит это прямым текстом
// (common_ProductionLayCheckStatus). Клетка, у которой не сошлась атрибуция детали, обязана
// читаться иначе, чем клетка, где ткань действительно не раскроена; «толщина ткани не задана» —
// это UNKNOWN, а не «0 см, влезает». Отсюда четыре разных глифа и четыре разных слова, а не
// «зелёное / красное».
export type LayVerdict = 'ok' | 'warning' | 'blocker' | 'unknown';

export function layVerdict(status?: common_ProductionLayCheckStatus): LayVerdict {
  switch (status) {
    case 'PRODUCTION_LAY_CHECK_STATUS_OK':
      return 'ok';
    case 'PRODUCTION_LAY_CHECK_STATUS_WARNING':
      return 'warning';
    case 'PRODUCTION_LAY_CHECK_STATUS_BLOCKER':
      return 'blocker';
    // UNSPECIFIED сюда попадает вместе с UNKNOWN осознанно: статус, которого клиент не знает, —
    // это ровно «не смогли проверить», и молча зачесть его за OK было бы худшим из вариантов.
    default:
      return 'unknown';
  }
}

export const VERDICT_GLYPH: Record<LayVerdict, string> = {
  ok: '✓',
  warning: '⚠',
  blocker: '✗',
  unknown: '?',
};

// Тон текста. `warning` в этой системе СИНИЙ (mid-flight, нужен человек) и его нельзя «поправить»
// на янтарный; `unknown` — labelColor, единственный читаемый серый, а не textInactiveColor.
export const VERDICT_TEXT: Record<LayVerdict, string> = {
  ok: '',
  warning: 'text-warning',
  blocker: 'text-error',
  unknown: 'text-labelColor',
};

// Тон пилла из словаря ui/components/pill.tsx: ok=зелёный, warn=красный, attention=синий
// («changed, stale», mid-flight), mut=серый.
export const VERDICT_PILL: Record<LayVerdict, 'ok' | 'warn' | 'attention' | 'mut'> = {
  ok: 'ok',
  warning: 'attention',
  blocker: 'warn',
  unknown: 'mut',
};

// Худший вердикт набора проверок, в порядке blocker > warning > unknown > ok.
//
// UNKNOWN стоит НИЖЕ warning, но выше ok — и это единственное место, где порядок надо объяснить:
// «не проверено» не может перебить измеренный факт, требующий решения, но обязано перебить «всё
// хорошо». Проглатывания при этом не происходит: список проверок под шапкой всегда полный, и
// каждая непроверенная строка стоит там со своим глифом и своей причиной.
export function worstVerdict(checks: common_ProductionLayCheck[]): LayVerdict {
  const set = new Set(checks.map((c) => layVerdict(c.status)));
  if (set.has('blocker')) return 'blocker';
  if (set.has('warning')) return 'warning';
  if (set.has('unknown')) return 'unknown';
  return 'ok';
}

// ВСЕ проверки настила, из ОБОИХ мест провода.
//
// Проверок одиннадцать, но лежат они не в одном поле: семь про настил целиком приезжают в
// `lay.checks`, а четыре про КОНКРЕТНЫЙ маркер — `lay_marker_scope`, `lay_marker_width`,
// `lay_lot_width` (Ф5б.1, Р8) и `lay_mirror_expansion` — в `lay.sections[].checks`. Вердикт,
// посчитанный по одному только `lay.checks`, молча теряет четыре из одиннадцати, в том числе
// ЗАПРЕТ «маркер шире рулона»: настил, который физически не выкроить, показывал бы «годен».
export function allLayChecks(lay: {
  checks?: common_ProductionLayCheck[];
  sections?: { checks?: common_ProductionLayCheck[] }[];
}): common_ProductionLayCheck[] {
  return [...(lay.checks ?? []), ...(lay.sections ?? []).flatMap((s) => s.checks ?? [])];
}

export const VERDICT_WORD: Record<LayVerdict, string> = {
  ok: 'годен',
  warning: 'с оговорками',
  blocker: 'не годен',
  unknown: 'не проверен',
};

// ─────────────────────────────────────────────────────────────────────────────
// ЛОТ И ФАКТ РАСХОДА (Ф5б.1 / Ф5б.2) — словарь на карточку и на редактор сразу.

// Подпись серверной отметки времени: «08 авг, 14:30». Пусто на отсутствующей и на неразбираемой —
// «замера нет» обязано выглядеть как отсутствие, а не как эпоха.
//
// Живёт ЗДЕСЬ, а не в lay-card, потому что читателей у неё трое и один из них — карточка артикула
// (панель предложения коэффициента). Тянуть ради десяти строк форматирования целый компонент
// настила в чанк склада значило бы связать два экрана тем, что к ним обоим отношения не имеет.
export function stampWhen(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Единица факта. Словарь ЗАКРЫТ проводом (MaterialUnit), а не колонкой, поэтому здесь ровно
// столько строк, сколько значений в перечислении, и Record<> ловит появление нового значения
// ошибкой компиляции, а не пустой ячейкой на экране.
export const MATERIAL_UNIT_LABEL: Record<common_MaterialUnit, string> = {
  // UNKNOWN — это «единицу не распознали», а НЕ «единицы нет»: прото говорит прямым текстом, что
  // клиент не имеет права читать её как отсутствие. Поэтому у неё своя подпись, и в выбор она не
  // попадает (см. FACT_UNIT_OPTIONS) — выбрать «не распознано» нельзя, это ответ сервера, а не
  // намерение человека.
  MATERIAL_UNIT_UNKNOWN: 'единица не распознана',
  MATERIAL_UNIT_M: 'м',
  MATERIAL_UNIT_CM: 'см',
  MATERIAL_UNIT_MM: 'мм',
  MATERIAL_UNIT_M2: 'м²',
  MATERIAL_UNIT_G: 'г',
  MATERIAL_UNIT_KG: 'кг',
  MATERIAL_UNIT_PCS: 'шт',
  MATERIAL_UNIT_PAIR: 'пара',
  MATERIAL_UNIT_SET: 'компл.',
  MATERIAL_UNIT_CONE: 'конус',
  MATERIAL_UNIT_ROLL: 'рулон',
};

// Что можно ВЫБРАТЬ в форме факта: весь словарь, кроме UNKNOWN.
//
// Список НЕ сужен до «метров и килограммов», хотя настил бывает только из рулонных слотов. Единица
// факта обязана сводиться с единицей артикула — иначе дрейф не считается вовсе, — а единица
// артикула здесь неизвестна: по проводу на настиле её нет. Отрезать «лишние» значения значило бы
// запретить цеху назвать факт в той единице, в которой этот артикул на складе и лежит.
export const FACT_UNIT_OPTIONS: common_MaterialUnit[] = [
  'MATERIAL_UNIT_M',
  'MATERIAL_UNIT_CM',
  'MATERIAL_UNIT_MM',
  'MATERIAL_UNIT_M2',
  'MATERIAL_UNIT_KG',
  'MATERIAL_UNIT_G',
  'MATERIAL_UNIT_PCS',
  'MATERIAL_UNIT_PAIR',
  'MATERIAL_UNIT_SET',
  'MATERIAL_UNIT_CONE',
  'MATERIAL_UNIT_ROLL',
];

// ЧЕМ замеряли. Метод едет рядом с числом, а не подразумевается: два метода врут по-разному —
// рулон до/после наследует ошибку измерения остатка и не видит ушедшего в обрезки, а взвешивание
// переводится в метры через плотность и ширину и потому чувствительно к обеим.
export const LAY_ACTUAL_METHOD_LABEL: Record<common_ProductionLayActualMethod, string> = {
  PRODUCTION_LAY_ACTUAL_METHOD_UNSPECIFIED: 'метод не назван',
  PRODUCTION_LAY_ACTUAL_METHOD_ROLL_BEFORE_AFTER: 'замер рулона до/после',
  PRODUCTION_LAY_ACTUAL_METHOD_WEIGHED: 'взвешивание',
};

export const LAY_ACTUAL_METHODS: common_ProductionLayActualMethod[] = [
  'PRODUCTION_LAY_ACTUAL_METHOD_ROLL_BEFORE_AFTER',
  'PRODUCTION_LAY_ACTUAL_METHOD_WEIGHED',
];

// СОСТОЯНИЕ ЛОТА — ТРИ, А НЕ ДВА.
//
//   named    — обе половины на месте, обычный случай;
//   detached — lot_id пуст при НЕПУСТОМ lot_code: рулон удалён из складского справочника
//              (fk_prlay_lot стоит на SET NULL), но настил всё ещё НАЗЫВАЕТ то, что взял. Это
//              история, и переписывать её нечем;
//   none     — рулон просто не назвали. Незаполненное поле, а не история.
//
// Разница между вторым и третьим — единственное, ради чего снимок кода вообще NOT NULL; читаться
// они обязаны по-разному, иначе снимок оплачен зря.
export type LayLotState = 'named' | 'detached' | 'none';

export function layLotState(lay: { lotId?: number; lotCode?: string }): LayLotState {
  if ((lay.lotId ?? 0) > 0) return 'named';
  return (lay.lotCode ?? '').trim() ? 'detached' : 'none';
}

// Есть ли факт. Факт — это КОЛИЧЕСТВО: единица и метод без числа это наполовину заполненная форма
// (импликация односторонняя), и показывать её как факт значило бы объявить замер там, где его нет.
export function layActualQty(lay: { actualQty?: { value?: string } }): string {
  const raw = (lay.actualQty?.value ?? '').trim();
  return raw && Number.isFinite(Number(raw)) ? raw : '';
}
