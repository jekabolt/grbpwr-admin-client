import type {
  common_AdminColorwayRef,
  common_Color,
  common_ColorwayColour,
  common_Material,
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardColorwayUsage,
} from 'api/proto-http/admin';
import {
  FIBRE_NAME_BY_CODE,
  materialCompositionCode,
  parseCompositionCode,
} from 'components/managers/materials/components/material-code';
import { parseDecimalNumber } from 'utils/decimal';
import { findDictionaryColour } from './design/render/model';
import { materialFabricWeight, materialFabricWidth } from './nesting/fabric-weight';
import { normalizePantone, findPantone } from './pantone-swatches';
import {
  colourTokens,
  coloursMatch,
  materialTokens,
  PIECE_SECTIONS,
  type ColourKeys,
} from './use-colourway-auto';
import { wireInt } from './wire-int';

// ═══ АВТО-ПОДБОР АРТИКУЛА ПОД КОЛОРВЕЙ — ЧИСТЫЙ, ДЕТЕРМИНИРОВАННЫЙ МАТЧЕР ═══════════════════════
//
// Для каждого слота BOM (строки тех-карты) ищет в каталоге артикул той же секции в цвет колорвея
// и ранжирует кандидатов по цвету (CIEDE2000) и по сходству с артикулом слота (плотность, ширина,
// волокно, поставщик, цена, наличие). Никаких эффектов и никакого ИИ: одинаковый вход — одинаковый
// ответ, поэтому план можно пересчитывать на каждом рендере.
//
// ЧТО ПИШЕТСЯ АВТОМАТИЧЕСКИ — РЕШАЕТ ВЫЗЫВАЮЩИЙ, но различитель даётся здесь: `exact` = ровно один
// кандидат с ТОЧНЫМ совпадением цвета (тот же пантон, тот же hex или та же полная метка — общий с
// planAuto `coloursMatch`) в том же семействе (та же секция и класс материала). Остальное — до трёх
// подсказок «выбери одну из N», лучшая первой.

// ── ВЕСА (сумма не обязана быть 1: счёт нормируется по применимым факторам) ─────────────────────
/** Цвет: главный фактор — ткань не того цвета не спасает никакое сходство. */
export const W_COLOUR = 0.5;
/** Плотность г/м² в пределах ±GSM_TOLERANCE от артикула слота. */
export const W_GSM = 0.12;
/** Ширина рулона: не уже артикула слота (только рулонные секции — по ней ляжет раскладка). */
export const W_WIDTH = 0.12;
/** Основное волокно состава совпадает. */
export const W_FIBRE = 0.1;
/** Тот же поставщик, что у артикула слота — бонус, не требование. */
export const W_SUPPLIER = 0.05;
/** Цена в пределах ±PRICE_TOLERANCE (сравнивается только в одной валюте). */
export const W_PRICE = 0.06;
/** На складе > 0 (только если вызывающий передал остатки). */
export const W_STOCK = 0.05;

/** Допуск плотности: ±15 % — «same gsm». */
export const GSM_TOLERANCE = 0.15;
/** За допуском плотность гаснет линейно до нуля ещё на эту долю. */
export const GSM_FALLOFF = 0.35;
/** Допуск цены: ±30 %. */
export const PRICE_TOLERANCE = 0.3;
/** Цвет: ΔE, при котором цветовой балл падает до нуля (линейно от ΔE 0). */
export const DELTA_E_ZERO = 30;
/** Кандидат с известным цветом дальше этого ΔE не предлагается вовсе — шум в пикере. */
export const MAX_SUGGEST_DELTA_E = 20;
/** Артикул слота «уже в цвет» при ΔE не больше этого — слот остаётся как есть. */
export const KEEP_DELTA_E = 3;
/** Цвет кандидата неизвестен: нейтральный, низкий цветовой балл (ниже любого близкого цвета). */
export const COLOUR_UNKNOWN_SCORE = 0.35;
/** Фактор сходства, у которого нет данных с одной из сторон: нейтральный балл. */
export const UNKNOWN_SCORE = 0.5;
/** Только-образцовый артикул (MATERIAL_PURPOSE_SAMPLE) в финальном колорвее — множитель счёта. */
export const SAMPLE_PENALTY = 0.85;
/** confidence 'high': ΔE не больше этого… */
export const HIGH_MAX_DELTA_E = 6;
/** …и отрыв счёта от следующего кандидата не меньше этого. */
export const HIGH_MARGIN = 0.08;
/** Подсказок на слот, когда точного совпадения нет. */
export const MAX_SUGGESTIONS = 3;

