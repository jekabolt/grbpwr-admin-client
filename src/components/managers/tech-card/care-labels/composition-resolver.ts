// РЕЗОЛВЕР СОСТАВА КОЛОРВЕЯ ПО ЧАСТЯМ ЭТИКЕТКИ — чистые функции (план §5.1, §5.3).
//
// Состав по колорвею не хранится нигде, его выводят: строка BOM → часть этикетки (label-parts.ts)
// → материал колорвея (пин артикула в usage, иначе материал строки) → доли волокон (типизированный
// состав материала, иначе ячейка `composition` строки) → код словаря волокон → слияние строк одной
// части по расходу колорвея → целые проценты с суммой ровно 100 → строки на 10 языках ленты.
//
// Вход — СОБСТВЕННЫЕ типы, не сгенерированные: движок не ждёт регена прото. Провод → вход
// переводит adapter.ts (Ф3); здесь только арифметика и дыры.
import type { common_TechCardBomPurpose, common_TechCardBomSection } from 'api/proto-http/admin';
import { composition as compositionDict } from 'constants/garment-composition';
import { parseCompositionCode } from 'components/managers/materials/components/material-code';

import { hole, withColorway, type Hole } from './holes';
import { effectiveLabelPart, LABEL_PART_NAME, LABEL_PARTS, type PrintedPart } from './label-parts';
import { LABEL_LANGS, NON_TEXTILE_ANIMAL_PHRASE, type LabelLang } from './phrases';

// ---------- вход ----------

/** Строка BOM стиля глазами ленты. */
export type LabelBomLine = {
  lineKey: string;
  section: common_TechCardBomSection | string | undefined;
  purpose?: common_TechCardBomPurpose | string;
  /** Значение энума `TechCardBomLabelPart` с провода; нет / UNSPECIFIED — авто (§5.2). */
  labelPart?: string | null;
  /** Материал слота; 0 / нет — строка без артикула. */
  materialId?: number;
  /** Ячейка состава строки: JSON пикера / привязки материала или свободный текст. */
  composition?: string;
  name: string;
  unit?: string;
};

/** Расход колорвея по строке BOM (`TechCardColorwayUsage`), числа уже из Decimal. */
export type LabelUsage = {
  bomLineKey: string;
  /** Пин артикула на колорвей; 0 / нет — материал слота. */
  materialId?: number;
  consumption: number | null;
  sizeConsumptions: number[];
  unit?: string;
  /**
   * Ссылка на деталь кроя (T8). Строка с ней — НАЗНАЧЕНИЕ материала детали («деталь X кроится из
   * слота Y»), а не норма и не пин слота: норма и пин колорвея живут только на строке уровня
   * изделия. Три представления одной привязки; `pieceIndex` — explicit presence, 0 — настоящая
   * деталь.
   */
  pieceLineKey?: string;
  pieceId?: number;
  pieceIndex?: number;
};

/**
 * Строка рецепта, привязанная к детали, — тот же предикат, что `slot-fabrics.ts`, `bom-norm.ts`,
 * `cloth-per-unit.ts` и серверный `IsPieceMaterialAssignment`. Такая строка в составе не участвует
 * ни весом, ни пином: посчитать её источником значит умножить вес ткани на число её деталей
 * (две ткани 1:1, у одной четыре детали → 71/29 вместо 50/50 на юридической этикетке).
 */
export const isPieceBoundUsage = (u: LabelUsage): boolean =>
  !!(u.pieceLineKey ?? '').trim() || (u.pieceId ?? 0) > 0 || u.pieceIndex != null;

/** Материал каталога: типизированный состав по кодам словаря волокон. */
export type LabelMaterial = {
  id: number;
  compositionEntries: { fiberCode: string; percent: number }[];
  unit?: string;
};

/** Волокно словаря с переводами на языки ленты (B2: `Fiber.translations`, `animal_non_textile`). */
export type LabelFiber = {
  code: string;
  /** Админский ярлык словаря (`Nylon`); на ленту идёт перевод, это — только фолбэк EN. */
  name: string;
  /** Натуральный регистр; капс делает `formatRow`. Пустая строка = перевода нет. */
  translations: Partial<Record<LabelLang, string>>;
  animalNonTextile: boolean;
  archived: boolean;
};

export type FiberDict = ReadonlyMap<string, LabelFiber>;

export type ColorwayCompositionInput = {
  colorwayId?: number;
  bom: readonly LabelBomLine[];
  /** Usages ОДНОГО колорвея (строки деталей отсеиваются здесь же). Пусто — «без колорвея»: веса 1,
   *  материал слота (§5.4). */
  usages: readonly LabelUsage[];
  materials: ReadonlyMap<number, LabelMaterial>;
  fibers: FiberDict;
};

