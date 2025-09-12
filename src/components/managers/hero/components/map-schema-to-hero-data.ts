import { common_HeroFullInsert } from 'api/proto-http/admin';
import {
  common_HeroEntityWithTranslations,
  common_HeroFullWithTranslations,
} from 'api/proto-http/frontend';
import { defaultData, HeroSchema } from './schema';

export function mapFormFieldsToHeroData(data: HeroSchema): common_HeroFullInsert {
  if (!data) return defaultData;

  return {
    entities: data.entities.map((e: any) => ({
      type: e.type,
      main: {
        mediaLandscapeId: e.main?.mediaLandscapeId || 0,
        mediaPortraitId: e.main?.mediaPortraitId || 0,
        exploreLink: e.main?.exploreLink || '',
        translations:
          e.main?.translations?.map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline,
            tag: t.tag,
            description: t.description,
            exploreText: t.exploreText,
          })) || [],
      },
      single: {
        mediaLandscapeId: e.single?.mediaLandscapeId || 0,
        mediaPortraitId: e.single?.mediaPortraitId || 0,
        exploreLink: e.single?.exploreLink || '',
        translations:
          e.single?.translations?.map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline,
            exploreText: t.exploreText,
          })) || [],
      },
      double: {
        left: {
          mediaLandscapeId: e.doubleAdd?.left?.mediaLandscapeId || 0,
          mediaPortraitId: e.doubleAdd?.left?.mediaPortraitId || 0,
          exploreLink: e.doubleAdd?.left?.exploreLink || '',
          translations:
            e.doubleAdd?.left?.translations?.map((t: any) => ({
              languageId: t.languageId,
              headline: t.headline,
              exploreText: t.exploreText,
            })) || [],
        },
        right: {
          mediaLandscapeId: e.doubleAdd?.right?.mediaLandscapeId || 0,
          mediaPortraitId: e.doubleAdd?.right?.mediaPortraitId || 0,
          exploreLink: e.doubleAdd?.right?.exploreLink || '',
          translations:
            e.doubleAdd?.right?.translations?.map((t: any) => ({
              languageId: t.languageId,
              headline: t.headline,
              exploreText: t.exploreText,
            })) || [],
        },
      },
      featuredProducts: {
        productIds: e.featuredProducts?.productIds || [],
        exploreLink: e.featuredProducts?.exploreLink || '',
        translations:
          e.featuredProducts?.translations?.map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline,
            exploreText: t.exploreText,
          })) || [],
      },
      featuredProductsTag: {
        tag: e.tag || '',
        translations:
          e.translations?.map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline,
            exploreText: t.exploreText,
          })) || [],
      },
      featuredArchive: {
        archiveId: 0,
        tag: '',
        translations:
          e.featuredArchive?.translations?.map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline,
            exploreText: t.exploreText,
          })) || [],
      },
    })),
    navFeatured: {
      men: {
        mediaId: data.navFeatured.men.mediaId,
        featuredTag: data.navFeatured.men.featuredTag,
        featuredArchiveId: data.navFeatured.men.featuredArchiveId,
        translations: data.navFeatured.men.translations.map((t: any) => ({
          languageId: t.languageId,
          exploreText: t.exploreText,
        })),
      },
      women: {
        mediaId: data.navFeatured.women.mediaId,
        featuredTag: data.navFeatured.women.featuredTag,
        featuredArchiveId: data.navFeatured.women.featuredArchiveId,
        translations: data.navFeatured.men.translations.map((t: any) => ({
          languageId: t.languageId,
          exploreText: t.exploreText,
        })),
      },
    },
  };
}

