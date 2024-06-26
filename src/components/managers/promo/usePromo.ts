import { addPromo, getPromo } from "api/promo";
import { common_PromoCode, common_PromoCodeInsert } from "api/proto-http/admin";
import { useCallback, useState } from "react";

const usePromo = (initialIsLoading = false, initialHasMore = true): {
    promos: common_PromoCode[];
    snackBarMessage: string;
    snackBarSeverity: 'success' | 'error';
    isSnackBarOpen: boolean;
    fetchPromos: (limit: number, offset: number) => void
    createNewPromo: (newPromo: common_PromoCodeInsert) => void
    setIsSnackBarOpen: (value: boolean) => void;
    showMessage: (message: string, severity: 'success' | 'error') => void;
} => {
    const [promos, setPromos] = useState<common_PromoCode[]>([])
    const [isLoading, setIsLoading] = useState<boolean>(initialIsLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
    const [snackBarMessage, setSnackBarMessage] = useState<string>('');
    const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
    const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

    const showMessage = (message: string, severity: 'success' | 'error') => {
        setSnackBarMessage(message);
        setSnackBarSeverity(severity);
        setIsSnackBarOpen(true);
    };

    const fetchPromos = useCallback(async (limit: number, startOffset: number) => {
        setIsLoading(true)
        const response = await getPromo({
            limit,
            offset: startOffset,
            orderFactor: 'ORDER_FACTOR_DESC'
        })
        const fetchedPromo = response.promoCodes || [];
        setPromos((prev) => (startOffset === 0 ? fetchedPromo : [...prev, ...fetchedPromo]));
        setIsLoading(false);
        setHasMore(fetchPromos.length === limit)
    }, [])

    const createNewPromo = useCallback(async (newPromo: common_PromoCodeInsert) => {
        // if (promos.some(promo => promo.promoCodeInsert?.code === newPromo.code)) {
        //     showMessage('PROMO ALREADY EXIST IN THE LIST', 'error')
        //     return
        // }
        try {
            await addPromo({ promo: newPromo })
            showMessage('PROMO CREATED', 'success');
        } catch (e) {
            showMessage('PROMO CAN\'T BE CREATED', 'error')
        }
    }, [promos])


    return {
        promos,
        snackBarMessage,
        snackBarSeverity,
        isSnackBarOpen,
        fetchPromos,
        createNewPromo,
        setIsSnackBarOpen,
        showMessage
    }
}

export default usePromo