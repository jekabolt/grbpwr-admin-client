import { getAllUploadedFiles } from "api/admin";
import { common_Media } from "api/proto-http/admin";
import { useCallback, useState } from "react";

const useMediaSelector = (initialIsLoading = false, initialHasMore = true): {
    media: common_Media[];
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>;
    fetchFiles: (limit: number, startOffset: number) => Promise<void>;
    reload: () => Promise<void>;
    isLoading: boolean;
    hasMore: boolean;
} => {
    const [media, setMedia] = useState<common_Media[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialIsLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);

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

    return { media, fetchFiles, reload, isLoading, hasMore, setMedia };
};

export default useMediaSelector;
