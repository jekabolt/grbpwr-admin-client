import { useParams } from 'react-router-dom';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { useArchiveDetails } from '../utility/useArchive';

export function Archive() {
  const { heading, tag, id } = useParams<{ heading: string; tag: string; id: string }>();
  const archiveId = id ? parseInt(id, 10) : undefined;
  const { data: archive, isLoading, error } = useArchiveDetails(archiveId, { heading, tag });

  return (
    <div className='w-full '>
      <div className='flex justify-between'>
        <Text>{archive?.archiveList?.translations?.[0]?.heading}</Text>
        <Text>{archive?.archiveList?.tag}</Text>
        <Text>{archive?.archiveList?.translations?.[0]?.description}</Text>
      </div>

      {archive?.mainMedia?.media?.fullSize?.mediaUrl && (
        <div>
          <Text>Main Media</Text>
          <div className='mb-8'>
            <Media
              src={archive.mainMedia.media.fullSize.mediaUrl}
              alt={archive.archiveList?.translations?.[0]?.heading || 'Archive'}
              className='w-full h-96 object-cover rounded-lg'
            />
          </div>
        </div>
      )}

      {archive?.media && archive?.media.length > 0 && (
        <div>
          <Text className='text-2xl font-semibold mb-6 uppercase'>Archive Media</Text>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {archive.media.map((mediaItem, index) => (
              <div key={mediaItem.id || index} className='overflow-hidden rounded-lg'>
                {mediaItem.media?.fullSize?.mediaUrl && (
                  <Media
                    src={mediaItem.media.fullSize.mediaUrl}
                    alt={`Archive media ${index + 1}`}
                    className='w-full h-64 object-cover hover:scale-105 transition-transform duration-300'
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
