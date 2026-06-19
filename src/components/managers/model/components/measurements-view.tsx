import { common_ModelMeasurement } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { BODY_MEASUREMENT_GROUPS } from './measurements';

// Read-only, grouped view of a model's captured body measurements (mm). Used in
// the fitting form so the operator can reference the model while recording sizes.
export function ModelMeasurementsView({
  measurements,
}: {
  measurements?: common_ModelMeasurement[];
}) {
  const values = new Map<string, number>();
  for (const m of measurements ?? []) {
    if (m.name && m.valueMm != null) values.set(m.name, m.valueMm);
  }

  if (values.size === 0) {
    return (
      <Text variant='inactive' size='small'>
        no measurements recorded for this model
      </Text>
    );
  }

  return (
    <div className='space-y-2 border border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small'>
        model measurements (mm)
      </Text>
      {BODY_MEASUREMENT_GROUPS.map((group) => {
        const present = group.measurements.filter((m) => values.has(m.name));
        if (present.length === 0) return null;
        return (
          <div key={group.title} className='space-y-1'>
            <Text variant='inactive' size='small'>
              {group.title}
            </Text>
            <div className='grid grid-cols-2 gap-x-4 gap-y-1 lg:grid-cols-3'>
              {present.map((m) => (
                <div
                  key={m.name}
                  className='flex justify-between gap-2 border-b border-textInactiveColor/40'
                >
                  <Text size='small'>{m.label}</Text>
                  <Text size='small'>{values.get(m.name)}</Text>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
