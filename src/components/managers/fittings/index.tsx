import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { MobileBottomBar } from 'components/managers/media/components/media-mobile';
import { ROUTES, SECTION } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button, Text } from 'ui';
import { FittingCardList } from './components/fitting-card-list';

export function Fittings() {
  const { canWrite } = usePermissions();
  const canCreate = canWrite(SECTION.fittings);
  return (
    <div className='flex flex-col gap-6 pb-24 lg:pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-borderColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          fittings
        </Text>
        {canCreate && (
          <Button size='lg' variant='main' className='uppercase max-lg:hidden' asChild>
            <Link to={ROUTES.addFitting}>create new</Link>
          </Button>
        )}
      </div>

      <FittingCardList />

      {/* Phone: the create action sits at the thumb, as upload does in media. */}
      {canCreate && (
        <div className='lg:hidden'>
          <MobileBottomBar>
            <Button variant='main' size='lg' className='min-h-11 w-full' asChild>
              <Link to={ROUTES.addFitting}>+ new fitting</Link>
            </Button>
          </MobileBottomBar>
        </div>
      )}
    </div>
  );
}
