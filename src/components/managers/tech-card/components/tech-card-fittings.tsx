import { common_Fitting } from 'api/proto-http/admin';
import {
  formatFittingDate,
  statusLabel,
  verdictLabel,
} from 'components/managers/fittings/components/utils';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

// Fittings anchored to this tech card. Edit-mode only (needs a saved id). The link lives
// on the fitting (FittingInsert.tech_card_id); "add fitting" deep-links to the fitting
// editor pre-linked to this style. POM actuals can reference a specific fitting from here.
//
// The spine's "(N unresolved changes)" counter deep-links here with ?fits=unresolved (R-8): the
// list then shows only fittings that still carry open FittingChangeRequests — the step-4 fix work
// list. A toggle flips between all and unresolved.
export function TechCardFittings({ techCardId }: { techCardId: number }) {
  const { data: fittings, isLoading } = useTechCardFittings(techCardId);
  const [params, setParams] = useSearchParams();
  const unresolvedOnly = params.get('fits') === 'unresolved';

  const openCount = (f: common_Fitting) =>
    (f.fitting?.changeRequests ?? []).filter((cr) => !cr.resolved).length;

  const list = fittings ?? [];
  const totalUnresolved = list.reduce((n, f) => n + openCount(f), 0);
  const shown = unresolvedOnly ? list.filter((f) => openCount(f) > 0) : list;

  const setFilter = (on: boolean) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (on) p.set('fits', 'unresolved');
        else p.delete('fits');
        return p;
      },
      { replace: true },
    );

  const toggle = 'border px-2 py-0.5 text-textBaseSize uppercase transition-colors';

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Text variant='inactive' size='small'>
            fittings linked to this style
          </Text>
          {totalUnresolved > 0 && (
            <div className='flex items-center gap-1'>
              <button
                type='button'
                onClick={() => setFilter(false)}
                className={`${toggle} ${
                  unresolvedOnly
                    ? 'border-transparent text-textInactiveColor hover:text-textColor'
                    : 'border-textColor text-textColor'
                }`}
              >
                all
              </button>
              <button
                type='button'
                onClick={() => setFilter(true)}
                className={`${toggle} ${
                  unresolvedOnly
                    ? 'border-textColor text-textColor'
                    : 'border-transparent text-textInactiveColor hover:text-textColor'
                }`}
              >
                unresolved {totalUnresolved}
              </button>
            </div>
          )}
        </div>
        <Button asChild variant='main' size='lg' className='uppercase'>
          <Link to={`${ROUTES.addFitting}?techCardId=${techCardId}`}>+ add fitting</Link>
        </Button>
      </div>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading fittings…
        </Text>
      ) : !shown.length ? (
        <Text variant='inactive' size='small'>
          {unresolvedOnly
            ? 'no fittings with unresolved changes'
            : 'no fittings for this tech card yet'}
        </Text>
      ) : (
        <div className='space-y-2'>
          {shown.map((f) => {
            const insert = f.fitting;
            const open = openCount(f);
            return (
              <Link
                key={f.id}
                to={`/fittings/${f.id}`}
                className='flex items-center justify-between gap-3 border border-textInactiveColor p-2 transition-colors hover:bg-highlightColor/5'
              >
                <Text size='small'>
                  #{f.id} · {formatFittingDate(insert?.fittingDate)}
                  {open > 0 ? (
                    <span className='ml-2 border border-error px-1 text-error'>
                      {open} unresolved
                    </span>
                  ) : null}
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
