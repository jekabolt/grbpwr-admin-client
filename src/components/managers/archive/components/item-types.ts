import { common_ArchiveItemType, common_ArchiveMediaAspectRatio } from 'api/proto-http/admin';

export type ArchiveItemValue = Exclude<common_ArchiveItemType, 'ARCHIVE_ITEM_TYPE_UNKNOWN'>;
export type AspectValue = common_ArchiveMediaAspectRatio;

// The eight timeline body block types, with palette copy. Order = palette order.
export const ARCHIVE_ITEM_TYPES: {
  value: ArchiveItemValue;
  label: string;
  description: string;
}[] = [
  {
    value: 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA',
    label: 'main media',
    description: 'A hero-scale image or video (16:9, 2:1, or 1:1).',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_MEDIA_LINE',
    label: 'media line',
    description: 'A row of 1–4 media (3:4 or 1:1).',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION',
    label: 'media + caption',
    description: 'One media with a caption and an optional link (3:4 or 1:1).',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_TEXT',
    label: 'text',
    description: 'A translatable paragraph of copy.',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_EMBED',
    label: 'embed',
    description: 'An iframe — video, 3D, or campaign — with a caption.',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_PRODUCT',
    label: 'product',
    description: 'A single product, with an optional caption.',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG',
    label: 'products by tag',
    description: 'Products auto-filled by a tag, with an optional cap.',
  },
  {
    value: 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL',
    label: 'manual products',
    description: 'A hand-picked set of products.',
  },
];

export const ARCHIVE_ITEM_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ARCHIVE_ITEM_TYPES.map((t) => [t.value, t.label]),
);

// ── aspect ratios ───────────────────────────────────────────────────────────
export const ASPECT_RATIO_LABEL: Record<string, string> = {
  ARCHIVE_MEDIA_ASPECT_RATIO_UNKNOWN: 'auto',
  ARCHIVE_MEDIA_ASPECT_RATIO_16X9: '16:9',
  ARCHIVE_MEDIA_ASPECT_RATIO_2X1: '2:1',
  ARCHIVE_MEDIA_ASPECT_RATIO_1X1: '1:1',
  ARCHIVE_MEDIA_ASPECT_RATIO_3X4: '3:4',
};

// CSS aspect-ratio string per enum, for preview frames and the media selectors.
export const ASPECT_RATIO_CSS: Record<string, string> = {
  ARCHIVE_MEDIA_ASPECT_RATIO_UNKNOWN: '16 / 9',
  ARCHIVE_MEDIA_ASPECT_RATIO_16X9: '16 / 9',
  ARCHIVE_MEDIA_ASPECT_RATIO_2X1: '2 / 1',
  ARCHIVE_MEDIA_ASPECT_RATIO_1X1: '1 / 1',
  ARCHIVE_MEDIA_ASPECT_RATIO_3X4: '3 / 4',
};

// Which ratios each media block offers (MAIN_MEDIA is wide; line / caption are tall/square).
export const MAIN_MEDIA_RATIOS: AspectValue[] = [
  'ARCHIVE_MEDIA_ASPECT_RATIO_16X9',
  'ARCHIVE_MEDIA_ASPECT_RATIO_2X1',
  'ARCHIVE_MEDIA_ASPECT_RATIO_1X1',
];
export const LINE_RATIOS: AspectValue[] = [
  'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
  'ARCHIVE_MEDIA_ASPECT_RATIO_1X1',
];

// Default aspect seeded when a media block is added.
export const DEFAULT_ASPECT: Record<string, AspectValue> = {
  ARCHIVE_ITEM_TYPE_MAIN_MEDIA: 'ARCHIVE_MEDIA_ASPECT_RATIO_16X9',
  ARCHIVE_ITEM_TYPE_MEDIA_LINE: 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
  ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION: 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4',
};

export const MEDIA_LINE_MAX = 4;
