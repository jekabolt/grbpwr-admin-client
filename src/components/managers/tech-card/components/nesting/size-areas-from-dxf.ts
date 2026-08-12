// ПЛОЩАДЬ ОДНОГО ИЗДЕЛИЯ КАЖДОГО РАЗМЕРА, ПОСЧИТАННАЯ ПО ВЫКРОЙКАМ (Ф2.4, клиентская половина).
//
// Сервер публикует a_s только для размеров, которые состав раскладки РЕЖЕТ: в блобе лежат детали
// именно этих размеров, а DXF он не разбирает никогда. Продолжить распределение на остальной
// размерный ряд может только тот, кто читает выкройки, и вот он.
//
// ЧТО СЧИТАЕТСЯ, ПО ОДНОМУ ПРАВИЛУ С СЕРВЕРОМ (entity.MarkerSizeAreasPerGarment):
//
//     a_s = Σ_{градуированные детали размера s} (кол-во на изделие × площадь)
//         + Σ_{неградуируемые детали}          (кол-во на изделие × площадь)
//
// Неградуируемая деталь входит в КАЖДЫЙ размер ЦЕЛИКОМ, а не долей от состава: формула экземпляров
// в блобе говорит ровно это (деталь без размера кроится quantity × total_units раз, то есть
// quantity раз на изделие — одинаково для S и для XL), и площадное распределение обязано совпадать
// с той геометрией, которую действительно укладывали. Именно под этой атрибуцией выполняется
// тождество Σ_s q_s·a_s = Σ_детали площадь × экземпляры, из которого и следует сходимость.
//
// ОТКУДА БЕРЁТСЯ КАЖДЫЙ СОМНОЖИТЕЛЬ — и это главное решение файла:
//
//   • КОЛИЧЕСТВО НА ИЗДЕЛИЕ — ИЗ БЛОБА. Оно нигде больше не записано: в модалке это состояние
//     оператора (сколько экземпляров этой детали кроить), и на карточке лежит СЕГОДНЯШНЕЕ
//     pieces_per_garment детали кроя, которое к снятой раскладке отношения не имеет. Блоб хранит
//     то, чем настил РЕАЛЬНО мерили.
//   • ПЛОЩАДЬ НЕГРАДУИРУЕМЫХ ДЕТАЛЕЙ — ТОЖЕ ИЗ БЛОБА. Она одинакова для всех размеров, она уже
//     измерена ровно на той геометрии, из которой получилась длина настила, и подставлять сюда
//     сегодняшний файл значило бы смешать два поколения выкроек в одном числе.
//   • ПЛОЩАДЬ ГРАДУИРОВАННЫХ ДЕТАЛЕЙ ОТСУТСТВУЮЩЕГО РАЗМЕРА — ИЗ ФАЙЛА. Другого источника нет,
//     ради этого всё и затевалось.
//
// И ровно поэтому сверка работает: для размеров, которые состав РЕЖЕТ, площадь считается ТЕМ ЖЕ
// путём (файл для градуированных + блоб для неградуируемых), и результат обязан совпасть с тем,
// что раскладка записала. Совпал — значит и файл тот же, и слой тот же, и припуск тот же, и
// количества прочитаны верно. Не совпал — выкройки менялись, и продолжать нельзя.
//
// ГЕОМЕТРИЯ ГОТОВИТСЯ ТЕМИ ЖЕ ЧИСТЫМИ ФУНКЦИЯМИ И В ТОМ ЖЕ ПОРЯДКЕ, что при съёмке и при
// пересборке чертежа: слой контура → разворот по долевой → припуск. Порядок не переставляется —
// припуск раздувает УЖЕ развёрнутый контур. Разворот площадь не меняет (это поворот), но
// вызывается всё равно: путь один, и расходиться ему негде.
import type { common_TechCardMarker, common_TechCardMarkerPiece } from 'api/proto-http/admin';
import { orientToGrain } from 'lib/nesting/geom/grain-orient';
import { mmToEngineCm } from './allowance-units';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import type { PieceDTO } from 'lib/nesting/types';
import {
  deriveBlockSizes,
  normBlock,
  uniBaseOf,
  uniConflictReason,
  uniDuplicateConflicts,
  uniGradedConflicts,
  uniGroupsOf,
  uniOf,
} from './block-code';
import {
  readMarkerConditions,
  rebuildParseOpts,
  type MarkerConditions,
  type PatternParse,
  type PatternSource,
} from './marker-rebuild';

