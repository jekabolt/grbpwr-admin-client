import { addPromo, getPromo } from "api/promo";
import { common_PromoCode, common_PromoCodeInsert } from "api/proto-http/admin";
import { useSnackBarStore } from "lib/stores/store";
import { useCallback, useState } from "react";

const usePromo = (initialIsLoading = false, initialHasMore = true): {
    promos: common_PromoCode[];
    fetchPromos: (limit: number, offset: number) => void
    createNewPromo: (newPromo: common_PromoCodeInsert) => void
} => {
    const { showMessage } = useSnackBarStore();
    const [promos, setPromos] = useState<common_PromoCode[]>([])
    const [isLoading, setIsLoading] = useState<boolean>(initialIsLoading);
    const [hasMore, setHasMore] = useState<boolean>(initialHasMore);

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

        try {
            await addPromo({ promo: newPromo })
            showMessage('PROMO CREATED', 'success');
            fetchPromos(50, 0)
        } catch (error) {
            showMessage(`${(error as Error).message}`, 'error');
        }
    }, [promos])


    return {
        promos,
        fetchPromos,
        createNewPromo,
    }
}

export default usePromo