import { common_ArchiveList, common_MediaFull } from 'api/proto-http/admin';
import { common_HeroFullWithTranslations } from 'api/proto-http/frontend';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { ArchivePicker } from './archive-picker';
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
    <div className='w-full flex flex-col gap-4'>
      <Text className='text-xl font-bold leading-none' variant='uppercase'>
        {gender}
      </Text>
      <div className='flex flex-col lg:flex-row gap-4'>
        <div className='w-full lg:w-1/4'>
          <MediaPreviewWithSelector
            mediaUrl={mediaUrls[gender]}
            aspectRatio={['1:1']}
            allowMultiple={false}
            showVideos={false}
            alt={`${gender} media preview`}
            onSaveMedia={saveMedia}
          />
        </div>
        <div className='w-full flex flex-col gap-4'>
          <InputField name={`navFeatured.${gender}.featuredTag`} label='tag' />
          <div className='flex items-center w-full border border-textColor justify-between px-2 py-1'>
            <Text variant='uppercase'>
              {selectedArchiveId ? `archive id: ${selectedArchiveId}` : 'no archive selected'}
            </Text>
            <Button type='button' onClick={() => onOpenArchivePicker(gender)} className='p-2'>
              select
            </Button>
          </div>

          <TranslationField
            label='explore text'
            fieldPrefix={`navFeatured.${gender}.translations`}
            fieldName='exploreText'
          />
        </div>
      </div>
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
    <div className='border border-2 border-text p-4 space-y-6'>
      <Text variant='uppercase' className='text-xl font-bold leading-none'>
        navigation featured
      </Text>
      <div className='flex flex-col gap-10'>
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
