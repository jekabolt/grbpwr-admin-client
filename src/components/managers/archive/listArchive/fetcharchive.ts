import {
    addArchiveItem,
    deleteArchive,
    deleteItemFromArchive,
    getArchive,
    updateArchive,
} from 'api/archive';
import { common_ArchiveFull, common_ArchiveItemInsert } from 'api/proto-http/admin';
import { useCallback, useState } from 'react';

export const fetchArchives = (
    initialLoading = false,
    initialHasMore = true,
): {
    archive: common_ArchiveFull[];
    isLoading: boolean;
    hasMore: boolean;
    fetchArchive: (limit: number, offset: number) => Promise<void>;
    deleteArchiveItem: (id: number | undefined) => void;
    updateArchiveInformation: (
        id: number | undefined,
        heading: string | undefined,
        description: string | undefined,
    ) => void;
    deleteArchiveFromList: (id: number | undefined) => void;
    addNewItemsToArchive: (id: number | undefined, newItems: common_ArchiveItemInsert[]) => void;
    snackBarMessage: string;
    snackBarSeverity: 'success' | 'error';
    isSnackBarOpen: boolean,
    setIsSnackBarOpen: (value: boolean) => void;
    showMessage: (message: string, severity: 'success' | 'error') => void;
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
        console.log(archive)
    }, []);

    const deleteArchiveItem = async (id: number | undefined) => {
        if (!id) showMessage('ITEM NOT EXIST', 'error');

        const confirmed = window.confirm('Are you sure you wnat to delete archive the item ?');

        try {
            if (confirmed) {
                await deleteItemFromArchive({ itemId: id });
                setArchive((prevArchive) =>
                    prevArchive.map((archive) => {
                        const updatedItems = archive.items?.filter((item) => item.id !== id);
                        return { ...archive, items: updatedItems };
                    }),
                );
                showMessage('ITEM IS REMOVED', 'success');
            }
        } catch (error) {
            showMessage('ITEM CANNOT BE DELETED', 'error');
        }
    };

    const deleteArchiveFromList = async (id: number | undefined) => {
        if (!id) {
            showMessage('ARCHIVE NOT FOUND', 'error');
        }
        const confirmed = window.confirm('Are you sure you wnat to delete the archive ?');

        try {
            if (confirmed) {
                await deleteArchive({ id: id });
                setArchive((prevArchives) => prevArchives.filter((archive) => archive.archive?.id !== id));
                showMessage('ARCHIVE IS REMOVED', 'success');
            }
        } catch (error) {
            showMessage('ARCHIVE CANNOT BE DELETED', 'error');
        }
    };

    const updateArchiveInformation = async (
        id: number | undefined,
        heading: string | undefined,
        description: string | undefined,
    ) => {
        if (id === undefined) {
            showMessage('ARCHIVE NOT FOUND', 'error');
        }
        try {
            await updateArchive({
                id: id,
                archive: {
                    heading: heading,
                    description: description,
                },
            });
            setArchive((prevArchives) => {
                return prevArchives.map((a) => {
                    if (a.archive?.id === id) {
                        return {
                            ...a,
                            archive: {
                                ...a.archive,
                                archiveInsert: {
                                    ...a.archive?.archiveInsert,
                                    heading: heading ?? a.archive?.archiveInsert?.heading,
                                    description: description ?? a.archive?.archiveInsert?.description,
                                },
                            },
                        } as common_ArchiveFull;
                    }
                    return a;
                });
            });
            showMessage('ARCHIVE INFORMATION UPDATED', 'success');
        } catch (error) {
            showMessage('ARCHIVE CANNOT BE UPDATED', 'error');
        }
    };

    const addNewItemsToArchive = async (
        id: number | undefined,
        newItems: common_ArchiveItemInsert[],
    ) => {
        let filteredNewItems: common_ArchiveItemInsert[] = [];

        setArchive((prevArchives) =>
            prevArchives.map((archive) => {
                if (archive.archive?.id === id) {
                    const existingMediaSet = new Set(archive.items?.map(item => item.archiveItemInsert?.media));
                    const filteredItems = newItems.filter(item => !existingMediaSet.has(item.media));
                    filteredNewItems = [...filteredItems];

                    return {
                        ...archive,
                        items: [
                            ...(archive.items || []),
                            ...filteredItems.map(item => ({
                                archiveItemInsert: {
                                    media: item.media,
                                    title: item.title,
                                    url: item.url,
                                },
                            })),
                        ],
                    } as common_ArchiveFull;
                }
                return archive;
            }),
        );

        if (filteredNewItems.length > 0) {
            try {
                await addArchiveItem({
                    archiveId: id,
                    items: filteredNewItems,
                });
                showMessage('NEW ITEM ADDED TO THE ARCHIVE', 'success');
            } catch (error) {
                showMessage('ITEM CANNOT BE ADDED TO THE ARCHIVE', 'error');
            }
        } else {
            showMessage('NO NEW ITEMS ADDED: DUPLICATES NOT ALLOWED', 'error');
        }
    };


    return {
        archive,
        isLoading,
        hasMore,
        fetchArchive,
        deleteArchiveItem,
        updateArchiveInformation,
        deleteArchiveFromList,
        addNewItemsToArchive,
        snackBarMessage,
        snackBarSeverity,
        showMessage,
        isSnackBarOpen,
        setIsSnackBarOpen
    };
};
