// АДАПТЕР ПРОВОД → ВХОД ДВИЖКА СОСТАВНИКОВ (план §9.2).
//
// Движок (резолвер, раскладка) принимает СОБСТВЕННЫЕ типы (`composition-resolver.ts`), а не
// сгенерированные: он не ждёт регена прото. Здесь — единственное место, которое знает провод:
// сохранённая карточка (GetTechCard), колорвеи полностью (GetColorwayByID — ради страны),
// материалы, словарь, прогоны. Всё, чего на проводе не хватает для ленты, становится ДЫРОЙ с
// адресом, а не догадкой: пустая клетка на ленте неотличима от «данных нет».
//
// Чистая часть — `adaptCareLabels` (фикстурой проверяется без сети); хук `useCareLabelSource`
// только собирает запросы и отдаёт их статусы гейту печати.
import { useQueries } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  common_AdminColorwayRef,
  common_ColorwayLifecycleStatus,
  common_Dictionary,
  common_Material,
  common_ProductionRun,
  common_ProductionRunStatus,
  common_TechCard,
  GetColorwayByIDResponse,
  googletype_Decimal,
} from 'api/proto-http/admin';
import {
  buildCareVocabulary,
  careCodes,
} from 'components/managers/product/components/care/care-codes';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { depStatus, type PrintDep } from 'components/managers/print/use-print-ready';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import type {
  FiberDict,
  LabelBomLine,
  LabelFiber,
  LabelMaterial,
  LabelUsage,
} from './composition-resolver';
import { hole, type Hole } from './holes';
import { isLabelLang, type LabelLang } from './phrases';
import type { WireBomItem, WireFiber } from './wire-shim';

const ORIGIN = 'TECH_CARD_LABEL_TYPE_ORIGIN';
const CARE = 'TECH_CARD_LABEL_TYPE_CARE';
const ACTIVE: common_ColorwayLifecycleStatus = 'COLORWAY_LIFECYCLE_STATUS_ACTIVE';

// ---------- выход ----------

export type CareLabelSize = {
  id: number;
  /** Имя словаря как есть (`xs_44ta_m`). */
  name: string;
  /** Как на ленте: `formatSizeName`, верхний регистр (`XS [44]`). */
  label: string;
  /** Порядковый номер размера в SKU, 1..99; null — у размера его нет (дыра `size-no-ord`). */
  skuOrd: number | null;
};

export type CareLabelColorway = {
  id: number;
  /** `RC27-99999-OFW`; пусто — дыра `no-sku`. */
  baseSku: string;
  /** EN-имя цвета: `name_i18n[en]` → `dev_name`; пусто — дыра `no-colour-name`. */
  colourName: string;
  status: common_ColorwayLifecycleStatus | undefined;
  active: boolean;
  /** Код страны словаря (`PL`); пусто — страну взяли из ORIGIN-этикетки или её нет. */
  countryCode: string;
  /** Имя страны для `MADE IN …` (натуральный регистр; капс делает раскладка). */
  countryName: string;
  usages: LabelUsage[];
  /** Дыры данных колорвея (SKU, цвет, страна, статус). Состав добавит резолвер. */
  holes: Hole[];
};

export type CareLabelRun = {
  id: number;
  status: common_ProductionRunStatus | undefined;
  /** Подпись для выпадашки: `run #12 · planned · 2026-09-01`. */
  label: string;
  lines: { productId: number; sizeId: number; plannedQty: number }[];
};

export type CareLabelData = {
  techCardId: number;
  styleNumber: string;
  styleName: string;
  colorways: CareLabelColorway[];
  /** Размерный ряд карточки в её порядке. */
  sizes: CareLabelSize[];
  bom: LabelBomLine[];
  materials: Map<number, LabelMaterial>;
  fibers: FiberDict;
  /** Уход стиля: коды в порядке словаря и EN-проза `short_prose` на каждый. */
  care: { codes: string[]; prose: string[] };
  runs: CareLabelRun[];
  /** Дыры уровня стиля (нет колорвеев, пустой уход, размер без номера). */
  holes: Hole[];
};

export type CareLabelSourceInput = {
  techCard: common_TechCard;
  /** GetColorwayByID по id колорвея; нет ответа (ещё едет / отказ) — страна из ORIGIN. */
  colorwayFull: ReadonlyMap<number, GetColorwayByIDResponse | undefined>;
  materials: readonly common_Material[];
  dictionary: common_Dictionary | undefined;
  runs: readonly common_ProductionRun[];
};

