import { getPromo } from "api/promo";
import { common_PromoCode } from "api/proto-http/admin";
import { useCallback, useState } from "react";

const usePromo = (initialIsLoading = false, initialHasMore = true): {
    promos: common_PromoCode[];
    fetchPromos: (limit: number, offset: number) => void
} => {
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


    return {
        promos,
        fetchPromos
    }
}

export default usePromo