// Для СРАВНЕНИЯ токен размера очищается от оформления: реальный файл пишет базовый размер как
// «BP_<S>», в угловых скобках. Та же нормализация, что в block-code.ts.
const bare = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

export type SizeAreas = {
  /** a_s по размерам, см² на ОДНО изделие. Размера в карте нет = выкроек этого размера нет. */
  areaBySize: Map<number, number>;
  /** Σ (кол-во × площадь) неградуируемых деталей — общая часть каждого a_s. */
  agnosticCm2: number;
  /** Сколько градуированных видов деталей участвует. 0 = в раскладке не градуируется ничего. */
  gradedPieces: number;
  /** Размеры, для которых в сегодняшних выкройках нашлись не все детали. */
  sizesWithoutPieces: number[];
  warnings: string[];
};

export type SizeAreasOutcome = { ok: true; areas: SizeAreas } | { ok: false; reason: string };

export type SizeAreasInput = {
  /** Раскладка ЦЕЛИКОМ: нужен блоб — количества на изделие и площади неградуируемых деталей. */
  marker: common_TechCardMarker;
  /** Всё, что разобралось из сегодняшних выкроек, ДО фильтра слоя, разворота и припуска. */
  parsed: readonly PieceDTO[];
  /** Размеры, про которые спрашивают: ряд карточки плюс состав раскладки. */
  sizeIds: readonly number[];
  /** Как размер карточки пишется в имени блока («m», «48»). Очищенные токены. */
  tokensOfSize: (sizeId: number) => readonly string[];
  /** Бывает ли токен размером ВООБЩЕ — весь словарь размеров, а не ряд карточки (см. deriveBlockSizes). */
  isSizeToken: (token: string) => boolean;
  conditions?: MarkerConditions;
  failedFiles?: readonly string[];
};

type BlockCodeLite = { identity: string; size: string };

