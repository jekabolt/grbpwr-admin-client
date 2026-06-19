import { ROUTES } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ModelTable } from './components/model-table';

export function Models() {
  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          models
        </Text>
        <Button size='lg' variant='main' className='uppercase' asChild>
          <Link to={ROUTES.addModel}>create new</Link>
        </Button>
      </div>

      <ModelTable />
    </div>
  );
}
