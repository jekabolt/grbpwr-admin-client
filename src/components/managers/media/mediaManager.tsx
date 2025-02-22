import { Layout } from 'components/common/layout';
import { MediaSelector } from 'components/managers/media/media-selector/components/mediaSelector';

import { FC } from 'react';

export const MediaManager: FC = () => {
  return (
    <Layout>
      <MediaSelector
        select={() => {}}
        selectedMedia={[]}
        allowMultiple={false}
        enableModal={true}
      />
    </Layout>
  );
};