export function sizeAreasFromParsed(input: SizeAreasInput): SizeAreasOutcome {
  const conditions = input.conditions ?? readMarkerConditions(input.marker.summary);
  // Условия проверяются ПЕРВЫМИ, как и в пересборке: без записанного припуска сегодняшний контур
  // готовится не тем преобразованием, площади разойдутся, и сверка обвинит в подмене ни в чём не
  // повинную выкройку. «Старая норма» продолжению не подлежит, и это честнее догадки.
  if (!conditions.recorded) {
    return {
      ok: false,
      reason:
        'у раскладки не записаны условия съёмки (припуск, слои) — повторить преобразование контура нечем, а площади, посчитанные другим припуском, с записанными не сойдутся',
    };
  }
  const stored = (input.marker.layout?.pieces ?? []) as common_TechCardMarkerPiece[];
  if (stored.length === 0) {
    return { ok: false, reason: 'в раскладке не сохранено ни одной детали — продолжать нечем' };
  }
  if (input.parsed.length === 0) {
    return {
      ok: false,
      reason:
        (input.failedFiles ?? []).length > 0
          ? `не скачались или не разобрались выкройки: ${(input.failedFiles ?? []).join(', ')}`
          : 'сегодняшних выкроек этой ткани на карточке нет — считать площади не по чему',
    };
  }

  const onLayer = conditions.contourLayer
    ? input.parsed.filter((p) => (p.layer ?? '') === conditions.contourLayer)
    : [...input.parsed];
  const oriented = orientToGrain(onLayer, conditions.grainLayer);
  // МИЛЛИМЕТРЫ УСЛОВИЙ → САНТИМЕТРЫ ДВИЖКА. applySeamAllowance раздувает контуры в системе
  // координат раскладки, а она сантиметровая; передать сюда миллиметры значит раздуть каждую
  // деталь ВДЕСЯТЕРО и завысить площадь размера — ошибка, которая выглядит совершенно правдоподобно
  // и всплывает только счётом от поставщика.
  const seam = applySeamAllowance(oriented.pieces, mmToEngineCm(conditions.seamAllowanceMm));
  const candidates = seam.pieces;
  const warnings: string[] = [];
  if (seam.hulled.length > 0) {
    warnings.push(`контур заменён выпуклой оболочкой: ${seam.hulled.join(', ')}`);
  }

  // ВЕРДИКТ О РАЗМЕРНЫХ ХВОСТАХ — ПО СОЮЗУ ИМЁН, сегодняшних и сохранённых. Правило deriveBlockSizes
  // структурное («хвост меняется у своей основы и повторяется у многих основ»), и посчитанное по
  // одной половине имён оно может разойтись с посчитанным по другой: файл, из которого сохраняли,
  // мог нести размеры, которых в сегодняшнем наборе листов уже нет. Разошедшийся вердикт означал бы,
  // что блоб и файл режутся на идентичности по-разному, — то есть сверка сравнивала бы разное.
  const names: string[] = [];
  for (const p of candidates) {
    const n = normBlock(p.blockName ?? '');
    if (n) names.push(n);
  }
  for (const p of stored) {
    const n = normBlock(p.blockName ?? '');
    if (n) names.push(n);
  }
  const verdict = deriveBlockSizes(names, input.isSizeToken);
  const codeOf = (raw: string): BlockCodeLite => {
    const n = normBlock(raw);
    const size = verdict.get(n) ?? '';
    if (!size) return { identity: n, size: '' };
    const identity = n.slice(0, n.length - size.length - 1);
    return identity ? { identity, size: bare(size) } : { identity: n, size: '' };
  };

  // ── сторона БЛОБА: количества на изделие и площадь неградуируемых ──────────────────────
  type Graded = { identity: string; qty: number; sizes: Map<string, number> };
  const graded = new Map<string, Graded>();
  const agnosticIdentities = new Set<string>();
  let agnosticCm2 = 0;
  // ЗАЯВЛЕНИЕ «ДЕТАЛЬ НЕ ГРАДУИРУЕТСЯ» БЕРЁТСЯ ЗДЕСЬ ТОЛЬКО ИЗ БЛОБА, и это не придирка. Продолжать
  // мы собираемся СНЯТУЮ раскладку, а галка с карточки — сегодняшнее состояние формы, которое
  // раскладка не видела и не хранит: подставить её сюда значило бы объяснить старый замер новым
  // ответом. Токен же уехал в блоб вместе с именем блока — он часть той самой съёмки.
  let storedAllUni = stored.length > 0;
  // Сохранённые uni-имена — для вердикта о склеенной выгрузке (см. отказ сразу за циклом).
  const storedUniEntries: { raw: string; uniBase: string }[] = [];
  for (const sp of stored) {
    const raw = normBlock(sp.blockName ?? '');
    if (!uniOf(raw)) storedAllUni = false;
    else storedUniEntries.push({ raw, uniBase: uniBaseOf(raw, input.isSizeToken) });
    if (!raw) {
      // Блоб схемы 1 или файл-«россыпь» без блоков: опознать деталь в сегодняшнем файле нечем, а
      // без неё площадь любого размера неполна — и неполная площадь ЗАНИЖАЕТ норму.
      return {
        ok: false,
        reason: `деталь «${sp.name || sp.pieceId}» сохранена без имени блока — сопоставить её с сегодняшней выкройкой нечем`,
      };
    }
    const qty = Math.max(1, Math.round(sp.quantity ?? 1));
    const area = sp.areaCm2 ?? 0;
    const { identity, size } = codeOf(raw);
    if (!size) {
      if (graded.has(identity)) {
        return { ok: false, reason: `блок «${identity}» встречается и с размерным хвостом, и без` };
      }
      agnosticIdentities.add(identity);
      agnosticCm2 += qty * area;
      continue;
    }
    if (agnosticIdentities.has(identity)) {
      return { ok: false, reason: `блок «${identity}» встречается и с размерным хвостом, и без` };
    }
    const g = graded.get(identity) ?? { identity, qty, sizes: new Map<string, number>() };
    // РАЗНОЕ КОЛИЧЕСТВО НА ИЗДЕЛИЕ У ОДНОЙ ДЕТАЛИ В РАЗНЫХ РАЗМЕРАХ — отказ, а не выбор большего.
    // Такой вход законен (в модалке количество ставится на КАЖДУЮ разобранную деталь), но какое из
    // двух чисел относится к размеру, которого в составе не было, не знает никто. Догадка здесь
    // прямо умножает норму.
    if (g.qty !== qty) {
      return {
        ok: false,
        reason: `деталь «${identity}» разложена разным числом на изделие в разных размерах (${g.qty} и ${qty}) — какое из них у размера вне состава, сказать нечем`,
      };
    }
    if (g.sizes.has(size)) {
      return {
        ok: false,
        reason: `блок «${raw}» сохранён в раскладке дважды — сопоставить его с сегодняшней выкройкой однозначно нельзя`,
      };
    }
    g.sizes.set(size, area);
    graded.set(identity, g);
  }

  // ── СТАРЫЙ БЛОБ ИЗ СКЛЕЕННОЙ ВЫГРУЗКИ: ОТКАЗ, А НЕ ДВОЙНОЙ КАРМАН ──────────────────────────
  //
  // Раскладка, снятая ДО того, как токен UNI начал что-то значить, хранит обе копии одной детали
  // (`PCK_L_UNI_M` и `PCK_L_UNI_S`) — и тогда это было ВЕРНО: разбор читал их как градацию (основа
  // `PCK_L_UNI`, два хвоста), по карману на размер, и настил положил ровно по одному на изделие.
  // Сегодня тот же блоб читается иначе: обе копии безразмерны, и каждая ложится в `agnosticCm2`,
  // то есть в ОБЩУЮ часть КАЖДОГО размера. Площадь изделия молча вырастает на целый карман, а
  // размеры вне состава уносят это удвоение в свою норму.
  //
  // Прежние проверки сюда не достают по построению: они ловят ОДНУ идентичность «и с хвостом, и
  // без», а здесь идентичности РАЗНЫЕ — это два разных имени, назвавшихся одной деталью.
  //
  // ОТКАЗ, А НЕ ДЕДУП, и это выбор, а не осторожность. Дедуп пришлось бы делать по геометрии, а
  // здесь её нет: блоб хранит площадь и количество на изделие, записанные для КАЖДОЙ копии
  // отдельно (в модалке количество ставится на каждую разобранную деталь). Схлопнуть их — значит
  // выбрать одно из двух количеств, ровно ту догадку, которую отказ десятью строками выше уже
  // запретил для градуированной детали («какое из них у размера вне состава, сказать нечем»).
  // Блоб — это ЗАМЕР прошлого прогона; переписывать его, чтобы он подошёл сегодняшнему парсеру,
  // значит объяснять старое измерение новым ответом. План принял это следствие сознательно:
  // раскладка пересниматься умеет, и новая (уже с дедупом Т1б) выйдет честной.
  {
    const groups = uniGroupsOf(storedUniEntries);
    const gradedCi = new Set([...graded.keys()].map((k) => normBlock(k).toLowerCase()));
    const gradedVsUni = uniGradedConflicts(groups, gradedCi);
    const flagged = new Set(gradedVsUni.map((c) => c.subject.toLowerCase()));
    const conflicts = [
      ...gradedVsUni,
      ...uniDuplicateConflicts(groups).filter((c) => !flagged.has(c.subject.toLowerCase())),
    ];
    if (conflicts.length > 0) {
      return { ok: false, reason: `${uniConflictReason(conflicts)}. Переснимите раскладку` };
    }
  }

  // ── сторона ФАЙЛА: площадь каждой градуированной детали в каждом размере ───────────────
  const fileArea = new Map<string, number>(); // `${identity} ${sizeToken}` → см²
  const ambiguous = new Set<string>();
  for (const c of candidates) {
    const raw = normBlock(c.blockName ?? '');
    if (!raw) continue;
    const { identity, size } = codeOf(raw);
    if (!size || !graded.has(identity)) continue;
    const key = `${identity} ${size}`;
    if (fileArea.has(key)) ambiguous.add(key);
    else fileArea.set(key, c.areaCm2);
  }

  // РАСКЛАДКА, В КОТОРОЙ НЕ ГРАДУИРУЕТСЯ НИЧЕГО, продолжению не подлежит, и молчать об этом нельзя.
  // Арифметика дала бы одинаковое a_s каждому размеру — формально верно (все изделия кроят одни и
  // те же контуры), но как ПРОДОЛЖЕНИЕ на размер вне состава это заявление «XL стоит ровно столько
  // же, сколько S», сделанное не по выкройкам, а по их отсутствию.
  //
  // Исключение ровно одно: КАЖДЫЙ сохранённый блок несёт токен UNI. Тогда одинаковость не выведена
  // из отсутствия размеров, а заявлена лекальщиком в момент съёмки, и продолжать её честно. Старый
  // блоб без единого токена такого доказательства не несёт — отказ ему остаётся дословно прежним.
  if (graded.size === 0 && !storedAllUni) {
    return {
      ok: false,
      reason:
        'в раскладке ни одна деталь не градуируется по размерам — площадь любого размера получилась бы одинаковой, и это была бы не норма размера, а копия соседней',
    };
  }

  // ── a_s по размерам ────────────────────────────────────────────────────────────────────
  const areaBySize = new Map<number, number>();
  const sizesWithoutPieces: number[] = [];
  for (const sizeId of input.sizeIds) {
    const tokens = input.tokensOfSize(sizeId).map(bare).filter(Boolean);
    let sum = agnosticCm2;
    let complete = true;
    for (const g of graded.values()) {
      const token = tokens.find((t) => fileArea.has(`${g.identity} ${t}`));
      if (!token) {
        // ЧАСТИЧНАЯ ПЛОЩАДЬ ХУЖЕ ОТСУТСТВУЮЩЕЙ: она меньше настоящей, а меньшая площадь даёт
        // меньшую норму — ошибка молчаливая и в дешёвую сторону, то есть замечают её на складе.
        complete = false;
        break;
      }
      if (ambiguous.has(`${g.identity} ${token}`)) {
        return {
          ok: false,
          reason: `в сегодняшних выкройках блок «${g.identity}_${token}» встречается несколько раз — какая из копий та самая, сказать нечем`,
        };
      }
      sum += g.qty * fileArea.get(`${g.identity} ${token}`)!;
    }
    if (!complete || !(sum > 0)) {
      sizesWithoutPieces.push(sizeId);
      continue;
    }
    areaBySize.set(sizeId, sum);
  }

  return {
    ok: true,
    areas: {
      areaBySize,
      agnosticCm2,
      gradedPieces: graded.size,
      sizesWithoutPieces,
      warnings,
    },
  };
}

