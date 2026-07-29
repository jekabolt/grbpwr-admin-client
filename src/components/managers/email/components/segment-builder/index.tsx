import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { useSegments } from '../useCampaign';

interface SegmentPanelProps {
  /** RHF path for the numeric segment id (0 / undefined = everyone). */
  name: string;
}

/**
 * Ф2 STUB — segment picker. The SegmentNode predicate-tree builder is deferred;
 * this only lets the operator pick an EXISTING segment (from ListEmailSegments) or
 * fall back to "everyone". Writes the numeric segment id to `name`.
 */
export function SegmentPanel({ name }: SegmentPanelProps) {
  const { data: segments = [] } = useSegments();

  const items = [
    { value: 0, label: 'no segment (everyone)' },
    ...segments.map((s) => ({
      value: s.id || 0,
      label: `${s.name || 'segment'}${typeof s.lastCount === 'number' ? ` · ${s.lastCount}` : ''}`,
    })),
  ];

  return (
    <div className='space-y-2'>
      <SelectField name={name} label='segment' items={items} valueAsNumber placeholder='everyone' />
      <Text variant='label' size='small'>
        Ф2 segment builder (predicate-tree editor) is deferred — pick an existing segment or send to
        everyone.
      </Text>
    </div>
  );
}
