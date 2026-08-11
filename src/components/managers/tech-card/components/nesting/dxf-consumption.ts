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
import { toBomUnit, type FabricWeightBasis } from './marker-io';
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
  /**
   * Размеры, в чей комплект вошёл контур, ВЫБРАННЫЙ ИЗ НЕСКОЛЬКИХ совпадающих кандидатов на слое
   * (площади в допуске 0.5%). Отчёт, а не отказ: применение такие копии сознательно принимает —
   * «тот же контур в двух листах» нормой не рискует. Но выбор здесь берёт ПЕРВОГО кандидата, то
   * есть зависит от порядка листов в пачке, а равенство ИСХОДНЫХ площадей не переживает раздутия
   * припуском (офсет строит новый контур геометрически, и периметры у копий разные). Поэтому
   * пересчёт по текущим данным (dxf-recheck.tsx) по этим размерам числовых утверждений не делает —
   * сравнение с ними невоспроизводимо по построению.
   */
  sizesAmbiguousPick: number[];
  /** Детали, у которых кандидатов на слое было несколько, — чтобы сообщение называло виновника. */
  ambiguousPickPieces: string[];
};

export type DxfNormOutcome = { ok: true; areas: DxfNormAreas } | { ok: false; reason: string };

export type DxfNormInput = {
  index: DxfIndex;
  /** Детали кроя ЭТОЙ ткани — все, что заявлены на карточке в этом скоупе. */
  pieces: readonly DxfNormPiece[];
  /**
   * Детали кроя, которые по карточке кроятся ИЗ ЭТОЙ ЖЕ ткани, но ни с одним блоком чертежа не
   * связаны. Отказ, а не пропуск: связи нет — площади нет — площадь изделия неполна, а неполная
   * занижает норму, и обнаруживается это на складе. Вызывающий обязан их назвать, потому что
   * привязка «деталь → ткань» живёт на самой детали (`pieces[].materials[].bomLineKey`), а не в
   * алиасах, и посчитать комплект по одним алиасам значит согласиться с любым недобором.
   */
  unaliasedPieces: readonly string[];
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
  if (input.unaliasedPieces.length > 0) {
    return {
      ok: false,
      reason: `детали этой ткани не связаны ни с одним блоком чертежа: ${input.unaliasedPieces.join(', ')} — площадь изделия вышла бы неполной, а неполная норма занижает и себестоимость, и закупку. Свяжите их на вкладке деталей кроя`,
    };
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
    // ДЕТАЛЬ, У КОТОРОЙ ЕСТЬ И РАЗМЕРНЫЕ, И БЕЗРАЗМЕРНЫЕ КОПИИ, — ОТКАЗ, а не выбор одной из них.
    // Такой вход двусмыслен по существу: безразмерная копия — это либо справочный контур базового
    // размера (тогда её нельзя складывать), либо деталь, которую кроят одинаково во всех размерах
    // (тогда её нельзя выбрасывать). Разница между двумя чтениями — целая деталь в площади каждого
    // размера, и угадать её нечем. Референсная реализация продолжения раскладки
    // (size-areas-from-dxf.ts) отвергает ровно этот вход теми же словами.
    if (graded && norm.has('')) {
      return {
        ok: false,
        reason: `деталь «${piece.name}» нарисована и с размерным хвостом, и без него — понять, справочный это контур базового размера или деталь, одинаковая во всех размерах, нечем. Разница — целая деталь в площади каждого размера`,
      };
    }
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
  // ДУБЛЬ НА ВЫБРАННОМ СЛОЕ — ДВУСМЫСЛЕННОСТЬ, а не «возьмём первый». Две ревизии одного листа в
  // одном скоупе — сценарий типовой, и площади у них разные ровно потому, что выкройку правили.
  // Взять ту, что раньше попала в пачку, значило бы поставить норму по порядку скачивания файлов.
  // Совпадающие в пределах допуска копии (тот же контур в двух листах) применению не мешают, но
  // ДОКЛАДЫВАЮТСЯ (multi → sizesAmbiguousPick): первый кандидат — это порядок листов в пачке, а не
  // выбор, и повторный прогон той же карточки с другим порядком даёт другой контур.
  const AREA_TOLERANCE = 0.005; // 0.5% — дребезг тесселяции, а не редакция выкройки
  const pickOnLayer = (
    list: readonly PieceDTO[],
  ): { contour: PieceDTO; multi: boolean } | null | 'ambiguous' => {
    const on = list.filter((p) => (p.layer ?? '') === input.contourLayer);
    if (on.length === 0) return null;
    if (on.length > 1) {
      const min = Math.min(...on.map((p) => p.areaCm2));
      const max = Math.max(...on.map((p) => p.areaCm2));
      if (min > 0 && (max - min) / min > AREA_TOLERANCE) return 'ambiguous';
    }
    return { contour: on[0], multi: on.length > 1 };
  };

  const picks: Pick[] = [];
  // Контур запоминается ТОТ САМЫЙ, что выбран здесь: сумма ниже читает эту карту, а не решает
  // задачу выбора второй раз. Два прохода по одному правилу — это два места, которые обязаны
  // согласоваться, и однажды они разойдутся.
  const contourByKey = new Map<string, PieceDTO>(); // `${sizeId}|${pieceIndex}` → контур
  const sizesIncomplete: number[] = [];
  const sizesAmbiguousPick: number[] = [];
  const ambiguousPieceNames = new Set<string>();

  for (const sizeId of input.sizeIds) {
    const tokens = input.tokensOfSize(sizeId).map(bare).filter(Boolean);
    let complete = true;
    const staged: (Pick & { multi: boolean })[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const { bySize, graded } = resolved[i];
      // Градуируемая деталь отвечает ТОЛЬКО своим размером: подстановка безразмерной копии здесь
      // отменена выше отказом — смешивать поколения контуров в одной площади нельзя.
      const key = graded ? tokens.find((t) => bySize.has(t)) ?? null : bySize.has('') ? '' : null;
      const picked = key != null ? pickOnLayer(bySize.get(key) ?? []) : null;
      if (picked === 'ambiguous') {
        return {
          ok: false,
          reason: `деталь «${resolved[i].piece.name}» лежит на слое ${input.contourLayer} в нескольких вариантах с разной площадью — похоже, в пачке две ревизии выкройки. Какая из них норма, сказать нечем`,
        };
      }
      if (!picked) {
        complete = false;
        break;
      }
      staged.push({
        pieceIndex: i,
        sizeKey: key ?? '',
        contour: picked.contour,
        multi: picked.multi,
      });
    }
    if (!complete) {
      sizesIncomplete.push(sizeId);
      continue;
    }
    // Размер, собравшийся ХОТЬ ОДНИМ контуром из нескольких кандидатов, — в отчёт (не в отказ):
    // число он получает, но воспроизводимым это число не назвать, см. sizesAmbiguousPick.
    if (staged.some((s) => s.multi)) {
      sizesAmbiguousPick.push(sizeId);
      for (const s of staged) {
        if (s.multi) ambiguousPieceNames.add(resolved[s.pieceIndex].piece.name);
      }
    }
    for (const s of staged) {
      contourByKey.set(`${sizeId}|${s.pieceIndex}`, s.contour);
      picks.push({ pieceIndex: s.pieceIndex, sizeKey: s.sizeKey, contour: s.contour });
    }
  }

  if (picks.length === 0) {
    return {
      ok: false,
      reason:
        input.contourLayer === ''
          ? 'в выкройках не нашлось ни одного контура — выбирать слой не из чего'
          : `ни у одного размера не собрался полный комплект деталей на слое ${input.contourLayer} — возможно, деталь нарисована на другом слое`,
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
  const qtyOf = (i: number) => Math.max(1, Math.round(resolved[i].piece.perGarment || 1));
  for (const sizeId of input.sizeIds) {
    if (incomplete.has(sizeId)) continue;
    let sum = 0;
    let ok = true;
    for (let i = 0; i < resolved.length; i++) {
      const contour = contourByKey.get(`${sizeId}|${i}`);
      if (!contour) {
        ok = false;
        break;
      }
      sum += qtyOf(i) * (areaOf.get(contour) ?? contour.areaCm2);
    }
    if (!ok || !(sum > 0)) {
      incomplete.add(sizeId);
      continue;
    }
    rows.push({ sizeId, areaCm2: sum });
  }

  // Σ по безразмерным деталям — общая часть каждого размера, нужна объяснению разбора. Берётся из
  // той же карты выбранных контуров (первый размер, для которого выборка полна): безразмерная
  // деталь по построению одна и та же во всех размерах.
  let sizelessCm2 = 0;
  const anySize = rows[0]?.sizeId;
  if (anySize != null) {
    for (let i = 0; i < resolved.length; i++) {
      if (resolved[i].graded) continue;
      const contour = contourByKey.get(`${anySize}|${i}`);
      if (!contour) continue;
      sizelessCm2 += qtyOf(i) * (areaOf.get(contour) ?? contour.areaCm2);
    }
  }

  if (rows.length === 0) {
    return {
      ok: false,
      reason:
        'ни у одного размера ряда в сегодняшних выкройках не нашлось полного комплекта деталей — норму по площади считать нечем',
    };
  }

  // ФАЙЛ, В КОТОРОМ НЕ ГРАДУИРУЕТСЯ НИ ОДНА ДЕТАЛЬ, НОРМЫ ПО РАЗМЕРАМ НЕ ДАЁТ — и арифметика здесь
  // как раз не спорит: она честно выдала бы всем размерам ОДНО число. Формально это верно (кроят
  // одни и те же контуры), а как норма размерного ряда — заявление «XL стоит ровно столько же,
  // сколько S», сделанное не по выкройкам, а по их отсутствию. Ровно та нечестность, ради которой
  // диалог и пишет ряд, а не скаляр. Один размер в ряду — случай другой: одинаковость там истинна
  // (шапка, сумка), и отказывать нечему.
  const gradedPieces = resolved.filter((r) => r.graded).length;
  if (gradedPieces === 0 && input.sizeIds.length > 1) {
    return {
      ok: false,
      reason:
        'в выкройках этой ткани ни одна деталь не градуируется по размерам — площадь каждого размера вышла бы одинаковой, и это была бы не норма размера, а копия соседней. Похоже, выгружен только один размер',
    };
  }

  return {
    ok: true,
    areas: {
      rows,
      sizesIncomplete: [...incomplete].sort((a, b) => a - b),
      sizelessCm2,
      gradedPieces,
      hulled: seam.hulled,
      sizesAmbiguousPick: sizesAmbiguousPick.sort((a, b) => a - b),
      ambiguousPickPieces: [...ambiguousPieceNames].sort(),
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

// ── ПЛОЩАДИ → СТРОКИ В ЕДИНИЦЕ ЛИНИИ, ОДНОЙ ФУНКЦИЕЙ НА ПРИМЕНЕНИЕ И СВЕРКУ ─────────────────────
//
// Цепочка nettoLengthCm → toBomUnit → строковое значение раньше жила внутри диалога применения.
// Пересчёт по текущим данным (dxf-recheck.tsx) считает РОВНО те же числа, чтобы сравнить их с
// сохранёнными, — и будь у него своя копия цепочки, «расхождение» однажды оказалось бы разницей
// двух наших же формул, а не входных данных. Поэтому цепочка живёт здесь одна, вместе с правилом
// «ноль после округления — не норма»: метры пишутся в тысячных (DECIMAL(10,3)), и крошечная площадь
// честно даёт 0.000 — строку «с нормой», которая ничего не требует, и нулевой дефицит на прогоне.
export type DxfNormValueRow = {
  sizeId: number;
  areaCm2: number;
  /** NETTO длина, см. null — ширины нет, делить не на что. */
  lengthCm: number | null;
  /**
   * Число в единице строки. null — единицу мы писать не умеем ЛИБО кг-слоту не передали основу
   * веса (ширину с плотностью) — toBomUnit без неё честно отказывает.
   */
  conv: { value: number; unit: string } | null;
  /** Готовое значение для sizeConsumptions. null — числа нет ЛИБО оно округлилось в ноль. */
  value: string | null;
};

// Кг-слот (Ф3) получает вес ЧЕРЕЗ ТУ ЖЕ ДЛИНУ: netto-длина считается делением площади на
// РАСКРОЙНУЮ ширину (на кромку деталь не положишь), а вес этой длины — умножением на ПОЛНУЮ
// (покупаешь всю ширину, кромка весит). Обе ширины в одном расчёте — так и должно быть; сама
// формула и её запреты живут в toBomUnit.
export function dxfNormValueRows(
  rows: readonly DxfNormSizeRow[],
  cuttingWidthCm: number,
  unit: string,
  fabric?: FabricWeightBasis,
): DxfNormValueRow[] {
  return rows.map((r) => {
    const cm = nettoLengthCm(r.areaCm2, cuttingWidthCm);
    const conv = cm != null ? toBomUnit(cm, unit, fabric) : null;
    return {
      sizeId: r.sizeId,
      areaCm2: r.areaCm2,
      lengthCm: cm,
      conv,
      value: conv != null && conv.value > 0 ? String(conv.value) : null,
    };
  });
}
