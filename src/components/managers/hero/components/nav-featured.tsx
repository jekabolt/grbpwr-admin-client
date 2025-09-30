import { common_ArchiveList, common_MediaFull } from 'api/proto-http/admin';
import { common_HeroFullWithTranslations } from 'api/proto-http/frontend';
import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { ArchivePicker } from '../entities/featured-archive/archive-picker';
import { HeroSchema } from './schema';

type MediaUrlsState = {
  men: string;
  women: string;
};

interface GenderSectionProps {
  gender: 'men' | 'women';
  hero?: common_HeroFullWithTranslations;
  onOpenArchivePicker: (gender: 'men' | 'women') => void;
}

function GenderSection({ gender, hero, onOpenArchivePicker }: GenderSectionProps) {
  const { watch, setValue } = useFormContext<HeroSchema>();
  const [mediaUrls, setMediaUrls] = useState<MediaUrlsState>({ men: '', women: '' });
  const selectedArchiveId =
    gender === 'men'
      ? watch('navFeatured.men.featuredArchiveId')
      : watch('navFeatured.women.featuredArchiveId');

  useEffect(() => {
    if (hero?.navFeatured?.[gender]?.media?.media?.thumbnail?.mediaUrl) {
      setMediaUrls((prev) => ({
        ...prev,
        [gender]: hero.navFeatured?.[gender]?.media?.media?.thumbnail?.mediaUrl,
      }));
    }
  }, [hero, gender]);

  const saveMedia = (selectedMedia: common_MediaFull[]) => {
    if (selectedMedia.length > 0) {
      const media = selectedMedia[0];
      setValue(`navFeatured.${gender}.mediaId`, media.id || 0);
      setMediaUrls((prev) => ({
        ...prev,
        [gender]: media.media?.thumbnail?.mediaUrl || '',
      }));
    }
  };

  return (
    <div className='space-y-4 p-4 border border-gray-200 w-full'>
      <Text>{gender}</Text>

      <div className='w-full'>
        <SingleMediaViewAndSelect
          link={mediaUrls[gender]}
          aspectRatio={['1:1']}
          isDeleteAccepted={false}
          saveSelectedMedia={saveMedia}
          isEditMode
        />

        <InputField name={`navFeatured.${gender}.featuredTag`} label='featured tag' />

        <div className='flex items-end w-full border border-textColor'>
          <div className='flex-1'>
            <Text className='text-sm'>
              {selectedArchiveId ? `Archive ID: ${selectedArchiveId}` : 'No archive selected'}
            </Text>
          </div>
          <div>
            <Button type='button' onClick={() => onOpenArchivePicker(gender)} size='lg'>
              select archive
            </Button>
          </div>
        </div>
      </div>

      <TranslationField
        label='explore text'
        fieldPrefix={`navFeatured.${gender}.translations`}
        fieldName='exploreText'
      />
    </div>
  );
}

export function NavFeatured({ hero }: { hero?: common_HeroFullWithTranslations }) {
  const { setValue, watch } = useFormContext<HeroSchema>();
  const [openArchivePicker, setOpenArchivePicker] = useState<'men' | 'women' | null>(null);
  const values = watch();
  const genders: ('men' | 'women')[] = ['men', 'women'];

  const handleSaveArchiveSelection = (
    selectedArchive: common_ArchiveList[],
    type: 'men' | 'women',
  ) => {
    if (selectedArchive.length > 0) {
      setValue(`navFeatured.${type}.featuredArchiveId`, selectedArchive[0].id || 0);
    } else {
      setValue(`navFeatured.${type}.featuredArchiveId`, 0);
    }
  };

  return (
    <div>
      <Text>navigation featured</Text>
      <div className='flex'>
        {genders.map((gender) => (
          <GenderSection
            hero={hero}
            key={gender}
            gender={gender}
            onOpenArchivePicker={setOpenArchivePicker}
          />
        ))}
      </div>

      <ArchivePicker
        open={!!openArchivePicker}
        onClose={() => setOpenArchivePicker(null)}
        onSave={(selectedArchive) => {
          if (openArchivePicker) {
            handleSaveArchiveSelection(selectedArchive, openArchivePicker);
          }
          setOpenArchivePicker(null);
        }}
        selectedArchiveId={
          openArchivePicker === 'men'
            ? values.navFeatured?.men?.featuredArchiveId || 0
            : values.navFeatured?.women?.featuredArchiveId || 0
        }
      />
    </div>
  );
}
