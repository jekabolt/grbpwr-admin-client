import { getAllUploadedFiles, uploadContentLink } from 'api/admin';
import { common_Media } from 'api/proto-http/admin';
import { useCallback, useState } from 'react';

// Define your hook here
const useMediaSelector = (
    initialIsLoading = false,
    initialHasMore = true
): {
    media: common_Media[];
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>;
    url: string;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    updateLink: () => Promise<void>;
    fetchFiles: (limit: number, startOffset: number) => Promise<void>;
    reload: () => Promise<void>;
    isLoading: boolean;
    hasMore: boolean;
} => {
    const [media, setMedia] = useState<common_Media[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialIsLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
    const [url, setUrl] = useState<string>('');


    const isHttpsMediaLink = (url: string) => {
        const lowerCaseUrl = url.toLowerCase();
        const pattern = /^https:\/\/.*\.(jpg|jpeg|png|gif|bmp|svg|mp4|avi|mov|wmv)$/i;
        return pattern.test(lowerCaseUrl);
    };

    const updateLink = useCallback(async () => {
        if (isHttpsMediaLink(url)) {
            await uploadContentLink({ url: url });
            reload();
            setUrl('');
        } else {
            setUrl('')
        }
    }, [url]);

    const fetchFiles = useCallback(async (limit: number, startOffset: number) => {
        setIsLoading(true);
        const response = await getAllUploadedFiles({ limit, offset: startOffset, orderFactor: 'ORDER_FACTOR_ASC' });
        const fetchedFiles: common_Media[] = response.list || [];
        setMedia(prev => startOffset === 0 ? fetchedFiles : [...prev, ...fetchedFiles]);
        setIsLoading(false);
        setHasMore(fetchedFiles.length === limit);
    }, []);

    const reload = useCallback(async () => {
        setMedia([]);
        await fetchFiles(10, 0);
    }, [fetchFiles]);

    return {
        media, fetchFiles, reload, isLoading, hasMore, setMedia, url, setUrl, updateLink
    };
};

export default useMediaSelector;
