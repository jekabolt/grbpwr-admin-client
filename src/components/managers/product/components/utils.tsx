import {
  common_ColorwayFull,
  common_ColorwayMerchandisingInsert,
  common_GenderEnum,
  common_SeasonEnum,
  common_StyleSizeChartCell,
  CreateColorwayRequest,
  StylePatch,
} from 'api/proto-http/admin';
import {
  nameI18nPatch,
  paletteFromWire,
  paletteSignature,
  paletteToWire,
} from 'components/managers/tech-card/components/colourway-palette-model';
import { LANGUAGES, SELLING_CURRENCIES } from 'constants/constants';
import { ProductFormData } from '../utility/schema';

// R2/R4 write decomposition. The single coupled UpsertColorway is gone; a save now targets three
// owners, each with its own RPC and optimistic lock:
//   - colourway merch/media/prices/tags/translations/cost -> Create/UpdateColorway (buildColorwayWrite)
//   - style facts (brand/season/collection/gender/fit/composition/care/model-wears/categories)
//     -> UpdateStyle (buildStylePatch)
//   - the shared size chart -> UpdateStyleSizeChart (buildChartCells)
// The read model (ColorwayFull) is denormalised: display.merchandising carries the style facts too,
// so mapProductFullToFormData can prefill every field from one fetch.

/** Converts date-only (YYYY-MM-DD) to RFC 3339 for protobuf Timestamp */
function toWellKnownTimestamp(value: string | undefined): string {
  if (!value || value === '0001-01-01T00:00:00Z') return '0001-01-01T00:00:00Z';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  return value;
}

// The fields shared by CreateColorway and UpdateColorway (everything but the request-specific keys —
// style_id on create, colorway_id/expected_colorway_version/update_mask on update). Typing it as
// Omit<CreateColorwayRequest,'styleId'> guarantees the two call sites stay in lockstep with the proto.
export function buildColorwayWrite(
  data: ProductFormData,
  initial?: ProductFormData,
): Omit<CreateColorwayRequest, 'styleId'> {
  const b = data.product.productBodyInsert;
  const dev = developmentDelta(data, initial);

  const merchandising: common_ColorwayMerchandisingInsert = {
    preorder: toWellKnownTimestamp(b.preorder),
    // Optional per-colourway shade override; absent falls back to the dictionary colour's hex.
    colorHexOverride: b.colorHexOverride || undefined,
    salePercentage: b.salePercentage,
    minTier: parseInt(b.minTier || '0'),
    // REQUIRED canonical FK to Dictionary.colors — the sole colour/SKU identity on writes.
    colorCode: b.colorCode,
    dictionaryColor: undefined, // output-only; resolved server-side from color_code
    // ISO 3166-1 alpha-2 manufacture country (the country picker yields alpha-2 codes).
    countryCode: b.countryOfOrigin,
    skuColorToken: undefined, // output-only (T45): minted by the server on create, never sent
  };

  // Write-only COGS: send only when the operator entered a value, so an empty field leaves the
  // stored cost unchanged (the caller also drops costPrice from the update_mask when empty).
  const costTrimmed = data.product.costPrice?.trim();
  const costPrice = costTrimmed && parseFloat(costTrimmed) > 0 ? { value: costTrimmed } : undefined;

  return {
    merchandising,
    // T45: the colourway's name, palette and name translations are written here; the lab-dip block
    // and the recipe stay on the tech card. Sent only when something of them changed (the update
    // mask names exactly those leaves), undefined otherwise — a legacy colourway keeps carrying none.
    development: dev.changed
      ? {
          devCode: undefined,
          name: dev.name,
          labDipStatus: undefined,
          comment: undefined,
          // The server mirrors colours[0] into pantone / pantoneSystem / devHex itself.
          pantone: undefined,
          pantoneSystem: undefined,
          devHex: undefined,
          swatchMediaId: undefined,
          labDipRound: undefined,
          labDipSubmittedAt: undefined,
          labDipDecidedAt: undefined,
          labDipDecidedBy: undefined,
          labDipRejectReason: undefined,
          usages: undefined,
          displayOrder: undefined,
          colours: dev.colours.length ? dev.colours : undefined,
          nameI18n: dev.nameI18n,
        }
      : undefined,
    thumbnailMediaId: data.product.thumbnailMediaId,
    secondaryThumbnailMediaId: data.product.secondaryThumbnailMediaId || 0,
    mediaIds: data.mediaIds,
    tags: data.tags.map((t) => ({ tag: t.tag })),
    prices: data.prices.map((p) => ({ currency: p.currency, price: { value: p.price.value } })),
    translations: data.product.translations.map((t) => ({
      languageId: t.languageId,
      name: t.name,
      description: t.description,
    })),
    costPrice,
    countryCode: b.countryOfOrigin,
  };
}

