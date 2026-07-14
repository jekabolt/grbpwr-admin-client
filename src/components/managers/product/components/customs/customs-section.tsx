import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import {
  CustomsForm,
  emptyCustoms,
  useProductCustoms,
  useSetProductCustoms,
} from './useProductCustoms';

// Self-contained customs editor for one product — loads and saves via its own RPCs,
// independent of the main product form's edit/save. HS code + country of origin are
// required for international (non-EU) shipping labels.
export function ProductCustomsSection({
  productId,
  canWrite,
}: {
  productId: number;
  canWrite: boolean;
}) {
  const { data, isLoading, isError, refetch } = useProductCustoms(productId);
  const save = useSetProductCustoms(productId);

  const [form, setForm] = useState<CustomsForm>(emptyCustoms);
  const [baseline, setBaseline] = useState<CustomsForm | null>(null);

  // Seed once — a background refetch must not clobber in-progress edits.
  useEffect(() => {
    if (data && baseline === null) {
      setForm(data);
      setBaseline(data);
    }
  }, [data, baseline]);

  const dirty = baseline ? JSON.stringify(form) !== JSON.stringify(baseline) : false;

  function set<K extends keyof CustomsForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSave() {
    if (!dirty || save.isPending) return;
    save.mutate(form, { onSuccess: () => setBaseline(form) });
  }

  if (isLoading) {
    return (
      <Text variant='inactive' size='small' className='animate-pulse uppercase'>
        loading…
      </Text>
    );
  }

  if (isError) {
    return (
      <div className='flex flex-col items-start gap-2'>
        <Text variant='error' size='small'>
          Failed to load customs data.
        </Text>
        <Button variant='secondary' size='lg' onClick={() => refetch()}>
          retry
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='label' size='small'>
        Used to build international (non-EU) shipping labels. Without an HS code and country of
        origin the carrier rejects the customs declaration.
      </Text>

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <label className='flex flex-col gap-1'>
          <Text variant='label' size='small' component='span'>
            HS code
          </Text>
          <Input
            name='customs-hs-code'
            placeholder='e.g. 6109100010'
            disabled={!canWrite}
            value={form.hsCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('hsCode', e.target.value)}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text variant='label' size='small' component='span'>
            country of origin (ISO-2)
          </Text>
          <Input
            name='customs-country'
            placeholder='e.g. IT'
            maxLength={2}
            disabled={!canWrite}
            value={form.countryOfOrigin}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set(
                'countryOfOrigin',
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, '')
                  .slice(0, 2),
              )
            }
          />
        </label>
      </div>

      <label className='flex flex-col gap-1'>
        <Text variant='label' size='small' component='span'>
          customs description
        </Text>
        <textarea
          name='customs-description'
          rows={2}
          maxLength={2000}
          disabled={!canWrite}
          placeholder='e.g. Men’s knitted cotton t-shirt'
          className='w-full resize-y rounded-none border border-textInactiveColor bg-bgColor p-2 text-textBaseSize transition-colors focus:border-textColor focus:outline-none disabled:opacity-60'
          value={form.customsDescription}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            set('customsDescription', e.target.value)
          }
        />
      </label>

      {canWrite && (
        <div className='flex justify-end'>
          <Button
            type='button'
            variant='main'
            size='lg'
            loading={save.isPending}
            disabled={!dirty || save.isPending}
            onClick={onSave}
          >
            save customs
          </Button>
        </div>
      )}
    </div>
  );
}
