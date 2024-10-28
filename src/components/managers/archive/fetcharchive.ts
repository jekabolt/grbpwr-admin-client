import { deleteArchive, getArchive, updateArchive } from 'api/archive';
import { common_ArchiveFull } from 'api/proto-http/frontend';
import { useCallback, useState } from 'react';
import { convertArchiveFullToNew } from './utility/convertArchiveFromFullToNew';

export const fetchArchives = (
    initialLoading = false,
    initialHasMore = true,
): {
    archive: common_ArchiveFull[];
    isLoading: boolean;
    hasMore: boolean;
    snackBarMessage: string;
    snackBarSeverity: 'success' | 'error';
    isSnackBarOpen: boolean;
    setArchive: React.Dispatch<React.SetStateAction<common_ArchiveFull[]>>;
    fetchArchive: (limit: number, offset: number) => Promise<void>;
    setIsSnackBarOpen: (value: boolean) => void;
    showMessage: (message: string, severity: 'success' | 'error') => void;
    deleteArchiveFromList: (id: number | undefined) => void;
    deleteItemFromArchive: (archiveId: number | undefined, itemId: number | undefined) => void;
    updateArchiveInformation: (archiveId: number | undefined, items: common_ArchiveFull) => void;
} => {
    const [archive, setArchive] = useState<common_ArchiveFull[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
    const [snackBarMessage, setSnackBarMessage] = useState<string>('');
    const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
    const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

    const showMessage = (message: string, severity: 'success' | 'error') => {
        setSnackBarMessage(message);
        setSnackBarSeverity(severity);
        setIsSnackBarOpen(!isSnackBarOpen);
    };

    const fetchArchive = useCallback(async (limit: number, offset: number) => {
        setIsLoading(true);
        const response = await getArchive({
            limit,
            offset,
            orderFactor: 'ORDER_FACTOR_DESC',
        });
        const fetchedArchives = response.archives || [];
        setArchive((prev) => (offset === 0 ? fetchedArchives : [...prev, ...fetchedArchives]));
        setIsLoading(false);
        setHasMore(fetchedArchives.length === limit);
        console.log(archive);
    }, []);

    const deleteArchiveFromList = async (id: number | undefined) => {
        if (!id) return;

        try {
            await deleteArchive({ id });
            fetchArchive(50, 0);
            showMessage('ARCHIVE REMOVED', 'success');
        } catch {
            showMessage('ARCHIVE CANNOT BE REMOVED', 'error');
        }
    };

    const updateArchiveInformation = async (
        archiveId: number | undefined,
        items: common_ArchiveFull,
    ) => {
        const convertedItemsData = convertArchiveFullToNew(items);

        try {
            await updateArchive({
                id: archiveId,
                archiveUpdate: convertedItemsData,
            });
        } catch (error) {
            showMessage(`ARCHIVE CANNOT BE UPDATED`, 'error');
        }
    };

    const deleteItemFromArchive = async (archiveId: number | undefined, itemId: number | undefined) => {
        setArchive((prevArchive) =>
            prevArchive.map((archiveEntry) => {
                if (archiveEntry.archive?.id === archiveId) {
                    const currentItems = archiveEntry.items || [];
                    const updatedItems = currentItems.filter((item) => item.id !== itemId);

                    if (currentItems.length === 1 && updatedItems.length === 0) {
                        const userConfirmed = window.confirm(
                            'This is the last item in the archive. If you delete it, the entire archive will be deleted. Are you sure you want to delete it?',
                        );
                        if (!userConfirmed) {
                            showMessage('Item deletion cancelled', 'error');
                            return archiveEntry;
                        }
                        deleteArchiveFromList(archiveId);
                        return null;
                    }

                    const updatedArchiveEntry = { ...archiveEntry, items: updatedItems };
                    showMessage('Item removed from archive', 'success');
                    updateArchiveInformation(archiveId, updatedArchiveEntry);
                    return updatedArchiveEntry;
                }
                return archiveEntry;
            }).filter((archiveEntry) => archiveEntry !== null) as common_ArchiveFull[]
        );
    }

    return {
        archive,
        isLoading,
        hasMore,
        snackBarMessage,
        snackBarSeverity,
        isSnackBarOpen,
        setArchive,
        fetchArchive,
        showMessage,
        setIsSnackBarOpen,
        deleteArchiveFromList,
        deleteItemFromArchive,
        updateArchiveInformation,
    };
};
