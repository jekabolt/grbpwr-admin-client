import {
  common_ArchiveInsert,
  common_ArchiveItemInsert,
  common_ArchiveItemTranslation,
} from 'api/proto-http/admin';
import { ArchiveFormData } from './schema';

// A flat form translation row (carries caption and/or text) → the proto's
// per-block ArchiveItemTranslation. Each block type uses only the subset it needs.
function toItemTranslation(t: any): common_ArchiveItemTranslation {
  return {
    languageId: t?.languageId,
    caption: t?.caption ?? undefined,
    text: t?.text ?? undefined,
  };
}

// Flat form item → the nested ArchiveItemInsert (exactly one payload field set).
function toItemInsert(item: any): common_ArchiveItemInsert {
  const tx = (item.translations || []).map(toItemTranslation);
  const base: common_ArchiveItemInsert = {
    type: item.type,
    mainMedia: undefined,
    mediaLine: undefined,
    text: undefined,
    embed: undefined,
    mediaWithCaption: undefined,
    product: undefined,
    productsTag: undefined,
    productsManual: undefined,
  };
  switch (item.type) {
    case 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA':
      return {
        ...base,
        mainMedia: {
          mediaId: item.mediaId || 0,
          aspectRatio: item.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_UNKNOWN',
        },
      };
    case 'ARCHIVE_ITEM_TYPE_MEDIA_LINE':
      return {
        ...base,
        mediaLine: {
          mediaIds: item.mediaIds || [],
          aspectRatio: item.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
        },
      };
    case 'ARCHIVE_ITEM_TYPE_TEXT':
      return { ...base, text: { translations: tx } };
    case 'ARCHIVE_ITEM_TYPE_EMBED':
      return { ...base, embed: { embedUrl: item.embedUrl || '', translations: tx } };
    case 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION':
      return {
        ...base,
        mediaWithCaption: {
          mediaId: item.mediaId || 0,
          link: item.link || '',
          aspectRatio: item.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
          translations: tx,
        },
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCT':
      // R2: archive product blocks reference a colourway now (was product_id). The form field keeps
      // its `productId` name; only the proto key changes.
      return { ...base, product: { colorwayId: item.productId || 0, translations: tx } };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG':
      // P0: `limit` is write-only on read (mapArchiveFullToForm always loads it as
      // undefined — a contract limitation, see that file). `item.limit || 0` used
      // to coerce that unknown/untouched state to an explicit 0 ("no cap") on
      // every save, silently zeroing a previously-set cap on any block the
      // operator never opened. Send the form's actual value (undefined when
      // untouched) instead of manufacturing a 0 the operator never entered.
      return {
        ...base,
        productsTag: { tag: item.tag || '', limit: item.limit, translations: tx },
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL':
      return { ...base, productsManual: { colorwayIds: item.productIds || [], translations: tx } };
    default:
      return base;
  }
}

// The first media id across media-bearing blocks, for thumbnail derivation.
function firstMediaId(items: any[]): number | undefined {
  for (const i of items) {
    if (i.type === 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA' && i.mediaId) return i.mediaId;
    if (i.type === 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION' && i.mediaId) return i.mediaId;
    if (i.type === 'ARCHIVE_ITEM_TYPE_MEDIA_LINE' && i.mediaIds?.[0]) return i.mediaIds[0];
  }
  return undefined;
}

export function mapFormToArchiveInsert(data: ArchiveFormData): common_ArchiveInsert {
  const items = (data.items || []).map(toItemInsert);
  return {
    tag: data.tag,
    // explicit choice → first media block, so a body-less archive still gets a
    // timeline thumbnail once media exists.
    thumbnailId: data.thumbnailId ?? firstMediaId(data.items || []),
    translations: (data.translations || []).map((t: any) => ({
      languageId: t.languageId,
      heading: t.heading,
    })),
    items,
  };
}
