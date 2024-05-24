import { Layout } from 'components/login/layout';
import { MediaSelector } from 'features/mediaSelector/mediaSelector';
import { FC } from 'react';

export const MediaManager: FC = () => {
  return (
    <Layout>
      <MediaSelector select={() => {}} selectedMedia={[]} allowMultiple={false} />
    </Layout>
  );
};
