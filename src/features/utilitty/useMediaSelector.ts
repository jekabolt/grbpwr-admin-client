import { getAllUploadedFiles, uploadContentLink } from 'api/admin';
import { common_Media } from 'api/proto-http/admin';
import { useCallback, useState } from 'react';
import { isVideo } from './filterContentType';

const useMediaSelector = (
    initialIsLoading = false,
    initialHasMore = true,
): {
    media: common_Media[];
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>;
    url: string;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    updateLink: () => Promise<void>;
    fetchFiles: (limit: number, startOffset: number) => Promise<void>;
    reload: () => Promise<void>;
    filterByType: string;
    sortByDate: string;
    setFilterByType: React.Dispatch<React.SetStateAction<string>>;
    setSortByDate: React.Dispatch<React.SetStateAction<string>>;
    sortedAndFilteredMedia: () => common_Media[];
    isLoading: boolean
} => {
    const [media, setMedia] = useState<common_Media[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialIsLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
    const [url, setUrl] = useState<string>('');
    const [filterByType, setFilterByType] = useState('');
    const [sortByDate, setSortByDate] = useState('desc');

    const sortedAndFilteredMedia = useCallback(() => {
        return media
            ?.filter((m) => {
                const matchesType =
                    filterByType === '' ||
                    (filterByType === 'video' && isVideo(m.media?.fullSize)) ||
                    (filterByType === 'image' && !isVideo(m.media?.fullSize));

                return matchesType;
            })
            .sort((a, b) => {
                const dateA = new Date(a.createdAt || 0).getTime();
                const dateB = new Date(b.createdAt || 0).getTime();
                return sortByDate === 'asc' ? dateA - dateB : dateB - dateA;
            });
    }, [media, filterByType, sortByDate]);

    const isHttpsMediaLink = (url: string) => {
        const lowerCaseUrl = url.toLowerCase();
        const pattern = /^https:\/\/.*\.(jpg|jpeg|png|gif|bmp|svg|mp4|avi|mov|wmv)$/i;
        return pattern.test(lowerCaseUrl);
    };

    const fetchFiles = useCallback(async (limit: number, startOffset: number) => {
        setIsLoading(true);
        const response = await getAllUploadedFiles({
            limit,
            offset: startOffset,
            orderFactor: 'ORDER_FACTOR_DESC',
        });
        const fetchedFiles: common_Media[] = response.list || [];
        setMedia((prev) => (startOffset === 0 ? fetchedFiles : [...prev, ...fetchedFiles]));
        setIsLoading(false);
        setHasMore(fetchedFiles.length === limit);
    }, []);

    const reload = useCallback(async () => {
        setMedia([]);
        await fetchFiles(50, 0);
    }, [fetchFiles]);

    const updateLink = useCallback(async () => {
        if (isHttpsMediaLink(url)) {
            setIsLoading(true);
            try {
                await uploadContentLink({ url: url });
                reload();
            } catch (error) {
                console.error("Error updating link:", error);
            } finally {
                setIsLoading(false);
            }
            setUrl('');
        } else {
            setUrl('');
        }
    }, [url, reload]);

    return {
        media,
        fetchFiles,
        reload,
        setMedia,
        url,
        setUrl,
        updateLink,
        filterByType,
        setFilterByType,
        sortByDate,
        setSortByDate,
        sortedAndFilteredMedia,
        isLoading
    };
};

export default useMediaSelector;