export type Proposal = {
  lineKey: string;
  materialId: number;
  /** 0..1, нормирован по применимым факторам. */
  score: number;
  confidence: 'high' | 'low';
  /** Единственный кандидат с точным совпадением цвета в том же семействе — можно писать авто. */
  exact: boolean;
  /** ΔE2000 к целевому цвету; null — цвет кандидата или цели не переводится в Lab. */
  deltaE: number | null;
  reasons: string[];
  /** reasons.join(' · ') */
  reason: string;
};

export type ProposePinsInput = {
  techCard: common_TechCard;
  colorwayId: number;
  catalog: readonly common_Material[];
  /** Словарь цветов (DictionaryProvider) — код семейства колорвея и именованные цвета → hex. */
  colours?: readonly common_Color[];
  /** Остатки на складе по materialId. Не передан — фактор наличия не учитывается. */
  stock?: ReadonlyMap<number, number>;
};

// ── ЦВЕТ: hex → CIE Lab (D65) → ΔE2000 ─────────────────────────────────────────────────────────

type Lab = { L: number; a: number; b: number };

function hex6(s?: string): string {
  const h = (s ?? '').trim().replace(/^#/, '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return /^[0-9a-fA-F]{6}$/.test(full) ? full.toLowerCase() : '';
}

export function hexToLab(hex: string): Lab | null {
  const h = hex6(hex);
  if (!h) return null;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(parseInt(h.slice(0, 2), 16));
  const g = lin(parseInt(h.slice(2, 4), 16));
  const b = lin(parseInt(h.slice(4, 6), 16));
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIEDE2000 (Sharma, Wu, Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000(p: Lab, q: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(p.a, p.b);
  const C2 = Math.hypot(q.a, q.b);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
  const a1 = (1 + G) * p.a;
  const a2 = (1 + G) * q.a;
  const c1 = Math.hypot(a1, p.b);
  const c2 = Math.hypot(a2, q.b);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1 = hue(p.b, a1);
  const h2 = hue(q.b, a2);
  const dL = q.L - p.L;
  const dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * rad);
  const Lm = (p.L + q.L) / 2;
  const cm = (c1 + c2) / 2;
  let hm = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) > 180) hm = h1 + h2 < 360 ? hm + 360 : hm - 360;
    hm /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hm - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(cm, 7) / (Math.pow(cm, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lm - 50, 2)) / Math.sqrt(20 + Math.pow(Lm - 50, 2));
  const Sc = 1 + 0.045 * cm;
  const Sh = 1 + 0.015 * cm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  const l = dL / Sl;
  const c = dC / Sc;
  const h = dH / Sh;
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
}

// Цвет, как его называют три поля: hex, пантон, слово/код словаря. Первый читаемый даёт hex.
type ColourSpec = { hex?: string; pantone?: string; label?: string };

function dictionaryHex(colours: readonly common_Color[] | undefined, word?: string): string {
  const w = (word ?? '').trim();
  if (!w) return '';
  const byCode = findDictionaryColour(colours, w);
  if (byCode?.hex) return hex6(byCode.hex);
  const lw = w.toLowerCase();
  const byName = (colours ?? []).find(
    (c) => !c.archived && (c.name ?? '').trim().toLowerCase() === lw,
  );
  return hex6(byName?.hex);
}

function pantoneHex(code?: string): string {
  // Книга (TCX/TPX/C…) у ссылки своя, номер цвета общий: промах по полному коду — по номеру.
  const norm = normalizePantone(code);
  if (!norm) return '';
  const bare = norm.replace(/\s+[A-Z]+$/, '');
  return hex6(findPantone(norm)?.hex) || (bare !== norm ? hex6(findPantone(bare)?.hex) : '');
}

function specHex(s: ColourSpec, colours?: readonly common_Color[]): string {
  return (
    hex6(s.hex) ||
    pantoneHex(s.pantone) ||
    hex6(s.label) ||
    pantoneHex(s.label) ||
    dictionaryHex(colours, s.label)
  );
}

// У материала нет поля hex: «цвет» бывает словом, пантоном или «#RRGGBB».
function materialHex(m: common_Material, colours?: readonly common_Color[]): string {
  return specHex({ pantone: m.pantone, label: m.color }, colours);
}

// ── ЦЕЛЬ СЛОТА ─────────────────────────────────────────────────────────────────────────────────

type Target = { keys: ColourKeys; lab: Lab | null; slotMapped: boolean };

const blankRef = (colour: common_ColorwayColour): common_AdminColorwayRef =>
  ({ colours: [colour] }) as unknown as common_AdminColorwayRef;