/**
 * What of the development block this save changes against the loaded form (T45). The palette is
 * replace-all by position and an EMPTY list under the mask is refused (a palette holds at least one
 * colour), so an emptied palette is not a write here — the form refuses it before saving. The name
 * translations are an upsert: only the languages that changed travel, '' deletes one.
 */
export function developmentDelta(data: ProductFormData, initial?: ProductFormData) {
  const dev = data.product.development;
  const was = initial?.product.development;
  const name = dev.name.trim();
  const nameChanged = name !== (was?.name ?? '').trim();
  const colours = paletteToWire(dev.colours);
  const coloursChanged =
    colours.length > 0 && paletteSignature(dev.colours) !== paletteSignature(was?.colours ?? []);
  const nameI18n = nameI18nPatch(was?.nameI18n, dev.nameI18n);
  return {
    name,
    nameChanged,
    colours,
    coloursChanged,
    nameI18n,
    changed: nameChanged || coloursChanged || !!nameI18n,
  };
}

// The update_mask paths for UpdateColorway. costPrice is included only when a value was entered, so an
// empty cost field is "keep current" rather than "clear". Paths are lowerCamelCase (protojson).
// T45: development leaves are named one by one and only when they changed — a mask path under
// `development` selects that leaf alone, so an untouched palette or name is never rewritten.
export function buildColorwayUpdateMask(data: ProductFormData, initial?: ProductFormData): string {
  const paths = [
    'merchandising',
    'thumbnailMediaId',
    'secondaryThumbnailMediaId',
    'mediaIds',
    'tags',
    'prices',
    'translations',
    'countryCode',
  ];
  const costTrimmed = data.product.costPrice?.trim();
  if (costTrimmed && parseFloat(costTrimmed) > 0) paths.push('costPrice');
  const dev = developmentDelta(data, initial);
  if (dev.nameChanged) paths.push('development.name');
  if (dev.coloursChanged) paths.push('development.colours');
  if (dev.nameI18n) paths.push('development.nameI18n');
  return paths.join(',');
}

// Style facts — the SOLE writer is UpdateStyle. season here is the SeasonEnum code; the colourway
// card edits no season YEAR, so 0 is sent, which the server reads as "keep the stored year". The
// year is authored on the tech card, where sku_season belongs.
export function buildStylePatch(data: ProductFormData): StylePatch {
  const b = data.product.productBodyInsert;
  return {
    brand: b.brand,
    season: (b.season as common_SeasonEnum) || undefined,
    seasonYear: 0,
    collection: b.collection,
    targetGender: b.targetGender as common_GenderEnum,
    // Age group is authored on the tech card (CARD DETAILS), never here. `undefined` goes out as
    // AGE_GROUP_ENUM_UNKNOWN, which UpdateStyle reads as "keep the stored value" whenever the
    // field is not masked — the 0366 contract for callers predating the field (this one included).
    ageGroup: undefined,
    fit: b.fit,
    composition: b.composition,
    careInstructions: b.careInstructions,
    modelWearsHeightCm: parseInt(b.modelWearsHeightCm || '0'),
    modelWearsSizeId: parseInt(b.modelWearsSizeId || '0'),
    topCategoryId: parseInt(b.topCategoryId),
    subCategoryId: parseInt(b.subCategoryId || '0'),
    typeId: parseInt(b.typeId || '0'),
  };
}

export const STYLE_UPDATE_MASK = [
  'brand',
  'season',
  'collection',
  'targetGender',
  'fit',
  'composition',
  'careInstructions',
  'modelWearsHeightCm',
  'modelWearsSizeId',
  'topCategoryId',
  'subCategoryId',
  'typeId',
].join(',');

// The colourway card owns only model-wears among the style facts now (the rest moved to the tech
// card, read-only here) — so its UpdateStyle writes just those two columns; the backend honors the
// mask and leaves every other fact untouched.
export const MODEL_WEARS_UPDATE_MASK = ['modelWearsHeightCm', 'modelWearsSizeId'].join(',');

