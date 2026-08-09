// НОРМА РАСХОДА ПО ВЫКРОЙКАМ, БЕЗ РАСКЛАДКИ (источник `consumption_source='dxf'`, 0294).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ПУТЬ, КОГДА РЯДОМ ЕСТЬ size-areas-from-dxf.ts. Тот файл ПРОДОЛЖАЕТ снятую
// раскладку на размеры вне её состава, и почти все его сомножители приходят из блоба раскладки:
// количество деталей на изделие, площади неградуируемых, условия съёмки. Без раскладки ни одного из
// них нет — и это не «тот же расчёт с пропусками», а другой расчёт с другими источниками истины:
//
//   • КОЛИЧЕСТВО НА ИЗДЕЛИЕ — ИЗ КАРТОЧКИ (`tech_card_piece.pieces_per_garment`). Там его и
//     заявляют. Считать экземпляры в файле нельзя: две ревизии одного листа лежат рядом и читались
//     бы как «деталь идёт по две» (ту же ловушку обходит findPiece, беря максимум ПО ФАЙЛАМ).
//   • ПЛОЩАДЬ — ИЗ СЕГОДНЯШНЕГО ФАЙЛА, по выбранному слою контура. Другого источника нет.
//   • УСЛОВИЯ (слой и припуск) — ВЫБОР ОПЕРАТОРА, предзаполненный ЗАМЕРОМ файла
//     (`contour-layer.ts` / `contour-allowance.ts`), а не умолчанием: слой 14 несёт линию шва и его
//     надо раздуть припуском, слой 1 несёт линию кроя базового размера, в которой припуск уже есть.
//     Ошибка здесь молча меняет норму на величину припуска по всему периметру каждой детали.
//
// ЧТО ЭТО ЧИСЛО ЗНАЧИТ, И ЧЕГО В НЁМ НЕТ. Σ(площадь деталей) ÷ раскройная ширина — это NETTO:
// длина полотна, которая нужна, если детали лежат вплотную без остатка. Так не бывает никогда.
// Межлекальных выпадов, концов настила и обхода пороков здесь НЕТ и быть не может — их знает только
// раскладка. За них платит процент раскроя слота (`bom_item.wastage_percent`), который сервер
// доначисляет ровно потому, что источник не 'marker'. Отсюда правило вызывающего: применять netto на
// слот с ПУСТЫМ процентом раскроя нельзя — гейт готовности прогона на такой паре ставит блокер.
//
// ПОЧЕМУ НЕПОЛНАЯ ПЛОЩАДЬ — ЭТО ОТКАЗ, А НЕ ЧАСТИЧНЫЙ ОТВЕТ. Потерянная деталь уменьшает площадь,
// меньшая площадь даёт меньшую норму, а заниженная норма всплывает не на экране, а на складе, когда
// ткань кончилась. Поэтому размер, у которого нашлись не все детали, не получает числа вовсе.
import type { PieceDTO } from 'lib/nesting/types';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import type { DxfIndex, PieceBlockRef } from './dxf-geometry';
import { aliasIdentity } from './use-block-sizes';

/** Деталь кроя карточки в терминах этого расчёта: сколько её на изделие и чем она нарисована. */
export type DxfNormPiece = {
  /** Для сообщений: как деталь названа на карточке. */
  name: string;
  /** `pieces_per_garment` карточки. Ниже единицы не бывает — деталь либо есть, либо её не заявляли. */
  perGarment: number;
  /** Привязки «деталь → блок чертежа»; побеждает первая, которая нашлась (как в findPiece). */
  refs: readonly PieceBlockRef[];
};

export type DxfNormSizeRow = {
  sizeId: number;
  /** Площадь ОДНОГО изделия этого размера, см². */
  areaCm2: number;
};

export type DxfNormAreas = {
  rows: DxfNormSizeRow[];
  /** Размеры, у которых в сегодняшних выкройках нашлись не все детали (числа им не дано). */
  sizesIncomplete: number[];
  /** Σ (кол-во × площадь) деталей БЕЗ размерного хвоста — общая часть каждого размера. */
  sizelessCm2: number;
  /** Сколько видов деталей градуируется по размерам. 0 = у всех размеров вышло бы одно число. */
  gradedPieces: number;
  /** Детали, у которых контур заменён выпуклой оболочкой при раздутии припуском. */
  hulled: string[];
};

export type DxfNormOutcome = { ok: true; areas: DxfNormAreas } | { ok: false; reason: string };

export type DxfNormInput = {
  index: DxfIndex;
  /** Детали кроя ЭТОЙ ткани — все, что заявлены на карточке в этом скоупе. */
  pieces: readonly DxfNormPiece[];
  sizeIds: readonly number[];
  /** Как размер написан в имени блока («m», «48»); токены уже очищены. */
  tokensOfSize: (sizeId: number) => readonly string[];
  /** Слой контура — выбор оператора (по умолчанию `index.contourLayer`). */
  contourLayer: string;
  /** Припуск, который надо добавить к контуру, СМ. 0 = на слое уже линия кроя. */
  allowanceCm: number;
};

