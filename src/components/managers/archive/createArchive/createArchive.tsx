import { useSnackBarStore } from 'lib/stores/store';
import { FC } from 'react';

export const CreateArchive: FC = () => {
  const { showMessage } = useSnackBarStore();

  // const addNewItem = () => {
  //   if (url && !isValidUrl(url)) {
  //     showMessage('invalid url', 'error');
  //     return;
  //   }

  //   if (mediaId && selectedItemIndex === null) {
  //     const isDuplicate = archive.mediaIds?.some((item) => item === mediaId);
  //     if (isDuplicate) {
  //       showMessage('This media is already in the archive', 'error');
  //       return;
  //     }
  //   }

  //   // const newItem: common_ArchiveItemInsert = {
  //   //   mediaId: mediaId,
  //   //   url: url,
  //   //   name: title,
  //   // };

  //   if (selectedItemIndex !== null) {
  //     const updatedItems = [...(archive.mediaIds || [])];
  //     updatedItems[selectedItemIndex] = newItem;
  //     setArchive((prev) => ({
  //       ...prev,
  //       itemsInsert: updatedItems,
  //     }));

  //     const newMediaItem: common_MediaItem = {
  //       fullSize: { mediaUrl: media, width: undefined, height: undefined },
  //       thumbnail: undefined,
  //       compressed: undefined,
  //       blurhash: undefined,
  //     };
  //     const newMediaFull = {
  //       media: newMediaItem,
  //     } as common_MediaFull;

  //     const updatedMediaItems = [...mediaItem];
  //     updatedMediaItems[selectedItemIndex] = newMediaFull;

  //     setMediaItem(updatedMediaItems);
  //   } else {
  //     setArchive((prev) => ({
  //       ...prev,
  //       itemsInsert: [...(prev.mediaIds ?? []), newItem],
  //     }));

  //     if (media) {
  //       const newMediaItem: common_MediaItem = {
  //         fullSize: { mediaUrl: media, width: undefined, height: undefined },
  //         thumbnail: undefined,
  //         compressed: undefined,
  //         blurhash: undefined,
  //       };

  //       const newMediaFull = {
  //         media: newMediaItem,
  //       } as common_MediaFull;

  //       setMediaItem((prevMediaItems) => [...prevMediaItems, newMediaFull]);
  //     }
  //   }

  //   setMedia(undefined);
  //   setTitle('');
  //   setUrl('');
  //   toggleModal();
  //   showMessage('item added', 'success');
  // };

  // const handleTextFieldChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const { name, value } = event.target;
  //   setArchive((prevArchive: common_ArchiveNew): common_ArchiveNew => {
  //     return {
  //       ...prevArchive,
  //       archive: {
  //         ...prevArchive.archive,
  //         [name]: value,
  //         heading: name === 'heading' ? value : prevArchive.archive?.heading || '',
  //         text: name === 'description' ? value : prevArchive.archive?.text || '',
  //       },
  //       itemsInsert: prevArchive.itemsInsert,
  //     };
  //   });
  // };

  return (
    // <Dialog open={open} onClose={close} title='create new archive' isSaveButton>
    //   <Grid container spacing={2} padding={4} alignItems='center'>
    //     <Grid size={{ xs: 12 }}>
    //       <Grid container className={styles.scroll_container} wrap='nowrap'>
    //         <Grid size={{ xs: 12, md: 3 }} className={styles.media_item_add}>
    //           {/* <MediaSelectorLayout
    //             label='add media'
    //             allowMultiple={false}
    //             saveSelectedMedia={mediaPreview}
    //             aspectRatio={['1:1', '3:4', '4:3']}
    //             hideVideos={true}
    //             isDeleteAccepted={false}
    //           />*/}
    //         </Grid>
    //         {/* {mediaItem.map((media, id) => (
    //           <Grid size={{ xs: 12, md: 3 }} key={id}>
    //             <Grid container>
    //               <Grid size={{ xs: 12 }} className={styles.media_item}>
    //                 <img
    //                   src={media.media?.fullSize?.mediaUrl}
    //                   alt=''
    //                   // onClick={() => toggleModal(id)}
    //                 />
    //                 <IconButton onClick={() => removeMediaItem(id)} className={styles.delete_item}>
    //                   <ClearIcon fontSize='small' />
    //                 </IconButton>
    //               </Grid>
    //             </Grid>
    //           </Grid>
    //         ))} */}
    //       </Grid>
    //     </Grid>
    //   </Grid>
    // </Dialog>
    <div>create</div>
  );
};
