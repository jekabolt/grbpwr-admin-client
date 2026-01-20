// import { PreviewMediaForUpload } from 'components/managers/media/cropper/previewMediaForUpload';
// import { MediaSelectorInterface } from 'components/managers/media/media-selector/interfaces/mediaSelectorInterfaces';
// import { FC, useState } from 'react';
// import 'react-advanced-cropper/dist/style.css';
// import { MediaList } from './listMedia';

// export const MediaSelector: FC<MediaSelectorInterface> = ({
//   allowMultiple,
//   selectedMedia,
//   enableModal,
//   aspectRatio,
//   hideVideos,
//   isDeleteAccepted,
//   select,
// }) => {
//   const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);
//   const [isFullSizeModalOpen, setIsFullSizeModalOpen] = useState(false);

//   return (
//     <div className='gap-10 flex items-center flex-col'>
//       {(uploadState.selectedFileUrl || uploadState.url) && !isFullSizeModalOpen && (
//         <PreviewMediaForUpload
//           b64Media={uploadState.selectedFileUrl || uploadState.url || ''}
//           isCropperOpen={isCropperOpen}
//           isMediaSelector={true}
//           setIsCropperOpen={setIsCropperOpen}
//           clear={resetUpload}
//         />
//       )}
//       <MediaList
//         allowMultiple={allowMultiple}
//         selectedMedia={selectedMedia}
//         enableModal={enableModal}
//         aspectRatio={aspectRatio}
//         hideVideos={hideVideos}
//         isDeleteAccepted={isDeleteAccepted}
//         select={select}
//         onModalStateChange={setIsFullSizeModalOpen}
//       />
//     </div>
//   );
// };
