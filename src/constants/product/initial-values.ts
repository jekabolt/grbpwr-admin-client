import { common_ProductFull, common_ProductNew } from "api/proto-http/admin";

export const productInitialValues = (product?: common_ProductFull): common_ProductNew => {
    // if (!product) {
    //     return initialProductState;
    // }

    return {
        product: {
            productBodyInsert: product?.product?.productDisplay?.productBody?.productBodyInsert,
            translations: product?.product?.productDisplay?.productBody?.translations,
            thumbnailMediaId: product?.product?.productDisplay?.thumbnail?.id || undefined,
        },
        sizeMeasurements: product?.sizes?.map((size) => ({
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
        })) || [],
        tags: product?.tags?.map((tag) => ({
            tag: tag.productTagInsert?.tag || '',
        })) || [],
        mediaIds: product?.media
            ?.map((media) => media.id)
            .filter((id): id is number => id !== undefined) || [],
    };
};


// // export const initialProductState: common_ProductNew = {
// //     product: {
// //         productBodyInsert: {
// //             preorder: '0001-01-01T00:00:00Z',
// //             name: '',
// //             brand: '',
// //             sku: '',
// //             careInstructions: '',
// //             composition: '',
// //             color: '',
// //             colorHex: '',
// //             countryOfOrigin: '',
// //             price: { value: '0' },
// //             salePercentage: { value: '0' },
// //             topCategoryId: undefined,
// //             subCategoryId: undefined,
// //             typeId: undefined,
// //             description: '',
// //             hidden: false,
// //             targetGender: '' as common_GenderEnum,
// //             modelWearsHeightCm: undefined,
// //             modelWearsSizeId: undefined,
// //         },
// //         thumbnailMediaId: undefined,
// //     },
// //     sizeMeasurements: [],
// //     mediaIds: [],
// //     tags: [],
// // };