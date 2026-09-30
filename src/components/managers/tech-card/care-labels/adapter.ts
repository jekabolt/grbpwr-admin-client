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
import { useQueries, useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  common_AdminColorwayRef,
  common_ColorwayLifecycleStatus,
  common_Dictionary,
  common_Fiber,
  common_Material,
  common_ProductionRun,
  common_ProductionRunStatus,
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardBomLabelPart,
  GetColorwayByIDResponse,
  googletype_Decimal,
} from 'api/proto-http/admin';
import {
  buildCareVocabulary,
  careCodes,
} from 'components/managers/product/components/care/care-codes';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { depStatus, type PrintDep } from 'components/managers/print/use-print-ready';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { wireInt } from 'components/managers/tech-card/components/wire-int';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { ArtworkError, type Art } from './art-types';
import type { OverrideFiber } from './composition-override';
import type {
  FiberDict,
  LabelBomLine,
  LabelFiber,
  LabelMaterial,
  LabelUsage,
} from './composition-resolver';
import { hole, type Hole } from './holes';
import { labelMediaFullUrl, logoSvgState, type LabelMediaSource } from './label-media';
import { labelPartFromWire, type LabelPartWire } from './label-parts';
import { parseLogoSvg } from './logo-svg';
import { isLabelLang, type LabelLang } from './phrases';
import type { QrPreset } from './use-care-label-prefs';

// Строки энума части в движке (`label-parts.ts`, без импорта генерата) и в генерате — один и тот же
// набор. Разъедутся (новая часть в прото без правки движка или наоборот) — здесь красный tsc.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const LABEL_PART_WIRE_MATCHES_PROTO: Same<LabelPartWire, common_TechCardBomLabelPart> = true;
void LABEL_PART_WIRE_MATCHES_PROTO;

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
  /** Имя цвета НА ЛЕНТЕ: переопределение составника, иначе `colourNameDerived`. */
  colourName: string;
  /** Выведенное EN-имя цвета: `name_i18n[en]` → `dev_name` (то, к чему ведёт «↺ derived»). */
  colourNameDerived: string;
  /** Имя цвета переопределено на составнике (D-12). */
  colourNameOverridden: boolean;
  /** Состав, переопределённый на составнике; null — выводится из BOM (D-03). */
  fiberOverride: OverrideFiber[] | null;
  status: common_ColorwayLifecycleStatus | undefined;
  active: boolean;
  /** Код страны словаря (`PL`); пусто — страны у колорвея нет (дыра `no-country`). */
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
  /**
   * Уход стиля: коды в порядке словаря и EN-проза. `prose` — то, что печатается (строки составника,
   * если они заданы, иначе `short_prose` на каждый код); `derivedProse` — всегда словарная.
   */
  care: { codes: string[]; prose: string[]; derivedProse: string[]; proseOverridden: boolean };
  /** Переопределения составника уровня карточки (labels rework). Пусто — константы ленты. */
  label: CareLabelOverrides;
  runs: CareLabelRun[];
  /** Дыры уровня стиля (нет колорвеев, пустой уход, размер без номера). */
  holes: Hole[];
};

export type CareLabelOverrides = {
  /** 0 — монограмма бренда. */
  logoMediaId: number;
  /** Разобранный SVG своего лого; null — монограмма (или лого не разобралось: тогда есть дыра). */
  logo: Art | null;
  /** Подпись QR; [] — `QR_CAPTION`. */
  caption: string[];
  /** Адрес; [] — `COMPANY_ADDRESS`. */
  address: string[];
  /** Ссылка QR — с карточки (раньше localStorage страницы печати). */
  qr: { qrPreset: QrPreset; qrTemplate: string };
};

const QR_PRESETS: readonly QrPreset[] = ['storefront', 'custom', 'fixed'];

