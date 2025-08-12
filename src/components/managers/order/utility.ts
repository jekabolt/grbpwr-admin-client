// import { deliveredOrderUpdate, getOrderByUUID, refundOrderUpdate, setTrackingNumberUpdate } from "api/orders";
import { adminService } from "api/api";
import { useDictionaryStore } from "lib/stores/store";
import { useEffect, useState } from "react";
import { getOrderStatusName } from "../orders-catalog/components/utility";
import { OrderDetailsState } from "./interface";


export const useOrderDetails = (uuid: string) => {
    const { dictionary } = useDictionaryStore();
    const [state, setState] = useState<OrderDetailsState>({
        orderDetails: undefined,
        dictionary: undefined,
        orderStatus: undefined,
        isLoading: false,
    });

    const [isPrinting, setIsPrinting] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [trackingNumber, setTrackingNumber] = useState('');

    async function fetchOrderDetails() {
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            const order = await adminService.GetOrderByUUID({ orderUuid: uuid });
            setState(prev => ({
                ...prev,
                orderDetails: order.order,
                dictionary: dictionary,
                orderStatus: getOrderStatusName(dictionary, order.order?.order?.orderStatusId)
            }))
        } catch (error) {
            console.error('Error fetching order details:', error);
        } finally {
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }

    useEffect(() => {
        fetchOrderDetails()
    }, [uuid, dictionary])

    useEffect(() => {
        const beforePrint = () => setIsPrinting(true);
        const afterPrint = () => setIsPrinting(false);

        window.addEventListener('beforeprint', beforePrint);
        window.addEventListener('afterprint', afterPrint);

        return () => {
            window.removeEventListener('beforeprint', beforePrint);
            window.removeEventListener('afterprint', afterPrint);
        };
    }, []);

    const toggleTrackNumber = () => {
        if (!isPrinting && state.orderStatus === 'SHIPPED') {
            setIsEdit(!isEdit);
            if (isEdit) {
                setTrackingNumber(state.orderDetails?.shipment?.trackingCode || '');
            }
        }
    };

    function handleTrackingNumberChange(event: any) {
        setTrackingNumber(event.target.value);
    }

    const saveTrackingNumber = async () => {
        if (!trackingNumber.trim()) {
            setIsEdit(false);
            return;
        }
        const response = await adminService.SetTrackingNumber({
            orderUuid: state.orderDetails?.order?.uuid,
            trackingCode: trackingNumber,
        });
        if (response) {
            fetchOrderDetails();
            setIsEdit(false);
        }
    };

    async function markAsDelivered() {
        const response = await adminService.DeliveredOrder({
            orderUuid: state.orderDetails?.order?.uuid,
        });
        if (response) {
            fetchOrderDetails();
        }
    }

    async function refundOrder() {
        const response = await adminService.RefundOrder({
            orderUuid: state.orderDetails?.order?.uuid,
        });
        if (response) {
            fetchOrderDetails();
        }
    }

    return {
        ...state,
        isPrinting,
        isEdit,
        trackingNumber,
        saveTrackingNumber,
        toggleTrackNumber,
        handleTrackingNumberChange,
        markAsDelivered,
        refundOrder,
    }
}