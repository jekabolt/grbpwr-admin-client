import { PreviewMediaForUpload } from 'components/common/cropper/previewMediaForUpload';
import { MediaSelectorInterface } from 'components/common/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';
import 'react-advanced-cropper/dist/style.css';
import { ByUrl } from './byUrl';
import { DragDrop } from './dragDrop';
import { FilterMedias } from './filterMedias';
import { MediaList } from './listMedia';

export const MediaSelector: FC<MediaSelectorInterface> = ({
  allowMultiple,
  selectedMedia,
  enableModal,
  aspectRatio,
  hideVideos,
  isDeleteAccepted,
  select,
}) => {
  const {
    url,
    selectedFiles,
    selectedFileUrl,
    croppedImage,
    loading,
    setUrl,
    handleMediaUpload,
    setSelectedFileUrl,
    setSelectedFiles,
    setCroppedImage,
  } = useMediaSelector();
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);

  useEffect(() => {
    if (url) {
      setSelectedFiles([]);
      setSelectedFileUrl('');
      setCroppedImage('');
    }
  }, [url]);

  useEffect(() => {
    if (selectedFiles.length > 0) {
      setUrl('');
    }
  }, [selectedFiles, selectedFileUrl]);

  const clearDragDropSelector = () => {
    setCroppedImage('');
    setSelectedFiles([]);
    setSelectedFileUrl('');
    setUrl('');
  };

  return (
    <div className='space-y-10'>
      <div className='flex justify-between items-center w-full'>
        <ByUrl url={url} setUrl={setUrl} />

        <DragDrop
          loading={loading}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          selectedFileUrl={selectedFileUrl}
          setSelectedFileUrl={setSelectedFileUrl}
        />

        <FilterMedias />
      </div>

      <PreviewMediaForUpload
        croppedImage={croppedImage}
        isCropperOpen={isCropperOpen}
        b64Media={selectedFileUrl || url}
        isMediaSelector={true}
        setIsCropperOpen={setIsCropperOpen}
        clear={clearDragDropSelector}
        setCroppedImage={setCroppedImage}
        handleUploadMedia={handleMediaUpload}
      />

      <MediaList
        allowMultiple={allowMultiple}
        selectedMedia={selectedMedia}
        enableModal={enableModal}
        croppedImage={croppedImage}
        aspectRatio={aspectRatio}
        hideVideos={hideVideos}
        isDeleteAccepted={isDeleteAccepted}
        setCroppedImage={setCroppedImage}
        select={select}
        handleUploadMedia={handleMediaUpload}
      />
    </div>
  );
};
