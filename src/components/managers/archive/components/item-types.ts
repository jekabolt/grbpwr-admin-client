import { common_ArchiveItemType } from 'api/proto-http/admin';

// The six timeline body block types, with palette copy. Order = palette order.
export const ARCHIVE_ITEM_TYPES: {
  value: Exclude<common_ArchiveItemType, 'ARCHIVE_ITEM_TYPE_UNKNOWN'>;
  label: string;
  description: string;
}[] = [
  {
    value: 'ARCHIVE_ITEM_TYPE_MEDIA',
    label: 'media',
    description: 'An image or video with an optional caption',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_TEXT',
    label: 'text',
    description: 'A translatable text block',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_EMBED',
    label: 'embed',
    description: 'An iframe embed (video / 3D / campaign) with a caption',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_PRODUCT',
    label: 'product',
    description: 'A single product with an optional caption',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG',
    label: 'products by tag',
    description: 'Products auto-filled by a tag (with an optional cap)',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL',
    label: 'manual products',
    description: 'Hand-picked products',
  },
];

export const ARCHIVE_ITEM_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ARCHIVE_ITEM_TYPES.map((t) => [t.value, t.label]),
);
