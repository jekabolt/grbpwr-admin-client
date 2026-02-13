import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { common_ArchiveFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { ArchiveMainMedia } from './archive-main-media';
import { ArchiveMedia } from './archive-media';
import { CheckoutData, defaultData, mapArchive, mapArchiveDataToForm, schema } from './schema';

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
        showMessage('arhive updated', 'success');
      } else {
        await adminService.AddArchive({ archiveInsert });
        showMessage('archive created', 'success');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit archive';
      showMessage(msg, 'error');
      console.error('Failed to submit archive', error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <div className='flex gap-5 lg:flex-row flex-col justify-between'>
          <div className='lg:w-1/2 w-full space-y-5'>
            <ArchiveMainMedia archive={archive} control={form.control} editMode={editMode} />
            <ArchiveMedia archive={archive} control={form.control} editMode={editMode} />
          </div>
          <div className='lg:w-1/2 w-full space-y-5'>
            <UnifiedTranslationFields
              fieldPrefix='translations'
              fields={[
                { name: 'heading', label: 'heading' },
                { name: 'description', label: 'description' },
              ]}
            />
            <InputField name='tag' placeholder='enter tag' label='tag' />
          </div>
        </div>
        <Button
          size='lg'
          variant='main'
          type='submit'
          className='fixed bottom-2.5 right-2.5'
          disabled={isEditMode && !isFormChanged}
        >
          {isEditMode ? 'save' : 'add'}
        </Button>
      </form>
    </Form>
  );
}