// ---------- мелочи ----------

export const decimalNumber = (d: googletype_Decimal | undefined): number | null => {
  const raw = d?.value?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** SKU варианта: `{base}-{sku_ord:02}` (`internal/store/product/sku.go`, ордер 1..99). */
export const variantSku = (baseSku: string, skuOrd: number): string =>
  `${baseSku}-${String(skuOrd).padStart(2, '0')}`;

const validSkuOrd = (n: number | undefined): number | null =>
  n != null && Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;

/** ORIGIN-этикетка — свободный текст («Made in Poland», «Poland»): вынуть страну. */
export const originCountryText = (content: string | undefined): string =>
  (content ?? '')
    .trim()
    .replace(/^made\s+in\s+/i, '')
    .replace(/[.\s]+$/, '')
    .trim();

const norm = (s: string) => s.trim().toLowerCase();

// ---------- чистый адаптер ----------

export function adaptFibers(fibers: readonly WireFiber[] | undefined): FiberDict {
  const out = new Map<string, LabelFiber>();
  for (const f of fibers ?? []) {
    if (!f.code) continue;
    const translations: Partial<Record<LabelLang, string>> = {};
    for (const t of f.translations ?? []) {
      const lang = (t.labelLang ?? '').trim();
      const name = (t.name ?? '').trim();
      if (isLabelLang(lang) && name) translations[lang] = name;
    }
    out.set(f.code, {
      code: f.code,
      name: f.name ?? f.code,
      translations,
      animalNonTextile: !!f.animalNonTextile,
      archived: !!f.archived,
    });
  }
  return out;
}

export function adaptMaterials(materials: readonly common_Material[]): Map<number, LabelMaterial> {
  const out = new Map<number, LabelMaterial>();
  for (const m of materials) {
    if (!m.id) continue;
    out.set(m.id, {
      id: m.id,
      compositionEntries: (m.compositionEntries ?? [])
        .filter((e) => !!e.fiberCode)
        .map((e) => ({ fiberCode: e.fiberCode!, percent: decimalNumber(e.percent) ?? 0 })),
      unit: m.unit ?? undefined,
    });
  }
  return out;
}

export function adaptBom(items: readonly WireBomItem[] | undefined): LabelBomLine[] {
  return (items ?? [])
    .filter((b) => !!b.lineKey)
    .map((b) => ({
      lineKey: b.lineKey!,
      section: b.section,
      purpose: b.purpose,
      labelPart: b.labelPart ?? null,
      materialId: b.materialId || undefined,
      composition: b.composition ?? undefined,
      name: b.name ?? '',
      unit: b.unit ?? undefined,
    }));
}

export function adaptUsages(c: common_AdminColorwayRef): LabelUsage[] {
  return (c.usages ?? [])
    .filter((u) => !!u.bomLineKey)
    .map((u) => ({
      bomLineKey: u.bomLineKey!,
      materialId: u.materialId || undefined,
      consumption: decimalNumber(u.consumption),
      sizeConsumptions: (u.sizeConsumptions ?? [])
        .map((s) => decimalNumber(s.consumption))
        .filter((n): n is number => n != null),
    }));
}

const RUN_STATUS_WORD: Partial<Record<common_ProductionRunStatus, string>> = {
  PRODUCTION_RUN_STATUS_PLANNED: 'planned',
  PRODUCTION_RUN_STATUS_IN_PROGRESS: 'in progress',
  PRODUCTION_RUN_STATUS_RECEIVED: 'received',
  PRODUCTION_RUN_STATUS_CLOSED: 'closed',
  PRODUCTION_RUN_STATUS_CANCELLED: 'cancelled',
};

export function adaptRuns(runs: readonly common_ProductionRun[]): CareLabelRun[] {
  return runs
    .filter((r) => !!r.id)
    .map((r) => {
      const status = r.run?.status;
      const word = (status && RUN_STATUS_WORD[status]) || 'run';
      const date = r.createdAt ? String(r.createdAt).slice(0, 10) : '';
      return {
        id: r.id!,
        status,
        label: [`run #${r.id}`, word, date].filter(Boolean).join(' · '),
        lines: (r.run?.lines ?? []).map((l) => ({
          productId: l.productId ?? 0,
          sizeId: l.sizeId ?? 0,
          plannedQty: l.plannedQty ?? 0,
        })),
      };
    });
}

/**
 * Провод → вход движка. Чистая: одна и та же карточка даёт один и тот же набор, и дыры знают адрес
 * (колорвей, размер), чтобы экран мог сказать, ЧТО чинить.
 */
export function adaptCareLabels(src: CareLabelSourceInput): CareLabelData {
  const insert = src.techCard.techCard;
  const dict = src.dictionary;
  const techCardId = src.techCard.id ?? 0;

  // Язык `en` — по коду из словаря, не хардкодом id (прецедент order/invoice-page.tsx).
  const enId = dict?.languages?.find((l) => norm(l.code ?? '') === 'en')?.id;

  const countryByCode = new Map<string, string>();
  const countryCodeByName = new Map<string, string>();
  for (const c of dict?.countries ?? []) {
    if (!c.code) continue;
    countryByCode.set(c.code.toUpperCase(), c.name ?? c.code);
    if (c.name) countryCodeByName.set(norm(c.name), c.code.toUpperCase());
  }

  const labels = insert?.labels ?? [];
  const originText = originCountryText(labels.find((l) => l.labelType === ORIGIN)?.content);

  const holes: Hole[] = [];

  // Размеры — в порядке карточки; словарь даёт имя и порядковый номер SKU.
  const sizeById = new Map((dict?.sizes ?? []).map((s) => [s.id ?? 0, s]));
  const sizes: CareLabelSize[] = (insert?.sizeIds ?? []).map((id) => {
    const s = sizeById.get(id);
    const name = s?.name ?? `size ${id}`;
    const skuOrd = validSkuOrd(s?.skuOrd);
    if (skuOrd == null) {
      holes.push(
        hole('size-no-ord', `size ${name}: no SKU ordinal in the dictionary`, { sizeId: id }),
      );
    }
    return { id, name, label: (formatSizeName(name) || name).toUpperCase(), skuOrd };
  });

  const colorways: CareLabelColorway[] = (src.techCard.colorways ?? [])
    .filter((c) => !!c.colorwayId)
    .map((c) => {
      const id = c.colorwayId!;
      const cwHoles: Hole[] = [];
      const ref = { colorwayId: id };
      const baseSku = (c.baseSku ?? '').trim();
      const label = baseSku || c.devName || `colourway #${id}`;
      if (!baseSku) {
        cwHoles.push(hole('no-sku', `${label}: no base SKU (the card has no SKU season)`, ref));
      }

      const i18n = enId != null ? (c.nameI18n?.[String(enId)] ?? '').trim() : '';
      const colourName = i18n || (c.devName ?? '').trim();
      if (!colourName) {
        cwHoles.push(hole('no-colour-name', `${label}: no English colour name`, ref));
      }

      const status = c.status;
      const active = status === ACTIVE;
      if (!active) {
        cwHoles.push(
          hole(
            'colorway-not-active',
            `${label}: colourway is not active — the QR link returns 404 until it is published`,
            ref,
          ),
        );
      }

      // Страна: код колорвея (merchandising) → ORIGIN-этикетка стиля.
      const merch = src.colorwayFull.get(id)?.colorway?.colorway?.display?.merchandising;
      const code = (merch?.countryCode ?? '').trim().toUpperCase();
      let countryCode = '';
      let countryName = '';
      if (code) {
        const name = countryByCode.get(code);
        if (name) {
          countryCode = code;
          countryName = name;
        } else {
          cwHoles.push(
            hole('country-unknown', `${label}: country code ${code} is not in the dictionary`, ref),
          );
        }
        if (name && originText && norm(originText) !== norm(name)) {
          cwHoles.push(
            hole(
              'country-mismatch',
              `${label}: colourway says ${name}, the ORIGIN label says ${originText}`,
              ref,
            ),
          );
        }
      } else if (originText) {
        countryName = originText;
        countryCode = countryCodeByName.get(norm(originText)) ?? '';
      } else {
        cwHoles.push(
          hole('no-country', `${label}: no country of origin (colourway or ORIGIN label)`, ref),
        );
      }

      return {
        id,
        baseSku,
        colourName,
        status,
        active,
        countryCode,
        countryName,
        usages: adaptUsages(c),
        holes: cwHoles,
      };
    });

  if (colorways.length === 0) {
    holes.push(hole('no-colorways', 'the card has no colourways — nothing to label'));
  }

  // Уход: коды стиля (careInstructions, иначе CARE-этикетка) в порядке словаря; проза — сервера
  // (care_entries), иначе словаря.
  const vocabulary = buildCareVocabulary(dict?.careSymbols);
  const rawCare =
    src.techCard.careInstructions?.trim() ||
    labels.find((l) => l.labelType === CARE)?.content?.trim() ||
    '';
  const order = (code: string) => vocabulary.byCode[code]?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const codes = [...new Set(careCodes(rawCare))].sort((a, b) => order(a) - order(b));
  const proseByCode = new Map(
    (src.techCard.careEntries ?? [])
      .filter((e) => !!e.code && !!e.shortProse)
      .map((e) => [e.code!, e.shortProse!.trim()]),
  );
  const prose = codes
    .map((c) => proseByCode.get(c) || vocabulary.byCode[c]?.shortProse?.trim() || '')
    .filter(Boolean);
  if (codes.length === 0) {
    holes.push(hole('care-empty', 'the card has no care symbols — the label prints without care'));
  }

  return {
    techCardId,
    styleNumber: insert?.styleNumber ?? '',
    styleName: insert?.name ?? '',
    colorways,
    sizes,
    bom: adaptBom(insert?.bomItems as WireBomItem[] | undefined),
    materials: adaptMaterials(src.materials),
    fibers: adaptFibers(dict?.fibers as WireFiber[] | undefined),
    care: { codes, prose },
    runs: adaptRuns(src.runs),
    holes,
  };
}

// ---------- хук: запросы + статусы для гейта ----------

export const colorwayFullKey = (colorwayId: number) =>
  ['care-labels', 'colorway', colorwayId] as const;

/**
 * Все чтения экрана одной точкой. `deps` — для `usePrintReady`: кнопка ZIP ждёт, пока приедет всё,
 * иначе архив соберётся из полуданных (нет страны → блок, который исчез бы через секунду).
 */
export function useCareLabelSource(techCardId: number | undefined): {
  data: CareLabelData | null;
  deps: PrintDep[];
  isLoading: boolean;
  isError: boolean;
} {
  const tc = useTechCard(techCardId);
  const { dictionary, loading: dictLoading, error: dictError } = useDictionary();
  const materials = useMaterials('', true);
  const runs = useProductionRuns(techCardId ?? 0, '', 0, false, !!techCardId);

  const colorwayIds = useMemo(
    () => (tc.data?.colorways ?? []).map((c) => c.colorwayId ?? 0).filter((id) => id > 0),
    [tc.data],
  );
  const full = useQueries({
    queries: colorwayIds.map((id) => ({
      queryKey: colorwayFullKey(id),
      queryFn: () => adminService.GetColorwayByID({ colorwayId: id }),
    })),
  });

  const fullLoading = full.some((q) => q.isLoading);
  const fullError = full.some((q) => q.isError);
  // Ключ пересборки: ответы колорвеев меняются по одному, `full` пересоздаётся каждый рендер.
  const fullKey = full.map((q) => q.dataUpdatedAt).join(',');

  const data = useMemo(() => {
    if (!tc.data) return null;
    const colorwayFull = new Map<number, GetColorwayByIDResponse | undefined>();
    colorwayIds.forEach((id, i) => colorwayFull.set(id, full[i]?.data));
    return adaptCareLabels({
      techCard: tc.data,
      colorwayFull,
      materials: materials.data?.materials ?? [],
      dictionary: dictionary ?? undefined,
      runs: runs.data?.runs ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tc.data, colorwayIds, fullKey, materials.data, dictionary, runs.data]);

  const deps: PrintDep[] = [
    { label: 'tech card', status: depStatus(tc.isLoading, tc.isError) },
    { label: 'dictionary', status: depStatus(dictLoading, !!dictError) },
    { label: 'materials', status: depStatus(materials.isLoading, materials.isError) },
    { label: 'production runs', status: depStatus(runs.isLoading, runs.isError) },
    { label: 'colourway countries', status: depStatus(fullLoading, fullError) },
  ];

  return { data, deps, isLoading: tc.isLoading, isError: tc.isError };
}
