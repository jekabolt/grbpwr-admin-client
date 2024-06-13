import { common_ArchiveItemInsert, common_ArchiveNew } from "api/proto-http/admin";
import { common_ArchiveFull } from "api/proto-http/frontend";

export const convertArchiveFullToNew = (
    archiveFull: common_ArchiveFull,
    newItem?: common_ArchiveItemInsert,
): common_ArchiveNew => {
    return {
        archive: archiveFull.archive
            ? {
                heading: archiveFull.archive.archiveBody?.heading,
                description: archiveFull.archive.archiveBody?.description,
            }
            : undefined,
        itemsInsert: [
            ...(archiveFull.items?.map((item) => ({
                mediaId: item.archiveItem?.media?.id,
                url: item.archiveItem?.url,
                title: item.archiveItem?.title,
            })) || []),
            ...(newItem ? [newItem] : []),
        ].filter((item) => item !== undefined) as common_ArchiveItemInsert[],
    };
};