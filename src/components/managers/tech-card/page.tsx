import { RelatedTasks } from 'components/managers/tasks/components/related-tasks';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TechCardForm } from './components';

export function TechCard() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const numId = id ? parseInt(id, 10) : undefined;
  const { data, isLoading, isError } = useTechCard(numId);

  if (isEditMode && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading tech card…
        </Text>
      </div>
    );
  }

  if (isEditMode && (isError || !data)) {
    return (
      <div className='flex flex-col items-center gap-4 py-20'>
        <Text variant='inactive' className='uppercase'>
          tech card not found
        </Text>
        <Button asChild variant='main' size='lg' className='uppercase'>
          <Link to={ROUTES.techCards}>← back to tech cards</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6'>
      <TechCardForm isEditMode={isEditMode} id={id} techCard={data} />
      {numId ? <RelatedTasks techCardId={numId} /> : null}
    </div>
  );
}
