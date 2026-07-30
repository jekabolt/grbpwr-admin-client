import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { useSegments } from '../useCampaign';

interface SegmentPanelProps {
  /** RHF path for the numeric segment id (0 / undefined = everyone). */
  name: string;
}

/**
 * Segment picker for the campaign envelope: pick an EXISTING segment (from
 * ListEmailSegments — authored in the segments manager / predicate-tree editor) or
 * fall back to "everyone". Writes the numeric segment id to `name`.
 */
export function SegmentPanel({ name }: SegmentPanelProps) {
  const { data: segments = [], isError } = useSegments();
  const { control } = useFormContext();
  const currentId = useWatch({ control, name }) as number | undefined;

  const items = [
    { value: 0, label: 'no segment (everyone)' },
    ...segments.map((s) => ({
      value: s.id || 0,
      // The audience size is only shown once a preview has actually cached it —
      // last_count_at is the "has been counted" signal (an un-run segment reports 0/0,
      // and the int64 timestamp arrives as a JSON string).
      label: `${s.name || 'segment'}${Number(s.lastCountAt) > 0 ? ` · ${s.lastCount ?? 0}` : ''}`,
    })),
  ];

  // The campaign's saved segment id must always be representable: if the list failed
  // to load (or the segment was deleted) the Select would otherwise fall back to the
  // "everyone" placeholder and a segmented campaign would read as unsegmented.
  if (currentId && !segments.some((s) => (s.id || 0) === currentId)) {
    items.push({ value: currentId, label: `segment #${currentId} (unavailable)` });
  }

  return (
    <div className='space-y-2'>
      <SelectField name={name} label='segment' items={items} valueAsNumber placeholder='everyone' />
      {isError ? (
        <Text variant='error' size='small'>
          couldn&apos;t load the segment list — reopen this page to retry. the saved segment is kept.
        </Text>
      ) : (
        <Text variant='label' size='small'>
          pick an existing segment (managed on the segments page) or send to everyone.
        </Text>
      )}
    </div>
  );
}