const emptyKeys = (k: ColourKeys) => k.pantone.size + k.hex.size + k.label.size === 0;

function targetOf(
  cw: common_AdminColorwayRef,
  usage: common_TechCardColorwayUsage | undefined,
  colours?: readonly common_Color[],
): Target | null {
  // 1) Цвет, названный на строке рецепта этого слота (usage.color / usage.pantone).
  const slotColour = (usage?.color ?? '').trim();
  const slotPantone = (usage?.pantone ?? '').trim();
  if (slotColour || slotPantone) {
    const keys = colourTokens(
      blankRef({ pantone: slotPantone, hex: slotColour, label: slotColour, pantoneSystem: '' }),
    );
    const hex = specHex({ pantone: slotPantone, label: slotColour }, colours);
    if (!emptyKeys(keys)) return { keys, lab: hexToLab(hex), slotMapped: true };
  }
  // 2) Главный цвет колорвея: палитра[0], затем разработка, затем семейство словаря.
  const keys = colourTokens(cw, colours);
  if (emptyKeys(keys)) return null;
  const main = cw.colours?.[0];
  const hex =
    specHex({ hex: main?.hex, pantone: main?.pantone, label: main?.label }, colours) ||
    specHex({ hex: cw.devHex, pantone: cw.pantone, label: cw.devName }, colours) ||
    dictionaryHex(colours, cw.colorCode);
  return { keys, lab: hexToLab(hex), slotMapped: false };
}

// ── СХОДСТВО С АРТИКУЛОМ СЛОТА ─────────────────────────────────────────────────────────────────

const num = (raw?: string): number => {
  const v = parseDecimalNumber(raw ?? '');
  return Number.isFinite(v) && v > 0 ? v : NaN;
};
const lc = (s?: string) => (s ?? '').trim().toLowerCase();

function mainFibre(m: common_Material | undefined, fallbackComposition?: string): string {
  const entries = (m?.compositionEntries ?? [])
    .map((e) => ({
      code: (e.name || e.fiberCode || '').trim(),
      percent: parseDecimalNumber(e.percent?.value ?? '') || 0,
    }))
    .filter((e) => e.code);
  const shares = entries.length
    ? entries
    : parseCompositionCode(m ? materialCompositionCode(m) : fallbackComposition);
  if (!shares.length) return '';
  const top = shares.slice().sort((a, b) => b.percent - a.percent)[0];
  return lc(FIBRE_NAME_BY_CODE[top.code] ?? top.code);
}

type Reference = {
  gsm: number;
  width: number;
  fibre: string;
  supplier: string;
  price: number;
  currency: string;
};

function referenceOf(line: common_TechCardBomItem, def: common_Material | undefined): Reference {
  return {
    gsm: num(materialFabricWeight(def)) || num(line.fabricWeightGsm?.value),
    width:
      num(line.fabricWidth?.value) ||
      num(line.effectiveFabricWidthCm?.value) ||
      num(materialFabricWidth(def)),
    fibre: mainFibre(def, line.composition),
    supplier: lc(def?.supplier) || lc(line.supplier),
    price: num(def?.latestPrice?.price?.value) || num(line.unitPrice?.value),
    currency: (def?.latestPrice?.currency || line.currency || '').trim().toUpperCase(),
  };
}

const fmt = (n: number) => String(Math.round(n));

type Scored = {
  m: common_Material;
  id: number;
  score: number;
  deltaE: number | null;
  exactColour: boolean;
  reasons: string[];
};