// ── боевой вход: скачать выкройки, разобрать, посчитать ─────────────────────────────────

export type SizeAreasRequest = Omit<SizeAreasInput, 'parsed' | 'failedFiles'> & {
  sources: readonly PatternSource[];
  /** Порт разбора. По умолчанию — воркерный `defaultPatternParse` (динамический импорт). */
  parse?: PatternParse;
};

export async function sizeAreasForMarker(req: SizeAreasRequest): Promise<SizeAreasOutcome> {
  const conditions = req.conditions ?? readMarkerConditions(req.marker.summary);
  // Дешёвое и частое — до сети: раскладка без условий съёмки не станет продолжаемой оттого, что
  // ради неё скачали десять мегабайт.
  if (!conditions.recorded) {
    return {
      ok: false,
      reason:
        'у раскладки не записаны условия съёмки (припуск, слои) — повторить преобразование контура нечем',
    };
  }
  if (req.sources.length === 0) {
    return { ok: false, reason: 'выкроек этой ткани на карточке нет — считать площади не по чему' };
  }
  // Параметры РАЗБОРА — из блоба, а не из умолчаний: тесселяция дуг зависит от tol напрямую, и
  // разбор с другим допуском даёт другую площадь на той же дуге.
  const opts = rebuildParseOpts(req.marker.layout);
  const parse = req.parse ?? (await import('./marker-rebuild')).defaultPatternParse;
  let parsed: PieceDTO[];
  let failed: readonly string[];
  try {
    const out = await parse(req.sources, opts);
    parsed = out.pieces;
    failed = out.failed;
  } catch {
    return {
      ok: false,
      reason: `не удалось разобрать выкройки: ${req.sources.map((s) => s.name).join(', ')}`,
    };
  }
  return sizeAreasFromParsed({ ...req, parsed, failedFiles: failed, conditions });
}
