import {
    uploadContentImage,
    uploadContentVideo
} from 'api/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { checkIsHttpHttpsMediaLink } from './checkIsHttpHttpsLink';
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
    selectedFiles: File[];
    url: string;
    selectedFileUrl: string;
    croppedImage: string | null,
    filterByType: string;
    sortByDate: string;
    loading: boolean,
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    setSelectedFiles: Dispatch<SetStateAction<File[]>>;
    handleMediaUpload: () => Promise<void>
    setFilterByType: React.Dispatch<React.SetStateAction<string>>;
    setSortByDate: React.Dispatch<React.SetStateAction<string>>;
    setSelectedFileUrl: (url: string) => void;
    setCroppedImage: (img: string | null) => void;
} => {
    const { showMessage } = useSnackBarStore();
    const [url, setUrl] = useState<string>('');
    const [filterByType, setFilterByType] = useState('');
    const [sortByDate, setSortByDate] = useState('desc');
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [croppedImage, setCroppedImage] = useState<string | null>(null);
    const [selectedFileUrl, setSelectedFileUrl] = useState<string>('');

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
    }, [url, croppedImage, selectedFiles]);


    return {
        selectedFiles,
        url,
        selectedFileUrl,
        croppedImage,
        filterByType,
        sortByDate,
        loading,
        setUrl,
        setFilterByType,
        setSortByDate,
        setSelectedFileUrl,
        setCroppedImage,
        setSelectedFiles,
        handleMediaUpload
    };
};

export default useMediaSelector;
