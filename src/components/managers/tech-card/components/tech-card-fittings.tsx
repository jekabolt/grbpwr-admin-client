import {
  formatFittingDate,
  statusLabel,
  verdictLabel,
} from 'components/managers/fittings/components/utils';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

// Fittings anchored to this tech card. Edit-mode only (needs a saved id). The link lives
// on the fitting (FittingInsert.tech_card_id); "add fitting" deep-links to the fitting
// editor pre-linked to this style. POM actuals can reference a specific fitting from here.
export function TechCardFittings({ techCardId }: { techCardId: number }) {
  const { data: fittings, isLoading } = useTechCardFittings(techCardId);

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <Text variant='inactive' size='small'>
          fittings linked to this style
        </Text>
        <Button asChild variant='main' size='lg' className='uppercase'>
          <Link to={`${ROUTES.addFitting}?techCardId=${techCardId}`}>+ add fitting</Link>
        </Button>
      </div>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading fittings…
        </Text>
      ) : !fittings?.length ? (
        <Text variant='inactive' size='small'>
          no fittings for this tech card yet
        </Text>
      ) : (
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
      )}
    </div>
  );
}
