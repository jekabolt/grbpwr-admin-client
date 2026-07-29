import { common_EmailCampaignFull } from 'api/proto-http/admin';
import {
  AB_DECISION_MAX_MINUTES,
  AB_DECISION_MIN_MINUTES,
  AB_DIMENSION_OPTIONS,
  AB_TEST_PCT_MAX,
  AB_TEST_PCT_MIN,
} from 'constants/email-campaign';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import ToggleField from 'ui/form/fields/toggle-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';

/**
 * Ф4 — A/B config. Enable toggle, dimension (subject|content), test %, decision
 * window (30…10080 min), and — for a subject test — variant B subject authoring.
 * Client validation mirrors the backend send/schedule gate (see schema.ts
 * superRefine); errors surface inline via each field's FormMessage. Post-decision
 * the winner variant is shown (per-variant metrics live in the metrics panel).
 */
export function ABPanel({ campaign }: { campaign?: common_EmailCampaignFull | null }) {
  const { watch, formState } = useFormContext();
  const enabled = !!watch('abConfig.enabled');
  const dimension = watch('abConfig.dimension');

  const winnerVariantId = campaign?.abConfig?.winnerVariantId || 0;
  const winner = winnerVariantId
    ? (campaign?.variants || []).find((v) => v.id === winnerVariantId)
    : undefined;

  // superRefine writes the variant-B error at abConfig-adjacent path variantB[i].subject.
  const variantBError = (() => {
    const err: any = formState.errors?.variantB;
    if (!err) return undefined;
    if (Array.isArray(err)) {
      const hit = err.find((e) => e?.subject?.message);
      return hit?.subject?.message as string | undefined;
    }
    return (err?.message as string | undefined) ?? undefined;
  })();

  return (
    <div className='space-y-4 border border-textInactiveColor p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase'>A/B testing</Text>
        <ToggleField name='abConfig.enabled' label='enable A/B test' />
      </div>

      {!enabled ? (
        <Text variant='label' size='small'>
          send one version to everyone. enable to test two variants on a slice of the audience and
          auto-pick a winner.
        </Text>
      ) : (
        <div className='space-y-4'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
            <SelectField
              name='abConfig.dimension'
              label='test dimension'
              items={AB_DIMENSION_OPTIONS}
              placeholder='pick one'
            />
            <InputField
              name='abConfig.testPct'
              label={`test % (${AB_TEST_PCT_MIN}–${AB_TEST_PCT_MAX})`}
              type='number'
              valueAsNumber
              placeholder='e.g. 20'
            />
            <InputField
              name='abConfig.decisionAfterMinutes'
              label={`decision after (min, ${AB_DECISION_MIN_MINUTES}–${AB_DECISION_MAX_MINUTES})`}
              type='number'
              valueAsNumber
              placeholder='e.g. 240'
            />
          </div>

          <Text variant='label' size='small'>
            {dimension === 'AB_DIMENSION_CONTENT'
              ? 'content test: the test slice is split across two body variants; the higher-engagement variant is sent to the remainder. (variant B body authoring is not in this form yet — both variants currently share the campaign body.)'
              : 'a subject test needs two distinct subject lines. the winner is sent to the remaining audience after the decision window.'}
          </Text>

          {dimension === 'AB_DIMENSION_SUBJECT' && (
            <div className='space-y-2 border border-textInactiveColor p-3'>
              <Text variant='uppercase' size='small'>
                variant B subject
              </Text>
              <UnifiedTranslationFields
                fieldPrefix='variantB'
                fields={[{ name: 'subject', label: 'variant B subject line' }]}
              />
              {variantBError && (
                <Text variant='error' size='small'>
                  {variantBError}
                </Text>
              )}
            </div>
          )}

          {winner && (
            <div className='border border-textColor p-3'>
              <Text variant='uppercase' size='small'>
                winner: {winner.label || `#${winner.id}`}
              </Text>
              <Text variant='label' size='small'>
                per-variant engagement is in the metrics panel below.
              </Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
