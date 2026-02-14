import { adminService } from 'api/api';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { getOrderStatusName } from '../orders-catalog/components/utility';
import { OrderDetailsState } from './interface';

export const useOrderDetails = (uuid: string) => {
  const { dictionary } = useDictionary();
  const showMessage = useSnackBarStore((state) => state.showMessage);
  const [state, setState] = useState<OrderDetailsState>({
    orderDetails: undefined,
    dictionary: undefined,
    orderStatus: undefined,
    isLoading: false,
  });

  const [isPrinting, setIsPrinting] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

  async function fetchOrderDetails() {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const order = await adminService.GetOrderByUUID({ orderUuid: uuid });
      setState((prev) => ({
        ...prev,
        orderDetails: order.order,
        dictionary: dictionary,
        orderStatus: getOrderStatusName(dictionary, order.order?.order?.orderStatusId),
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error fetching order details';
      showMessage(msg, 'error');
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }

  useEffect(() => {
    fetchOrderDetails();
  }, [uuid, dictionary]);

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
    try {
      await adminService.SetTrackingNumber({
        orderUuid: state.orderDetails?.order?.uuid,
        trackingCode: trackingNumber,
      });
      fetchOrderDetails();
      setIsEdit(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save tracking number';
      showMessage(msg, 'error');
    }
  };

  async function markAsDelivered() {
    const confirmed = window.confirm('Are you sure you want to mark this order as delivered?');
    if (!confirmed) return;

    try {
      await adminService.DeliveredOrder({
        orderUuid: state.orderDetails?.order?.uuid,
      });
      fetchOrderDetails();
      showMessage('Order marked as delivered successfully', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to mark as delivered';
      showMessage(msg, 'error');
    }
  }

  async function refundOrder() {
    const confirmed = window.confirm('Are you sure you want to full refund this order?');
    if (!confirmed) return;

    try {
      await adminService.RefundOrder({
        orderUuid: state.orderDetails?.order?.uuid,
        orderItemIds: selectedProductIds.length ? selectedProductIds : [],
      });
      fetchOrderDetails();
      setSelectedProductIds([]);
      showMessage('Order refunded successfully', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to refund order';
      showMessage(msg, 'error');
    }
  }

  const toggleOrderItemsSelection = (productIds: number[]) => {
    if (!productIds.length) return;

    setSelectedProductIds((prev) => {
      const allSelected = productIds.every((id) => prev.includes(id));

      if (allSelected) {
        return prev.filter((id) => !productIds.includes(id));
      }

      const next = [...prev];
      productIds.forEach((id) => {
        if (!next.includes(id)) {
          next.push(id);
        }
      });

      return next;
    });
  };

  return {
    ...state,
    isPrinting,
    isEdit,
    trackingNumber,
    selectedProductIds,
    saveTrackingNumber,
    toggleTrackNumber,
    handleTrackingNumberChange,
    markAsDelivered,
    refundOrder,
    toggleOrderItemsSelection,
  };
};
