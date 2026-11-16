import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { Text } from 'ui';
import { ModelCardList } from './model-card-list';

/** Browser-gate fixture for the real Models gallery component; development builds only. */
export function ModelCardListDevPage() {
  return (
    <DictionaryProvider>
      <main
        className='min-h-screen bg-pageBg px-2.5 py-gutter lg:px-6'
        data-testid='model-card-list-dev-page'
      >
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-gutter'>
          <Text component='h1' size='large' variant='uppercase'>
            model card mannequin preview fixture
          </Text>
          <ModelCardList />
        </div>
      </main>
    </DictionaryProvider>
  );
}