// ---------- выход ----------

export type FiberShare = { code: string; percent: number };

export type PartComposition = {
  part: PrintedPart;
  /** По убыванию %, при равенстве — по коду; сумма ровно 100 (у NOTE — пусто). */
  fibers: FiberShare[];
  /** Есть волокно с `animalNonTextile` — ради него на ленте колонка NOTE. */
  animal: boolean;
  /** Готовые строки ленты по языкам (`55% COTTON  35% LINEN`); у NOTE — фраза ст. 12. */
  rows: Record<LabelLang, string>;
  /** Строки BOM, из которых собрана часть. */
  lineKeys: string[];
};

export type ResolvedComposition = { parts: PartComposition[]; holes: Hole[] };

// ---------- коды волокон ----------

/**
 * Коды пикера (`constants/garment-composition.ts`) → коды словаря волокон. Только юридически то же
 * волокно (ЕС 1007/2011): Mulberry Silk — шёлк, Econyl — полиамид, rPET — полиэстер. Модал, лиоцелл,
 * як и прочие — САМОСТОЯТЕЛЬНЫЕ названия, псевдонима им нет: такое волокно заводят в словарь.
 */
export const PICKER_ALIAS: Readonly<Record<string, string>> = {
  SIL: 'SLK',
  MULS: 'SLK',
  SPA: 'ELS',
  LYC: 'ELS',
  RAY: 'VIS',
  OCOT: 'COT',
  SIC: 'COT',
  RWOL: 'WOL',
  MER: 'WOL',
  CHE: 'WOL',
  LTH: 'LEA',
  RPET: 'POL',
  ECO: 'NYL',
};

// Смеси пикера («Cotton-Polyester» → COT-POL) — долю каждого волокна из кода не достать.
// OCOT / RWOL стоят в той же категории, но это одно волокно — у них псевдоним.
const BLEND_CATEGORY = compositionDict.garment_composition[
  'Blends (natural + synthetic)'
] as Record<string, string>;
const BLEND_CODES = new Set(
  Object.values(BLEND_CATEGORY)
    .filter((c) => !(c in PICKER_ALIAS))
    .map((c) => c.toUpperCase()),
);
const BLEND_NAMES = new Set(
  Object.entries(BLEND_CATEGORY)
    .filter(([, c]) => !(c in PICKER_ALIAS))
    .map(([n]) => n.toLowerCase()),
);

// Имя пикера → код пикера: свободный текст «Spandex (Elastane)» доходит до SPA → ELS.
const PICKER_CODE_BY_NAME: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const cat of Object.values(compositionDict.garment_composition)) {
    for (const [name, code] of Object.entries(cat as Record<string, string>)) {
      if (!m.has(name.toLowerCase())) m.set(name.toLowerCase(), code);
    }
  }
  return m;
})();

// Цели псевдонимов — коды сида словаря; при совпадении ПО ИМЕНИ с несколькими волокнами (на бете
// `ELA` — дубль Elastane) выигрывает неархивное, затем код сида, затем алфавит.
const CANONICAL_CODES = new Set(Object.values(PICKER_ALIAS));

export type FiberAliasResult =
  | { ok: true; code: string; via: 'code' | 'alias' | 'name' }
  | { ok: false; reason: 'fibre-blend-code' | 'fibre-unknown' };

/**
 * Код из слота состава → код словаря волокон (§5.3 п. 3): точный код; псевдоним пикера; имя
 * словаря или любой перевод без учёта регистра; имя пикера → его код → псевдоним. Смесевой код
 * пикера — отдельный отказ (`fibre-blend-code`), всё прочее — `fibre-unknown`.
 */
export function fiberAlias(raw: string, dict: FiberDict): FiberAliasResult {
  const code = raw.trim();
  const upper = code.toUpperCase();
  if (!upper) return { ok: false, reason: 'fibre-unknown' };
  if (dict.has(upper)) return { ok: true, code: upper, via: 'code' };

  const aliasOf = (c: string): string | undefined => {
    const target = PICKER_ALIAS[c.toUpperCase()];
    return target && dict.has(target) ? target : undefined;
  };
  const alias = aliasOf(upper);
  if (alias) return { ok: true, code: alias, via: 'alias' };

  const lower = code.toLowerCase();
  const byName = [...dict.values()].filter(
    (f) =>
      f.name.trim().toLowerCase() === lower ||
      Object.values(f.translations).some((t) => t && t.trim().toLowerCase() === lower),
  );
  if (byName.length) {
    byName.sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) ||
        Number(CANONICAL_CODES.has(b.code)) - Number(CANONICAL_CODES.has(a.code)) ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    );
    return { ok: true, code: byName[0].code, via: 'name' };
  }

  const pickerCode = PICKER_CODE_BY_NAME.get(lower);
  if (pickerCode) {
    if (dict.has(pickerCode)) return { ok: true, code: pickerCode, via: 'name' };
    const viaName = aliasOf(pickerCode);
    if (viaName) return { ok: true, code: viaName, via: 'name' };
  }

  if (
    BLEND_CODES.has(upper) ||
    BLEND_NAMES.has(lower) ||
    (pickerCode && BLEND_CODES.has(pickerCode))
  ) {
    return { ok: false, reason: 'fibre-blend-code' };
  }
  return { ok: false, reason: 'fibre-unknown' };
}

