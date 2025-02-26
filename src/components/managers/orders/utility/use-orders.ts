import { getOrdersList } from "api/orders";
import { common_Order } from "api/proto-http/admin";
import { useState } from "react";
import { SearchFilters } from "../interfaces/interface";

export const useOrders = () => {
    const [rows, setRows] = useState<common_Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const pageSize = 1;
    const [loadMoreVisible, setLoadMoreVisible] = useState(true);
    const [currentFilters, setCurrentFilters] = useState<SearchFilters>({
        status: undefined,
        paymentMethod: undefined,
        orderId: undefined,
        email: undefined,
    });

    const newSearch = async (filters: SearchFilters) => {
        setCurrentFilters(filters);
        setPage(1);
        setLoading(true);
        try {
            const response = await getOrdersList({
                offset: 0,
                limit: pageSize,
                status: filters.status,
                orderId: Number(filters.orderId) || undefined,
                email: filters.email,
                paymentMethod: filters.paymentMethod,
                orderFactor: 'ORDER_FACTOR_DESC',
            });
            if (!response.orders || response.orders.length === 0) {
                setLoadMoreVisible(false);
                setRows([]);
            } else {
                setRows(response.orders!);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMore = async () => {
        const offset = page * pageSize;
        setLoading(true);
        try {
            const response = await getOrdersList({
                offset: offset,
                limit: pageSize,
                status: currentFilters.status,
                orderId: Number(currentFilters.orderId) || undefined,
                email: currentFilters.email,
                paymentMethod: currentFilters.paymentMethod,
                orderFactor: 'ORDER_FACTOR_DESC',
            });
            if (!response.orders || response.orders.length === 0) {
                setLoadMoreVisible(false);
            } else {
                setRows((currentRows) => [...currentRows, ...response.orders!]);
                setPage((currentPage) => currentPage + 1);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    return {
        rows,
        loading,
        loadMoreVisible,
        newSearch,
        loadMore,
    };
}
