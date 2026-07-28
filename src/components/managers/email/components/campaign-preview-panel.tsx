import { LANGUAGES } from 'constants/constants';
import { useEffect, useMemo, useState } from 'react';
import { Control, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { LanguageButtons } from 'ui/components/language-buttons';
import Text from 'ui/components/text';
import { mapFormToCampaignInsert } from './map-schema-to-campaign';
import { CampaignSchema } from './schema';
import { useRenderPreview } from './useCampaign';

interface CampaignPreviewPanelProps {
  control: Control<CampaignSchema>;
  /** Saved campaign id, if any (unused for now — preview always renders the live draft). */
  campaignId?: number;
  /** Soft-deleted block uids to exclude from the rendered draft. */
  deletedUids?: Set<string>;
  /** Bumped when the soft-delete set changes, so the preview re-renders. */
  deletedVersion?: number;
}

const DEVICE_WIDTH: Record<'desktop' | 'mobile', number> = { desktop: 600, mobile: 375 };

/**
 * Live preview of the campaign. Debounces on form changes, calls
 * RenderCampaignPreview with the UNSAVED draft (so it works before first save),
 * and drops the returned server-rendered, sanitized HTML into a SANDBOXED iframe.
 *
 * Security: the backend output is trusted (bluemonday sanitizes at render), but it
 * is still injected via `srcDoc` into an iframe carrying ONLY `sandbox=
 * "allow-same-origin"` — NOT `allow-scripts` — so any markup is rendered inert
 * (no script execution, no top-navigation, no form submission), never via
 * innerHTML on the app DOM.
 */
export function CampaignPreviewPanel({
  control,
  deletedUids,
  deletedVersion,
}: CampaignPreviewPanelProps) {
  const values = useWatch({ control }) as CampaignSchema;
  const [languageId, setLanguageId] = useState<number>(LANGUAGES[0].id);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [html, setHtml] = useState('');
  const [warnings, setWarnings] = useState<{ blockIndex?: number; reason?: string }[]>([]);
  const render = useRenderPreview();

  // Cheap change signal so the debounce effect only re-fires on real edits.
  const valuesKey = useMemo(() => JSON.stringify(values ?? {}), [values]);

  useEffect(() => {
    if (!values) return;
    const t = setTimeout(() => {
      const liveBody = (values.body || []).filter(
        (b: any) => !deletedUids?.has(b?._uid),
      );
      const draft = mapFormToCampaignInsert({ ...values, body: liveBody });
      render.mutate(
        { draft, languageId, variantId: 0, device },
        {
          onSuccess: (res) => {
            setHtml(res?.html || '');
            setWarnings(res?.warnings || []);
          },
        },
      );
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, languageId, device, deletedVersion]);

  const subjectFilled = (langId: number) => {
    const s = (values?.subjectI18n || []).find((t: any) => t?.languageId === langId);
    return !!(s?.subject && s.subject.trim().length > 0);
  };

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='uppercase' size='small'>
          preview
        </Text>
        <div className='flex items-center gap-1'>
          {(['desktop', 'mobile'] as const).map((d) => (
            <Button
              key={d}
              type='button'
              variant={device === d ? 'main' : 'secondary'}
              className='px-2 py-1 uppercase'
              onClick={() => setDevice(d)}
            >
              {d} {DEVICE_WIDTH[d]}
            </Button>
          ))}
        </div>
      </div>

      <LanguageButtons
        selectedLanguageId={languageId}
        isLanguageFilled={subjectFilled}
        onLanguageChange={(e, id) => {
          e.preventDefault();
          setLanguageId(id);
        }}
      />

      <div className='flex items-center justify-between'>
        <Text variant='label' size='small'>
          variant: default {render.isPending && '· rendering…'}
        </Text>
        {render.isError && <Text variant='error'>preview failed to render</Text>}
      </div>

      {warnings.length > 0 && (
        <div className='border border-warning p-2'>
          <Text size='small' variant='uppercase' className='text-warning'>
            {warnings.length} render warning{warnings.length === 1 ? '' : 's'}
          </Text>
          <ul className='mt-1 space-y-0.5'>
            {warnings.map((w, i) => (
              <li key={i}>
                <Text size='small' variant='label'>
                  {typeof w.blockIndex === 'number' ? `block #${w.blockIndex + 1}: ` : ''}
                  {w.reason}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className='flex justify-center overflow-x-auto border border-textInactiveColor bg-textInactiveColor/10 p-4'>
        {html ? (
          <iframe
            title='email preview'
            srcDoc={html}
            sandbox='allow-same-origin'
            className='h-[70vh] shrink-0 border border-textInactiveColor bg-white'
            style={{ width: DEVICE_WIDTH[device] }}
          />
        ) : (
          <div className='flex h-[40vh] items-center justify-center'>
            <Text variant='inactive' className='animate-pulse'>
              {render.isPending ? 'rendering preview…' : 'add blocks to see a preview'}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
