import { common_HeroFullInsert, common_HeroType } from 'api/proto-http/admin';
import { common_HeroFull } from 'api/proto-http/frontend';


export const heroTypes: { value: common_HeroType; label: string }[] = [
    { value: 'HERO_TYPE_MAIN_ADD', label: 'main add' },
    { value: 'HERO_TYPE_SINGLE_ADD', label: 'single add' },
    { value: 'HERO_TYPE_DOUBLE_ADD', label: 'double add' },
    { value: 'HERO_TYPE_FEATURED_PRODUCTS', label: 'featured products' }
]

export const mapHeroFunction = (hero?: common_HeroFull | undefined): common_HeroFullInsert => {
    return {
        entities: hero?.entities?.map((entity) => ({
            type: entity.type,
            mainAdd: {
                singleAdd: {
                    mediaId: entity.mainAdd?.singleAdd?.media?.id,
                    exploreLink: entity.mainAdd?.singleAdd?.exploreLink,
                    exploreText: entity.mainAdd?.singleAdd?.exploreText,
                },
            },
            singleAdd: {
                mediaId: entity.singleAdd?.media?.id,
                exploreLink: entity.singleAdd?.exploreLink,
                exploreText: entity.singleAdd?.exploreText,
            },
            doubleAdd: {
                left: {
                    mediaId: entity.doubleAdd?.left?.media?.id,
                    exploreLink: entity.doubleAdd?.left?.exploreLink,
                    exploreText: entity.doubleAdd?.left?.exploreText,
                },
                right: {
                    mediaId: entity.doubleAdd?.right?.media?.id,
                    exploreLink: entity.doubleAdd?.right?.exploreLink,
                    exploreText: entity.doubleAdd?.right?.exploreText,
                },
            },
            featuredProducts: {
                productIds:
                    entity.featuredProducts?.products
                        ?.map((product) => product.id)
                        .filter((id): id is number => id !== undefined) || [],
                title: entity.featuredProducts?.title,
                exploreLink: entity.featuredProducts?.exploreLink,
                exploreText: entity.featuredProducts?.exploreText,
            },
            featuredProductsTag: {
                tag: entity.featuredProductsTag?.tag,
                title: entity.featuredProductsTag?.products?.title,
                exploreLink: entity.featuredProductsTag?.products?.exploreLink,
                exploreText: entity.featuredProductsTag?.products?.exploreText
            }
        })),
    };
};

export const emptyHeroForm: common_HeroFullInsert = {
    entities: [
        {
            type: 'HERO_TYPE_UNKNOWN' as common_HeroType,
            mainAdd: {
                singleAdd: {
                    mediaId: 0,
                    exploreLink: '',
                    exploreText: ''
                }
            },
            singleAdd: {
                mediaId: 0,
                exploreLink: '',
                exploreText: ''
            },
            doubleAdd: {
                left: {
                    mediaId: 0,
                    exploreLink: '',
                    exploreText: ''
                },
                right: {
                    mediaId: 0,
                    exploreLink: '',
                    exploreText: ''
                }
            },
            featuredProducts: {
                productIds: [],
                title: '',
                exploreLink: '',
                exploreText: ''
            },
            featuredProductsTag: {
                tag: '',
                title: '',
                exploreLink: '',
                exploreText: ''
            }
        }
    ]
}


