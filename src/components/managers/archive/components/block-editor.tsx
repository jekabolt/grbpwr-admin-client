import { common_MediaFull } from 'api/proto-http/admin';
import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { HeroProductPicker } from '../../hero/components/hero-product-picker';
import { TagPicker } from '../../hero/components/tag-picker';
import { ProductSelectionApi } from '../../hero/components/useProductSelection';
import { ArchiveFormData } from './schema';

interface BlockEditorProps {
  index: number;
  item: any;
  productApi: ProductSelectionApi;
}

// Shared caption editor for every block except TEXT (which uses `text`).
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

/**
 * Renders one archive body block's editor for items[index]. Extracted so the same
 * editor renders inside the click-to-edit modal. Every edit writes straight to the
 * RHF form, which drives the live preview. Mirrors the hero BlockEditor.
 */
export function BlockEditor({ index, item, productApi }: BlockEditorProps) {
  const { setValue } = useFormContext<ArchiveFormData>();
  const uid = item._uid as string;

  const saveMedia = useCallback(
    (media: common_MediaFull[]) => {
      if (!media.length) return;
      setValue(`items.${index}.mediaId` as any, media[0].id, {
        shouldDirty: true,
        shouldTouch: true,
      });
      setValue(`items.${index}.mediaUrl` as any, media[0].media?.thumbnail?.mediaUrl || '', {
        shouldDirty: true,
        shouldTouch: true,
      });
    },
    [setValue, index],
  );

  const clearMedia = useCallback(() => {
    setValue(`items.${index}.mediaId` as any, undefined, { shouldDirty: true, shouldTouch: true });
    setValue(`items.${index}.mediaUrl` as any, '', { shouldDirty: true, shouldTouch: true });
  }, [setValue, index]);

  switch (item.type) {
    case 'ARCHIVE_ITEM_TYPE_MEDIA':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            media
          </Text>
          <div className='space-y-1'>
            <Text variant='label' size='small'>
              image or video
            </Text>
            <MediaPreviewWithSelector
              mediaUrl={item.mediaUrl || ''}
              aspectRatio={['3:4']}
              allowMultiple={false}
              showVideos
              alt='archive media'
              label='select'
              purpose='archive media'
              onSaveMedia={saveMedia}
              onClear={clearMedia}
            />
          </div>
          <CaptionFields index={index} />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_TEXT':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            text
          </Text>
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
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            embed
          </Text>
          <InputField name={`items.${index}.embedUrl`} label='embed URL' placeholder='https://…' />
          <CaptionFields index={index} />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_PRODUCT':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            product
          </Text>
          <div className='space-y-2'>
            <Text variant='label' size='small'>
              product
            </Text>
            <HeroProductPicker
              uid={uid}
              api={productApi}
              formPath={`items.${index}.productId`}
              single
            />
          </div>
          <CaptionFields index={index} />
        </div>
      );

    case 'ARCHIVE_ITEM_TYPE_PRODUCTS_TAG':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            products by tag
          </Text>
          <TagPicker
            value={item.tag || ''}
            onChange={(v) =>
              setValue(`items.${index}.tag` as any, v, { shouldDirty: true, shouldTouch: true })
            }
            label='tag'
            placeholder='select a product tag'
          />
          <InputField
            name={`items.${index}.limit`}
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
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            manual products
          </Text>
          <div className='space-y-2'>
            <Text variant='label' size='small'>
              products
            </Text>
            <HeroProductPicker uid={uid} api={productApi} formPath={`items.${index}.productIds`} />
          </div>
          <CaptionFields index={index} />
        </div>
      );

    default:
      return null;
  }
}
