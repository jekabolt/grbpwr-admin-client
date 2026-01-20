// import { FC, useState } from 'react';
// import { Button } from 'ui/components/button';
// import { MediaSelectorModal } from './components/mediaSelectorModal';
// import { MediaSelectorLayoutProps } from './interfaces/mediaSelectorInterfaces';

// export const MediaSelectorLayout: FC<MediaSelectorLayoutProps> = ({
//   label,
//   allowMultiple,
//   aspectRatio,
//   hideVideos,
//   isDeleteAccepted,
//   className,
//   saveSelectedMedia,
// }) => {
//   const [mediaSelectorVisibility, setMediaSelectorVisibility] = useState(false);

//   const handleMediaSelectorVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();
//     setMediaSelectorVisibility(!mediaSelectorVisibility);
//   };
//   return (
//     <div className={className}>
//       <Button size='lg' onClick={handleMediaSelectorVisibility}>
//         {label}
//       </Button>
//       {mediaSelectorVisibility && (
//         <MediaSelectorModal
//           aspectRatio={aspectRatio}
//           hideVideos={hideVideos}
//           allowMultiple={allowMultiple}
//           isDeleteAccepted={isDeleteAccepted}
//           saveSelectedMedia={saveSelectedMedia}
//           closeMediaSelector={() => setMediaSelectorVisibility(false)}
//         />
//       )}
//     </div>
//   );
// };
