import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { common_ArchiveFull } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { ArchiveMainMedia } from './archive-main-media';
import { ArchiveMedia } from './archive-media';
import { CheckoutData, defaultData, mapArchive, mapArchiveDataToForm, schema } from './schema';

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`space-y-4 border border-textColor p-4 ${className ?? ''}`}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}

export function ArchiveForm({
  isEditMode,
  isAddingArchive,
  id,
  archive,
}: {
  isEditMode: boolean;
  isAddingArchive: boolean;
  id?: string;
  archive?: common_ArchiveFull;
}) {
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();

  const [isFormChanged, setIsFormChanged] = useState(false);

  const initialValues = archive ? mapArchive(archive) : defaultData;
  const editMode = isEditMode || isAddingArchive;

  const form = useForm<CheckoutData>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    mode: 'onSubmit',
  });

  useEffect(() => {
    setIsFormChanged(form.formState.isDirty);
  }, [form.formState.isDirty]);

  async function handleSubmit(data: CheckoutData) {
    const archiveInsert = mapArchiveDataToForm(data);

    try {
      if (isEditMode) {
        await adminService.UpdateArchive({ id: parseInt(id || '0'), archiveInsert });
        showMessage('archive updated', 'success');
        form.reset(data);
      } else {
        await adminService.AddArchive({ archiveInsert });
        showMessage('archive created', 'success');
        navigate(ROUTES.archives);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit archive';
      showMessage(msg, 'error');
      console.error('Failed to submit archive', error);
    }
  }

  const handleCancel = () => navigate(ROUTES.archives);

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textColor pb-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.archives}>← timeline</Link>
            </Button>
            <Text variant='uppercase' size='large'>
              {isAddingArchive ? 'new timeline entry' : 'edit timeline entry'}
            </Text>
          </div>
        </div>

        <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
          <Section title='media' className='w-full lg:w-1/2'>
            <ArchiveMainMedia archive={archive} control={form.control} editMode={editMode} />
            <ArchiveMedia archive={archive} control={form.control} editMode={editMode} />
          </Section>

          <Section title='details' className='w-full lg:w-1/2'>
            <UnifiedTranslationFields
              fieldPrefix='translations'
              fields={[
                { name: 'heading', label: 'heading', maxLength: 90 },
                {
                  name: 'description',
                  label: 'description',
                  type: 'textarea',
                  rows: 5,
                  maxLength: 10000,
                },
              ]}
            />
            <InputField name='tag' placeholder='enter tag' label='tag' />
          </Section>
        </div>
      </form>

      <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textColor bg-bgColor px-3 py-2'>
        <Text variant='inactive' size='small'>
          {isFormChanged ? 'unsaved changes' : ' '}
        </Text>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase cursor-pointer'
            onClick={handleCancel}
          >
            cancel
          </Button>
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase cursor-pointer'
            disabled={(isEditMode && !isFormChanged) || form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
            onClick={() => form.handleSubmit(handleSubmit)()}
          >
            {isEditMode ? 'save' : 'add'}
          </Button>
        </div>
      </div>
    </Form>
  );
}
