import {
  common_ArchiveFull,
  common_ArchiveItemFull,
  common_MediaFull,
  common_Product,
} from 'api/proto-http/frontend';
import { ArchiveFormData } from './schema';

/**
 * Hydrate the editor's flat write-model form values into the nested read-model
 * shape the storefront renders (common_ArchiveFull, the same object GetArchive
 * returns). Inverse of mapArchiveFullToForm; feeds the live iframe preview.
 *
 * Media is thumbnail-first: the only URL the form keeps is the thumbnail, so we
 * place it in fullSize/thumbnail/compressed alike. `productsByUid` is the
 * uid-keyed resolved-product cache the editor holds, so product/products blocks
 * render real media in the preview.
 */
export function mapFormToArchiveFull(
  data: ArchiveFormData,
  productsByUid: Record<string, common_Product[]> = {},
): common_ArchiveFull {
  return {
    archiveList: {
      id: undefined,
      tag: data.tag,
      slug: undefined,
      createdAt: undefined,
      thumbnail: undefined,
      translations: (data.translations || []).map((t: any) => ({
        languageId: t.languageId,
        heading: t.heading ?? undefined,
      })),
    },
    items: (data.items || []).map((i) => toItemFull(i, productsByUid)),
  };
}

function toMediaFull(id?: number, url?: string | null): common_MediaFull | undefined {
  if (!url) return undefined;
  const info = { mediaUrl: url, width: undefined, height: undefined };
  return {
    id: id || undefined,
    createdAt: undefined,
    media: { fullSize: info, thumbnail: info, compressed: info, blurhash: undefined },
  };
}

function toTranslations(translations: any) {
  return (translations || []).map((t: any) => ({
    languageId: t.languageId,
    caption: t.caption ?? undefined,
    text: t.text ?? undefined,
  }));
}

function toItemFull(
  item: any,
  productsByUid: Record<string, common_Product[]>,
): common_ArchiveItemFull {
  const base: common_ArchiveItemFull = {
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
          media: toMediaFull(item.mediaId, item.mediaUrl),
          aspectRatio: item.aspectRatio,
        },
      };
    case 'ARCHIVE_ITEM_TYPE_MEDIA_LINE':
      return {
        ...base,
        mediaLine: {
          media: (item.mediaIds || [])
            .map((id: number, i: number) => toMediaFull(id, item.mediaUrls?.[i]))
            .filter((m: common_MediaFull | undefined): m is common_MediaFull => !!m),
          aspectRatio: item.aspectRatio,
        },
      };
    case 'ARCHIVE_ITEM_TYPE_TEXT':
      return { ...base, text: { translations: toTranslations(item.translations) } };
    case 'ARCHIVE_ITEM_TYPE_EMBED':
      return {
        ...base,
        embed: {
          embedUrl: item.embedUrl ?? undefined,
          translations: toTranslations(item.translations),
        },
      };
    case 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION':
      return {
        ...base,
        mediaWithCaption: {
          media: toMediaFull(item.mediaId, item.mediaUrl),
          link: item.link ?? undefined,
          aspectRatio: item.aspectRatio,
          translations: toTranslations(item.translations),
        },
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCT':
      return {
        ...base,
        product: {
          product: (productsByUid[item._uid] || [])[0],
          translations: toTranslations(item.translations),
        },
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG':
      return {
        ...base,
        productsTag: {
          tag: item.tag ?? undefined,
          products: productsByUid[item._uid] || undefined,
          translations: toTranslations(item.translations),
        },
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL':
      return {
        ...base,
        productsManual: {
          products: productsByUid[item._uid] || [],
          translations: toTranslations(item.translations),
        },
      };
    default:
      return base;
  }
}
