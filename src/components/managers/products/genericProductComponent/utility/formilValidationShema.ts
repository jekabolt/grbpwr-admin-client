import * as Yup from 'yup';

export const validationSchema = Yup.object().shape({
    product: Yup.object().shape({
        productBody: Yup.object().shape({
            name: Yup.string()
                .required('Name is required')
                .matches(/^(?![_\.\-]+$)/, 'Name cannot consist only of special symbols'),
            brand: Yup.string()
                .required('Brand is required')
                .matches(/^(?![_\.\-]+$)/, 'Brand cannot consist only of special symbols'),
            targetGender: Yup.string().required('Gender is required'),
            topCategoryId: Yup.number().required('Category is required'),
            // subCategoryId: Yup.number().required('Subcategory is required'),
            typeId: Yup.number().required('Type is required'),
            color: Yup.string().required('Color is required'),
            countryOfOrigin: Yup.string().required('Country is required'),
            price: Yup.object().shape({
                value: Yup.string()
                    .test(
                        'is-valid-number',
                        'Price must be a valid number greater than 0',
                        (value) => {
                            const parsedValue = parseFloat(value ?? '');
                            return !isNaN(parsedValue) && parsedValue > 0;
                        }
                    )
                    .required('Price is required'),
            }).required(),
            description: Yup.string().required('Description is required'),
        }).required(),
        thumbnailMediaId: Yup.number().required('Thumbnail must be selected'),
    }).required(),
    mediaIds: Yup.array().min(2, 'At least two media must be added to the product'),
    sizeMeasurements: Yup.array().test(
        'at-least-one-size',
        'At least one size must be specified',
        (sizes) => sizes?.some((size) => size.productSize?.quantity?.value !== '0')
    ),
    tags: Yup.array().min(1, 'At least one tag must be added to the product'),
});
