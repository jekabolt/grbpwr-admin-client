import {
    getAllUploadedFiles,
    uploadContentImage,
    uploadContentVideo
} from 'api/admin';
import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { checkIsHttpHttpsMediaLink } from './checkIsHttpHttpsLink';
import { isVideo } from './filterContentType';
import { filterExtensionToContentType } from './filterExtentions';
import { getBase64ImageFromUrl } from './getBase64';


function trimBeforeBase64(input: string): string {
    const parts = input.split('base64,');
    if (parts.length > 1) {
        return parts[1];
    }
    return input;
}

const useMediaSelector = (
    initialIsLoading = false,
    initialHasMore = true,
): {
    media: common_MediaFull[];
    selectedFiles: File[];
    url: string;
    selectedFileUrl: string;
    croppedImage: string | null,
    filterByType: string;
    sortByDate: string;
    isLoading: boolean;
    loading: boolean,
    setMedia: React.Dispatch<React.SetStateAction<common_MediaFull[]>>;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    setSelectedFiles: Dispatch<SetStateAction<File[]>>;
    handleMediaUpload: () => Promise<void>
    fetchFiles: (limit: number, startOffset: number) => Promise<void>;
    reload: () => Promise<void>;
    setFilterByType: React.Dispatch<React.SetStateAction<string>>;
    setSortByDate: React.Dispatch<React.SetStateAction<string>>;
    sortedAndFilteredMedia: () => common_MediaFull[];
    setSelectedFileUrl: (url: string) => void;
    setCroppedImage: (img: string | null) => void;
} => {
    const { showMessage } = useSnackBarStore();
    const [media, setMedia] = useState<common_MediaFull[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialIsLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
    const [url, setUrl] = useState<string>('');
    const [filterByType, setFilterByType] = useState('');
    const [sortByDate, setSortByDate] = useState('desc');
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [croppedImage, setCroppedImage] = useState<string | null>(null);
    const [selectedFileUrl, setSelectedFileUrl] = useState<string>('');

    const sortedAndFilteredMedia = useCallback(() => {
        return media
            ?.filter((m) => {
                const matchesType =
                    filterByType === '' ||
                    (filterByType === 'video' && isVideo(m.media?.fullSize?.mediaUrl)) ||
                    (filterByType === 'image' && !isVideo(m.media?.fullSize?.mediaUrl));

                return matchesType;
            })
            .sort((a, b) => {
                const dateA = new Date(a.createdAt || 0).getTime();
                const dateB = new Date(b.createdAt || 0).getTime();
                return sortByDate === 'asc' ? dateA - dateB : dateB - dateA;
            });
    }, [media, filterByType, sortByDate]);

    const fetchFiles = useCallback(async (limit: number, startOffset: number) => {
        setIsLoading(true);
        const response = await getAllUploadedFiles({
            limit,
            offset: startOffset,
            orderFactor: 'ORDER_FACTOR_DESC',
        });
        const fetchedFiles: common_MediaFull[] = response.list || [];
        setMedia((prev) => (startOffset === 0 ? fetchedFiles : [...prev, ...fetchedFiles]));
        setIsLoading(false);
        setHasMore(fetchedFiles.length === limit);
    }, []);

    const reload = useCallback(async () => {
        setMedia([]);
        await fetchFiles(50, 0);
    }, [fetchFiles]);

    const processAndUpload = async (baseData64: string, contentType: string) => {
        try {
            if (contentType.startsWith('image')) {
                await uploadContentImage({ rawB64Image: baseData64 });
            } else if (contentType.startsWith('video')) {
                const raw = trimBeforeBase64(baseData64);
                await uploadContentVideo({ raw, contentType });
            }
            showMessage('MEDIA IS UPLOADED', 'success');
        } catch (error) {
            showMessage('UPLOAD HAS FAILED. TRY AGAIN', 'error');
        } finally {
            setLoading(false);
            setSelectedFiles([]);
            setSelectedFileUrl('');
            setCroppedImage(null);
            setUrl('')
            reload();
        }
    };

    const handleMediaUpload = useCallback(async () => {
        setLoading(true);
        if (croppedImage) {
            await processAndUpload(croppedImage, 'image');
        } else if (selectedFiles.length > 0) {
            const file = selectedFiles[0];
            const fileExtension = file?.name?.split('.')?.pop()?.toLowerCase();
            const contentType = filterExtensionToContentType[fileExtension || ''] || 'application/octet-stream';
            const reader = new FileReader();
            reader.onload = async (event) => {
                if (event.target && event.target.result) {
                    await processAndUpload(event.target.result.toString(), contentType);
                }
            };
            reader.readAsDataURL(file);
        } else if (checkIsHttpHttpsMediaLink(url)) {
            const baseData64 = await getBase64ImageFromUrl(url);
            await processAndUpload(baseData64, 'image');
        } else {
            showMessage('NO MEDIA FOR UPLOAD', 'error');
            setLoading(false);
        }
    }, [url, croppedImage, selectedFiles, reload]);


    return {
        media,
        selectedFiles,
        url,
        selectedFileUrl,
        croppedImage,
        filterByType,
        sortByDate,
        isLoading,
        loading,
        fetchFiles,
        reload,
        setMedia,
        setUrl,
        setFilterByType,
        setSortByDate,
        sortedAndFilteredMedia,
        setSelectedFileUrl,
        setCroppedImage,
        setSelectedFiles,
        handleMediaUpload
    };
};

export default useMediaSelector;
