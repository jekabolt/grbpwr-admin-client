import {
  common_HeroCopyTranslation,
  common_HeroEntityInsert,
  common_HeroFullInsert,
  common_HeroMedia,
} from 'api/proto-http/admin';
import {
  common_HeroEntityWithTranslations,
  common_HeroFullWithTranslations,
  common_HeroSingleWithTranslations,
} from 'api/proto-http/frontend';
import { v4 as uuidv4 } from 'uuid';
import { defaultData, HeroSchema } from './schema';

// ─── form → insert (write model) ────────────────────────────────────────────

// The form keeps copy flat (headline/description/exploreText/tag); the contract
// now uses one shared HeroCopyTranslation for every block. The form's `description`
// (main only) maps to `body` per the proto contract comment.
function toCopy(t: any): common_HeroCopyTranslation {
  return {
    languageId: t?.languageId,
    tag: t?.tag ?? undefined,
    headline: t?.headline ?? undefined,
    subhead: t?.subhead ?? undefined,
    body: t?.body ?? t?.description ?? undefined,
    ctaText: t?.ctaText ?? undefined,
    exploreText: t?.exploreText ?? undefined,
    caption: t?.caption ?? undefined,
    placeholder: t?.placeholder ?? undefined,
    successText: t?.successText ?? undefined,
  };
}

// The form keeps a flat portrait/landscape id+url pair per media slot; the
// contract nests it under HeroMedia (+ a per-slot overlay toggle).
function toMedia(s: any): common_HeroMedia {
  return {
    portraitId: s?.mediaPortraitId || 0,
    landscapeId: s?.mediaLandscapeId || 0,
    disableOverlay: s?.disableOverlay ?? false,
  };
}

// single / double.left / double.right / main all share the HeroSingleInsert shape.
function toSingleInsert(s: any) {
  return {
    media: toMedia(s),
    exploreLink: s?.exploreLink || '',
    translations: (s?.translations || []).map(toCopy),
  };
}

// Every insert entity must carry all variant keys (each present, possibly
// undefined) plus the targeting modifier; only the active variant is populated.
function emptyInsertEntity(type: any): common_HeroEntityInsert {
  return {
    type,
    single: undefined,
    double: undefined,
    main: undefined,
    featuredProducts: undefined,
    featuredProductsTag: undefined,
    featuredArchive: undefined,
    embed: undefined,
    drop: undefined,
    lastChance: undefined,
    marquee: undefined,
    newArrivals: undefined,
    slideshow: undefined,
    mosaic: undefined,
    split: undefined,
    video: undefined,
    productSpotlight: undefined,
    newsletter: undefined,
    statement: undefined,
    lookbook: undefined,
    audience: undefined,
    minTierId: undefined,
  };
}

function toInsertEntity(e: any): common_HeroEntityInsert {
  const base = emptyInsertEntity(e.type);
  switch (e.type) {
    case 'HERO_TYPE_MAIN':
      return { ...base, main: toSingleInsert(e.main) };
    case 'HERO_TYPE_SINGLE':
      return { ...base, single: toSingleInsert(e.single) };
    case 'HERO_TYPE_DOUBLE':
      return {
        ...base,
        double: { left: toSingleInsert(e.double?.left), right: toSingleInsert(e.double?.right) },
      };
    case 'HERO_TYPE_FEATURED_PRODUCTS':
      return {
        ...base,
        featuredProducts: {
          productIds: e.featuredProducts?.productIds || [],
          exploreLink: e.featuredProducts?.exploreLink || '',
          translations: (e.featuredProducts?.translations || []).map(toCopy),
        },
      };
    case 'HERO_TYPE_FEATURED_PRODUCTS_TAG':
      return {
        ...base,
        featuredProductsTag: {
          tag: e.featuredProductsTag?.tag || '',
          translations: (e.featuredProductsTag?.translations || []).map(toCopy),
        },
      };
    case 'HERO_TYPE_MARQUEE':
      return {
        ...base,
        marquee: {
          link: e.marquee?.link || '',
          speed: e.marquee?.speed || 0,
          translations: (e.marquee?.translations || []).map(toCopy),
        },
      };
    case 'HERO_TYPE_VIDEO':
      return {
        ...base,
        video: {
          mediaId: e.video?.mediaId || 0,
          posterMediaId: e.video?.posterId || 0,
          autoplay: e.video?.autoplay ?? true,
          loop: e.video?.loop ?? true,
          muted: e.video?.muted ?? true,
          ctaLink: e.video?.ctaLink || '',
          translations: (e.video?.translations || []).map(toCopy),
        },
      };
    case 'HERO_TYPE_STATEMENT':
      return {
        ...base,
        statement: {
          media: toMedia(e.statement),
          exploreLink: e.statement?.exploreLink || '',
          translations: (e.statement?.translations || []).map(toCopy),
        },
      };
    default:
      return base;
  }
}

