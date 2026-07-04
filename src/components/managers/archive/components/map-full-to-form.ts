import { common_ArchiveFull, common_MediaFull, common_Product } from 'api/proto-http/admin';
import { v4 as uuidv4 } from 'uuid';
import { ArchiveFormData, defaultData } from './schema';

function readTranslations(translations: any) {
  return (translations || []).map((t: any) => ({
    languageId: t.languageId || 0,
    caption: t.caption ?? undefined,
    text: t.text ?? undefined,
  }));
}

function mediaUrl(m?: common_MediaFull): string {
  return m?.media?.thumbnail?.mediaUrl || m?.media?.fullSize?.mediaUrl || '';
}

/**
 * Resolved ArchiveFull (read model) → flat editor form. Assigns each block a
 * stable `_uid` and, for product-bearing blocks, caches the resolved product
 * objects by that uid so the live preview and product picker have real data.
 * Inverse of mapFormToArchiveInsert.
 */
export function mapArchiveFullToForm(
  archive?: common_ArchiveFull,
): ArchiveFormData & { productsByUid: Record<string, common_Product[]> } {
  if (!archive) return { ...defaultData, productsByUid: {} };

  const productsByUid: Record<string, common_Product[]> = {};

  const items = (archive.items || [])
    .filter((i) => i.type)
    .map((i) => {
      const _uid = uuidv4();
      switch (i.type) {
        case 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA':
          return {
            type: i.type,
            _uid,
            mediaId: i.mainMedia?.media?.id,
            mediaUrl: mediaUrl(i.mainMedia?.media),
            aspectRatio: i.mainMedia?.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_16X9',
          };
        case 'ARCHIVE_ITEM_TYPE_MEDIA_LINE': {
          const media = (i.mediaLine?.media || []).filter(Boolean) as common_MediaFull[];
          return {
            type: i.type,
            _uid,
            mediaIds: media.map((m) => m.id).filter((id): id is number => id != null),
            mediaUrls: media.map(mediaUrl),
            aspectRatio: i.mediaLine?.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
          };
        }
        case 'ARCHIVE_ITEM_TYPE_TEXT':
          return { type: i.type, _uid, translations: readTranslations(i.text?.translations) };
        case 'ARCHIVE_ITEM_TYPE_EMBED':
          return {
            type: i.type,
            _uid,
            embedUrl: i.embed?.embedUrl || '',
            translations: readTranslations(i.embed?.translations),
          };
        case 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION':
          return {
            type: i.type,
            _uid,
            mediaId: i.mediaWithCaption?.media?.id,
            mediaUrl: mediaUrl(i.mediaWithCaption?.media),
            link: i.mediaWithCaption?.link || '',
            aspectRatio: i.mediaWithCaption?.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
            translations: readTranslations(i.mediaWithCaption?.translations),
          };
        case 'ARCHIVE_ITEM_TYPE_PRODUCT': {
          if (i.product?.product) productsByUid[_uid] = [i.product.product];
          return {
            type: i.type,
            _uid,
            productId: i.product?.product?.id,
            translations: readTranslations(i.product?.translations),
          };
        }
        case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG': {
          const products = (i.productsTag?.products || []).filter(Boolean) as common_Product[];
          if (products.length) productsByUid[_uid] = products;
          // `limit` is write-only (the read model returns resolved products, not
          // the rule) — it resets to blank on edit, a contract limitation.
          return {
            type: i.type,
            _uid,
            tag: i.productsTag?.tag || '',
            limit: undefined,
            translations: readTranslations(i.productsTag?.translations),
          };
        }
        case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL': {
          const products = (i.productsManual?.products || []).filter(Boolean) as common_Product[];
          if (products.length) productsByUid[_uid] = products;
          return {
            type: i.type,
            _uid,
            productIds: products.map((p) => p.id).filter((id): id is number => id != null),
            translations: readTranslations(i.productsManual?.translations),
          };
        }
        default:
          return { type: i.type, _uid };
      }
    });

  return {
    tag: archive.archiveList?.tag || '',
    thumbnailId: archive.archiveList?.thumbnail?.id,
    thumbnailUrl: mediaUrl(archive.archiveList?.thumbnail) || undefined,
    translations:
      archive.archiveList?.translations?.map((t) => ({
        languageId: t.languageId || 0,
        heading: t.heading || '',
      })) ?? defaultData.translations,
    items: items as ArchiveFormData['items'],
    productsByUid,
  };
}
