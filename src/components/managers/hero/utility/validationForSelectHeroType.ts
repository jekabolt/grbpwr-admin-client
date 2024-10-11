import { common_HeroEntityInsert, common_HeroType } from "api/proto-http/admin";

export const validationForSelectHeroType: Record<common_HeroType, (entity: common_HeroEntityInsert) => boolean> = {
    HERO_TYPE_MAIN_ADD: (entity: common_HeroEntityInsert) =>
        !entity.mainAdd?.singleAdd?.mediaId,


    HERO_TYPE_SINGLE_ADD: (entity: common_HeroEntityInsert) =>
        !entity.singleAdd?.mediaId,

    HERO_TYPE_DOUBLE_ADD: (entity: common_HeroEntityInsert) =>
        !entity.doubleAdd?.left?.mediaId ||
        !entity.doubleAdd?.right?.mediaId,

    HERO_TYPE_FEATURED_PRODUCTS: (entity: common_HeroEntityInsert) =>
        !entity.featuredProducts?.productIds,

    HERO_TYPE_UNKNOWN: (entity: common_HeroEntityInsert) => false,
}