function scoreCandidate(
  m: common_Material,
  target: Target,
  ref: Reference | null,
  roll: boolean,
  finalColourway: boolean,
  colours: readonly common_Color[] | undefined,
  stock: ReadonlyMap<number, number> | undefined,
): Scored {
  const id = wireInt(m.id);
  const reasons: string[] = [];
  let sum = 0;
  let weights = 0;
  const add = (w: number, s: number) => {
    sum += w * s;
    weights += w;
  };

  // Цвет
  const exactColour = coloursMatch(materialTokens(m), target.keys);
  const lab = hexToLab(materialHex(m, colours));
  const deltaE = lab && target.lab ? deltaE2000(lab, target.lab) : null;
  if (exactColour) {
    add(W_COLOUR, 1);
    reasons.push(deltaE !== null ? `exact colour · ΔE ${fmt(deltaE)}` : 'exact colour');
  } else if (deltaE !== null) {
    add(W_COLOUR, Math.max(0, 1 - deltaE / DELTA_E_ZERO));
    reasons.push(`colour ΔE ${fmt(deltaE)}`);
  } else {
    add(W_COLOUR, COLOUR_UNKNOWN_SCORE);
    reasons.push('colour unknown');
  }

  // Сходство с артикулом слота — только если он есть.
  if (ref) {
    const gsm = num(materialFabricWeight(m));
    if (Number.isFinite(gsm) && Number.isFinite(ref.gsm)) {
      const rel = Math.abs(gsm - ref.gsm) / ref.gsm;
      if (rel <= GSM_TOLERANCE) {
        add(W_GSM, 1);
        reasons.push('same gsm');
      } else {
        add(W_GSM, Math.max(0, 1 - (rel - GSM_TOLERANCE) / GSM_FALLOFF));
        reasons.push(`gsm ${fmt(gsm)} vs ${fmt(ref.gsm)}`);
      }
    } else add(W_GSM, UNKNOWN_SCORE);

    if (roll) {
      const width = num(materialFabricWidth(m));
      if (Number.isFinite(width) && Number.isFinite(ref.width)) {
        if (width >= ref.width) {
          add(W_WIDTH, 1);
          reasons.push(width > ref.width ? `wider ${fmt(width)} cm` : 'same width');
        } else {
          add(W_WIDTH, 0);
          reasons.push(`narrower ${fmt(width)} < ${fmt(ref.width)} cm`);
        }
      } else add(W_WIDTH, UNKNOWN_SCORE);
    }

    const fibre = mainFibre(m);
    if (fibre && ref.fibre) {
      add(W_FIBRE, fibre === ref.fibre ? 1 : 0);
      if (fibre === ref.fibre) reasons.push(`same fibre ${fibre}`);
      else reasons.push(`fibre ${fibre}`);
    } else add(W_FIBRE, UNKNOWN_SCORE);

    if (ref.supplier) {
      const same = lc(m.supplier) === ref.supplier;
      add(W_SUPPLIER, same ? 1 : 0);
      if (same) reasons.push('same supplier');
    }

    const price = num(m.latestPrice?.price?.value);
    const currency = (m.latestPrice?.currency ?? '').trim().toUpperCase();
    if (Number.isFinite(price) && Number.isFinite(ref.price) && currency === ref.currency) {
      const ok = Math.abs(price - ref.price) / ref.price <= PRICE_TOLERANCE;
      add(W_PRICE, ok ? 1 : 0);
      reasons.push(ok ? 'similar price' : price > ref.price ? 'pricier' : 'cheaper');
    } else add(W_PRICE, UNKNOWN_SCORE);
  }

  if (stock) {
    const qty = stock.get(id) ?? 0;
    add(W_STOCK, qty > 0 ? 1 : 0);
    reasons.push(qty > 0 ? 'in stock' : 'no stock');
  }

  let score = weights > 0 ? sum / weights : 0;
  if (finalColourway && m.purpose === 'MATERIAL_PURPOSE_SAMPLE') {
    score *= SAMPLE_PENALTY;
    reasons.push('sample-only article');
  }
  return { m, id, score: Math.round(score * 1000) / 1000, deltaE, exactColour, reasons };
}

// ── ПЛАН ПО СЛОТАМ ─────────────────────────────────────────────────────────────────────────────

/** Строка изделия (не детали) этого слота в рецепте колорвея. */
function garmentUsage(
  cw: common_AdminColorwayRef,
  line: common_TechCardBomItem,
  index: number,
): common_TechCardColorwayUsage | undefined {
  const key = line.lineKey ?? '';
  return (cw.usages ?? []).find((u) => {
    if ((u.pieceLineKey ?? '') || u.pieceIndex !== undefined) return false;
    if (u.bomLineKey) return !!key && u.bomLineKey === key;
    return u.bomItemIndex === index;
  });
}

// Артикула слота нет в каталоге (или слот не привязан): судит цвет, записанный на самой строке BOM.
function lineAlreadyInColour(
  line: common_TechCardBomItem,
  target: Target,
  colours?: readonly common_Color[],
): boolean {
  const pantone = (line.pantone ?? '').trim();
  const colour = (line.color ?? '').trim();
  if (!pantone && !colour) return false;
  const keys = colourTokens(blankRef({ pantone, hex: colour, label: colour, pantoneSystem: '' }));
  if (coloursMatch(keys, target.keys)) return true;
  const lab = hexToLab(specHex({ pantone, label: colour }, colours));
  return !!lab && !!target.lab && deltaE2000(lab, target.lab) <= KEEP_DELTA_E;
}

