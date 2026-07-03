import {
  common_HeroCopyTranslation,
  common_HeroEntityWithTranslations,
  common_HeroFullWithTranslations,
  common_HeroMediaFull,
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

// The form's flat portrait/landscape id+url pair → the contract's nested HeroMediaFull.
function toMediaPair(s: any): common_HeroMediaFull {
  return {
    portrait: toMediaFull(s?.mediaPortraitId, s?.mediaPortraitUrl),
    landscape: toMediaFull(s?.mediaLandscapeId, s?.mediaLandscapeUrl),
    disableOverlay: s?.disableOverlay ?? false,
  };
}

// The form keeps copy flat; the contract uses one shared HeroCopyTranslation.
// The form's `description` (main) maps to `body` per the proto contract comment.
function toCopy(t: any): common_HeroCopyTranslation {
  return {
    languageId: t.languageId,
    tag: t.tag ?? undefined,
    headline: t.headline ?? undefined,
    subhead: t.subhead ?? undefined,
    body: t.body ?? t.description ?? undefined,
    ctaText: t.ctaText ?? undefined,
    exploreText: t.exploreText ?? undefined,
    caption: t.caption ?? undefined,
    placeholder: t.placeholder ?? undefined,
    successText: t.successText ?? undefined,
  };
}

/** single / double.left / double.right / main share one shape. */
function toSingle(s: any): common_HeroSingleWithTranslations {
  return {
    media: toMediaPair(s),
    exploreLink: s?.exploreLink ?? undefined,
    translations: (s?.translations || []).map(toCopy),
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

function mapEntity(
  e: any,
  productsByUid: Record<string, any[]>,
): common_HeroEntityWithTranslations {
  switch (e.type) {
    case 'HERO_TYPE_MAIN':
      return { ...emptyEntity(e.type), main: toSingle(e.main) };

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
          translations: (e.featuredProducts?.translations || []).map(toCopy),
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
          translations: (e.featuredProductsTag?.translations || []).map(toCopy),
        },
      };

    case 'HERO_TYPE_MARQUEE':
      return {
        ...emptyEntity(e.type),
        marquee: {
          link: e.marquee?.link ?? undefined,
          speed: e.marquee?.speed ?? undefined,
          translations: (e.marquee?.translations || []).map(toCopy),
        },
      };

    case 'HERO_TYPE_VIDEO':
      return {
        ...emptyEntity(e.type),
        video: {
          // form keeps only the thumbnail url, so preview shows the poster frame,
          // not the playing video — full video fidelity is a post-save GetHero pass.
          media: toMediaFull(e.video?.mediaId, e.video?.mediaUrl),
          posterMedia: toMediaFull(e.video?.posterId, e.video?.posterUrl),
          autoplay: e.video?.autoplay ?? true,
          loop: e.video?.loop ?? true,
          muted: e.video?.muted ?? true,
          ctaLink: e.video?.ctaLink ?? undefined,
          translations: (e.video?.translations || []).map(toCopy),
        },
      };

    case 'HERO_TYPE_STATEMENT':
      return {
        ...emptyEntity(e.type),
        statement: {
          media: toMediaPair(e.statement),
          exploreLink: e.statement?.exploreLink ?? undefined,
          translations: (e.statement?.translations || []).map(toCopy),
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