export type CareLabelSourceInput = {
  techCard: common_TechCard;
  /**
   * ПРИЕХАВШИЕ ответы GetColorwayByID по id колорвея. Нет записи — ответа нет (едет, отказ,
   * таймаут): страна колорвея неизвестна, и это блок `colorway-unavailable`, а НЕ страна из
   * ORIGIN-этикетки. Запись без кода страны — «загружено, пусто»: тогда законно ORIGIN.
   */
  colorwayFull: ReadonlyMap<number, GetColorwayByIDResponse>;
  /** Каталог материалов; `null` — не загрузился (едет / отказ): общий блок `materials-unavailable`. */
  materials: readonly common_Material[] | null;
  /** `undefined` — словарь не загрузился (едет / отказ): общий блок `dictionary-unavailable`. */
  dictionary: common_Dictionary | undefined;
  runs: readonly common_ProductionRun[];
  /**
   * Текст SVG своего лого (`care_label.logo_media_id`). Нужен только когда лого задано: строка —
   * приехал; `null` — не загрузился; `undefined` — ещё едет. Оба последних — блок `logo-unavailable`:
   * лента с монограммой вместо заказанного лого — не «почти то же самое».
   */
  logoSvg?: string | null;
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

/**
 * ORIGIN-этикетка — свободный текст («Made in Poland», «Poland»): вынуть страну. ЛЕГАСИ: лента
 * больше не берёт страну из ORIGIN (labels rework, D-06) — функцию читает только старый экран лейблов.
 */
export const originCountryText = (content: string | undefined): string =>
  (content ?? '')
    .trim()
    .replace(/^made\s+in\s+/i, '')
    .replace(/[.\s]+$/, '')
    .trim();

const norm = (s: string) => s.trim().toLowerCase();

// ---------- чистый адаптер ----------

export function adaptFibers(fibers: readonly common_Fiber[] | undefined): FiberDict {
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

// ID С ПРОВОДА. grpc-gateway отдаёт int64 JSON-СТРОКОЙ («501»), а сгенерированный тип говорит
// `number` — компилятор расхождения не видит. Все id, по которым составники что-то ищут (материал
// слота, каталог, пин колорвея, строка BOM по bom_item_id, колорвей, прогон), приводятся к числу
// ЗДЕСЬ, на границе провода, одним `wireInt`: дальше ни одна выборка не зависит от того, строкой или
// числом пришёл id. Иначе «пин того же артикула» (`"1" !== 1`) выглядит пином ДРУГОГО, а колорвей
// не находит своего ответа GetColorwayByID и берёт страну ORIGIN.

export function adaptMaterials(materials: readonly common_Material[]): Map<number, LabelMaterial> {
  const out = new Map<number, LabelMaterial>();
  for (const m of materials) {
    const id = wireInt(m.id);
    if (!id) continue;
    out.set(id, {
      id,
      compositionEntries: (m.compositionEntries ?? [])
        .filter((e) => !!e.fiberCode)
        .map((e) => ({ fiberCode: e.fiberCode!, percent: decimalNumber(e.percent) ?? 0 })),
      unit: m.unit ?? undefined,
    });
  }
  return out;
}

export function adaptBom(items: readonly common_TechCardBomItem[] | undefined): LabelBomLine[] {
  return (items ?? [])
    .filter((b) => !!b.lineKey)
    .map((b) => ({
      lineKey: b.lineKey!,
      section: b.section,
      purpose: b.purpose,
      labelPart: b.labelPart ?? null,
      materialId: wireInt(b.materialId) || undefined,
      composition: b.composition ?? undefined,
      name: b.name ?? '',
      unit: b.unit ?? undefined,
    }));
}

/**
 * Usages колорвея. Строка BOM — по `bom_line_key`, а у легаси-usage без ключа — по серверному
 * `bom_item_id` через id строк BOM (ровно как `fromRead` рецепта, `colorway-usage-wire.ts`):
 * отбросить такой usage значило бы потерять его пин и напечатать артикул слота. Usage, который не
 * адресуется ни так, ни так, не относится ни к одной строке и в состав не идёт.
 */
export function adaptUsages(
  c: common_AdminColorwayRef,
  bomItems: readonly Pick<common_TechCardBomItem, 'id' | 'lineKey'>[] | undefined,
): LabelUsage[] {
  const keyByBomItemId = new Map<number, string>();
  for (const b of bomItems ?? []) {
    const id = wireInt(b.id);
    if (id && b.lineKey) keyByBomItemId.set(id, b.lineKey);
  }
  return (c.usages ?? [])
    .map((u) => ({
      u,
      key: (u.bomLineKey ?? '').trim() || keyByBomItemId.get(wireInt(u.bomItemId)) || '',
    }))
    .filter(({ key }) => !!key)
    .map(({ u, key }) => ({
      bomLineKey: key,
      materialId: wireInt(u.materialId) || undefined,
      consumption: decimalNumber(u.consumption),
      sizeConsumptions: (u.sizeConsumptions ?? [])
        .map((s) => decimalNumber(s.consumption))
        .filter((n): n is number => n != null),
      // Ссылка на деталь едет ДО резолвера целиком: по ней он отличает назначение детали от нормы.
      // Потерять её здесь — значит сосчитать каждую деталь ещё одним источником состава.
      pieceLineKey: (u.pieceLineKey ?? '').trim() || undefined,
      pieceId: wireInt(u.pieceId) || undefined,
      pieceIndex: u.pieceIndex ?? undefined,
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
    .map((r) => ({ r, id: wireInt(r.id) }))
    .filter(({ id }) => id > 0)
    .map(({ r, id }) => {
      const status = r.run?.status;
      const word = (status && RUN_STATUS_WORD[status]) || 'run';
      const date = r.createdAt ? String(r.createdAt).slice(0, 10) : '';
      return {
        id,
        status,
        label: [`run #${id}`, word, date].filter(Boolean).join(' · '),
        lines: (r.run?.lines ?? []).map((l) => ({
          productId: wireInt(l.productId),
          sizeId: wireInt(l.sizeId),
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
  const techCardId = wireInt(src.techCard.id);

  // Язык `en` — по коду из словаря, не хардкодом id (прецедент order/invoice-page.tsx).
  const enId = dict?.languages?.find((l) => norm(l.code ?? '') === 'en')?.id;

  const countryByCode = new Map<string, string>();
  for (const c of dict?.countries ?? []) {
    if (!c.code) continue;
    countryByCode.set(c.code.toUpperCase(), c.name ?? c.code);
  }

  const labels = insert?.labels ?? [];
  const cl = insert?.careLabel;
  const overrideByColorway = new Map(
    (cl?.colorways ?? []).map((c) => [wireInt(c.colorwayId), c] as const),
  );

  const holes: Hole[] = [];
  // Не загрузилось — блок, а не «пусто» (holes.ts): без каталога резолвер взял бы снимок состава из
  // строки BOM, без словаря не знал бы ни волокон, ни размеров, ни стран.
  if (!dict) {
    holes.push(
      hole(
        'dictionary-unavailable',
        'the dictionary did not load (still loading or the request failed) — fibres, sizes and countries are unknown; reload the page',
      ),
    );
  }
  if (!src.materials) {
    holes.push(
      hole(
        'materials-unavailable',
        'the materials catalogue did not load (still loading or the request failed) — the composition cannot be read from the articles; reload the page',
      ),
    );
  }

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
    .map((c) => ({ c, id: wireInt(c.colorwayId) }))
    .filter(({ id }) => id > 0)
    .map(({ c, id }) => {
      const cwHoles: Hole[] = [];
      const ref = { colorwayId: id };
      const baseSku = (c.baseSku ?? '').trim();
      const label = baseSku || c.devName || `colourway #${id}`;
      if (!baseSku) {
        cwHoles.push(hole('no-sku', `${label}: no base SKU (the card has no SKU season)`, ref));
      }

      const i18n = enId != null ? (c.nameI18n?.[String(enId)] ?? '').trim() : '';
      const colourNameDerived = i18n || (c.devName ?? '').trim();
      const ov = overrideByColorway.get(id);
      const colourNameOverride = (ov?.colourName ?? '').trim();
      const colourName = colourNameOverride || colourNameDerived;
      if (!colourName) {
        cwHoles.push(hole('no-colour-name', `${label}: no English colour name`, ref));
      }
      const fiberOverride: OverrideFiber[] = (ov?.fibers ?? []).flatMap((f) => {
        const part = labelPartFromWire(f.part);
        if (!part || part === 'NOT_ON_LABEL') return [];
        return [{ part, fiberCode: (f.fiberCode ?? '').trim(), pct: wireInt(f.pct) }];
      });

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

      // Страна — ТОЛЬКО колорвея (merchandising.country_code). ORIGIN-этикетка стиля больше не
      // источник (labels rework): страну без колорвея ставят на составнике, в сам колорвей. Ответа
      // колорвея нет — страна НЕИЗВЕСТНА (блок), а не «пусто».
      const full = src.colorwayFull.get(id);
      const merch = full?.colorway?.colorway?.display?.merchandising;
      const code = (merch?.countryCode ?? '').trim().toUpperCase();
      let countryCode = '';
      let countryName = '';
      if (!full) {
        cwHoles.push(
          hole(
            'colorway-unavailable',
            `${label}: colourway details did not load (still loading or the request failed) — its country of origin is unknown; reload the page`,
            ref,
          ),
        );
      } else if (code) {
        const name = countryByCode.get(code);
        if (name) {
          countryCode = code;
          countryName = name;
        } else {
          cwHoles.push(
            hole('country-unknown', `${label}: country code ${code} is not in the dictionary`, ref),
          );
        }
      } else {
        cwHoles.push(
          hole(
            'no-country',
            `${label}: no country of origin — set it on the composition label`,
            ref,
          ),
        );
      }

      return {
        id,
        baseSku,
        colourName,
        colourNameDerived,
        colourNameOverridden: !!colourNameOverride,
        fiberOverride: fiberOverride.length ? fiberOverride : null,
        status,
        active,
        countryCode,
        countryName,
        usages: adaptUsages(c, insert?.bomItems),
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
  const derivedProse = codes
    .map((c) => proseByCode.get(c) || vocabulary.byCode[c]?.shortProse?.trim() || '')
    .filter(Boolean);
  const proseOverride = (cl?.careProseLines ?? []).map((l) => l.trim()).filter(Boolean);
  const prose = proseOverride.length ? proseOverride : derivedProse;
  if (codes.length === 0) {
    holes.push(hole('care-empty', 'the card has no care symbols — the label prints without care'));
  }

  // Лого составника: своё SVG → контуры; не приехало или не разобралось — БЛОК, не монограмма.
  const logoMediaId = wireInt(cl?.logoMediaId);
  let logo: Art | null = null;
  if (logoMediaId > 0) {
    if (typeof src.logoSvg !== 'string') {
      holes.push(
        hole(
          'logo-unavailable',
          'the composition label logo did not load — reload the page or put the brand mark back',
        ),
      );
    } else {
      try {
        logo = parseLogoSvg(src.logoSvg);
      } catch (e) {
        holes.push(
          hole(
            'logo-svg-unsupported',
            e instanceof ArtworkError ? e.message : `logo SVG: ${String(e)}`,
          ),
        );
      }
    }
  }
  const qrPreset = (QR_PRESETS as readonly string[]).includes(cl?.qrPreset ?? '')
    ? (cl!.qrPreset as QrPreset)
    : 'storefront';

  return {
    techCardId,
    styleNumber: insert?.styleNumber ?? '',
    styleName: insert?.name ?? '',
    colorways,
    sizes,
    bom: adaptBom(insert?.bomItems),
    materials: adaptMaterials(src.materials ?? []),
    fibers: adaptFibers(dict?.fibers),
    care: { codes, prose, derivedProse, proseOverridden: proseOverride.length > 0 },
    label: {
      logoMediaId,
      logo,
      caption: (cl?.backCaptionLines ?? []).map((l) => l.trim()).filter(Boolean),
      address: (cl?.addressLines ?? []).map((l) => l.trim()).filter(Boolean),
      qr: { qrPreset, qrTemplate: (cl?.qrTemplate ?? '').trim() },
    },
    runs: adaptRuns(src.runs),
    holes,
  };
}

// ---------- хук: запросы + статусы для гейта ----------

export const colorwayFullKey = (colorwayId: number) =>
  ['care-labels', 'colorway', colorwayId] as const;

/**
 * Полные колорвеи (страна) — по одному запросу на колорвей, общий ключ с составником на карточке:
 * страна, поставленная там, видна здесь без перезагрузки (и наоборот).
 */
export function useColorwayFull(colorwayIds: readonly number[]) {
  const full = useQueries({
    queries: colorwayIds.map((id) => ({
      queryKey: colorwayFullKey(id),
      queryFn: () => adminService.GetColorwayByID({ colorwayId: id }),
    })),
  });
  const loading = full.some((q) => q.isLoading);
  const error = full.some((q) => q.isError);
  // Ключ пересборки: ответы колорвеев меняются по одному, `full` пересоздаётся каждый рендер.
  const key = full.map((q) => `${q.status}:${q.dataUpdatedAt}`).join(',');
  const byId = useMemo(() => {
    const m = new Map<number, GetColorwayByIDResponse>();
    colorwayIds.forEach((id, i) => {
      const q = full[i];
      if (q?.isSuccess && q.data) m.set(id, q.data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorwayIds, key]);
  return { byId, loading, error };
}

export const logoSvgKey = (mediaId: number, url: string) =>
  ['care-labels', 'logo-svg', mediaId, url] as const;

/**
 * Текст SVG своего лого по id медиа. Адрес — из переданного `urlHint` (только что выбранное в слоте),
 * затем из `resolvedLabelMedia` карточки (сервер разрешает id лого на чтении, M-02), и лишь затем из
 * библиотеки (`useMediaMap`, последние 500 — запасной путь для выбранного до сохранения).
 * `undefined` — едет, `null` — не загрузился (адреса нет или запрос упал).
 */
export function useLogoSvg(
  mediaId: number,
  urlHint?: string,
  resolved?: LabelMediaSource,
): { svg: string | null | undefined; url: string } {
  const library = useMediaMap();
  const url = urlHint || (mediaId > 0 ? labelMediaFullUrl(mediaId, resolved, library) : '');
  const q = useQuery({
    queryKey: logoSvgKey(mediaId, url),
    queryFn: async () => (await fetchMediaBlob(url)).text(),
    enabled: mediaId > 0 && !!url,
    staleTime: Infinity,
    retry: 1,
  });
  if (!(mediaId > 0)) return { svg: undefined, url: '' };
  return {
    svg: logoSvgState(mediaId, url, library.size > 0 || !!resolved?.length, q),
    url,
  };
}

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
    () => (tc.data?.colorways ?? []).map((c) => wireInt(c.colorwayId)).filter((id) => id > 0),
    [tc.data],
  );
  const full = useColorwayFull(colorwayIds);
  const logo = useLogoSvg(
    wireInt(tc.data?.techCard?.careLabel?.logoMediaId),
    undefined,
    tc.data?.resolvedLabelMedia,
  );
  const materialsOk = materials.isSuccess;

  // В адаптер уходит только ПРИЕХАВШЕЕ: запрос, который упал, ещё едет или не успел к таймауту
  // гейта печати (`usePrintReady` отпускает кнопку через 10 с), становится блоком-дырой, а не пустым
  // значением с фолбэком. Гейт по таймауту такой блок не снимает — снимает только ответ.
  const data = useMemo(() => {
    if (!tc.data) return null;
    return adaptCareLabels({
      techCard: tc.data,
      colorwayFull: full.byId,
      materials: materialsOk ? materials.data?.materials ?? [] : null,
      dictionary: dictionary ?? undefined,
      runs: runs.data?.runs ?? [],
      logoSvg: logo.svg,
    });
  }, [tc.data, full.byId, materialsOk, materials.data, dictionary, runs.data, logo.svg]);

  const deps: PrintDep[] = [
    { label: 'tech card', status: depStatus(tc.isLoading, tc.isError) },
    { label: 'dictionary', status: depStatus(dictLoading, !!dictError) },
    { label: 'materials', status: depStatus(materials.isLoading, materials.isError) },
    { label: 'production runs', status: depStatus(runs.isLoading, runs.isError) },
    { label: 'colourway countries', status: depStatus(full.loading, full.error) },
  ];

  return { data, deps, isLoading: tc.isLoading, isError: tc.isError };
}