// ---------- округление ----------

const byPercentThenCode = (a: FiberShare, b: FiberShare) =>
  b.percent - a.percent || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/**
 * Доли → целые проценты с суммой РОВНО `total` методом наибольших остатков (§5.3 п. 5): каждой доле
 * пол, недостающие единицы — долям с наибольшей дробной частью (при равенстве — большей доле, затем
 * по коду). Доля, округлившаяся в 0, выбрасывается, а оставшиеся доли заново нормируются и
 * округляются тем же правилом — сумма остаётся ровно `total`. Результат — по убыванию %, затем код.
 */
export function largestRemainder(
  shares: readonly { code: string; value: number }[],
  total = 100,
): FiberShare[] {
  let pool = shares.filter((s) => Number.isFinite(s.value) && s.value > 0);
  for (;;) {
    const sum = pool.reduce((a, s) => a + s.value, 0);
    if (!pool.length || sum <= 0) return [];
    // 1e-9: 54.9999999997 от деления не должно проиграть остаток честным 55.
    const scaled = pool.map((s) => {
      const value = Math.round(((s.value * total) / sum) * 1e9) / 1e9;
      return { code: s.code, value, percent: Math.floor(value), rem: value - Math.floor(value) };
    });
    let left = total - scaled.reduce((a, s) => a + s.percent, 0);
    const byRem = [...scaled].sort(
      (a, b) =>
        b.rem - a.rem || b.value - a.value || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    );
    for (let i = 0; left > 0; i = (i + 1) % byRem.length, left -= 1) byRem[i].percent += 1;
    if (scaled.every((s) => s.percent > 0)) {
      return scaled.map(({ code, percent }) => ({ code, percent })).sort(byPercentThenCode);
    }
    pool = scaled.filter((s) => s.percent > 0).map(({ code, value }) => ({ code, value }));
  }
}

// ---------- строки ленты ----------

/** Два пробела между волокнами — как на макете. */
export const FIBER_SEPARATOR = '  ';

/**
 * Строка части на языке ленты: `55% COTTON  35% LINEN` (§5.3 п. 7). Перевод — в верхний регистр
 * (CJK не меняется). Нет перевода: EN → имя словаря + предупреждение, иной язык → БЛОК. NOTE —
 * фраза ст. 12.
 */
export function formatRow(
  part: Pick<PartComposition, 'part' | 'fibers'>,
  lang: LabelLang,
  dict: FiberDict,
): { text: string; holes: Hole[] } {
  if (part.part === 'NOTE') return { text: NON_TEXTILE_ANIMAL_PHRASE[lang], holes: [] };
  const holes: Hole[] = [];
  const partName = LABEL_PART_NAME[part.part];
  const cells = part.fibers.map(({ code, percent }) => {
    const fiber = dict.get(code);
    const translated = fiber?.translations[lang]?.trim();
    let name = translated ? translated.toUpperCase() : '';
    if (!name && lang === 'en' && fiber?.name.trim()) {
      name = fiber.name.trim().toUpperCase();
      holes.push(
        hole(
          'en-fallback-name',
          `fibre ${code} has no EN label name — printed as "${name}" from the dictionary`,
          {
            part: part.part,
            fiberCode: code,
            lang,
          },
        ),
      );
    }
    if (!name) {
      holes.push(
        hole(
          'fibre-no-translation',
          `fibre ${code} has no ${lang.toUpperCase()} label name (${partName}) — add it in dictionaries`,
          { part: part.part, fiberCode: code, lang },
        ),
      );
      name = code;
    }
    return `${percent}% ${name}`;
  });
  return { text: cells.join(FIBER_SEPARATOR), holes };
}

// ---------- резолвер ----------

