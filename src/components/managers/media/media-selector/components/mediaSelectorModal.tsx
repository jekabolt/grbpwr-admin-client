// import { common_MediaFull } from 'api/proto-http/admin';
// import { MediaSelectorModalProps } from 'components/managers/media/media-selector/interfaces/mediaSelectorInterfaces';

// import { useSnackBarStore } from 'lib/stores/store';
// import { FC, useState } from 'react';
// import { Dialog } from 'ui/components/dialog';
// import { MediaSelector } from './mediaSelector';

// export const MediaSelectorModal: FC<MediaSelectorModalProps> = ({
//   allowMultiple,
//   aspectRatio,
//   hideVideos,
//   isDeleteAccepted,
//   closeMediaSelector,
//   saveSelectedMedia,
// }) => {
//   const { showMessage } = useSnackBarStore();
//   const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);
//   const [open, setOpen] = useState(true);

//   const handleMediaAndCloseSelector = async () => {
//     if (selectedMedia.length === 0) {
//       showMessage('NO SELECTED MEDIA', 'error');
//       return;
//     }
//     saveSelectedMedia(selectedMedia);
//     handleClose();
//   };

//   const select = (media: common_MediaFull, allowMultiple: boolean) => {
//     setSelectedMedia((prevSelected) => {
//       return allowMultiple
//         ? prevSelected.some((item) => item.id === media.id)
//           ? prevSelected.filter((item) => item.id !== media.id)
//           : [...prevSelected, media]
//         : [media];
//     });
//   };

//   const handleClose = () => {
//     setOpen(false);
//     closeMediaSelector();
//   };

//   return (
//     <Dialog open={open} onClose={handleClose} isSaveButton save={handleMediaAndCloseSelector}>
//       <MediaSelector
//         allowMultiple={allowMultiple}
//         aspectRatio={aspectRatio}
//         hideVideos={hideVideos}
//         isDeleteAccepted={isDeleteAccepted}
//         selectedMedia={selectedMedia}
//         select={select}
//       />
//     </Dialog>
//   );
// };
