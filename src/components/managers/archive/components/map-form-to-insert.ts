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

// Every insert item carries all discriminant keys (present, mostly undefined);
// only the fields relevant to `type` are populated — mirrors the hero write mapper.
function toItemInsert(item: any): common_ArchiveItemInsert {
  const base: common_ArchiveItemInsert = {
    type: item.type,
    mediaId: undefined,
    embedUrl: undefined,
    productId: undefined,
    tag: undefined,
    limit: undefined,
    productIds: undefined,
    translations: (item.translations || []).map(toItemTranslation),
  };
  switch (item.type) {
    case 'ARCHIVE_ITEM_TYPE_MEDIA':
      return { ...base, mediaId: item.mediaId || 0 };
    case 'ARCHIVE_ITEM_TYPE_TEXT':
      return base;
    case 'ARCHIVE_ITEM_TYPE_EMBED':
      return { ...base, embedUrl: item.embedUrl || '' };
    case 'ARCHIVE_ITEM_TYPE_PRODUCT':
      return { ...base, productId: item.productId || 0 };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG':
      return { ...base, tag: item.tag || '', limit: item.limit || 0 };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL':
      return { ...base, productIds: item.productIds || [] };
    default:
      return base;
  }
}

export function mapFormToArchiveInsert(data: ArchiveFormData): common_ArchiveInsert {
  const items = (data.items || []).map(toItemInsert);
  // Thumbnail defaults to the first MEDIA block's media when the user hasn't set
  // one explicitly, preserving the prior "first media = thumbnail" behavior.
  const firstMediaId = items.find(
    (i) => i.type === 'ARCHIVE_ITEM_TYPE_MEDIA' && i.mediaId,
  )?.mediaId;
  return {
    tag: data.tag,
    mainMediaIds: data.mainMediaIds || [],
    // explicit choice → first MEDIA block → first main-media, so a body-less
    // archive still gets a timeline thumbnail.
    thumbnailId: data.thumbnailId ?? firstMediaId ?? data.mainMediaIds?.[0],
    translations: (data.translations || []).map((t: any) => ({
      languageId: t.languageId,
      heading: t.heading,
      description: t.description,
    })),
    items,
  };
}
