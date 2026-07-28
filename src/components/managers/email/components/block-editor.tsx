import {
  CTA_ALIGNMENT_OPTIONS,
  CTA_STYLE_OPTIONS,
  EMAIL_BG_COLOR_OPTIONS,
  SOCIAL_NETWORK_OPTIONS,
} from 'constants/email-campaign';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { CampaignSchema, EmailBlockForm } from './schema';

interface BlockEditorProps {
  index: number;
  block: EmailBlockForm;
}

// PROTO-GATED slots — media (MediaPreviewWithSelector) and product pickers
// (ProductPickerModal / HeroProductPicker) are reused by direct import in the
// full build, after the proto client is regenerated. Until then the foundation
// exposes the underlying id fields so a block round-trips; the visual pickers are
// swapped in later without changing the form shape.
function PickerSlot({ label }: { label: string }) {
  return (
    <div className='border border-dashed border-textInactiveColor p-3'>
      <Text variant='label' size='small'>
        {label} — visual picker wired in the proto-gated follow-up
      </Text>
    </div>
  );
}

/**
 * Renders one email block's editor for body[index]. Fork of the hero
 * block-editor switch, minus the TargetingFields footer. Every field writes to
 * the RHF campaign form at the positional `body.${index}` path. Media/product
 * selection is stubbed to id fields (see PickerSlot) — the rest is fully wired.
 */
export function BlockEditor({ index, block }: BlockEditorProps) {
  const { control } = useFormContext<CampaignSchema>();
  const prefix = `body.${index}`;
  const translationsPrefix = `${prefix}.translations`;

  const socialLinks = useFieldArray({
    control,
    name: `${prefix}.socialLinks.links` as any,
  });

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
            <PickerSlot label='logo media' />
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[
                { name: 'preheader', label: 'preheader', required: false },
                { name: 'heading', label: 'heading', required: false },
                { name: 'subheading', label: 'subheading', required: false },
              ]}
            />
          </>
        );

      case 'EMAIL_BLOCK_TYPE_IMAGE_LINK':
        return (
          <>
            <PickerSlot label='image media' />
            <InputField name={`${prefix}.imageLink.url`} label='link url' placeholder='https://' />
            <UnifiedTranslationFields
              fieldPrefix={translationsPrefix}
              fields={[
                { name: 'altText', label: 'alt text', required: false },
                { name: 'caption', label: 'caption', required: false },
              ]}
            />
          </>
        );

      case 'EMAIL_BLOCK_TYPE_RICH_TEXT':
        return (
          <UnifiedTranslationFields
            fieldPrefix={translationsPrefix}
            fields={[{ name: 'body', label: 'content', type: 'richtext' }]}
          />
        );

      case 'EMAIL_BLOCK_TYPE_PRODUCT_CARD':
        return <PickerSlot label='product' />;

      case 'EMAIL_BLOCK_TYPE_PRODUCT_GRID':
        return (
          <>
            <PickerSlot label='products' />
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
          <InputField
            name={`${prefix}.spacer.height`}
            label='height (px)'
            type='number'
            valueAsNumber
          />
        );

      case 'EMAIL_BLOCK_TYPE_TWO_COLUMN':
        return (
          <div className='border border-dashed border-textInactiveColor p-3'>
            <Text variant='label' size='small'>
              two-column child editing (BlockListField — nested left/right EmailBlock lists, child
              picker excludes TWO_COLUMN) is wired in the proto-gated follow-up.
            </Text>
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
            <PickerSlot label='ends-at (ReleaseDateField -> epoch)' />
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
            <PickerSlot label='poster media' />
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
