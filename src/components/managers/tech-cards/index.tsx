import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TechCardList } from './components/tech-card-list';

export function TechCards() {
  const { canWrite } = usePermissions();
  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          tech cards
        </Text>
        {canWrite(SECTION.techCards) && (
          <Button size='lg' variant='main' className='uppercase' asChild>
            <Link to={ROUTES.addTechCard}>create new</Link>
          </Button>
        )}
      </div>

      <TechCardList />
    </div>
  );
}