const sameFamily = (m: common_Material, line: common_TechCardBomItem, def?: common_Material) =>
  m.section === line.section &&
  (!def?.materialClass ||
    def.materialClass === 'MATERIAL_CLASS_UNKNOWN' ||
    !m.materialClass ||
    m.materialClass === def.materialClass);

const bySlotRank = (a: Scored, b: Scored) =>
  b.score - a.score || (a.deltaE ?? Infinity) - (b.deltaE ?? Infinity) || a.id - b.id;

function proposal(
  lineKey: string,
  s: Scored,
  confidence: 'high' | 'low',
  exact: boolean,
  extra: string[] = [],
): Proposal {
  const reasons = [...extra, ...s.reasons];
  return {
    lineKey,
    materialId: s.id,
    score: s.score,
    confidence,
    exact,
    deltaE: s.deltaE === null ? null : Math.round(s.deltaE * 10) / 10,
    reasons,
    reason: reasons.join(' · '),
  };
}

/**
 * Предложения пинов артикула для колорвея `colorwayId`, по порядку слотов BOM.
 *
 * На слот: либо ОДНО предложение с `exact: true` (единственный кандидат в точный цвет), либо до
 * MAX_SUGGESTIONS подсказок (`exact: false`, лучшая первой), либо ничего — слот уже с ручным
 * пином, без секции и артикула, артикул слота уже в цвет, или подходящих кандидатов нет.
 */
export function proposePins({
  techCard,
  colorwayId,
  catalog,
  colours,
  stock,
}: ProposePinsInput): Proposal[] {
  const cw = (techCard.colorways ?? []).find((c) => wireInt(c.colorwayId) === colorwayId);
  if (!cw) return [];
  const finalColourway =
    cw.status === 'COLORWAY_LIFECYCLE_STATUS_ACTIVE' ||
    cw.status === 'COLORWAY_LIFECYCLE_STATUS_HIDDEN';
  const lines = techCard.techCard?.bomItems ?? [];
  const live = catalog.filter((m) => !m.archived && wireInt(m.id) > 0);
  const out: Proposal[] = [];

  lines.forEach((line, index) => {
    const lineKey = line.lineKey ?? '';
    const defaultId = wireInt(line.materialId);
    if (!lineKey) return;
    if (!line.section) return; // без секции не из чего выбирать (и непривязанный — тем более)

    const usage = garmentUsage(cw, line, index);
    const pinned = wireInt(usage?.materialId);
    if (pinned > 0 && pinned !== defaultId) return; // ручной пин — не трогаем

    const target = targetOf(cw, usage, colours);
    if (!target) return; // колорвей без цвета: матчить не с чем

    const def = defaultId ? catalog.find((m) => wireInt(m.id) === defaultId) : undefined;
    const ref = defaultId || def ? referenceOf(line, def) : null;
    const roll = PIECE_SECTIONS.has(line.section);
    const candidates = live.filter((m) => m.section === line.section);
    const scored = candidates
      .map((m) => scoreCandidate(m, target, ref, roll, finalColourway, colours, stock))
      .sort(bySlotRank);

    // Артикул слота уже в цвет — слот остаётся как есть.
    const self = scored.find((s) => s.id === defaultId);
    if (self && (self.exactColour || (self.deltaE !== null && self.deltaE <= KEEP_DELTA_E))) return;
    if (!self && lineAlreadyInColour(line, target, colours)) return;

    const others = scored.filter((s) => s.id !== defaultId);
    const exact = others.filter((s) => s.exactColour && sameFamily(s.m, line, def));
    if (exact.length === 1) {
      out.push(proposal(lineKey, exact[0], 'high', true));
      return;
    }
    if (exact.length > 1) {
      // Несколько артикулов в точный цвет — решает человек; лучшие первыми.
      exact.slice(0, MAX_SUGGESTIONS).forEach((s, i) => {
        const next = exact[i + 1];
        const confident = i === 0 && (!next || s.score - next.score >= HIGH_MARGIN);
        out.push(
          proposal(lineKey, s, confident ? 'high' : 'low', false, [`one of ${exact.length} exact`]),
        );
      });
      return;
    }

    const pool = others.filter((s) => s.deltaE === null || s.deltaE <= MAX_SUGGEST_DELTA_E);
    pool.slice(0, MAX_SUGGESTIONS).forEach((s, i) => {
      const next = pool[i + 1];
      const confident =
        i === 0 &&
        s.deltaE !== null &&
        s.deltaE <= HIGH_MAX_DELTA_E &&
        (!next || s.score - next.score >= HIGH_MARGIN);
      out.push(proposal(lineKey, s, confident ? 'high' : 'low', false));
    });
  });
  return out;
}