const METRE = new Set(['m', 'м', 'meter', 'meters', 'metre', 'metres', 'material_unit_m']);
const normUnit = (u?: string): string => {
  const v = (u ?? '').trim().toLowerCase();
  return METRE.has(v) ? 'm' : v;
};

type Source = {
  lineKey: string;
  lineName: string;
  unit: string;
  weight: number;
  /** Откуда вес: расход колорвея, среднее по размерам, либо «нечем взвесить» (1). */
  weighed: 'consumption' | 'sizes' | 'none';
  /** Доли по кодам словаря, нормированные к 100. */
  shares: Map<string, number>;
};

const isStructured = (v: string): boolean => {
  const t = v.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
};

function usageWeight(usage: LabelUsage | undefined): {
  weight: number;
  weighed: Source['weighed'];
} {
  if (usage?.consumption != null && Number.isFinite(usage.consumption) && usage.consumption > 0) {
    return { weight: usage.consumption, weighed: 'consumption' };
  }
  const sizes = (usage?.sizeConsumptions ?? []).filter((v) => Number.isFinite(v) && v > 0);
  if (sizes.length)
    return { weight: sizes.reduce((a, v) => a + v, 0) / sizes.length, weighed: 'sizes' };
  return { weight: 1, weighed: 'none' };
}

/**
 * Состав колорвея по частям этикетки (§5.3). Части — в порядке `LABEL_PARTS`; если хоть одна часть
 * содержит животное не-текстильное волокно, в конец добавляется псевдо-часть NOTE. Дыры — с адресом
 * (колорвей, часть, строка, волокно, язык); блок одной строки не прячет остальные части.
 */
