import { common_HeroFullInsert, common_HeroType } from 'api/proto-http/admin';
import { common_HeroFull } from 'api/proto-http/frontend';


export const heroTypes: { value: common_HeroType; label: string }[] = [
    { value: 'HERO_TYPE_MAIN', label: 'main add' },
    { value: 'HERO_TYPE_SINGLE', label: 'single add' },
    { value: 'HERO_TYPE_DOUBLE', label: 'double add' },
    { value: 'HERO_TYPE_FEATURED_PRODUCTS', label: 'featured products' },
    { value: 'HERO_TYPE_FEATURED_PRODUCTS_TAG', label: 'featured products tag' },
    { value: 'HERO_TYPE_FEATURED_ARCHIVE', label: 'featured archive' }
]

export const mapHeroFunction = (hero?: common_HeroFull | undefined): common_HeroFullInsert => {
    return {
        entities: hero?.entities?.map((entity) => ({
            type: entity.type,
            main: {
                single: {
                    headline: entity.main?.single?.headline,
                    mediaLandscapeId: entity.main?.single?.mediaLandscape?.id,
                    mediaPortraitId: entity.main?.single?.mediaPortrait?.id,
                    exploreLink: entity.main?.single?.exploreLink,
                    exploreText: entity.main?.single?.exploreText,
                },
                tag: entity.main?.tag,
                description: entity.main?.description,
            },
            single: {
                headline: entity.single?.headline,
                mediaLandscapeId: entity.single?.mediaLandscape?.id,
                mediaPortraitId: entity.single?.mediaPortrait?.id,
                exploreLink: entity.single?.exploreLink,
                exploreText: entity.single?.exploreText,
            },
            double: {
                left: {
                    headline: entity.double?.left?.headline,
                    mediaLandscapeId: entity.double?.left?.mediaLandscape?.id,
                    mediaPortraitId: entity.double?.left?.mediaPortrait?.id,
                    exploreLink: entity.double?.left?.exploreLink,
                    exploreText: entity.double?.left?.exploreText,
                },
                right: {
                    headline: entity.double?.right?.headline,
                    mediaLandscapeId: entity.double?.right?.mediaLandscape?.id,
                    mediaPortraitId: entity.double?.right?.mediaPortrait?.id,
                    exploreLink: entity.double?.right?.exploreLink,
                    exploreText: entity.double?.right?.exploreText,
                },
            },
            featuredProducts: {
                productIds:
                    entity.featuredProducts?.products
                        ?.map((product) => product.id)
                        .filter((id): id is number => id !== undefined) || [],
                headline: entity.featuredProducts?.headline,
                exploreLink: entity.featuredProducts?.exploreLink,
                exploreText: entity.featuredProducts?.exploreText,
            },
            featuredProductsTag: {
                tag: entity.featuredProductsTag?.tag,
                headline: entity.featuredProductsTag?.products?.headline,
                exploreLink: entity.featuredProductsTag?.products?.exploreLink,
                exploreText: entity.featuredProductsTag?.products?.exploreText,
            },
            featuredArchive: {
                archiveId: entity.featuredArchive?.archive?.id,
                tag: entity.featuredArchive?.tag,
                headline: entity.featuredArchive?.headline,
                exploreText: entity.featuredArchive?.exploreText,
            }
        })),
        navFeatured: {
            men: {
                mediaId: undefined,
                exploreText: undefined,
                featuredTag: undefined,
                featuredArchiveId: undefined
            },
            women: {
                mediaId: undefined,
                exploreText: undefined,
                featuredTag: undefined,
                featuredArchiveId: undefined
            }
        }
    };
};

export const emptyHeroForm: common_HeroFullInsert = {
    entities: [
        {
            type: 'HERO_TYPE_UNKNOWN' as common_HeroType,
            main: {
                single: {
                    mediaLandscapeId: 0,
                    mediaPortraitId: 0,
                    headline: '',
                    exploreLink: '',
                    exploreText: ''
                },
                tag: '',
                description: ''
            },
            single: {
                headline: '',
                mediaLandscapeId: 0,
                mediaPortraitId: 0,
                exploreLink: '',
                exploreText: ''
            },
            double: {
                left: {
                    headline: '',
                    mediaLandscapeId: 0,
                    mediaPortraitId: 0,
                    exploreLink: '',
                    exploreText: ''
                },
                right: {
                    headline: '',
                    mediaLandscapeId: 0,
                    mediaPortraitId: 0,
                    exploreLink: '',
                    exploreText: ''
                }
            },
            featuredProducts: {
                productIds: [],
                headline: '',
                exploreLink: '',
                exploreText: ''
            },
            featuredProductsTag: {
                tag: '',
                headline: '',
                exploreText: ''
            },
            featuredArchive: {
                archiveId: 0,
                tag: '',
                headline: '',
                exploreText: ''
            }
        }
    ],
    navFeatured: undefined
}


