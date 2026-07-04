import { common_MediaFull } from 'api/proto-http/admin';
import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { HeroProductPicker } from '../../hero/components/hero-product-picker';
import { TagPicker } from '../../hero/components/tag-picker';
import { ProductSelectionApi } from '../../hero/components/useProductSelection';
import { MediaGallerySelector } from '../../media/components/media-gallery-selector';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import {
  ASPECT_RATIO_CSS,
  ASPECT_RATIO_LABEL,
  AspectValue,
  LINE_RATIOS,
  MAIN_MEDIA_RATIOS,
  MEDIA_LINE_MAX,
} from './item-types';
import { ArchiveFormData } from './schema';

interface BlockEditorProps {
  index: number;
  item: any;
  productApi: ProductSelectionApi;
}

// Shared optional-caption editor for blocks that carry copy other than TEXT.
function CaptionFields({ index }: { index: number }) {
  return (
    <UnifiedTranslationFields
      fieldPrefix={`items.${index}.translations`}
      fields={[
        {
          name: 'caption',
          label: 'caption (optional)',
          type: 'textarea',
          rows: 2,
          required: false,
          maxLength: 500,
        },
      ]}
      editMode
    />
  );
}

// Segmented aspect-ratio picker (on-brand button group).
function AspectRatioField({
  value,
  onChange,
  options,
}: {
  value?: AspectValue;
  onChange: (v: AspectValue) => void;
  options: AspectValue[];
}) {
  return (
    <div className='space-y-1'>
      <Text variant='label' size='small'>
        aspect ratio
      </Text>
      <div className='flex flex-wrap gap-2'>
        {options.map((opt) => (
          <Button
            key={opt}
            type='button'
            variant={value === opt ? 'main' : 'secondary'}
            className='cursor-pointer px-3 py-1'
            onClick={() => onChange(opt)}
          >
            {ASPECT_RATIO_LABEL[opt]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function BlockTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className='font-bold leading-none' variant='uppercase' size='large'>
      {children}
    </Text>
  );
}

/**
 * Renders one archive body block's editor for items[index]. Extracted so the same
 * editor renders inside the click-to-edit modal. Every edit writes straight to the
 * RHF form, which drives the live preview.
 */
export function BlockEditor({ index, item, productApi }: BlockEditorProps) {
  const { setValue } = useFormContext<ArchiveFormData>();
  const uid = item._uid as string;
  const base = `items.${index}`;

  const setField = useCallback(
    (key: string, value: any) =>
      setValue(`${base}.${key}` as any, value, { shouldDirty: true, shouldTouch: true }),
    [setValue, base],
  );

  // single-media handlers (main media / media + caption)
  const saveSingle = useCallback(
    (media: common_MediaFull[]) => {
      if (!media.length) return;
      setField('mediaId', media[0].id);
      setField('mediaUrl', media[0].media?.thumbnail?.mediaUrl || '');
    },
    [setField],
  );
  const clearSingle = useCallback(() => {
    setField('mediaId', undefined);
    setField('mediaUrl', '');
  }, [setField]);

  // media-line handlers (1..4) — reconstruct display objects from id+url pairs.
  const lineMedia: common_MediaFull[] = (item.mediaIds || []).map((id: number, i: number) => {
    const info = { mediaUrl: item.mediaUrls?.[i] || '', width: undefined, height: undefined };
    return {
      id,
      createdAt: undefined,
      media: { fullSize: info, thumbnail: info, compressed: info, blurhash: undefined },
    };
  });
  const addLineMedia = useCallback(
    (media: common_MediaFull[]) => {
      const ids: number[] = item.mediaIds || [];
      const urls: string[] = item.mediaUrls || [];
      const room = MEDIA_LINE_MAX - ids.length;
      const toAdd = media
        .filter((m) => m.id != null && !ids.includes(m.id))
        .slice(0, Math.max(0, room));
      if (!toAdd.length) return;
      setField('mediaIds', [...ids, ...toAdd.map((m) => m.id!)]);
      setField('mediaUrls', [...urls, ...toAdd.map((m) => m.media?.thumbnail?.mediaUrl || '')]);
    },
    [item.mediaIds, item.mediaUrls, setField],
  );
  const removeLineMedia = useCallback(
    (id: number) => {
      const ids: number[] = item.mediaIds || [];
      const urls: string[] = item.mediaUrls || [];
      const idx = ids.indexOf(id);
      setField(
        'mediaIds',
        ids.filter((x) => x !== id),
      );
      if (idx >= 0)
        setField(
          'mediaUrls',
          urls.filter((_, i) => i !== idx),
        );
    },
    [item.mediaIds, item.mediaUrls, setField],
  );

  switch (item.type) {
    case 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>main media</BlockTitle>
          <AspectRatioField
            value={item.aspectRatio}
            onChange={(v) => setField('aspectRatio', v)}
            options={MAIN_MEDIA_RATIOS}
          />
          <div className='space-y-1'>
            <Text variant='label' size='small'>
              image or video
            </Text>
            <MediaPreviewWithSelector
              mediaUrl={item.mediaUrl || ''}
              aspectRatio={[
                ASPECT_RATIO_LABEL[item.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_16X9'],
              ]}
              allowMultiple={false}
              showVideos
              alt='main media'
              label='select'
              purpose='archive main media'
              onSaveMedia={saveSingle}
              onClear={clearSingle}
            />
          </div>
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_MEDIA_LINE': {
      const count = (item.mediaIds || []).length;
      const cssAspect = ASPECT_RATIO_CSS[item.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4'];
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>media line</BlockTitle>
          <AspectRatioField
            value={item.aspectRatio}
            onChange={(v) => setField('aspectRatio', v)}
            options={LINE_RATIOS}
          />
          <div className='space-y-1'>
            <Text variant='label' size='small'>
              media ({count}/{MEDIA_LINE_MAX})
            </Text>
            <MediaGallerySelector
              media={lineMedia}
              aspectRatio={LINE_RATIOS.map((r) => ASPECT_RATIO_LABEL[r])}
              frameAspect={cssAspect}
              purpose='archive media line'
              ratioCaption={count >= MEDIA_LINE_MAX ? 'max reached' : `up to ${MEDIA_LINE_MAX}`}
              onSelect={addLineMedia}
              onDelete={removeLineMedia}
            />
          </div>
        </div>
      );
    }

    case 'ARCHIVE_ITEM_TYPE_TEXT':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>text</BlockTitle>
          <UnifiedTranslationFields
            fieldPrefix={`items.${index}.translations`}
            fields={[{ name: 'text', label: 'text', type: 'textarea', rows: 6, maxLength: 10000 }]}
            editMode
          />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_EMBED':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>embed</BlockTitle>
          <InputField name={`${base}.embedUrl`} label='embed URL' placeholder='https://…' />
          <CaptionFields index={index} />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>media + caption</BlockTitle>
          <AspectRatioField
            value={item.aspectRatio}
            onChange={(v) => setField('aspectRatio', v)}
            options={LINE_RATIOS}
          />
          <div className='space-y-1'>
            <Text variant='label' size='small'>
              image or video
            </Text>
            <MediaPreviewWithSelector
              mediaUrl={item.mediaUrl || ''}
              aspectRatio={[
                ASPECT_RATIO_LABEL[item.aspectRatio || 'ARCHIVE_MEDIA_ASPECT_RATIO_3X4'],
              ]}
              allowMultiple={false}
              showVideos
              alt='media'
              label='select'
              purpose='archive media'
              onSaveMedia={saveSingle}
              onClear={clearSingle}
            />
          </div>
          <InputField name={`${base}.link`} label='link (optional)' placeholder='https://…' />
          <CaptionFields index={index} />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_PRODUCT':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>product</BlockTitle>
          <div className='space-y-2'>
            <Text variant='label' size='small'>
              product
            </Text>
            <HeroProductPicker uid={uid} api={productApi} formPath={`${base}.productId`} single />
          </div>
          <CaptionFields index={index} />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>products by tag</BlockTitle>
          <TagPicker
            value={item.tag || ''}
            onChange={(v) => setField('tag', v)}
            label='tag'
            placeholder='select a product tag'
          />
          <InputField
            name={`${base}.limit`}
            label='max products (optional, 0 = no cap)'
            type='number'
            valueAsNumber
            placeholder='e.g. 8'
          />
          <CaptionFields index={index} />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_MANUAL':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <BlockTitle>manual products</BlockTitle>
          <div className='space-y-2'>
            <Text variant='label' size='small'>
              products
            </Text>
            <HeroProductPicker uid={uid} api={productApi} formPath={`${base}.productIds`} />
          </div>
          <CaptionFields index={index} />
        </div>
      );

    default:
      return null;
  }
}
