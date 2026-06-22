import {
  formatFittingDate,
  statusLabel,
  verdictLabel,
} from 'components/managers/fittings/components/utils';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';

// Read-only list of fittings anchored to this tech card. Edit-mode only (needs a saved
// id). POM actuals can link a specific fitting from this set.
export function TechCardFittings({ techCardId }: { techCardId: number }) {
  const { data: fittings, isLoading } = useTechCardFittings(techCardId);

  if (isLoading) {
    return (
      <Text variant='inactive' size='small'>
        loading fittings…
      </Text>
    );
  }
  if (!fittings?.length) {
    return (
      <Text variant='inactive' size='small'>
        no fittings for this tech card yet
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      {fittings.map((f) => {
        const insert = f.fitting;
        return (
          <Link
            key={f.id}
            to={`/fittings/${f.id}`}
            className='flex items-center justify-between gap-3 border border-textInactiveColor p-2 transition-colors hover:bg-highlightColor/5'
          >
            <Text size='small'>
              #{f.id} · {formatFittingDate(insert?.fittingDate)}
            </Text>
            <Text variant='inactive' size='small'>
              {statusLabel(insert?.status)} · {verdictLabel(insert?.verdict)} ·{' '}
              {f.media?.length ?? 0} photo(s)
            </Text>
          </Link>
        );
      })}
    </div>
  );
}
