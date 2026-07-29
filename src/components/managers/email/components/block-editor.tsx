import { common_MediaFull } from 'api/proto-http/admin';
import {
  CTA_ALIGNMENT_OPTIONS,
  CTA_STYLE_OPTIONS,
  EMAIL_BG_COLOR_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
  LOGO_POSITION_OPTIONS,
  SOCIAL_NETWORK_OPTIONS,
  SPACER_HEIGHT_OPTIONS,
} from 'constants/email-campaign';
import { useCallback } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { HeroProductPicker } from '../../hero/components/hero-product-picker';
import { LinkField } from '../../hero/components/link-field';
import { ReleaseDateField } from '../../hero/components/release-date-field';
import { ProductSelectionApi } from '../../hero/components/useProductSelection';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { BlockListField } from './block-list-field';
import { CampaignSchema, EmailBlockForm } from './schema';

interface BlockEditorProps {
  /** RHF path to this block, e.g. `body.3` or `body.3.twoColumn.left.0` (nested). */
  prefix: string;
  block: EmailBlockForm;
  featuredProducts: ProductSelectionApi;
}

/**
 * Renders one email block's editor at `prefix`. Fork of the hero block-editor
 * switch (minus the TargetingFields footer). Reuses MediaPreviewWithSelector,
 * HeroProductPicker, LinkField and ReleaseDateField by direct import; TWO_COLUMN
 * recurses through BlockListField (whose child picker excludes TWO_COLUMN).
 */
