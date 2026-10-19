import { adminService } from 'api/api';
import type { RefundReason } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { notify } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { getOrderStatusName } from '../orders-catalog/components/utility';
import { OrderDetailsState } from './interface';

export const useOrderDetails = (uuid: string) => {
  const { dictionary } = useDictionary();
  const [state, setState] = useState<OrderDetailsState>({
    orderDetails: undefined,
    stripeDetails: undefined,
    dictionary: undefined,
    orderStatus: undefined,
    isLoading: false,
  });

  const [isPrinting, setIsPrinting] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [selectedUnitKeys, setSelectedUnitKeys] = useState<string[]>([]);

  // MONEY PATH: only the feedback changed here. Errors go to the inbox with the order on them;
  // writes get no retry action (a lost response may still have landed). Receipts: the status,
  // the cost and the tracking code on the page.
  const orderSubject = () => `ORDER ${state.orderDetails?.order?.id ?? uuid.slice(0, 8)}`;
  const failed = (text: string, error: unknown, fallback: string, retry?: () => void) =>
    notify({
      sev: 'error',
      subject: orderSubject(),
      text,
      detail: error instanceof Error ? error.message : fallback,
      action: retry ? { label: 'retry', onClick: retry } : undefined,
    });

  async function fetchOrderDetails() {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const order = await adminService.GetOrderByUUID({ orderUuid: uuid });
      setState((prev) => ({
        ...prev,
        orderDetails: order.order,
        stripeDetails: order.stripeDetails,
        dictionary: dictionary,
        orderStatus: getOrderStatusName(dictionary, order.order?.order?.orderStatusId),
      }));
    } catch (error) {
      failed('not loaded', error, 'Error fetching order details', () => void fetchOrderDetails());
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
      failed('tracking not saved', error, 'Failed to save tracking number');
    }
  };

  // Record the real carrier invoice (and optional return leg) so contribution margin
  // uses actual logistics instead of the quoted rate. Write-only — the contract does
  // not surface the stored value back on the order.
  async function setShipmentActualCost(actualCost: string, returnShippingCost?: string) {
    const orderUuid = state.orderDetails?.order?.uuid;
    if (!orderUuid) return false;
    try {
      await adminService.SetShipmentActualCost({
        orderUuid,
        actualCost: { value: actualCost.trim() },
        returnShippingCost: returnShippingCost?.trim()
          ? { value: returnShippingCost.trim() }
          : undefined,
      });
      return true;
    } catch (error) {
      failed('cost not saved', error, 'Failed to record shipping cost');
      return false;
    }
  }

  // Confirmation now lives in the order header's ConfirmationModal (ordActions v2), so
  // this is a direct write — no window.confirm, which the redesign has no vocabulary for.
  async function markAsDelivered() {
    try {
      await adminService.DeliveredOrder({
        orderUuid: state.orderDetails?.order?.uuid,
      });
      fetchOrderDetails();
    } catch (error) {
      failed('not delivered', error, 'Failed to mark as delivered');
    }
  }

  // Pre-fulfilment escape hatch — releases reserved stock and stops fulfilment. Confirmed
  // in the header modal; does NOT move money (a paid order is refunded, not cancelled).
  async function cancelOrder() {
    try {
      await adminService.CancelOrder({
        orderUuid: state.orderDetails?.order?.uuid,
      });
      fetchOrderDetails();
    } catch (error) {
      failed('not cancelled', error, 'Failed to cancel order');
    }
  }

  async function refundOrder(payload: {
    reason: string;
    refundShipping?: boolean;
    reasonCode?: RefundReason;
    disposition?: string;
  }) {
    try {
      const isPartial = selectedUnitKeys.length > 0;
      // One order_item id per selected unit (duplicates encode quantity — e.g. refund 1 of 2).
      const orderItemIds = isPartial
        ? selectedUnitKeys
            .map((k) => parseInt(k.split('-')[0], 10))
            .filter((id) => !Number.isNaN(id))
        : [];
      await adminService.RefundOrder({
        orderUuid: state.orderDetails?.order?.uuid,
        orderItemIds: orderItemIds.length ? orderItemIds : [],
        reason: payload.reason || undefined,
        // Structured code drives the return-analysis breakdown; free-text reason is the audit note.
        reasonCode: payload.reasonCode ?? 'REFUND_REASON_UNSPECIFIED',
        // What happens to the returned units (Phase 8): '' = restock; writeoff = consumed (COGS
        // stays expensed); seconds = B-grade restock at zero cost.
        disposition: payload.disposition ?? '',
        // Sent on FULL refunds too, not just partial ones: the backend reads the flag for a full
        // refund of any shipped status (delivered / pending return / refund in progress /
        // partially refunded) and only overrides it to true for a not-yet-shipped CONFIRMED
        // order. Omitting it silently dropped the shipping fee the modal had promised.
        refundShipping: payload.refundShipping ?? false,
      });
      fetchOrderDetails();
      setSelectedUnitKeys([]);
    } catch (error) {
      failed('not refunded', error, 'Failed to refund order');
    }
  }

  const toggleOrderItemsSelection = (unitKeys: string[]) => {
    if (!unitKeys.length) return;

    setSelectedUnitKeys((prev) => {
      const allSelected = unitKeys.every((k) => prev.includes(k));

      if (allSelected) {
        return prev.filter((k) => !unitKeys.includes(k));
      }

      const next = [...prev];
      unitKeys.forEach((k) => {
        if (!next.includes(k)) {
          next.push(k);
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
    selectedUnitKeys,
    saveTrackingNumber,
    toggleTrackNumber,
    handleTrackingNumberChange,
    markAsDelivered,
    cancelOrder,
    refundOrder,
    setShipmentActualCost,
    toggleOrderItemsSelection,
  };
};
