import type { QueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { AdminService, common_Model } from 'api/proto-http/admin';
import { modelKeys } from './useModelQuery';
import {
  createSavedModelDisplayedTriangleBodySessionV2,
  type SavedModelDisplayedTriangleBodyFreshReaderV2,
} from './saved-model-displayed-triangle-body-session-v2';

const abortGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function check(signal: AbortSignal): void {
  if (abortGetter.call(signal)) throw new DOMException('Fresh model read cancelled.', 'AbortError');
}
function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  check(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Fresh model read cancelled.', 'AbortError'));
    const cleanup = () => EventTarget.prototype.removeEventListener.call(signal, 'abort', abort);
    EventTarget.prototype.addEventListener.call(signal, 'abort', abort, { once: true });
    void promise.then(
      (value) => {
        cleanup();
        try {
          check(signal);
          resolve(value);
        } catch (error) {
          reject(error);
        }
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

/**
 * Reuses the app's detail query as the sole network/cache owner. A cached ListModels/detail row is
 * never authority. Pre-existing detail requests finish before this read starts its own fresh
 * GetModel fetch; consumer cancellation stops only its wait, never the shared query/transport.
 * Generated GetModel currently exposes no transport AbortSignal parameter.
 */
export function createSavedModelDisplayedTriangleBodyFreshQueryReaderV2(
  queryClient: QueryClient,
  service: Pick<AdminService, 'GetModel'> = adminService,
): SavedModelDisplayedTriangleBodyFreshReaderV2 {
  return async (id, signal): Promise<common_Model | null> => {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new TypeError('A positive saved model id is required.');
    check(signal);
    const queryKey = modelKeys.detail(id);
    for (;;) {
      check(signal);
      const prior = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!prior || prior.state.fetchStatus === 'idle') break;
      if (prior.state.fetchStatus === 'paused' || !prior.promise)
        throw new Error('The shared model detail lookup is paused or unavailable.');
      // A failed earlier request is not this read's result; retry through this new fresh lookup.
      try {
        await waitFor(prior.promise, signal);
      } catch {
        check(signal);
      }
    }
    check(signal);
    const fresh = queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        const model = (await service.GetModel({ id })).model;
        if (!model) throw new Error('GetModel returned no persisted model row.');
        return model;
      },
      staleTime: 0,
      retry: false,
    });
    const row = await waitFor(fresh, signal);
    check(signal);
    return row ?? null;
  };
}

/** Production composition; callers supply the existing app QueryClient, never a second client. */
export function createSavedModelDisplayedTriangleBodyQuerySessionV2(
  queryClient: QueryClient,
  service: Pick<AdminService, 'GetModel'> = adminService,
) {
  return createSavedModelDisplayedTriangleBodySessionV2(
    createSavedModelDisplayedTriangleBodyFreshQueryReaderV2(queryClient, service),
  );
}
