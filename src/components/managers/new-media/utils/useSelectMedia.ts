import { common_MediaFull } from 'api/proto-http/admin';
import { useState } from 'react';

interface UseSelectionProps {
    allowMultiple?: boolean;
    disabled?: boolean;
    onSelectionChange?: (items: common_MediaFull[]) => void;
}

export function useSelection({
    allowMultiple = true,
    disabled = false,
    onSelectionChange
}: UseSelectionProps = {}) {
    const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);

    const selectMedia = (media: common_MediaFull) => {
        if (disabled) return;

        setSelectedMedia(prev => {
            const newSelection = allowMultiple
                ? [...prev, media]
                : [media];

            onSelectionChange?.(newSelection);
            return newSelection;
        });
    };

    const deselectMedia = (mediaId: number) => {
        if (disabled) return;

        setSelectedMedia(prev => {
            const newSelection = prev.filter(item => item.id !== mediaId);
            onSelectionChange?.(newSelection);
            return newSelection;
        });
    };

    const toggleMedia = (media: common_MediaFull) => {
        if (disabled) return;

        const isSelected = selectedMedia.some(item => item.id === media.id);

        if (isSelected) {
            deselectMedia(media.id || 0);
        } else {
            if (allowMultiple) {
                selectMedia(media);
            } else {
                setSelectedMedia([media]);
                onSelectionChange?.([media]);
            }
        }
    };

    const isSelected = (mediaId: number) => {
        return selectedMedia.some(item => item.id === mediaId);
    };

    return {
        selectedMedia,
        selectMedia,
        toggleMedia,
        isSelected,
    };
} 