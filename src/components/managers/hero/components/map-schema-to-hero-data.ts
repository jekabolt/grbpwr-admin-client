import { common_HeroFullInsert } from 'api/proto-http/admin';
import {
  common_HeroEntityWithTranslations,
  common_HeroFullWithTranslations,
} from 'api/proto-http/frontend';
import { defaultData, HeroSchema } from './schema';

export function mapFormFieldsToHeroData(data: HeroSchema): common_HeroFullInsert {
  return {
    entities: data?.entities.map((e: any) => ({
      type: e.type,
      main: {
        mediaLandscapeId: e.main?.mediaLandscapeId || 0,
        mediaPortraitId: e.main?.mediaPortraitId || 0,
        mediaLandscapeUrl: e.main?.mediaLandscapeUrl || '',
        mediaPortraitUrl: e.main?.mediaPortraitUrl || '',
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
        mediaLandscapeUrl: e.single?.mediaLandscapeUrl || '',
        mediaPortraitUrl: e.single?.mediaPortraitUrl || '',
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
          mediaLandscapeId: e.double?.left?.mediaLandscapeId || 0,
          mediaPortraitId: e.double?.left?.mediaPortraitId || 0,
          mediaLandscapeUrl: e.double?.left?.mediaLandscapeUrl || '',
          mediaPortraitUrl: e.double?.left?.mediaPortraitUrl || '',
          exploreLink: e.double?.left?.exploreLink || '',
          translations:
            e.double?.left?.translations?.map((t: any) => ({
              languageId: t.languageId,
              headline: t.headline,
              exploreText: t.exploreText,
            })) || [],
        },
        right: {
          mediaLandscapeId: e.double?.right?.mediaLandscapeId || 0,
          mediaPortraitId: e.double?.right?.mediaPortraitId || 0,
          mediaLandscapeUrl: e.double?.right?.mediaLandscapeUrl || '',
          mediaPortraitUrl: e.double?.right?.mediaPortraitUrl || '',
          exploreLink: e.double?.right?.exploreLink || '',
          translations:
            e.double?.right?.translations?.map((t: any) => ({
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
        tag: e.featuredProductsTag?.tag || '',
        translations:
          e.featuredProductsTag?.translations?.map((t: any) => ({
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

export function mapHeroFullToFormData(
  heroFull?: common_HeroFullWithTranslations,
): HeroSchema & { productsByEntityIndex?: Record<number, any[]> } {
  if (!heroFull) return { ...defaultData, productsByEntityIndex: {} };

  const productsByEntityIndex: Record<number, any[]> = {};

  const entities =
    heroFull.entities
      ?.filter((e) => e.type)
      .map((e: common_HeroEntityWithTranslations, index: number) => {
        switch (e.type) {
          case 'HERO_TYPE_MAIN':
            return {
              type: e.type,
              main: {
                mediaLandscapeId: e.main?.single?.mediaLandscape?.id || 0,
                mediaPortraitId: e.main?.single?.mediaPortrait?.id || 0,
                mediaLandscapeUrl: e.main?.single?.mediaLandscape?.media?.thumbnail?.mediaUrl || '',
                mediaPortraitUrl: e.main?.single?.mediaPortrait?.media?.thumbnail?.mediaUrl || '',
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
                mediaLandscapeUrl: e.single?.mediaLandscape?.media?.thumbnail?.mediaUrl || '',
                mediaPortraitUrl: e.single?.mediaPortrait?.media?.thumbnail?.mediaUrl || '',
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
                  mediaLandscapeUrl:
                    e.double?.left?.mediaLandscape?.media?.thumbnail?.mediaUrl || '',
                  mediaPortraitUrl: e.double?.left?.mediaPortrait?.media?.thumbnail?.mediaUrl || '',
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
                  mediaLandscapeUrl:
                    e.double?.right?.mediaLandscape?.media?.thumbnail?.mediaUrl || '',
                  mediaPortraitUrl:
                    e.double?.right?.mediaPortrait?.media?.thumbnail?.mediaUrl || '',
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
          case 'HERO_TYPE_FEATURED_PRODUCTS': {
            const products =
              e.featuredProducts?.products?.filter(
                (p): p is any => typeof p !== 'number' && p !== undefined,
              ) || [];
            if (products.length > 0) {
              productsByEntityIndex[index] = products;
            }
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
          }
          case 'HERO_TYPE_FEATURED_PRODUCTS_TAG':
            return {
              type: e.type,
              featuredProductsTag: {
                tag: e.featuredProductsTag?.tag || '',
                translations:
                  e.featuredProductsTag?.translations?.map((t) => ({
                    languageId: t.languageId || 0,
                    headline: t.headline,
                    exploreText: t.exploreText || '',
                  })) || [],
              },
            };
          default:
            return { type: 'HERO_TYPE_UNKNOWN' as const };
        }
      }) || [];

  return {
    entities,
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
    productsByEntityIndex,
  };
}