export function mapHeroFullToFormData(heroFull?: common_HeroFullWithTranslations): HeroSchema {
  if (!heroFull) return defaultData;

  return {
    entities:
      heroFull.entities
        ?.filter((e) => e.type)
        .map((e: common_HeroEntityWithTranslations) => {
          switch (e.type) {
            case 'HERO_TYPE_MAIN':
              return {
                type: e.type,
                main: {
                  mediaLandscapeId: e.main?.single?.mediaLandscape?.id || 0,
                  mediaPortraitId: e.main?.single?.mediaPortrait?.id || 0,
                  exploreLink: e.main?.single?.exploreLink,
                  translations:
                    e.main?.translations?.map((t) => ({
                      languageId: t.languageId || 0,
                      headline: t.headline,
                      tag: t.tag,
                      description: t.description,
                      exploreText: t.exploreText || '',
                    })) || [],
                },
              };
            case 'HERO_TYPE_SINGLE':
              return {
                type: e.type,
                single: {
                  mediaLandscapeId: e.single?.mediaLandscape?.id || 0,
                  mediaPortraitId: e.single?.mediaPortrait?.id || 0,
                  exploreLink: e.single?.exploreLink,
                  translations:
                    e.single?.translations?.map((t) => ({
                      languageId: t.languageId || 0,
                      headline: t.headline,
                      exploreText: t.exploreText || '',
                    })) || [],
                },
              };
            case 'HERO_TYPE_DOUBLE':
              return {
                type: e.type,
                double: {
                  left: {
                    mediaLandscapeId: e.double?.left?.mediaLandscape?.id || 0,
                    mediaPortraitId: e.double?.left?.mediaPortrait?.id || 0,
                    exploreLink: e.double?.left?.exploreLink,
                    translations:
                      e.double?.left?.translations?.map((t) => ({
                        languageId: t.languageId || 0,
                        headline: t.headline,
                        exploreText: t.exploreText || '',
                      })) || [],
                  },
                  right: {
                    mediaLandscapeId: e.double?.right?.mediaLandscape?.id || 0,
                    mediaPortraitId: e.double?.right?.mediaPortrait?.id || 0,
                    exploreLink: e.double?.right?.exploreLink,
                    translations:
                      e.double?.right?.translations?.map((t) => ({
                        languageId: t.languageId || 0,
                        headline: t.headline,
                        exploreText: t.exploreText || '',
                      })) || [],
                  },
                },
              };
            case 'HERO_TYPE_FEATURED_PRODUCTS':
              return {
                type: e.type,
                featuredProducts: {
                  productIds:
                    e.featuredProducts?.products
                      ?.map((p) => (typeof p === 'number' ? p : p.id))
                      .filter((id): id is number => id !== undefined) || [],
                  exploreLink: e.featuredProducts?.exploreLink,
                  translations:
                    e.featuredProducts?.translations?.map((t) => ({
                      languageId: t.languageId || 0,
                      headline: t.headline,
                      exploreText: t.exploreText || '',
                    })) || [],
                },
              };
            case 'HERO_TYPE_FEATURED_PRODUCTS_TAG':
              return {
                type: e.type,
                tag: e.featuredProductsTag?.tag || '',
                translations:
                  e.featuredProductsTag?.translations?.map((t) => ({
                    languageId: t.languageId || 0,
                    headline: t.headline,
                    exploreText: t.exploreText || '',
                  })) || [],
              };
            default:
              return { type: 'HERO_TYPE_UNKNOWN' as const };
          }
        }) || [],
    navFeatured: {
      men: {
        mediaId: heroFull.navFeatured?.men?.media?.id,
        featuredTag: heroFull.navFeatured?.men?.featuredTag,
        featuredArchiveId: heroFull.navFeatured?.men?.featuredArchiveId
          ? parseInt(heroFull.navFeatured.men.featuredArchiveId)
          : undefined,
        translations:
          heroFull.navFeatured?.men?.translations?.map((t) => ({
            languageId: t.languageId || 0,
            exploreText: t.exploreText || '',
          })) || [],
      },
      women: {
        mediaId: heroFull.navFeatured?.women?.media?.id,
        featuredTag: heroFull.navFeatured?.women?.featuredTag,
        featuredArchiveId: heroFull.navFeatured?.women?.featuredArchiveId
          ? parseInt(heroFull.navFeatured.women.featuredArchiveId)
          : undefined,
        translations:
          heroFull.navFeatured?.women?.translations?.map((t) => ({
            languageId: t.languageId || 0,
            exploreText: t.exploreText || '',
          })) || [],
      },
    },
  };
}
