import {
    getAllUploadedFiles,
    uploadContentImage,
    uploadContentLink,
    uploadContentVideo,
} from 'api/admin';
import { common_MediaFull } from 'api/proto-http/admin';
import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { isVideo } from './filterContentType';

const fileExtensionToContentType: { [key: string]: string } = {
    jpg: 'image/jpg',
    png: 'image/png',
    webm: 'video/webm',
    mp4: 'video/mp4',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
};

const useMediaSelector = (
    initialIsLoading = false,
    initialHasMore = true,
): {
    media: common_MediaFull[];
    setMedia: React.Dispatch<React.SetStateAction<common_MediaFull[]>>;
    url: string;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    updateLink: () => Promise<void>;
    fetchFiles: (limit: number, startOffset: number) => Promise<void>;
    reload: () => Promise<void>;
    filterByType: string;
    sortByDate: string;
    setFilterByType: React.Dispatch<React.SetStateAction<string>>;
    setSortByDate: React.Dispatch<React.SetStateAction<string>>;
    sortedAndFilteredMedia: () => common_MediaFull[];
    isLoading: boolean;
    snackBarMessage: string;
    showMessage: (message: string, severity: 'success' | 'error') => void;
    snackBarSeverity: 'success' | 'error';
    closeSnackBar: () => void;
    isSnackBarOpen: boolean;
    handleUpload: () => void;
    selectedFileUrl: string;
    setSelectedFileUrl: (url: string) => void;
    croppedImage: string | null,
    setCroppedImage: (img: string | null) => void;
    loading: boolean,
    selectedFiles: File[];
    setSelectedFiles: Dispatch<SetStateAction<File[]>>;
    isHttpsMediaLink: (url: string) => void
} => {
    const [media, setMedia] = useState<common_MediaFull[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(initialIsLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
    const [url, setUrl] = useState<string>('');
    const [filterByType, setFilterByType] = useState('');
    const [sortByDate, setSortByDate] = useState('desc');
    const [snackBarMessage, setSnackBarMessage] = useState<string>('');
    const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
    const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [croppedImage, setCroppedImage] = useState<string | null>(null);
    const [selectedFileUrl, setSelectedFileUrl] = useState<string>('');

    const showMessage = (message: string, severity: 'success' | 'error') => {
        setSnackBarMessage(message);
        setSnackBarSeverity(severity);
        setIsSnackBarOpen(!isSnackBarOpen);
    };

    const closeSnackBar = () => {
        setIsSnackBarOpen(!isSnackBarOpen);
    };

    function trimBeforeBase64(input: string): string {
        const parts = input.split('base64,');
        if (parts.length > 1) {
            return parts[1];
        }
        return input;
    }

    const handleUpload = async () => {
        if (selectedFiles.length === 0 && !croppedImage) {
            showMessage('NO SELECTED FILE', 'error');
            return;
        }

        setLoading(true);

        const selectedFile = selectedFiles[0];
        const fileExtension = (selectedFile.name.split('.').pop() || '').toLowerCase();

        if (!fileExtension) {
            showMessage('INVALID FILE FORMAT', 'error');
            setLoading(false);
            return;
        }

        const processAndUploadImage = async (baseData64: string) => {
            const contentType = fileExtensionToContentType[fileExtension];
            try {
                if (contentType.startsWith('image')) {
                    await uploadContentImage({
                        rawB64Image: baseData64,
                    });
                } else if (contentType.startsWith('video')) {
                    const raw = trimBeforeBase64(baseData64);
                    await uploadContentVideo({
                        raw: raw,
                        contentType: contentType,
                    });
                }
                showMessage('MEDIA IS UPLOADED', 'success');
            } catch (error) {
                showMessage('UPLOAD HAS FAILED. TRY AGAIN', 'error');
            } finally {
                setLoading(false);
                setSelectedFiles([]);
                setSelectedFileUrl('');
                setCroppedImage(null);
                reload();
            }
        };

        if (croppedImage) {
            processAndUploadImage(croppedImage);
            console.log(croppedImage);
        } else {
            const reader = new FileReader();
            reader.onload = async (event) => {
                if (event.target && event.target.result) {
                    const baseData64 = event.target.result as string;
                    processAndUploadImage(baseData64);
                }
            };
            reader.readAsDataURL(selectedFile);
        }
    };

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

    const isHttpsMediaLink = (url: string) => {
        const lowerCaseUrl = url.toLowerCase();
        const pattern = /^https:\/\/.*\.(jpg|jpeg|png|gif|bmp|svg|mp4|avi|mov|wmv|webp|webm)$/i;
        return pattern.test(lowerCaseUrl);
    };

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

    const updateLink = useCallback(async () => {
        if (isHttpsMediaLink(url)) {
            setIsLoading(true);
            try {
                await uploadContentLink({ url: url });
                reload();
                showMessage('MEDIA UPLOADED', 'success');
            } catch (error) {
                showMessage('ERROR UPDATING MEDIA', 'error');
            } finally {
                setIsLoading(false);
            }
            setUrl('');
        } else {
            showMessage('INCORRECT URL', 'error');
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
        isLoading,
        snackBarMessage,
        showMessage,
        closeSnackBar,
        isSnackBarOpen,
        snackBarSeverity,
        handleUpload,
        selectedFileUrl,
        setSelectedFileUrl,
        croppedImage,
        setCroppedImage,
        loading,
        setSelectedFiles,
        selectedFiles,
        isHttpsMediaLink
    };
};

export default useMediaSelector;
