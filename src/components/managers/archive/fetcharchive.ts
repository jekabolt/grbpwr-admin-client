import {
    deleteArchive,
    getArchive,
    updateArchive
} from 'api/archive';
import { common_ArchiveNew } from 'api/proto-http/admin';
import { common_ArchiveFull } from 'api/proto-http/frontend';
import { useCallback, useState } from 'react';

export const fetchArchives = (
    initialLoading = false,
    initialHasMore = true,
): {
    archive: common_ArchiveFull[];
    setArchive: React.Dispatch<React.SetStateAction<common_ArchiveFull[]>>;
    isLoading: boolean;
    hasMore: boolean;
    fetchArchive: (limit: number, offset: number) => Promise<void>;
    snackBarMessage: string;
    snackBarSeverity: 'success' | 'error';
    isSnackBarOpen: boolean;
    setIsSnackBarOpen: (value: boolean) => void;
    showMessage: (message: string, severity: 'success' | 'error') => void;
    deleteArchiveFromList: (id: number | undefined) => void
    updateArchiveInformation: (archiveId: number | undefined, items: common_ArchiveNew) => void
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
        if (!id) return

        try {
            await deleteArchive({ id })
            fetchArchive(50, 0)
            showMessage('ARCHIVE REMOVED', 'success')
        } catch {
            showMessage('ARCHIVE CANNOT BE REMOVED', 'error')
        }
    }

    const updateArchiveInformation = async (
        archiveId: number | undefined,
        items: common_ArchiveNew,
    ) => {
        try {
            await updateArchive({
                id: archiveId,
                archiveUpdate: items,
            });
        } catch (error) {
            showMessage(`ARCHIVE CANNOT BE UPDATED`, 'error');
        }
    };

    return {
        archive,
        setArchive,
        isLoading,
        hasMore,
        fetchArchive,
        snackBarMessage,
        snackBarSeverity,
        showMessage,
        isSnackBarOpen,
        setIsSnackBarOpen,
        deleteArchiveFromList,
        updateArchiveInformation
    };
};