export function BlockEditor({ prefix, block, featuredProducts }: BlockEditorProps) {
  const { control, setValue, watch } = useFormContext<CampaignSchema>();
  const uid = (block as any)._uid as string;
  const translationsPrefix = `${prefix}.translations`;

  const socialLinks = useFieldArray({ control, name: `${prefix}.socialLinks.links` as any });

  const saveMedia = useCallback(
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

  const clearMedia = useCallback(
    (idPath: string, urlPath: string) => {
      setValue(idPath as any, undefined, { shouldDirty: true, shouldTouch: true });
      setValue(urlPath as any, '', { shouldDirty: true, shouldTouch: true });
    },
    [setValue],
  );

  const bgColorField = (
    <SelectField
      name={`${prefix}.backgroundColor`}
      label='background color'
      items={EMAIL_BG_COLOR_OPTIONS}
      placeholder='default'
    />
  );

  const body = (() => {
    switch (block.type) {
      case 'EMAIL_BLOCK_TYPE_HEADER':
        return (
          <>
            <div className='space-y-1'>
              <Text size='small' variant='label'>
                logo
              </Text>
              <Text variant='inactive' size='small'>
                the GRBPWR brand logo is used automatically — only its position is adjustable.
              </Text>
            </div>
            <SelectField
              name={`${prefix}.header.logoPosition`}
              label='logo position'
              items={LOGO_POSITION_OPTIONS}
              placeholder='center'
            />
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[
                { name: 'preheader', label: 'preheader', required: false },
                { name: 'heading', label: 'heading', required: false },
                { name: 'subheading', label: 'subheading', required: false },
              ]}
            />
            <div className='border border-dashed border-textInactiveColor p-2'>
              <Text variant='label' size='small'>
                per-language header nav links (EmailBlockTranslation.links[]) — deferred to a later
                pass.
              </Text>
            </div>
          </>
        );

      case 'EMAIL_BLOCK_TYPE_IMAGE_LINK': {
        const imageAspect = (watch(`${prefix}.imageLink.aspect` as any) as string) || '16:9';
        return (
          <>
            <SelectField
              name={`${prefix}.imageLink.aspect`}
              label='aspect ratio'
              items={IMAGE_ASPECT_OPTIONS}
              placeholder='horizontal (16:9)'
            />
            <div className='space-y-1'>
              <Text size='small' variant='label'>
                image
              </Text>
              <MediaPreviewWithSelector
                mediaUrl={watch(`${prefix}.imageLink.mediaUrl` as any) || ''}
                aspectRatio={[imageAspect]}
                showVideos={false}
                label='select image'
                purpose='image'
                alt='image'
                heightClass='h-44'
                onSaveMedia={(m) =>
                  saveMedia(`${prefix}.imageLink.mediaId`, `${prefix}.imageLink.mediaUrl`, m)
                }
                onClear={() =>
                  clearMedia(`${prefix}.imageLink.mediaId`, `${prefix}.imageLink.mediaUrl`)
                }
              />
            </div>
            <LinkField name={`${prefix}.imageLink.url`} label='click-through link' optional />
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[
                { name: 'altText', label: 'alt text', required: false },
                { name: 'caption', label: 'caption', required: false },
              ]}
            />
          </>
        );
      }

      case 'EMAIL_BLOCK_TYPE_RICH_TEXT':
        return (
          <UnifiedTranslationFields
            fieldPrefix={translationsPrefix}
            fields={[{ name: 'body', label: 'content', type: 'richtext' }]}
          />
        );

      case 'EMAIL_BLOCK_TYPE_PRODUCT_CARD':
        return (
          <div className='space-y-2'>
            <Text size='small' variant='label'>
              product
            </Text>
            <HeroProductPicker
              uid={uid}
              api={featuredProducts}
              formPath={`${prefix}.productCard.productId`}
              single
              activeOnly
            />
            <Button
              type='button'
              variant='secondary'
              className='px-2 py-1'
              onClick={() => featuredProducts.openSelection(uid)}
            >
              choose product
            </Button>
          </div>
        );

      case 'EMAIL_BLOCK_TYPE_PRODUCT_GRID':
        return (
          <>
            <div className='space-y-2'>
              <Text size='small' variant='label'>
                products
              </Text>
              <HeroProductPicker
                uid={uid}
                api={featuredProducts}
                formPath={`${prefix}.productGrid.productIds`}
                activeOnly
              />
              <Button
                type='button'
                variant='secondary'
                className='px-2 py-1'
                onClick={() => featuredProducts.openSelection(uid)}
              >
                choose products
              </Button>
            </div>
            <InputField
              name={`${prefix}.productGrid.columns`}
              label='columns'
              type='number'
              valueAsNumber
            />
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[{ name: 'heading', label: 'heading', required: false }]}
            />
          </>
        );

      case 'EMAIL_BLOCK_TYPE_CTA_BUTTON':
        return (
          <>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <SelectField
                name={`${prefix}.ctaButton.style`}
                label='style'
                items={CTA_STYLE_OPTIONS}
              />
              <SelectField
                name={`${prefix}.ctaButton.alignment`}
                label='alignment'
                items={CTA_ALIGNMENT_OPTIONS}
              />
            </div>
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[
                { name: 'ctaLabel', label: 'button label' },
                { name: 'ctaUrl', label: 'button url' },
              ]}
            />
          </>
        );

      case 'EMAIL_BLOCK_TYPE_DIVIDER':
        return (
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <InputField name={`${prefix}.divider.color`} label='color' placeholder='#000000' />
            <InputField
              name={`${prefix}.divider.height`}
              label='thickness (px)'
              type='number'
              valueAsNumber
            />
          </div>
        );

      case 'EMAIL_BLOCK_TYPE_SPACER':
        return (
          <SelectField
            name={`${prefix}.spacer.height`}
            label='height'
            items={SPACER_HEIGHT_OPTIONS}
            valueAsNumber
            placeholder='medium (32px)'
          />
        );

      case 'EMAIL_BLOCK_TYPE_TWO_COLUMN':
        return (
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
            <BlockListField
              prefix={`${prefix}.twoColumn`}
              side='left'
              featuredProducts={featuredProducts}
            />
            <BlockListField
              prefix={`${prefix}.twoColumn`}
              side='right'
              featuredProducts={featuredProducts}
            />
          </div>
        );

      case 'EMAIL_BLOCK_TYPE_SOCIAL_LINKS':
        return (
          <div className='space-y-3'>
            <Text variant='uppercase' size='small'>
              social links
            </Text>
            {socialLinks.fields.map((f, i) => (
              <div key={f.id} className='flex items-end gap-2'>
                <div className='w-40'>
                  <SelectField
                    name={`${prefix}.socialLinks.links.${i}.network`}
                    label='network'
                    items={SOCIAL_NETWORK_OPTIONS}
                  />
                </div>
                <div className='flex-1'>
                  <InputField
                    name={`${prefix}.socialLinks.links.${i}.url`}
                    label='profile url'
                    placeholder='https://'
                  />
                </div>
                <Button
                  type='button'
                  variant='secondary'
                  className='px-2 py-1'
                  onClick={() => socialLinks.remove(i)}
                >
                  remove
                </Button>
              </div>
            ))}
            <Button
              type='button'
              variant='secondary'
              className='px-2 py-1'
              onClick={() => socialLinks.append({ network: '', url: '' })}
            >
              + add social link
            </Button>
          </div>
        );

      case 'EMAIL_BLOCK_TYPE_COUNTDOWN':
        return (
          <>
            <ReleaseDateField
              name={`${prefix}.countdown.endsAt`}
              value={watch(`${prefix}.countdown.endsAt` as any)}
              label='ends at'
            />
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[
                { name: 'heading', label: 'heading', required: false },
                { name: 'caption', label: 'caption', required: false },
              ]}
            />
          </>
        );

      case 'EMAIL_BLOCK_TYPE_VIDEO_THUMB':
        return (
          <>
            <div className='space-y-1'>
              <Text size='small' variant='label'>
                poster
              </Text>
              <MediaPreviewWithSelector
                mediaUrl={watch(`${prefix}.videoThumb.posterUrl` as any) || ''}
                aspectRatio={['16:9']}
                showVideos={false}
                label='select poster'
                purpose='poster'
                alt='poster'
                heightClass='h-44'
                onSaveMedia={(m) =>
                  saveMedia(`${prefix}.videoThumb.mediaId`, `${prefix}.videoThumb.posterUrl`, m)
                }
                onClear={() =>
                  clearMedia(`${prefix}.videoThumb.mediaId`, `${prefix}.videoThumb.posterUrl`)
                }
              />
            </div>
            <InputField
              name={`${prefix}.videoThumb.videoUrl`}
              label='video url'
              placeholder='https://'
            />
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[
                { name: 'caption', label: 'caption', required: false },
                { name: 'altText', label: 'alt text', required: false },
              ]}
            />
          </>
        );

      default:
        return null;
    }
  })();

  return (
    <div className='space-y-4'>
      {bgColorField}
      {body}
    </div>
  );
}