// The whole style size chart as flat cells (R5 full-replace). Empty/zero measurements are dropped.
export function buildChartCells(
  sizeMeasurements: ProductFormData['sizeMeasurements'],
): common_StyleSizeChartCell[] {
  return (sizeMeasurements ?? []).flatMap((sm) =>
    (sm.measurements ?? [])
      .filter((m) => m?.measurementValue?.value && m.measurementValue.value !== '0')
      .map((m) => ({
        sizeId: sm.productSize.sizeId,
        measurementNameId: m.measurementNameId,
        value: { value: m.measurementValue.value },
      })),
  );
}

export function mapProductFullToFormData(
  productFull: common_ColorwayFull | undefined,
): ProductFormData {
  const colorway = productFull?.colorway;
  // R2/R4/R5: display.merchandising is the denormalised read projection — it carries the colourway's
  // own merch AND the owning style's facts (brand/season/collection/gender/fit/…/categories).
  const merch = colorway?.display?.merchandising;
  const displayTranslations = colorway?.display?.translations ?? [];

  // R5: the size chart is style-owned (loaded separately via GetStyleSizeChart). ColorwayFull only
  // carries variants, so prefill stock quantities here; measurements are merged in by the size section.
  const sizeMeasurements = productFull?.variants?.map((variant) => ({
    productSize: {
      quantity: { value: variant.quantity?.value || '0' },
      sizeId: variant.sizeId || 1,
    },
    measurements: [] as { measurementNameId: number; measurementValue: { value: string } }[],
  })) || [{ productSize: { quantity: { value: '0' }, sizeId: 0 }, measurements: [] }];

  const tags = productFull?.tags?.map((tag) => ({ tag: tag.tagInsert?.tag || '' })) || [];

  const mediaIds = productFull?.media?.map((media) => media.id || 0).filter((id) => id > 0) || [];

  const apiPrices = colorway?.prices ?? [];
  const prices = SELLING_CURRENCIES.map((c) => {
    const fromApi = apiPrices.find((p) => p.currency === c.value);
    return { currency: c.value, price: { value: fromApi?.price?.value ?? '0' } };
  });

  return {
    styleId: colorway?.styleId ? String(colorway.styleId) : '',
    product: {
      productBodyInsert: {
        preorder: merch?.preorder || '0001-01-01T00:00:00Z',
        brand: merch?.brand || '',
        careInstructions: merch?.careInstructions || '',
        composition: merch?.composition || '',
        colorCode: merch?.colorCode || '',
        colorHexOverride: merch?.colorHexOverride || '',
        // Prefer the ISO manufacture code (countryCode); fall back to the legacy free-text field.
        countryOfOrigin: merch?.countryCode || merch?.countryOfOrigin || '',
        salePercentage: { value: merch?.salePercentage?.value || '0' },
        topCategoryId: merch?.topCategoryId ? merch.topCategoryId.toString() : '',
        subCategoryId: merch?.subCategoryId ? merch.subCategoryId.toString() : '',
        typeId: merch?.typeId ? merch.typeId.toString() : '',
        minTier: merch?.minTier?.toString() ?? '0',
        targetGender: merch?.targetGender || ('' as common_GenderEnum),
        modelWearsHeightCm: merch?.modelWearsHeightCm?.toString() || undefined,
        modelWearsSizeId: merch?.modelWearsSizeId?.toString() || undefined,
        collection: merch?.collection || '',
        fit: merch?.fit || '',
        season: merch?.season || undefined,
      },
      // T45: colour_name is the colourway's own name once it has a palette and the family's
      // dictionary name otherwise — so it is prefilled only when a palette stands; a legacy
      // colourway starts nameless here rather than carrying the family name as its own.
      development: {
        name: merch?.colours?.length ? merch.colourName?.trim() || '' : '',
        colours: paletteFromWire(merch?.colours),
        nameI18n: { ...(merch?.nameI18n ?? {}) },
      },
      thumbnailMediaId: colorway?.display?.thumbnail?.id || 0,
      secondaryThumbnailMediaId: colorway?.display?.secondaryThumbnail?.id || 0,
      translations: LANGUAGES.map((lang) => {
        const fromApi = displayTranslations.find((t) => t.languageId === lang.id);
        return {
          languageId: lang.id,
          name: fromApi?.name ?? '',
          description: fromApi?.description ?? '',
        };
      }),
      prices,
      // COGS is write-only (never on the read path) — empty means "keep current cost" on save.
      costPrice: '',
    },
    prices,
    mediaIds,
    tags,
    sizeMeasurements,
  };
}
