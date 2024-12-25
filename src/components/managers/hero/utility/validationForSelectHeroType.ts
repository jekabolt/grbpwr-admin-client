import { common_HeroEntityInsert, common_HeroType } from "api/proto-http/admin";

export const validationForSelectHeroType: Record<common_HeroType, (entity: common_HeroEntityInsert) => boolean> = {
    HERO_TYPE_MAIN: (entity: common_HeroEntityInsert) =>
        !entity.main?.single?.mediaId,

    HERO_TYPE_SINGLE: (entity: common_HeroEntityInsert) =>
        !entity.single?.mediaId,

    HERO_TYPE_DOUBLE: (entity: common_HeroEntityInsert) =>
        !entity.double?.left?.mediaId ||
        !entity.double?.right?.mediaId,

    HERO_TYPE_FEATURED_PRODUCTS: (entity: common_HeroEntityInsert) =>
        !entity.featuredProducts?.productIds || entity.featuredProducts.productIds.length === 0,

    HERO_TYPE_FEATURED_PRODUCTS_TAG: (entity: common_HeroEntityInsert) =>
        !entity.featuredProductsTag?.tag,

    HERO_TYPE_UNKNOWN: (entity: common_HeroEntityInsert) => false,
}