export function mapFormFieldsToHeroData(data: HeroSchema): common_HeroFullInsert {
  return {
    entities: (data?.entities || []).map(toInsertEntity),
    navFeatured: {
      men: {
        mediaId: data.navFeatured?.men?.mediaId,
        featuredTag: data.navFeatured?.men?.featuredTag,
        featuredArchiveId: data.navFeatured?.men?.featuredArchiveId,
        translations: (data.navFeatured?.men?.translations || []).map((t: any) => ({
          languageId: t.languageId,
          exploreText: t.exploreText,
        })),
      },
      women: {
        mediaId: data.navFeatured?.women?.mediaId,
        featuredTag: data.navFeatured?.women?.featuredTag,
        featuredArchiveId: data.navFeatured?.women?.featuredArchiveId,
        translations: (data.navFeatured?.women?.translations || []).map((t: any) => ({
          languageId: t.languageId,
          exploreText: t.exploreText,
        })),
      },
    },
  };
}

// ─── read (resolved) → form ─────────────────────────────────────────────────

// Read a resolved single/main media pair back into the form's flat id+url fields
// (thumbnail URL, which is all the form keeps).
function readSingle(s?: common_HeroSingleWithTranslations) {
  return {
    mediaLandscapeId: s?.media?.landscape?.id || 0,
    mediaPortraitId: s?.media?.portrait?.id || 0,
    mediaLandscapeUrl: s?.media?.landscape?.media?.thumbnail?.mediaUrl || '',
    mediaPortraitUrl: s?.media?.portrait?.media?.thumbnail?.mediaUrl || '',
    exploreLink: s?.exploreLink,
    translations: (s?.translations || []).map((t) => ({
      languageId: t.languageId || 0,
      headline: t.headline,
      exploreText: t.exploreText || '',
    })),
  };
}

export function mapHeroFullToFormData(
  heroFull?: common_HeroFullWithTranslations,
): HeroSchema & { productsByEntityUid?: Record<string, any[]> } {
  if (!heroFull) return { ...defaultData, productsByEntityUid: {} };

  // Products are resolved during the entity map keyed by array index (the only
  // handle available there), then remapped to _uid below so the display cache
  // survives a reorder.
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
                mediaLandscapeId: e.main?.media?.landscape?.id || 0,
                mediaPortraitId: e.main?.media?.portrait?.id || 0,
                mediaLandscapeUrl: e.main?.media?.landscape?.media?.thumbnail?.mediaUrl || '',
                mediaPortraitUrl: e.main?.media?.portrait?.media?.thumbnail?.mediaUrl || '',
                exploreLink: e.main?.exploreLink,
                translations:
                  e.main?.translations?.map((t) => ({
                    languageId: t.languageId || 0,
                    headline: t.headline,
                    tag: t.tag,
                    description: t.body,
                    exploreText: t.exploreText || '',
                  })) || [],
              },
            };
          case 'HERO_TYPE_SINGLE':
            return { type: e.type, single: readSingle(e.single) };
          case 'HERO_TYPE_DOUBLE':
            return {
              type: e.type,
              double: { left: readSingle(e.double?.left), right: readSingle(e.double?.right) },
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
          case 'HERO_TYPE_MARQUEE':
            return {
              type: e.type,
              marquee: {
                link: e.marquee?.link,
                speed: e.marquee?.speed,
                translations:
                  e.marquee?.translations?.map((t) => ({
                    languageId: t.languageId || 0,
                    headline: t.headline,
                  })) || [],
              },
            };
          case 'HERO_TYPE_VIDEO':
            return {
              type: e.type,
              video: {
                mediaId: e.video?.media?.id || 0,
                mediaUrl: e.video?.media?.media?.thumbnail?.mediaUrl || '',
                posterId: e.video?.posterMedia?.id || 0,
                posterUrl: e.video?.posterMedia?.media?.thumbnail?.mediaUrl || '',
                autoplay: e.video?.autoplay,
                loop: e.video?.loop,
                muted: e.video?.muted,
                ctaLink: e.video?.ctaLink,
                translations:
                  e.video?.translations?.map((t) => ({
                    languageId: t.languageId || 0,
                    headline: t.headline,
                    ctaText: t.ctaText,
                  })) || [],
              },
            };
          case 'HERO_TYPE_STATEMENT':
            return {
              type: e.type,
              statement: {
                mediaLandscapeId: e.statement?.media?.landscape?.id || 0,
                mediaPortraitId: e.statement?.media?.portrait?.id || 0,
                mediaLandscapeUrl: e.statement?.media?.landscape?.media?.thumbnail?.mediaUrl || '',
                mediaPortraitUrl: e.statement?.media?.portrait?.media?.thumbnail?.mediaUrl || '',
                exploreLink: e.statement?.exploreLink,
                translations:
                  e.statement?.translations?.map((t) => ({
                    languageId: t.languageId || 0,
                    headline: t.headline,
                    body: t.body,
                  })) || [],
              },
            };
          default:
            return { type: 'HERO_TYPE_UNKNOWN' as const };
        }
      }) || [];

  // Assign each entity a stable _uid and remap its resolved products (index-keyed
  // above) onto that uid, so the display cache is addressed the same way as the
  // rest of the block's side-state.
  const productsByEntityUid: Record<string, any[]> = {};
  const entitiesWithUid = entities.map((e, index) => {
    const _uid = uuidv4();
    if (productsByEntityIndex[index]) {
      productsByEntityUid[_uid] = productsByEntityIndex[index];
    }
    return { ...e, _uid };
  });

  return {
    entities: entitiesWithUid,
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
    productsByEntityUid,
  };
}
