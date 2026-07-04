import {
  common_ArchiveFull,
  common_ArchiveItemFull,
  common_MediaFull,
  common_Product,
} from 'api/proto-http/frontend';
import { ArchiveFormData } from './schema';

/**
 * Hydrate the editor's write-model form values into the read-model shape the
 * storefront renders (common_ArchiveFull, the same object GetArchive returns).
 * Inverse of mapArchiveFullToForm; feeds the live iframe preview via postMessage.
 *
 * Media is thumbnail-first: the only URL the form keeps is the thumbnail, so we
 * place it in fullSize/thumbnail/compressed alike (mirrors mapFormToHeroFull).
 * `productsByUid` is the uid-keyed resolved-product cache the editor holds, so
 * product/products blocks render real media in the preview.
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
        description: t.description ?? undefined,
      })),
    },
    // The form keeps only main-media ids (no urls), so the band renders empty in
    // the preview until selection-time urls are retained — a later fidelity pass.
    mainMedia: [],
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

function toItemTranslations(item: any) {
  return (item.translations || []).map((t: any) => ({
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
    media: undefined,
    embedUrl: undefined,
    product: undefined,
    tag: undefined,
    products: undefined,
    translations: toItemTranslations(item),
  };
  switch (item.type) {
    case 'ARCHIVE_ITEM_TYPE_MEDIA':
      return { ...base, media: toMediaFull(item.mediaId, item.mediaUrl) };
    case 'ARCHIVE_ITEM_TYPE_TEXT':
      return base;
    case 'ARCHIVE_ITEM_TYPE_EMBED':
      return { ...base, embedUrl: item.embedUrl ?? undefined };
    case 'ARCHIVE_ITEM_TYPE_PRODUCT':
      return { ...base, product: (productsByUid[item._uid] || [])[0] };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG':
      return {
        ...base,
        tag: item.tag ?? undefined,
        // resolved by the backend from the tag; the tag-products cache (if any)
        // feeds the preview, else it renders empty until wired (mirrors hero).
        products: productsByUid[item._uid] || undefined,
      };
    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL':
      return { ...base, products: productsByUid[item._uid] || [] };
    default:
      return base;
  }
}
