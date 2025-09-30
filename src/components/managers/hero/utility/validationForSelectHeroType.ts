import { common_HeroEntityInsert, common_HeroType } from 'api/proto-http/admin';

export const validationForSelectHeroType: Record<
  common_HeroType,
  (entity: common_HeroEntityInsert) => boolean
> = {
  HERO_TYPE_MAIN: (entity: common_HeroEntityInsert) =>
    !entity.main?.mediaLandscapeId || !entity.main?.mediaPortraitId,

  HERO_TYPE_SINGLE: (entity: common_HeroEntityInsert) =>
    !entity.single?.mediaLandscapeId || !entity.single?.mediaPortraitId,

  HERO_TYPE_DOUBLE: (entity: common_HeroEntityInsert) =>
    !entity.double?.left?.mediaLandscapeId ||
    !entity.double?.left?.mediaPortraitId ||
    !entity.double?.right?.mediaLandscapeId ||
    !entity.double?.right?.mediaPortraitId,

  HERO_TYPE_FEATURED_PRODUCTS: (entity: common_HeroEntityInsert) =>
    !entity.featuredProducts?.productIds || entity.featuredProducts.productIds.length === 0,

  HERO_TYPE_FEATURED_PRODUCTS_TAG: (entity: common_HeroEntityInsert) =>
    !entity.featuredProductsTag?.tag,

  HERO_TYPE_FEATURED_ARCHIVE: (entity: common_HeroEntityInsert) =>
    !entity.featuredArchive?.archiveId,

  HERO_TYPE_UNKNOWN: (entity: common_HeroEntityInsert) => false,
};