export function resolveColorwayComposition(input: ColorwayCompositionInput): ResolvedComposition {
  const { bom, usages, materials, fibers, colorwayId } = input;
  const holes: Hole[] = [];
  const usagesByLine = new Map<string, LabelUsage[]>();
  for (const u of usages) {
    // Только строки уровня изделия: назначение детали не норма и не пин (см. `isPieceBoundUsage`).
    if (isPieceBoundUsage(u)) continue;
    const list = usagesByLine.get(u.bomLineKey) ?? [];
    list.push(u);
    usagesByLine.set(u.bomLineKey, list);
  }

  const byPart = new Map<PrintedPart, Source[]>();
  for (const line of bom) {
    const part = effectiveLabelPart(line);
    if (part === 'NOT_ON_LABEL') continue;
    const partName = LABEL_PART_NAME[part];
    const lineUsages = usagesByLine.get(line.lineKey);
    if (!lineUsages?.length) {
      holes.push(
        hole(
          'no-usage',
          `${partName}: line "${line.name}" has no usage in this colourway — counted with weight 1`,
          {
            part,
            lineKey: line.lineKey,
          },
        ),
      );
    }
    // Строка без usage — один источник весом 1; иначе по источнику на usage (пин у каждого свой).
    for (const usage of lineUsages?.length ? lineUsages : [undefined]) {
      const materialId =
        usage?.materialId && usage.materialId > 0 ? usage.materialId : line.materialId;
      const material = materialId ? materials.get(materialId) : undefined;
      // Пин колорвея на ДРУГОЙ артикул: ячейка `composition` строки описывает артикул слота, и
      // её состав на ленте другого артикула — неверная юридическая этикетка. Лучше дыра.
      const pinned = !!materialId && materialId !== (line.materialId || 0);

      let raw: { code: string; percent: number }[] = [];
      if (material?.compositionEntries.length) {
        raw = material.compositionEntries.map((e) => ({ code: e.fiberCode, percent: e.percent }));
      } else if (pinned) {
        holes.push(
          hole(
            'pinned-material-no-composition',
            `${partName}: line "${line.name}" — the colourway pins article #${materialId}, which has no fibre composition; set its fibres in materials`,
            { part, lineKey: line.lineKey, materialId },
          ),
        );
        continue;
      } else if (line.composition?.trim()) {
        raw = parseCompositionCode(line.composition);
        if (raw.length && !isStructured(line.composition)) {
          holes.push(
            hole(
              'legacy-free-text-composition',
              `${partName}: line "${line.name}" composition was read from free text — check the shares`,
              { part, lineKey: line.lineKey },
            ),
          );
        }
      }

      const shares = new Map<string, number>();
      let sourceSum = 0;
      for (const r of raw) {
        const pct = Number.isFinite(r.percent) ? r.percent : 0;
        sourceSum += pct;
        const res = fiberAlias(r.code, fibers);
        if (!res.ok) {
          holes.push(
            res.reason === 'fibre-blend-code'
              ? hole(
                  'fibre-blend-code',
                  `${partName}: line "${line.name}" uses the blend code "${r.code}" — a blend cannot be split into fibres; set the material composition by fibre`,
                  { part, lineKey: line.lineKey, fiberCode: r.code },
                )
              : hole(
                  'fibre-unknown',
                  `${partName}: line "${line.name}" — fibre "${r.code}" is not in the fibre dictionary`,
                  { part, lineKey: line.lineKey, fiberCode: r.code },
                ),
          );
          continue;
        }
        if (res.via !== 'code') {
          holes.push(
            hole(
              'fibre-by-name',
              `${partName}: line "${line.name}" — "${r.code}" read as fibre ${res.code}`,
              {
                part,
                lineKey: line.lineKey,
                fiberCode: res.code,
              },
            ),
          );
        }
        if (pct > 0) shares.set(res.code, (shares.get(res.code) ?? 0) + pct);
      }

      if (!raw.length || sourceSum <= 0) {
        holes.push(
          hole(
            'part-no-composition',
            `${partName}: line "${line.name}" has no composition — set the material's fibres or the line's composition`,
            { part, lineKey: line.lineKey },
          ),
        );
        continue;
      }
      if (Math.abs(sourceSum - 100) > 1) {
        holes.push(
          hole(
            'part-not-100',
            `${partName}: line "${line.name}" composition sums to ${sourceSum}% — normalised to 100%`,
            { part, lineKey: line.lineKey },
          ),
        );
      }
      const known = [...shares.values()].reduce((a, v) => a + v, 0);
      if (known <= 0) continue;
      for (const [code, v] of shares) shares.set(code, (v * 100) / known);

      const { weight, weighed } = usageWeight(usage);
      const list = byPart.get(part) ?? [];
      list.push({
        lineKey: line.lineKey,
        lineName: line.name,
        unit: normUnit(usage?.unit || line.unit || material?.unit),
        weight,
        weighed,
        shares,
      });
      byPart.set(part, list);
    }
  }

  const parts: PartComposition[] = [];
  for (const part of LABEL_PARTS) {
    const sources = byPart.get(part);
    if (!sources?.length) continue;
    const partName = LABEL_PART_NAME[part];
    let weights = sources.map((s) => s.weight);
    // Одна строка — вес неважен, и предупреждать не о чем.
    if (sources.length > 1) {
      const units = new Set(sources.map((s) => s.unit));
      if (units.size > 1) {
        weights = sources.map(() => 1);
        holes.push(
          hole(
            'mixed-units',
            `${partName}: lines are measured in different units (${[...units].map((u) => u || '—').join(', ')}) — mixed with equal weights`,
            { part },
          ),
        );
      } else if (sources.some((s) => s.weighed === 'none')) {
        holes.push(
          hole(
            'equal-weight',
            `${partName}: ${sources
              .filter((s) => s.weighed === 'none')
              .map((s) => `"${s.lineName}"`)
              .join(', ')} has no consumption in this colourway — weighted 1`,
            { part },
          ),
        );
      }
    }
    const totalWeight = weights.reduce((a, w) => a + w, 0);
    const merged = new Map<string, number>();
    sources.forEach((s, i) => {
      for (const [code, pct] of s.shares)
        merged.set(code, (merged.get(code) ?? 0) + (weights[i] * pct) / totalWeight);
    });
    const fibersOut = largestRemainder([...merged].map(([code, value]) => ({ code, value })));
    if (!fibersOut.length) continue;
    parts.push({
      part,
      fibers: fibersOut,
      animal: fibersOut.some((f) => fibers.get(f.code)?.animalNonTextile),
      rows: {} as Record<LabelLang, string>,
      lineKeys: [...new Set(sources.map((s) => s.lineKey))],
    });
  }
  if (parts.some((p) => p.animal)) {
    parts.push({
      part: 'NOTE',
      fibers: [],
      animal: false,
      rows: {} as Record<LabelLang, string>,
      lineKeys: [],
    });
  }
  for (const p of parts) {
    for (const lang of LABEL_LANGS) {
      const row = formatRow(p, lang, fibers);
      p.rows[lang] = row.text;
      holes.push(...row.holes);
    }
  }

  return { parts, holes: withColorway(dedupeHoles(holes), colorwayId) };
}

// Одна и та же дыра приходит от каждой строки/usage части — на экране она нужна один раз.
function dedupeHoles(holes: Hole[]): Hole[] {
  const seen = new Set<string>();
  return holes.filter((h) => {
    const key = `${h.code}|${h.ref.part ?? ''}|${h.ref.lineKey ?? ''}|${h.ref.fiberCode ?? ''}|${h.ref.lang ?? ''}|${h.ref.materialId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
