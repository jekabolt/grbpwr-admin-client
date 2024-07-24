import { common_GenderEnum, common_ProductFull, common_ProductNew } from "api/proto-http/admin";

export const productInitialValues = (product?: common_ProductFull): common_ProductNew => {
    if (!product) {
        return {} as common_ProductNew;
    }
    return {
        product: {
            productBody: product.product?.productDisplay?.productBody,
            thumbnailMediaId: product.product?.productDisplay?.thumbnail?.id || 0,
        },
        sizeMeasurements: product.sizes?.map((size) => ({
            productSize: {
                quantity: { value: size.quantity?.value || '' },
                sizeId: size.sizeId,
            },
            measurements: product.measurements
                ?.filter((measurement) => measurement.productSizeId === size.sizeId)
                .map((m) => ({
                    measurementNameId: m.measurementNameId,
                    measurementValue: { value: m.measurementValue?.value || '' },
                })),
        })),
        tags:
            product.tags?.map((tag) => ({
                tag: tag.productTagInsert?.tag || '',
            })) || [],
        mediaIds:
            product.media?.map((media) => media.id).filter((id): id is number => id !== undefined) ||
            [],
    };
};

export const initialProductState: common_ProductNew = {
    product: {
        productBody: {
            preorder: '',
            name: '',
            brand: '',
            sku: '',
            color: '',
            colorHex: '',
            countryOfOrigin: '',
            price: { value: '0' },
            salePercentage: { value: '0' },
            categoryId: 0,
            description: '',
            hidden: false,
            targetGender: '' as common_GenderEnum,
        },
        thumbnailMediaId: undefined,
    },
    sizeMeasurements: [],
    mediaIds: [],
    tags: [],
};


