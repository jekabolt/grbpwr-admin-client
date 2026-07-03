import { common_MediaFull } from 'api/proto-http/admin';
import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import ToggleField from 'ui/form/fields/toggle-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { CommonEntity } from './common-entity';
import { FeaturedProductBase } from './featured-prduct-base';
import { MediaPairField } from './media-pair-field';
import { HeroSchema } from './schema';
import { ProductSelectionApi } from './useProductSelection';

interface BlockEditorProps {
  index: number;
  entity: HeroSchema['entities'][number];
  featuredProducts: ProductSelectionApi;
}

/**
 * Renders one hero block's editor (media / text / products) for entities[index].
 * Extracted from Entities so the same editor can render inline in the canvas or
 * inside the click-to-edit modal (phase 4). Every edit writes to the RHF form,
 * which drives the live preview. Media/product handlers are scoped to this
 * block's index; the form path stays positional, the product cache keys by uid.
 */
export function BlockEditor({ index, entity, featuredProducts }: BlockEditorProps) {
  const { setValue } = useFormContext<HeroSchema>();
  const uid = (entity as any)._uid as string;

  const handleSaveMedia = useCallback(
    (
      selectedMedia: common_MediaFull[],
      type: 'main' | 'single' | 'doubleLeft' | 'doubleRight',
      orientation: 'Portrait' | 'Landscape',
    ) => {
      if (!selectedMedia.length) return;

      const media = selectedMedia[0];
      const thumbnailUrl = media.media?.thumbnail?.mediaUrl || '';

      let idPath: string;
      let urlPath: string;

      if (type === 'doubleLeft' || type === 'doubleRight') {
        const side = type === 'doubleLeft' ? 'left' : 'right';
        idPath = `entities.${index}.double.${side}.media${orientation}Id`;
        urlPath = `entities.${index}.double.${side}.media${orientation}Url`;
      } else {
        const entityType = type === 'main' ? 'main' : 'single';
        idPath = `entities.${index}.${entityType}.media${orientation}Id`;
        urlPath = `entities.${index}.${entityType}.media${orientation}Url`;
      }

      setValue(idPath as any, media.id, { shouldDirty: true, shouldTouch: true });
      setValue(urlPath as any, thumbnailUrl, { shouldDirty: true, shouldTouch: true });
    },
    [setValue, index],
  );

  const handleClearMedia = useCallback(
    (
      type: 'main' | 'single' | 'doubleLeft' | 'doubleRight',
      orientation: 'Portrait' | 'Landscape',
    ) => {
      let idPath: string;
      let urlPath: string;

      if (type === 'doubleLeft' || type === 'doubleRight') {
        const side = type === 'doubleLeft' ? 'left' : 'right';
        idPath = `entities.${index}.double.${side}.media${orientation}Id`;
        urlPath = `entities.${index}.double.${side}.media${orientation}Url`;
      } else {
        const entityType = type === 'main' ? 'main' : 'single';
        idPath = `entities.${index}.${entityType}.media${orientation}Id`;
        urlPath = `entities.${index}.${entityType}.media${orientation}Url`;
      }

      setValue(idPath as any, undefined, { shouldDirty: true, shouldTouch: true });
      setValue(urlPath as any, '', { shouldDirty: true, shouldTouch: true });
    },
    [setValue, index],
  );

  // Generic single-slot media handlers (used by v2 blocks that address media by
  // one id rather than a portrait/landscape pair). Store the id + thumbnail url.
  const saveSingleMedia = useCallback(
    (idPath: string, urlPath: string, media: common_MediaFull[]) => {
      if (!media.length) return;
      setValue(idPath as any, media[0].id, { shouldDirty: true, shouldTouch: true });
      setValue(urlPath as any, media[0].media?.thumbnail?.mediaUrl || '', {
        shouldDirty: true,
        shouldTouch: true,
      });
    },
    [setValue],
  );

  const clearSingleMedia = useCallback(
    (idPath: string, urlPath: string) => {
      setValue(idPath as any, undefined, { shouldDirty: true, shouldTouch: true });
      setValue(urlPath as any, '', { shouldDirty: true, shouldTouch: true });
    },
    [setValue],
  );

  const handleSaveProductSelection = useCallback(
    (newProducts: any[], entityIndex: number, entityUid: string) => {
      const productIds = newProducts
        .map((product) => product.id)
        .filter((id): id is number => id !== undefined);

      // form path is positional; display cache is keyed by the stable uid
      setValue(`entities.${entityIndex}.featuredProducts.productIds` as any, productIds);
      featuredProducts.saveSelection(newProducts, entityUid);
      featuredProducts.closeSelection();
    },
    [setValue, featuredProducts],
  );

  switch (entity.type) {
    case 'HERO_TYPE_MAIN':
      return (
        <CommonEntity
          title='main add'
          prefix={`entities.${index}.main`}
          landscapeLink={entity.main?.mediaLandscapeUrl || ''}
          portraitLink={entity.main?.mediaPortraitUrl || ''}
          aspectRatio={{ Portrait: ['9:16'], Landscape: ['2:1'] }}
          onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
            handleSaveMedia(media, 'main', orientation)
          }
          onClearMedia={(orientation) => handleClearMedia('main', orientation)}
        />
      );

    case 'HERO_TYPE_SINGLE':
      return (
        <CommonEntity
          title='single add'
          prefix={`entities.${index}.single`}
          landscapeLink={entity.single?.mediaLandscapeUrl || ''}
          portraitLink={entity.single?.mediaPortraitUrl || ''}
          aspectRatio={{ Portrait: ['9:16'], Landscape: ['2:1'] }}
          onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
            handleSaveMedia(media, 'single', orientation)
          }
          onClearMedia={(orientation) => handleClearMedia('single', orientation)}
        />
      );

    case 'HERO_TYPE_DOUBLE':
      return (
        <div className='flex flex-col gap-4'>
          <div className='lg:px-2.5 p-2.5'>
            <Text className='text-xl font-bold leading-none' variant='uppercase'>
              double add
            </Text>
          </div>
          <CommonEntity
            title='left add'
            prefix={`entities.${index}.double.left`}
            landscapeLink={entity.double?.left?.mediaLandscapeUrl || ''}
            portraitLink={entity.double?.left?.mediaPortraitUrl || ''}
            aspectRatio={['1:1']}
            isDoubleAd
            onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
              handleSaveMedia(media, 'doubleLeft', orientation)
            }
            onClearMedia={(orientation) => handleClearMedia('doubleLeft', orientation)}
          />
          <CommonEntity
            title='right add'
            prefix={`entities.${index}.double.right`}
            landscapeLink={entity.double?.right?.mediaLandscapeUrl || ''}
            portraitLink={entity.double?.right?.mediaPortraitUrl || ''}
            aspectRatio={['1:1']}
            isDoubleAd
            onSaveMedia={(media: common_MediaFull[], orientation: 'Portrait' | 'Landscape') =>
              handleSaveMedia(media, 'doubleRight', orientation)
            }
            onClearMedia={(orientation) => handleClearMedia('doubleRight', orientation)}
          />
        </div>
      );

    case 'HERO_TYPE_FEATURED_PRODUCTS':
      return (
        <FeaturedProductBase
          index={index}
          uid={uid}
          entity={entity}
          product={featuredProducts.products}
          currentEntityUid={featuredProducts.currentUid}
          isModalOpen={featuredProducts.isOpen}
          showProductPicker
          title='featured products'
          prefix='featuredProducts'
          handleOpenProductSelection={featuredProducts.openSelection}
          handleCloseModal={featuredProducts.closeSelection}
          handleSaveNewSelection={handleSaveProductSelection}
          handleProductsReorder={featuredProducts.reorderProducts}
        />
      );

    case 'HERO_TYPE_FEATURED_PRODUCTS_TAG':
      return (
        <FeaturedProductBase
          index={index}
          uid={uid}
          entity={entity}
          product={{}}
          title='featured products tag'
          prefix='featuredProductsTag'
        />
      );

    case 'HERO_TYPE_VIDEO':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            video
          </Text>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
            <div className='w-full space-y-1 sm:w-auto'>
              <Text variant='inactive' size='small'>
                video file
              </Text>
              <MediaPreviewWithSelector
                mediaUrl={entity.video?.mediaUrl || ''}
                aspectRatio={['16:9']}
                allowMultiple={false}
                showVideos={true}
                alt='video'
                label='select'
                purpose='video'
                heightClass='sm:h-44'
                onSaveMedia={(media) =>
                  saveSingleMedia(
                    `entities.${index}.video.mediaId`,
                    `entities.${index}.video.mediaUrl`,
                    media,
                  )
                }
                onClear={() =>
                  clearSingleMedia(
                    `entities.${index}.video.mediaId`,
                    `entities.${index}.video.mediaUrl`,
                  )
                }
              />
            </div>
            <div className='w-full space-y-1 sm:w-auto'>
              <Text variant='inactive' size='small'>
                poster (optional)
              </Text>
              <MediaPreviewWithSelector
                mediaUrl={entity.video?.posterUrl || ''}
                aspectRatio={['16:9']}
                allowMultiple={false}
                showVideos={false}
                alt='poster'
                label='select'
                purpose='poster'
                heightClass='sm:h-44'
                onSaveMedia={(media) =>
                  saveSingleMedia(
                    `entities.${index}.video.posterId`,
                    `entities.${index}.video.posterUrl`,
                    media,
                  )
                }
                onClear={() =>
                  clearSingleMedia(
                    `entities.${index}.video.posterId`,
                    `entities.${index}.video.posterUrl`,
                  )
                }
              />
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-6'>
            <ToggleField name={`entities.${index}.video.autoplay`} label='autoplay' />
            <ToggleField name={`entities.${index}.video.loop`} label='loop' />
            <ToggleField name={`entities.${index}.video.muted`} label='muted' />
          </div>
          <div className='space-y-4'>
            <InputField
              name={`entities.${index}.video.ctaLink`}
              label='CTA link (optional)'
              placeholder='https://…'
            />
            <UnifiedTranslationFields
              fieldPrefix={`entities.${index}.video.translations`}
              fields={[
                { name: 'headline', label: 'headline', type: 'input', required: false },
                { name: 'ctaText', label: 'CTA text', type: 'input', required: false },
              ]}
              editMode
            />
          </div>
        </div>
      );

    case 'HERO_TYPE_MARQUEE':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            marquee
          </Text>
          <div className='space-y-4'>
            <InputField
              name={`entities.${index}.marquee.link`}
              label='link (optional)'
              placeholder='https://…'
            />
            <InputField
              name={`entities.${index}.marquee.speed`}
              label='speed (optional)'
              type='number'
              valueAsNumber
              placeholder='scroll speed, e.g. 30'
            />
            <UnifiedTranslationFields
              fieldPrefix={`entities.${index}.marquee.translations`}
              fields={[{ name: 'headline', label: 'marquee text', type: 'input' }]}
              editMode
            />
          </div>
        </div>
      );

    case 'HERO_TYPE_STATEMENT':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            statement
          </Text>
          <MediaPairField
            prefix={`entities.${index}.statement`}
            landscapeUrl={entity.statement?.mediaLandscapeUrl || ''}
            portraitUrl={entity.statement?.mediaPortraitUrl || ''}
            optional
          />
          <div className='space-y-4'>
            <InputField
              name={`entities.${index}.statement.exploreLink`}
              label='explore link (optional)'
              placeholder='https://…'
            />
            <UnifiedTranslationFields
              fieldPrefix={`entities.${index}.statement.translations`}
              fields={[
                { name: 'headline', label: 'statement', type: 'textarea', rows: 2, maxLength: 160 },
                {
                  name: 'body',
                  label: 'body (optional)',
                  type: 'textarea',
                  rows: 3,
                  required: false,
                },
              ]}
              editMode
            />
          </div>
        </div>
      );

    case 'HERO_TYPE_NEWSLETTER':
      return (
        <div className='space-y-5 p-3 lg:p-4'>
          <Text className='font-bold leading-none' variant='uppercase' size='large'>
            newsletter
          </Text>
          <MediaPairField
            prefix={`entities.${index}.newsletter`}
            landscapeUrl={entity.newsletter?.mediaLandscapeUrl || ''}
            portraitUrl={entity.newsletter?.mediaPortraitUrl || ''}
            optional
          />
          <div className='space-y-4'>
            <UnifiedTranslationFields
              fieldPrefix={`entities.${index}.newsletter.translations`}
              fields={[
                { name: 'headline', label: 'headline', type: 'input' },
                {
                  name: 'body',
                  label: 'body (optional)',
                  type: 'textarea',
                  rows: 2,
                  required: false,
                },
                {
                  name: 'placeholder',
                  label: 'email placeholder (optional)',
                  type: 'input',
                  required: false,
                },
                { name: 'ctaText', label: 'button text', type: 'input' },
                {
                  name: 'successText',
                  label: 'success message (optional)',
                  type: 'input',
                  required: false,
                },
              ]}
              editMode
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}
