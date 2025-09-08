import { common_HeroFullInsert, common_HeroType } from 'api/proto-http/admin';


export const heroTypes: { value: common_HeroType; label: string }[] = [
    { value: 'HERO_TYPE_MAIN', label: 'main add' },
    { value: 'HERO_TYPE_SINGLE', label: 'single add' },
    { value: 'HERO_TYPE_DOUBLE', label: 'double add' },
    { value: 'HERO_TYPE_FEATURED_PRODUCTS', label: 'featured products' },
    { value: 'HERO_TYPE_FEATURED_PRODUCTS_TAG', label: 'featured products tag' },
    { value: 'HERO_TYPE_FEATURED_ARCHIVE', label: 'featured archive' }
]

export const mapHeroFunction = (hero?: common_HeroFullInsert | undefined): common_HeroFullInsert => {
    return {
        entities: hero?.entities?.map((entity) => ({
            type: entity.type,
            main: {
                mediaLandscapeId: entity.main?.mediaLandscapeId,
                mediaPortraitId: entity.main?.mediaPortraitId,
                exploreLink: entity.main?.exploreLink,
                translations: [{
                    languageId: 1,
                    headline: entity.main?.translations?.[0].headline || '',
                    exploreText: entity.main?.translations?.[0].exploreText || '',
                    tag: entity.main?.translations?.[0].tag || '',
                    description: entity.main?.translations?.[0].description || '',
                }],
            },
            single: {
                mediaLandscapeId: entity.single?.mediaLandscapeId,
                mediaPortraitId: entity.single?.mediaPortraitId,
                exploreLink: entity.single?.exploreLink,
                translations: [{
                    languageId: 1,
                    headline: entity.single?.translations?.[0].headline || '',
                    exploreText: entity.single?.translations?.[0].exploreText || ''
                }],
            },
            double: {
                left: {
                    mediaLandscapeId: entity.double?.left?.mediaLandscapeId,
                    mediaPortraitId: entity.double?.left?.mediaPortraitId,
                    exploreLink: entity.double?.left?.exploreLink,
                    translations: [{
                        languageId: 1,
                        headline: entity.double?.left?.translations?.[0].headline || '',
                        exploreText: entity.double?.left?.translations?.[0].exploreText || ''
                    }],
                },
                right: {
                    mediaLandscapeId: entity.double?.right?.mediaLandscapeId,
                    mediaPortraitId: entity.double?.right?.mediaPortraitId,
                    exploreLink: entity.double?.right?.exploreLink,
                    translations: [{
                        languageId: 1,
                        headline: entity.double?.right?.translations?.[0].headline || '',
                        exploreText: entity.double?.right?.translations?.[0].exploreText || ''
                    }],
                },
            },
            featuredProducts: {
                productIds:
                    entity.featuredProducts?.productIds
                        ?.map((product) => product)
                        .filter((id): id is number => id !== undefined) || [],
                exploreLink: entity.featuredProducts?.exploreLink,
                translations: [{
                    languageId: 1,
                    headline: entity.featuredProducts?.translations?.[0].headline || '',
                    exploreText: entity.featuredProducts?.translations?.[0].exploreText || ''
                }],
            },
            featuredProductsTag: {
                tag: entity.featuredProductsTag?.tag || '',
                translations: [{
                    languageId: 1,
                    headline: entity.featuredProductsTag?.translations?.[0].headline || '',
                    exploreText: entity.featuredProductsTag?.translations?.[0].exploreText || ''
                }],
            },
            featuredArchive: {
                archiveId: entity.featuredArchive?.archiveId,
                tag: entity.featuredArchive?.tag,
                translations: [{
                    languageId: 1,
                    headline: entity.featuredArchive?.translations?.[0].headline || '',
                    exploreText: entity.featuredArchive?.translations?.[0].exploreText || ''
                }],
            }
        })),
        navFeatured: {
            men: {
                mediaId: hero?.navFeatured?.men?.mediaId,
                featuredTag: hero?.navFeatured?.men?.featuredTag,
                featuredArchiveId: hero?.navFeatured?.men?.featuredArchiveId,
                translations: [{
                    languageId: 1, exploreText: hero?.navFeatured?.men?.translations?.[0].exploreText,
                }]
            },
            women: {
                mediaId: hero?.navFeatured?.women?.mediaId,
                featuredTag: hero?.navFeatured?.women?.featuredTag,
                featuredArchiveId: hero?.navFeatured?.women?.featuredArchiveId,
                translations: [{
                    languageId: 1, exploreText: hero?.navFeatured?.women?.translations?.[0].exploreText,
                }]
            }
        }
    };
};

export const emptyHeroForm: common_HeroFullInsert = {
    entities: [
        {
            type: 'HERO_TYPE_UNKNOWN' as common_HeroType,
            main: {

                mediaLandscapeId: 0,
                mediaPortraitId: 0,
                exploreLink: '',
                translations: [{ languageId: 1, headline: '', exploreText: '', tag: '', description: '' }]
            },
            single: {

                mediaLandscapeId: 0,
                mediaPortraitId: 0,
                exploreLink: '',
                translations: [{ languageId: 1, headline: '', exploreText: '' }]
            },
            double: {
                left: {

                    mediaLandscapeId: 0,
                    mediaPortraitId: 0,
                    exploreLink: '',
                    translations: [{ languageId: 1, headline: '', exploreText: '' }]
                },
                right: {

                    mediaLandscapeId: 0,
                    mediaPortraitId: 0,
                    exploreLink: '',
                    translations: [{ languageId: 1, headline: '', exploreText: '' }]
                }
            },
            featuredProducts: {
                productIds: [],
                exploreLink: '',
                translations: [{ languageId: 1, headline: '', exploreText: '' }]
            },
            featuredProductsTag: {
                tag: '',
                translations: [{ languageId: 1, headline: '', exploreText: '' }]
            },
            featuredArchive: {
                archiveId: 0,
                tag: '',
                translations: [{ languageId: 1, headline: '', exploreText: '' }]
            }
        }
    ],
    navFeatured: {
        men: {
            mediaId: 0,
            translations: [{ languageId: 1, exploreText: '' }],
            featuredTag: '',
            featuredArchiveId: 0
        },
        women: {
            mediaId: 0,
            translations: [{ languageId: 1, exploreText: '' }],
            featuredTag: '',
            featuredArchiveId: 0
        }
    }
}


