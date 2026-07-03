import {
  common_HeroEntityWithTranslations,
  common_HeroFullWithTranslations,
  common_HeroSingleWithTranslations,
  common_MediaFull,
  common_NavFeaturedEntityWithTranslations,
} from 'api/proto-http/frontend';
import { HeroSchema } from './schema';

/**
 * Hydrate the editor's write-model form values (HeroSchema: media ids + a
 * thumbnail URL, product ids) into the read-model shape the storefront renders
 * (common_HeroFullWithTranslations, the same object GetHero returns). This is
 * the inverse of mapHeroFullToFormData and feeds the live iframe preview via
 * postMessage.
 *
 * Media is thumbnail-first: the only URL the form keeps is the thumbnail, so we
 * place it in fullSize/thumbnail/compressed alike — the storefront reads
 * fullSize.mediaUrl, so the draft renders (at thumbnail resolution). Retaining
 * the true fullSize URL at selection time is a later fidelity pass.
 *
 * `productsByUid` is the uid-keyed featured-products cache the editor already
 * holds (resolved common_Product objects); it is passed straight into the
 * featuredProducts block so the preview shows real product media.
 */
export function mapFormToHeroFull(
  data: HeroSchema,
  productsByUid: Record<string, any[]> = {},
): common_HeroFullWithTranslations {
  return {
    entities: (data.entities || []).map((e: any) => mapEntity(e, productsByUid)),
    navFeatured: {
      men: mapNav(data.navFeatured?.men),
      women: mapNav(data.navFeatured?.women),
    },
  };
}

function toMediaFull(id?: number, url?: string | null): common_MediaFull | undefined {
  if (!url) return undefined;
  const info = { mediaUrl: url, width: undefined, height: undefined };
  return {
    id: id || undefined,
    createdAt: undefined,
    media: {
      fullSize: info,
      thumbnail: info,
      compressed: info,
      blurhash: undefined,
    },
  };
}

/** single / double.left / double.right share one shape. */
function toSingle(s: any): common_HeroSingleWithTranslations {
  return {
    mediaLandscape: toMediaFull(s?.mediaLandscapeId, s?.mediaLandscapeUrl),
    mediaPortrait: toMediaFull(s?.mediaPortraitId, s?.mediaPortraitUrl),
    exploreLink: s?.exploreLink ?? undefined,
    translations: (s?.translations || []).map((t: any) => ({
      languageId: t.languageId,
      headline: t.headline ?? undefined,
      exploreText: t.exploreText ?? undefined,
    })),
  };
}

function emptyEntity(type: any): common_HeroEntityWithTranslations {
  return {
    type,
    single: undefined,
    double: undefined,
    main: undefined,
    featuredProducts: undefined,
    featuredProductsTag: undefined,
    featuredArchive: undefined,
  };
}

function mapEntity(
  e: any,
  productsByUid: Record<string, any[]>,
): common_HeroEntityWithTranslations {
  switch (e.type) {
    case 'HERO_TYPE_MAIN':
      return {
        ...emptyEntity(e.type),
        main: {
          single: {
            mediaLandscape: toMediaFull(e.main?.mediaLandscapeId, e.main?.mediaLandscapeUrl),
            mediaPortrait: toMediaFull(e.main?.mediaPortraitId, e.main?.mediaPortraitUrl),
            exploreLink: e.main?.exploreLink ?? undefined,
            translations: [],
          },
          translations: (e.main?.translations || []).map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline ?? undefined,
            tag: t.tag ?? undefined,
            description: t.description ?? undefined,
            exploreText: t.exploreText ?? undefined,
          })),
        },
      };

    case 'HERO_TYPE_SINGLE':
      return { ...emptyEntity(e.type), single: toSingle(e.single) };

    case 'HERO_TYPE_DOUBLE':
      return {
        ...emptyEntity(e.type),
        double: { left: toSingle(e.double?.left), right: toSingle(e.double?.right) },
      };

    case 'HERO_TYPE_FEATURED_PRODUCTS':
      return {
        ...emptyEntity(e.type),
        featuredProducts: {
          products: productsByUid[e._uid] || [],
          exploreLink: e.featuredProducts?.exploreLink ?? undefined,
          translations: (e.featuredProducts?.translations || []).map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline ?? undefined,
            exploreText: t.exploreText ?? undefined,
          })),
        },
      };

    case 'HERO_TYPE_FEATURED_PRODUCTS_TAG':
      return {
        ...emptyEntity(e.type),
        featuredProductsTag: {
          tag: e.featuredProductsTag?.tag ?? undefined,
          // products for a tag block are resolved by the backend from the tag;
          // the form has no resolved list, so the preview renders it empty until
          // the tag-products cache is wired in (later pass).
          products: undefined,
          translations: (e.featuredProductsTag?.translations || []).map((t: any) => ({
            languageId: t.languageId,
            headline: t.headline ?? undefined,
            exploreText: t.exploreText ?? undefined,
          })),
        },
      };

    default:
      return emptyEntity(e.type);
  }
}

function mapNav(n: any): common_NavFeaturedEntityWithTranslations {
  return {
    // nav media URL is not kept in the form (only mediaId), and the hero preview
    // route renders the hero blocks, not the nav — so media is best-effort here.
    media: undefined,
    featuredTag: n?.featuredTag ?? undefined,
    featuredArchiveId: n?.featuredArchiveId != null ? String(n.featuredArchiveId) : undefined,
    translations: (n?.translations || []).map((t: any) => ({
      languageId: t.languageId,
      exploreText: t.exploreText ?? undefined,
    })),
  };
}
