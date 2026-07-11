import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { FittingCardList } from './components/fitting-card-list';

export function Fittings() {
  const { canWrite } = usePermissions();
  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          fittings
        </Text>
        {canWrite(SECTION.fittings) && (
          <Button size='lg' variant='main' className='uppercase' asChild>
            <Link to={ROUTES.addFitting}>create new</Link>
          </Button>
        )}
      </div>

      <FittingCardList />
    </div>
  );
}
