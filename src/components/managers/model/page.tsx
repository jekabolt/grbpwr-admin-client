import { useModel } from 'components/managers/models/components/useModelQuery';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ModelForm } from './components';

export function Model() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const numId = id ? parseInt(id, 10) : undefined;
  const { data, isLoading, isError } = useModel(numId);

  if (isEditMode && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading model…
        </Text>
      </div>
    );
  }

  if (isEditMode && (isError || !data)) {
    return (
      <div className='flex flex-col items-center gap-4 py-20'>
        <Text variant='inactive' className='uppercase'>
          model not found
        </Text>
        <Button asChild variant='main' size='lg' className='uppercase'>
          <Link to={ROUTES.models}>← back to models</Link>
        </Button>
      </div>
    );
  }

  return <ModelForm isEditMode={isEditMode} id={id} model={data} />;
}
