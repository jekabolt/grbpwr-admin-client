// ПРОДОЛЖЕНИЕ ПЕР-РАЗМЕРНОГО РАСХОДА НА ВЕСЬ РАЗМЕРНЫЙ РЯД (Ф2.4, вторая половина).
//
// Сервер поделил измеренную длину настила между размерами ЕГО СОСТАВА по занимаемой площади:
//
//     расход(s) = a_s · k,   k = L / Σ_j (q_j · a_j)
//
// и опубликовал на каждой строке состава оба сомножителя — свой расход и свою площадь a_s. Дальше
// он остановился, и остановился не из лени: 03-composition.md хочет, чтобы ОДНА раскладка честно
// нормировала весь ряд, включая размеры, которых в составе не было («площади градуированных
// деталей известны из файлов БЕЗ маркера»), а сервер DXF не разбирает никогда и в блобе видит
// детали только тех размеров, которые состав кроит. Продолжить формулу может только тот, кто умеет
// читать выкройки, — то есть этот клиент.
//
// ЧТО ИМЕННО ПРОДОЛЖАЕТСЯ. Константа k — не выдумка клиента: она собирается из того, что сервер
// уже прислал (каждая a_j, каждое q_j и длина настила). Клиенту остаётся ОДНО число — a_s размера,
// которого в составе нет, — и берётся оно из тех же выкроек тем же правилом: градуированные детали
// этого размера плюс ПОЛНЫЙ набор неградуируемых, каждая × своё количество на изделие.
//
// ПОЧЕМУ КЛИЕНТСКИЕ ПЛОЩАДИ СНАЧАЛА СВЕРЯЮТСЯ. Файлы живут своей жизнью: лекальщик перезалил лист,
// поправил деталь, поменял слой. Раскладка при этом осталась прежней — её длина измерена по
// ПРЕЖНЕЙ геометрии, — и продолжать её константой по НОВЫМ файлам значит выдать число, которое ни
// к чему не относится. Проверить это можно бесплатно и в лоб: посчитать по сегодняшним файлам те
// площади, которые сервер уже прислал, и сравнить. Расхождение сверх допуска — не повод округлить,
// а повод сказать «продолжать нельзя» и назвать почему. Тот же приём, которым marker-rebuild.ts
// доказывает, что сегодняшняя выкройка — та же самая, только там сверяются точки контура, а здесь
// площадь: продолжение опирается на площадь, значит проверяться обязана она.
//
// СРЕДНЕЕ ОСТАЁТСЯ ТОЛЬКО ТАМ, ГДЕ ФАЙЛОВ НЕТ ВОВСЕ, и обязано быть НАЗВАНО на экране. Это ровно то
// число, которое вся подсистема отказывается отдавать скаляром (оно завышает мелкие размеры и
// занижает крупные), и молчаливая подстановка его в рецепт — единственная ошибка, которую здесь
// нельзя допустить. Поэтому у каждой строки плана есть ПРОИСХОЖДЕНИЕ, и «среднее» — отдельное
// значение, а не пробел.
import type { common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { consumptionForSize, decNum, sizeNormsOf, totalUnitsOf } from './marker-io';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── БАЗИС ПРОДОЛЖЕНИЯ ───────────────────────────────────────────────────────────────────

export type ContinuationBasis = {
  /** k = L / Σ q·a, см длины настила на см² площади изделий. */
  cmPerCm2: number;
  /** a_s сервера по размерам ЕГО состава — то, против чего сверяются клиентские площади. */
  areaBySize: Map<number, number>;
  /** Σ q·a, см² — площадь всего, что укладывает настил. */
  totalAreaCm2: number;
  usedLengthCm: number;
};

// Базис продолжения раскладки. null = продолжать нечем, и это ответ.
//
// Требуется ПОЛНЫЙ набор площадей: знаменатель, в котором не хватает площади одного размера,
// меньше настоящего, а меньший знаменатель ЗАВЫШАЕТ норму каждого размера, выведенного из него, —
// молча и в дорогую сторону. Ровно поэтому сервер пишет площади «все строки или ни одной»
// (entity.WithMarkerSizeAreas), и читатель обязан сохранить это правило, а не переоткрыть его.
export function continuationBasisOf(s: common_TechCardMarkerSummary): ContinuationBasis | null {
  const rows = sizeNormsOf(s);
  if (rows.length === 0) return null;
  const used = decNum(s.usedLengthCm);
  if (!(used > 0)) return null;
  const areaBySize = new Map<number, number>();
  let total = 0;
  for (const r of rows) {
    if (r.areaCm2 == null || r.quantity < 1) return null;
    areaBySize.set(r.sizeId, r.areaCm2);
    total += r.quantity * r.areaCm2;
  }
  if (!(total > 0)) return null;
  const cmPerCm2 = used / total;
  // САМОПРОВЕРКА КОНСТАНТЫ. Сервер прислал и расход, и площадь; если k, собранная из площадей, не
  // воспроизводит присланные расходы, то две половины строки состава выведены из разных данных —
  // и продолжать такой константой нельзя, каким бы правдоподобным ни выглядел результат. Допуск —
  // шаг публикации расхода (сотые сантиметра) плюс машинная погрешность деления.
  for (const r of rows) {
    if (r.consumptionCm == null) continue;
    if (Math.abs(r.consumptionCm - r.areaCm2! * cmPerCm2) > 0.005 + 1e-6 * Math.max(1, used)) {
      return null;
    }
  }
  return { cmPerCm2, areaBySize, totalAreaCm2: total, usedLengthCm: used };
}

// ── СВЕРКА КЛИЕНТСКИХ ПЛОЩАДЕЙ С СЕРВЕРНЫМИ ─────────────────────────────────────────────

// ДОПУСК — БЮДЖЕТ ОКРУГЛЕНИЯ, А НЕ «чтобы не придиралось».
//
// Абсолютная часть: блоб хранит площадь каждой детали с двумя знаками (buildMarkerLayout: r2), а
// сервер ещё раз округляет до двух саму a_s (MarkerAreaScale = 2). На изделии из полусотни
// экземпляров это даёт не больше нескольких десятых см² — 0.5 см² покрывает это с запасом и на
// изделии в 20 000 см² составляет 0.0025 %.
//
// Относительная часть: она и есть настоящий детектор. Соседние размеры градации отличаются по
// площади на 4–6 %, правка одной детали — на доли процента; 0.5 % проходит между «те же файлы» и
// «файлы поменяли», и ослаблять его нельзя — послабление здесь не «терпимость к дребезгу», а
// разрешение продолжить норму по чужой геометрии.
export const AREA_ABS_TOL_CM2 = 0.5;
export const AREA_REL_TOL = 0.005;
export const areaToleranceCm2 = (serverCm2: number): number =>
  Math.max(AREA_ABS_TOL_CM2, AREA_REL_TOL * Math.abs(serverCm2));

export type AreaComparison = {
  sizeId: number;
  serverCm2: number;
  clientCm2: number;
  deltaCm2: number;
  /** |Δ| / серверная площадь, доля. */
  relative: number;
  within: boolean;
};

export type AreaCheck = {
  ok: boolean;
  rows: AreaComparison[];
  /** Непустая строка — почему продолжать нельзя, словами для экрана. */
  reason: string;
};

// Сверка площадей, посчитанных клиентом по сегодняшним выкройкам, с теми, что раскладка записала.
//
// НИ ОДНОГО ОБЩЕГО РАЗМЕРА — ЭТО ПРОВАЛ, а не «нечего проверять». Клиентские площади без единой
// точки соприкосновения с серверными нефальсифицируемы: ни то, что разобран тот же файл, ни то,
// что применены те же условия съёмки, ни то, что количество деталей на изделие взято верно, —
// ничего из этого не доказано, а продолжение опирается на всё три сразу.
export function checkClientAreas(
  basis: ContinuationBasis,
  clientAreas: ReadonlyMap<number, number>,
): AreaCheck {
  const rows: AreaComparison[] = [];
  for (const [sizeId, serverCm2] of basis.areaBySize) {
    const clientCm2 = clientAreas.get(sizeId);
    if (clientCm2 == null || !(clientCm2 > 0)) continue;
    const deltaCm2 = clientCm2 - serverCm2;
    rows.push({
      sizeId,
      serverCm2,
      clientCm2,
      deltaCm2,
      relative: Math.abs(deltaCm2) / serverCm2,
      within: Math.abs(deltaCm2) <= areaToleranceCm2(serverCm2),
    });
  }
  if (rows.length === 0) {
    return {
      ok: false,
      rows,
      reason:
        'ни один размер состава раскладки не удалось посчитать по сегодняшним выкройкам — сверить площади не с чем, а непроверенная площадь продолжения не основание',
    };
  }
  const off = rows.filter((r) => !r.within);
  if (off.length > 0) {
    const worst = off.reduce((a, b) => (Math.abs(b.deltaCm2) > Math.abs(a.deltaCm2) ? b : a));
    return {
      ok: false,
      rows,
      reason: `площади по сегодняшним выкройкам разошлись с записанными в раскладке (максимум ${worst.clientCm2.toFixed(
        1,
      )} против ${worst.serverCm2.toFixed(1)} см², ${(worst.relative * 100).toFixed(
        1,
      )}%) — выкройки менялись после съёмки, и продолжать норму по ним нельзя: длина измерена по прежней геометрии`,
    };
  }
  return { ok: true, rows, reason: '' };
}

// ── ПЛАН ПРИМЕНЕНИЯ ПО РАЗМЕРАМ ─────────────────────────────────────────────────────────

/**
 * Откуда взялось число размера:
 * - `marker` — измерено этой раскладкой (её собственный состав);
 * - `area`   — продолжено по площади выкроек тем же распределением;
 * - `mean`   — СРЕДНЕЕ по настилу, потому что выкроек этого размера нет вовсе.
 */
export type PerSizeOrigin = 'marker' | 'area' | 'mean';

export type PerSizeRow = {
  sizeId: number;
  consumptionCm: number | null;
  origin: PerSizeOrigin | null;
  /** Площадь, из которой выведено число, — для `area` клиентская, для `marker` серверная. */
  areaCm2: number | null;
  /** Раскладка, ответившая за этот размер. */
  marker: common_TechCardMarkerSummary | null;
};

export type ContinuationState =
  /** Продолжение не запрашивали (площадей по выкройкам нет). */
  | 'off'
  /** Раскладка площадей не публикует — продолжать нечем (снята до Ф2.4). */
  | 'unavailable'
  /** Площади посчитаны, но со сверкой не сошлись — продолжение НЕДЕЙСТВИТЕЛЬНО. */
  | 'blocked'
  | 'ok';

export type PerSizePlan = {
  rows: PerSizeRow[];
  bySize: Map<number, PerSizeRow>;
  /** У КАЖДОГО запрошенного размера есть число. */
  complete: boolean;
  continuation: ContinuationState;
  areaCheck: AreaCheck | null;
  /** Размеры, чьё число — среднее по настилу. Обязаны быть названы на экране. */
  meanSizes: number[];
  /** Размеры, на которые ответить нечем. */
  unansweredSizes: number[];
  /** Размеры, продолженные по площади. */
  continuedSizes: number[];
};

export type PerSizePlanInput = {
  /** Размерный ряд карточки — то, на что нужно ответить. */
  sizeIds: readonly number[];
  /** Лучшая раскладка на каждый размер (latestPerSize). */
  bySize: ReadonlyMap<number, common_TechCardMarkerSummary>;
  /** Раскладка, чьей константой продолжается формула. Обычно — выбранная в диалоге. */
  continueFrom?: common_TechCardMarkerSummary;
  /**
   * a_s по сегодняшним выкройкам, см² на изделие. undefined = продолжение не запрашивали.
   * Размер, которого в карте НЕТ, считается размером БЕЗ выкроек — только такому полагается
   * среднее, и только если карта вообще посчитана.
   */
  clientAreas?: ReadonlyMap<number, number>;
  /** Разрешить среднее размерам без выкроек. По умолчанию да — так велит 03-composition.md. */
  allowMean?: boolean;
};

// Среднее по настилу — то самое число, которое scalarNormRefusal отказывается отдавать скаляром.
// Считается ЗДЕСЬ и только для явно помеченного фолбэка: у него ровно одно законное употребление,
// и оно обязано быть видно на экране.
export function meanConsumptionCm(s: common_TechCardMarkerSummary): number | null {
  const used = decNum(s.usedLengthCm);
  const units = totalUnitsOf(s);
  if (!(used > 0) || units < 1) return null;
  return r2(used / units);
}

export function perSizePlan(input: PerSizePlanInput): PerSizePlan {
  const { sizeIds, bySize, continueFrom, clientAreas } = input;
  const allowMean = input.allowMean !== false;

  const basis = continueFrom ? continuationBasisOf(continueFrom) : null;
  const areaCheck = basis && clientAreas ? checkClientAreas(basis, clientAreas) : null;
  const continuation: ContinuationState = !clientAreas
    ? 'off'
    : !basis
      ? 'unavailable'
      : areaCheck?.ok
        ? 'ok'
        : 'blocked';

  const rows: PerSizeRow[] = sizeIds.map((sizeId) => {
    // ИЗМЕРЕННОЕ ПОБЕЖДАЕТ ПРОДОЛЖЕННОЕ, всегда. Размер, у которого есть своя раскладка (или
    // который входит в состав смешанной), нормируется ЕЮ: продолжение — это восстановление
    // недостающего, а не вторая версия имеющегося.
    const own = bySize.get(sizeId);
    if (own) {
      const cons = consumptionForSize(own, sizeId);
      if (cons != null) {
        return {
          sizeId,
          consumptionCm: cons,
          origin: 'marker',
          areaCm2: sizeNormsOf(own).find((r) => r.sizeId === sizeId)?.areaCm2 ?? null,
          marker: own,
        };
      }
    }
    if (continuation === 'ok' && basis && continueFrom) {
      const a = clientAreas!.get(sizeId);
      if (a != null && a > 0) {
        return {
          sizeId,
          consumptionCm: r2(a * basis.cmPerCm2),
          origin: 'area',
          areaCm2: a,
          marker: continueFrom,
        };
      }
      // Выкроек этого размера в файлах нет — единственный случай, которому 03-composition.md
      // оставляет среднее, и ровно тот, который обязан быть подписан на экране.
      if (allowMean) {
        const mean = continueFrom ? meanConsumptionCm(continueFrom) : null;
        if (mean != null) {
          return { sizeId, consumptionCm: mean, origin: 'mean', areaCm2: null, marker: continueFrom };
        }
      }
    }
    return { sizeId, consumptionCm: null, origin: null, areaCm2: null, marker: null };
  });

  return {
    rows,
    bySize: new Map(rows.map((r) => [r.sizeId, r])),
    complete: rows.length > 0 && rows.every((r) => r.consumptionCm != null),
    continuation,
    areaCheck,
    meanSizes: rows.filter((r) => r.origin === 'mean').map((r) => r.sizeId),
    continuedSizes: rows.filter((r) => r.origin === 'area').map((r) => r.sizeId),
    unansweredSizes: rows.filter((r) => r.consumptionCm == null).map((r) => r.sizeId),
  };
}

// ── ПОЧЕМУ ПО РАЗМЕРАМ ПРИМЕНИТЬ НЕЛЬЗЯ ─────────────────────────────────────────────────

// Слово вместо погасшей кнопки. Пусто = препятствий нет.
//
// Отказ СЕРВЕРА (scalarNormRefusal) сюда не переписывается и не пересказывается: он про СКАЛЯР, и
// с Ф2.4 его текст сам называет лекарство — «примените ПО РАЗМЕРАМ» у раскладки с пер-размерными
// числами и «пересохраните раскладку» у снятой до Ф2.4. Здесь объясняется другое: почему по
// размерам не получается ЗДЕСЬ И СЕЙЧАС.
export function perSizeRefusal(plan: PerSizePlan, sizeName: (id: number) => string): string {
  if (plan.complete) return '';
  if (plan.unansweredSizes.length === 0) return '';
  const names = plan.unansweredSizes.map(sizeName).join(', ');
  if (plan.continuation === 'blocked' && plan.areaCheck) {
    return `${plan.areaCheck.reason}. Без продолжения размеры ${names} остались без нормы`;
  }
  if (plan.continuation === 'unavailable') {
    return `у размеров ${names} нет своей раскладки, а продолжить норму по площадям нечем: выбранная раскладка снята до того, как площади по размерам стали записываться. Пересохраните её из модалки`;
  }
  return `у размеров ${names} нормы нет: своей раскладки у них нет, и по выкройкам они не посчитаны`;
}

// Пометка происхождения для экрана — одно слово на строку, в одном месте.
export function originLabel(origin: PerSizeOrigin | null): string {
  switch (origin) {
    case 'marker':
      return 'из раскладки';
    case 'area':
      return 'по площади выкроек';
    case 'mean':
      return 'СРЕДНЕЕ';
    default:
      return 'нормы нет';
  }
}

/** Раскладка, от которой ВООБЩЕ имеет смысл продолжать: несёт площади по всем строкам состава. */
export function canContinue(s: common_TechCardMarkerSummary | undefined): boolean {
  return s != null && !!continuationBasisOf(s);
}
