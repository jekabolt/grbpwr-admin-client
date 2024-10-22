import { isValidURL } from 'features/utilitty/isValidUrl';
import * as Yup from 'yup';

export const heroValidationSchema = Yup.object().shape({

    entities: Yup.array().of(
        Yup.lazy((entity) => {
            switch (entity?.type) {
                case 'HERO_TYPE_MAIN_ADD':
                    return Yup.object().shape({
                        type: Yup.string().required('Hero type is required'),
                        mainAdd: Yup.object().shape({
                            singleAdd: Yup.object().shape({
                                mediaId: Yup.number().min(1, 'Main Add Media is required'),
                                exploreLink: Yup.string().nullable()
                                    .test(
                                        'is-valid-url',
                                        (value) => !value || isValidURL(value),
                                    ),
                                exploreText: Yup.string().nullable(),
                            }),
                        }),
                    });

                case 'HERO_TYPE_SINGLE_ADD':
                    return Yup.object().shape({
                        type: Yup.string().required('Hero type is required'),
                        singleAdd: Yup.object().shape({
                            mediaId: Yup.number().min(1, 'Single Add Media is required'),
                            exploreLink: Yup.string().nullable().test(
                                'is-valid-url',
                                (value) => !value || isValidURL(value),
                            ),
                            exploreText: Yup.string().nullable(),
                        }),
                    });

                case 'HERO_TYPE_DOUBLE_ADD':
                    return Yup.object().shape({
                        type: Yup.string().required('Hero type is required'),
                        doubleAdd: Yup.object().shape({
                            left: Yup.object().shape({
                                mediaId: Yup.number().min(1, 'Left media is required'),
                                exploreLink: Yup.string().nullable().test(
                                    'is-valid-url',
                                    (value) => !value || isValidURL(value),
                                ),
                                exploreText: Yup.string().nullable(),
                            }),
                            right: Yup.object().shape({
                                mediaId: Yup.number().min(1, 'Right media is required'),
                                exploreLink: Yup.string().nullable().test(
                                    'is-valid-url',
                                    (value) => !value || isValidURL(value),
                                ),
                                exploreText: Yup.string().nullable(),
                            }),
                        }),
                    });

                case 'HERO_TYPE_FEATURED_PRODUCTS':
                    return Yup.object().shape({
                        type: Yup.string().required('Hero type is required'),
                        featuredProducts: Yup.object().shape({
                            productIds: Yup.array()
                                .of(Yup.number().min(1))
                                .min(1, 'At least one product is required'),
                            title: Yup.string().nullable(),
                            exploreLink: Yup.string().nullable().test(
                                'is-valid-url',
                                (value) => !value || isValidURL(value),
                            ),
                            exploreText: Yup.string().nullable(),
                        }),
                    });

                default:
                    return Yup.object().shape({
                        type: Yup.string().required('Hero type is required'),
                    });
            }
        }),
    ),
});
