import { ROUTES } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { HackerAccounts } from './components/accounts';
import { HackerInvites } from './components/invites';

export function HackerManager() {
  return (
    <div className='flex flex-col w-full gap-4 pb-16'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large'>
          grbpwr hacker
        </Text>
        <Button variant='secondary' size='lg' asChild>
          <Link to={ROUTES.members}>Back to members</Link>
        </Button>
      </div>

      <HackerInvites />
      <HackerAccounts />
    </div>
  );
}
