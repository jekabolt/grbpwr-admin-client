import {
  common_GenderEnum,
  common_ProductBodyInsert,
  common_ProductFull,
  common_ProductInsert,
  common_ProductInsertTranslation,
  common_ProductNew,
  common_ProductTagInsert,
  common_SizeWithMeasurementInsert,
  UpsertProductRequest,
} from 'api/proto-http/admin';
import isEqual from 'lodash/isEqual';
import { defaultData, ProductFormData } from '../utility/schema';
import { getNonEmptySizeMeasurements } from '../utility/sizes';

export function mapProductDataToForm(data: ProductFormData) {
  const productBodyInsert: common_ProductBodyInsert = {
    brand: data.product.productBodyInsert.brand,
    color: data.product.productBodyInsert.color,
    colorHex: data.product.productBodyInsert.colorHex,
    countryOfOrigin: data.product.productBodyInsert.countryOfOrigin,
    price: data.product.productBodyInsert.price,
    salePercentage: data.product.productBodyInsert.salePercentage,
    topCategoryId: parseInt(data.product.productBodyInsert.topCategoryId),
    subCategoryId: parseInt(data.product.productBodyInsert.subCategoryId || '0'),
    typeId: parseInt(data.product.productBodyInsert.typeId || '0'),
    modelWearsHeightCm: parseInt(data.product.productBodyInsert.modelWearsHeightCm || '0'),
    modelWearsSizeId: parseInt(data.product.productBodyInsert.modelWearsSizeId || '0'),
    careInstructions: data.product.productBodyInsert.careInstructions,
    composition: data.product.productBodyInsert.composition,
    hidden: data.product.productBodyInsert.hidden,
    targetGender: data.product.productBodyInsert.targetGender as common_GenderEnum,
    version: data.product.productBodyInsert.version,
    collection: data.product.productBodyInsert.collection,
    preorder: data.product.productBodyInsert.preorder,
    fit: data.product.productBodyInsert.fit,
  };

  const translations: common_ProductInsertTranslation[] = data.product.translations.map(
    (translation) => ({
      languageId: parseInt(translation.languageId.toString()),
      name: translation.name,
      description: translation.description,
    }),
  );

  const mediaIds: number[] = data.mediaIds;

  const tags: common_ProductTagInsert[] = data.tags.map((tag) => ({
    tag: tag.tag,
  }));

  const sizeMeasurements: common_SizeWithMeasurementInsert[] = data.sizeMeasurements.map(
    (sizeMeasurement) => ({
      productSize: {
        quantity: {
          value: sizeMeasurement.productSize.quantity.value,
        },
        sizeId: sizeMeasurement.productSize.sizeId,
      },
      measurements: sizeMeasurement.measurements?.map((measurement) => ({
        measurementNameId: measurement?.measurementNameId,
        measurementValue: {
          value: measurement?.measurementValue?.value,
        },
      })),
    }),
  );

  const product: common_ProductInsert = {
    productBodyInsert,
    thumbnailMediaId: data.product.thumbnailMediaId,
    translations,
  };

  const productNew: common_ProductNew = {
    product,
    mediaIds,
    tags,
    sizeMeasurements,
  };

  return productNew;
}

export function mapProductFullToFormData(
  productFull: common_ProductFull | undefined,
): ProductFormData {
  if (!productFull?.product?.productDisplay) {
    return defaultData;
  }

  const productBody = productFull.product.productDisplay.productBody;
  const productBodyInsert = productBody?.productBodyInsert;

  const sizeMeasurements = productFull.sizes?.map((size) => {
    const sizeMeasurements =
      productFull.measurements?.filter((measurement) => measurement.productSizeId === size.id) ||
      [];

    return {
      productSize: {
        quantity: {
          value: size.quantity?.value || '0',
        },
        sizeId: size.sizeId || 1,
      },
      measurements: sizeMeasurements.map((measurement) => ({
        measurementNameId: measurement.measurementNameId || 0,
        measurementValue: {
          value: measurement.measurementValue?.value || '0',
        },
      })),
    };
  }) || [{ productSize: { quantity: { value: '0' }, sizeId: 0 }, measurements: [] }];

  const tags =
    productFull.tags?.map((tag) => ({
      tag: tag.productTagInsert?.tag || '',
    })) || [];

  const mediaIds = productFull.media?.map((media) => media.id || 0).filter((id) => id > 0) || [];

  return {
    product: {
      productBodyInsert: {
        preorder: productBodyInsert?.preorder || '0001-01-01T00:00:00Z',
        brand: productBodyInsert?.brand || '',
        careInstructions: productBodyInsert?.careInstructions || '',
        composition: productBodyInsert?.composition || '',
        color: productBodyInsert?.color || '',
        colorHex: productBodyInsert?.colorHex || '',
        countryOfOrigin: productBodyInsert?.countryOfOrigin || '',
        price: {
          value: productBodyInsert?.price?.value || '0',
        },
        salePercentage: {
          value: productBodyInsert?.salePercentage?.value || '0',
        },
        topCategoryId: productBodyInsert?.topCategoryId?.toString() || '',
        subCategoryId: productBodyInsert?.subCategoryId?.toString() || '',
        typeId: productBodyInsert?.typeId?.toString() || '',
        hidden: productBodyInsert?.hidden || false,
        targetGender: productBodyInsert?.targetGender || ('' as common_GenderEnum),
        modelWearsHeightCm: productBodyInsert?.modelWearsHeightCm?.toString() || undefined,
        modelWearsSizeId: productBodyInsert?.modelWearsSizeId?.toString() || undefined,
        version: productBodyInsert?.version || '',
        collection: productBodyInsert?.collection || '',
      },
      thumbnailMediaId: productFull.product.productDisplay.thumbnail?.id || 0,
      translations: productBody?.translations?.map((translation) => ({
        languageId: translation.languageId || 1,
        name: translation.name || '',
        description: translation.description || '',
      })) || [{ languageId: 1, name: '', description: '' }],
    },
    mediaIds,
    tags,
    sizeMeasurements,
  };
}

const normalizeDate = (date: string | null): string | null => {
  if (!date) return null;
  const parsedDate = new Date(date);
  return parsedDate.toISOString().split('.')[0] + 'Z';
};

export const comparisonOfInitialProductValues = (obj1: any, obj2: any): boolean => {
  const normalize = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' && !isNaN(Date.parse(obj))) {
      return normalizeDate(obj);
    }
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalize);
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, normalize(v)]));
  };

  return isEqual(normalize(obj1), normalize(obj2));
};

export const createProductPayload = (
  values: common_ProductNew,
  id: string | undefined,
  isCopyMode: boolean,
): UpsertProductRequest => ({
  id: isCopyMode ? undefined : id ? parseInt(id) : undefined,
  product: {
    ...values,
    sizeMeasurements: getNonEmptySizeMeasurements(values),
  } as common_ProductNew,
});
