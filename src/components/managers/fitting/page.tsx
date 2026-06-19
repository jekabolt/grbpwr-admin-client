import { useFitting } from 'components/managers/fittings/components/useFittingQuery';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { FittingForm } from './components';

export function Fitting() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const numId = id ? parseInt(id, 10) : undefined;
  const { data, isLoading, isError } = useFitting(numId);

  if (isEditMode && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading fitting…
        </Text>
      </div>
    );
  }

  if (isEditMode && (isError || !data)) {
    return (
      <div className='flex flex-col items-center gap-4 py-20'>
        <Text variant='inactive' className='uppercase'>
          fitting not found
        </Text>
        <Button asChild variant='main' size='lg' className='uppercase'>
          <Link to={ROUTES.fittings}>← back to fittings</Link>
        </Button>
      </div>
    );
  }

  return <FittingForm isEditMode={isEditMode} id={id} fitting={data} />;
}