// Тот же bare(), что в size-areas-from-dxf.ts и block-code.ts: реальный файл пишет размер как
// «BP_<S>», в угловых скобках, и сравнение обязано идти по очищенному токену.
const bare = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/** Один контур детали, выбранный под конкретный размер (или без размера). */
type Pick = { pieceIndex: number; sizeKey: string; contour: PieceDTO };

/**
 * Площадь изделия по размерам, посчитанная по сегодняшним выкройкам карточки.
 *
 * Чистая функция: ни сети, ни разбора. Разбор (React Query, общий для панелей вкладки) отдаёт
 * `DxfIndex`, дальше — только арифметика и отказы.
 */
export function dxfNormAreas(input: DxfNormInput): DxfNormOutcome {
  if (input.pieces.length === 0) {
    return {
      ok: false,
      reason:
        'у этой ткани нет деталей кроя, привязанных к блокам чертежа — площадь изделия складывать не из чего',
    };
  }
  if (input.sizeIds.length === 0) {
    return { ok: false, reason: 'у карточки не заявлен размерный ряд — считать норму не для кого' };
  }

  // ── что каждая деталь несёт в чертеже ────────────────────────────────────────────────────
  type Resolved = { piece: DxfNormPiece; bySize: Map<string, PieceDTO[]>; graded: boolean };
  const resolved: Resolved[] = [];
  const unmatched: string[] = [];
  for (const piece of input.pieces) {
    let bySize: Map<string, PieceDTO[]> | undefined;
    for (const r of piece.refs) {
      // Тем же правилом, что findPiece: сохранённая связь может нести размер прямо в имени
      // («BP_1_XS»), и сворачивать её к идентичности надо СПРАШИВАЯ ФАЙЛ — «FP_L» это левая
      // полочка целиком, а не размер L.
      const identity = aliasIdentity(r.block, input.index.split);
      const hit = input.index.byKey.get(`${r.scopeKey}|${identity.toLowerCase()}`);
      if (hit && hit.size > 0) {
        bySize = hit;
        break;
      }
    }
    if (!bySize) {
      unmatched.push(piece.name);
      continue;
    }
    // РАЗМЕРНЫЙ ХВОСТ В ИНДЕКСЕ ЛЕЖИТ «КАК В ФАЙЛЕ» (BlockCode.size — сырой хвост), а размеры
    // карточки приходят очищенными токенами. Реальный файл лекальщика пишет базовый размер в
    // угловых скобках («BP_<S>»), поэтому прямое сравнение промахнулось бы на КАЖДОЙ такой детали —
    // и промах читался бы как «деталь размера нет», то есть весь ряд остался бы без нормы. Ключи
    // сводятся к тому же виду, что сравниваемые токены; две записи, схлопнувшиеся в один токен, —
    // это один размер, и контуры складываются в один список (выберется первый на нужном слое).
    const norm = new Map<string, PieceDTO[]>();
    for (const [k, list] of bySize) {
      const key = k === '' ? '' : bare(k);
      norm.set(key, [...(norm.get(key) ?? []), ...list]);
    }
    const graded = [...norm.keys()].some((k) => k !== '');
    resolved.push({ piece, bySize: norm, graded });
  }
  if (unmatched.length > 0) {
    // Частичная площадь ЗАНИЖАЕТ норму, и молча: экран показал бы число, склад — недостачу.
    return {
      ok: false,
      reason: `в сегодняшних выкройках нет деталей: ${unmatched.join(', ')} — площадь изделия вышла бы неполной, а неполная норма занижает закупку`,
    };
  }

  // ── выбор контура под размер ─────────────────────────────────────────────────────────────
  //
  // Контур берётся ТОЛЬКО с выбранного слоя. Подстановка «чем нарисовано вообще», как в findPiece,
  // здесь запрещена: там это показ (лучше не тот слой, чем «детали нет»), а тут это площадь —
  // смешать линию шва одной детали с линией кроя другой значит сложить два разных числа в одно.
  const onLayer = (list: readonly PieceDTO[]): PieceDTO | null => {
    for (const p of list) if ((p.layer ?? '') === input.contourLayer) return p;
    return null;
  };

  const picks: Pick[] = [];
  const sizeKeyByPiece = new Map<string, string>(); // `${sizeId}|${pieceIndex}` → sizeKey
  const sizesIncomplete: number[] = [];
  const sizelessKey = '';

  for (const sizeId of input.sizeIds) {
    const tokens = input.tokensOfSize(sizeId).map(bare).filter(Boolean);
    let complete = true;
    const staged: Pick[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const { bySize, graded } = resolved[i];
      let key: string | null = null;
      if (graded) {
        key = tokens.find((t) => bySize.has(t)) ?? null;
        // Деталь, у которой есть и размерные, и безразмерные копии, — законна: часть градации
        // выгружена, часть нет. Безразмерная копия отвечает за любой размер.
        if (key == null && bySize.has(sizelessKey)) key = sizelessKey;
      } else {
        key = bySize.has(sizelessKey) ? sizelessKey : null;
      }
      const contour = key != null ? onLayer(bySize.get(key) ?? []) : null;
      if (!contour) {
        complete = false;
        break;
      }
      staged.push({ pieceIndex: i, sizeKey: key ?? sizelessKey, contour });
    }
    if (!complete) {
      sizesIncomplete.push(sizeId);
      continue;
    }
    for (const s of staged) {
      const k = `${sizeId}|${s.pieceIndex}`;
      sizeKeyByPiece.set(k, s.sizeKey);
      picks.push(s);
    }
  }

  if (picks.length === 0) {
    return {
      ok: false,
      reason:
        input.contourLayer === ''
          ? 'в выкройках не нашлось ни одного контура — выбирать слой не из чего'
          : `на слое ${input.contourLayer} нет контуров ни одной детали ни одного размера — выберите другой слой контура`,
    };
  }

  // ── припуск ──────────────────────────────────────────────────────────────────────────────
  //
  // Раздуваются ВЫБРАННЫЕ контуры, одним вызовом и одним числом — той же чистой функцией, которой
  // раздувает раскладка. Порядок массива сохраняется 1:1 (деталь, у которой офсет не сошёлся,
  // отдаётся как есть), поэтому по индексу можно вернуться к своей выборке.
  const unique = [...new Set(picks.map((p) => p.contour))];
  const seam = applySeamAllowance(unique, input.allowanceCm);
  const areaOf = new Map<PieceDTO, number>();
  unique.forEach((p, i) => areaOf.set(p, seam.pieces[i]?.areaCm2 ?? p.areaCm2));

  // ── площадь по размерам ──────────────────────────────────────────────────────────────────
  const rows: DxfNormSizeRow[] = [];
  const incomplete = new Set(sizesIncomplete);
  for (const sizeId of input.sizeIds) {
    if (incomplete.has(sizeId)) continue;
    let sum = 0;
    let ok = true;
    for (let i = 0; i < resolved.length; i++) {
      const key = sizeKeyByPiece.get(`${sizeId}|${i}`);
      if (key == null) {
        ok = false;
        break;
      }
      const contour = onLayer(resolved[i].bySize.get(key) ?? []);
      if (!contour) {
        ok = false;
        break;
      }
      const qty = Math.max(1, Math.round(resolved[i].piece.perGarment || 1));
      sum += qty * (areaOf.get(contour) ?? contour.areaCm2);
    }
    if (!ok || !(sum > 0)) {
      incomplete.add(sizeId);
      continue;
    }
    rows.push({ sizeId, areaCm2: sum });
  }

  // Σ по безразмерным деталям — общая часть каждого размера, нужна объяснению разбора.
  let sizelessCm2 = 0;
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i].graded) continue;
    const contour = onLayer(resolved[i].bySize.get(sizelessKey) ?? []);
    if (!contour) continue;
    const qty = Math.max(1, Math.round(resolved[i].piece.perGarment || 1));
    sizelessCm2 += qty * (areaOf.get(contour) ?? contour.areaCm2);
  }

  if (rows.length === 0) {
    return {
      ok: false,
      reason:
        'ни у одного размера ряда в сегодняшних выкройках не нашлось полного комплекта деталей — норму по площади считать нечем',
    };
  }

  return {
    ok: true,
    areas: {
      rows,
      sizesIncomplete: [...incomplete].sort((a, b) => a - b),
      sizelessCm2,
      gradedPieces: resolved.filter((r) => r.graded).length,
      hulled: seam.hulled,
    },
  };
}

/**
 * NETTO длина полотна на одно изделие, СМ: площадь ÷ раскройная ширина.
 *
 * Раскройная, а не полная ширина рулона (`cuttingWidthOf` = width − 2×кромка): кромку не кроят, и
 * поделив на полную ширину, мы бы заявили, что деталь можно положить на кромку. `null` — ширины нет,
 * и подставлять сюда номинал «150» вместо неизвестной ширины нельзя: ошибка ширины входит в норму
 * линейно и не видна ни в одном числе.
 */
export function nettoLengthCm(areaCm2: number, cuttingWidthCm: number): number | null {
  if (!(cuttingWidthCm > 0) || !(areaCm2 > 0)) return null;
  return areaCm2 / cuttingWidthCm;
}
