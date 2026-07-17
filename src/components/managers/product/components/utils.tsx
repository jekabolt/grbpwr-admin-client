import {
  common_ColorwayFull,
  common_ColorwayMerchandisingInsert,
  common_GenderEnum,
  common_SeasonEnum,
  common_StyleSizeChartCell,
  CreateColorwayRequest,
  StylePatch,
} from 'api/proto-http/admin';
import { currencySymbols, LANGUAGES } from 'constants/constants';
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
export function buildColorwayWrite(data: ProductFormData): Omit<CreateColorwayRequest, 'styleId'> {
  const b = data.product.productBodyInsert;

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
  };

  // Write-only COGS: send only when the operator entered a value, so an empty field leaves the
  // stored cost unchanged (the caller also drops costPrice from the update_mask when empty).
  const costTrimmed = data.product.costPrice?.trim();
  const costPrice = costTrimmed && parseFloat(costTrimmed) > 0 ? { value: costTrimmed } : undefined;

  return {
    merchandising,
    development: undefined, // dev/lab-dip recipe is edited on the tech card, not this form
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

// The update_mask paths for UpdateColorway. costPrice is included only when a value was entered, so an
// empty cost field is "keep current" rather than "clear". Paths are lowerCamelCase (protojson).
export function buildColorwayUpdateMask(data: ProductFormData): string {
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
  return paths.join(',');
}

// Style facts — the SOLE writer is UpdateStyle. season here is the SeasonEnum code (the sku_season
// year lives on the tech card / CloneStyleForSeason, not this patch).
export function buildStylePatch(data: ProductFormData): StylePatch {
  const b = data.product.productBodyInsert;
  return {
    brand: b.brand,
    season: (b.season as common_SeasonEnum) || undefined,
    collection: b.collection,
    targetGender: b.targetGender as common_GenderEnum,
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
  const prices = Object.keys(currencySymbols).map((currency) => {
    const fromApi = apiPrices.find((p) => p.currency === currency);
    return { currency, price: { value: fromApi?.price?.value ?? '0' } };
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
        // R6: visibility is the stored lifecycle status; keep the vestigial `hidden` in sync so it
        // never contradicts a Hide/Unhide transition.
        hidden: colorway?.status === 'COLORWAY_LIFECYCLE_STATUS_HIDDEN',
        minTier: merch?.minTier?.toString() ?? '0',
        targetGender: merch?.targetGender || ('' as common_GenderEnum),
        modelWearsHeightCm: merch?.modelWearsHeightCm?.toString() || undefined,
        modelWearsSizeId: merch?.modelWearsSizeId?.toString() || undefined,
        collection: merch?.collection || '',
        fit: merch?.fit || '',
        season: merch?.season || undefined,
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
