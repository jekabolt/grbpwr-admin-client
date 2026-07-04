import { common_ArchiveFull, common_ArchiveItemFull, common_Product } from 'api/proto-http/admin';
import { v4 as uuidv4 } from 'uuid';
import { ArchiveFormData, defaultData } from './schema';

function readItemTranslations(item: common_ArchiveItemFull) {
  return (item.translations || []).map((t) => ({
    languageId: t.languageId || 0,
    caption: t.caption ?? undefined,
    text: t.text ?? undefined,
  }));
}

/**
 * Resolved ArchiveFull (read model) → flat editor form. Assigns each block a
 * stable `_uid` and, for product-bearing blocks, caches the resolved product
 * objects by that uid so the live preview and product picker have real data.
 * Inverse of mapFormToArchiveInsert; mirrors mapHeroFullToFormData.
 */
export function mapArchiveFullToForm(
  archive?: common_ArchiveFull,
): ArchiveFormData & { productsByUid: Record<string, common_Product[]> } {
  if (!archive) return { ...defaultData, productsByUid: {} };

  const productsByUid: Record<string, common_Product[]> = {};

  const items = (archive.items || [])
    .filter((i) => i.type)
    .map((i: common_ArchiveItemFull) => {
      const _uid = uuidv4();
      const translations = readItemTranslations(i);
      switch (i.type) {
        case 'ARCHIVE_ITEM_TYPE_MEDIA':
          return {
            type: i.type,
            _uid,
            mediaId: i.media?.id || 0,
            mediaUrl: i.media?.media?.thumbnail?.mediaUrl || '',
            translations,
          };
        case 'ARCHIVE_ITEM_TYPE_TEXT':
          return { type: i.type, _uid, translations };
        case 'ARCHIVE_ITEM_TYPE_EMBED':
          return { type: i.type, _uid, embedUrl: i.embedUrl || '', translations };
        case 'ARCHIVE_ITEM_TYPE_PRODUCT': {
          if (i.product) productsByUid[_uid] = [i.product];
          return { type: i.type, _uid, productId: i.product?.id, translations };
        }
        case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG': {
          const products = (i.products || []).filter(Boolean) as common_Product[];
          if (products.length) productsByUid[_uid] = products;
          // `limit` is write-only (the read model returns resolved `products`, not
          // the rule) — it resets to blank on edit, a contract limitation.
          return { type: i.type, _uid, tag: i.tag || '', limit: undefined, translations };
        }
        case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL': {
          const products = (i.products || []).filter(Boolean) as common_Product[];
          if (products.length) productsByUid[_uid] = products;
          return {
            type: i.type,
            _uid,
            productIds: products.map((p) => p.id).filter((id): id is number => id != null),
            translations,
          };
        }
        default:
          return { type: i.type, _uid, translations };
      }
    });

  return {
    tag: archive.archiveList?.tag || '',
    mainMediaIds:
      archive.mainMedia?.map((m) => m.id).filter((id): id is number => id != null) ?? [],
    thumbnailId: archive.archiveList?.thumbnail?.id,
    translations:
      archive.archiveList?.translations?.map((t) => ({
        languageId: t.languageId || 0,
        heading: t.heading || '',
        description: t.description || '',
      })) ?? defaultData.translations,
    items: items as ArchiveFormData['items'],
    productsByUid,
  };
}
