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
                text: archiveFull.archive.archiveBody?.text,
            }
            : undefined,
        itemsInsert: [
            ...(archiveFull.items?.map((item) => ({
                mediaId: item.archiveItem?.media?.id,
                url: item.archiveItem?.url,
                name: item.archiveItem?.name,
            })) || []),
            ...(newItem ? [newItem] : []),
        ].filter((item) => item !== undefined) as common_ArchiveItemInsert[],
    };
};