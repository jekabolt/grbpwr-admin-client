import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { modelKeys } from './useModelQuery';
import {
  createSavedModelDisplayedTriangleBodyFreshQueryReaderV2,
  createSavedModelDisplayedTriangleBodyQuerySessionV2,
} from './saved-model-displayed-triangle-body-query-session-v2';
import {
  deferredSessionValue,
  sessionFixture,
  sessionModelRow,
} from './saved-model-displayed-triangle-body-session-v2.test-fixture';
import type { GetModelResponse } from 'api/proto-http/admin';

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
}
describe('fresh displayed-body reader using existing model detail query ownership', () => {
  it('bypasses cached detail and ListModels rows and updates the same existing key on every read', async () => {
    const query = client();
    const stale = sessionModelRow();
    const fresh = { ...stale, updatedAt: '2026-11-17T00:00:00.999999Z' };
    query.setQueryData(modelKeys.detail(731), stale);
    query.setQueryData([...modelKeys.lists(), 'all', 500], [stale]);
    const service = { GetModel: vi.fn(async () => ({ model: structuredClone(fresh) })) };
    const read = createSavedModelDisplayedTriangleBodyFreshQueryReaderV2(query, service);
    const signal = new AbortController().signal;
    expect(await read(731, signal)).toEqual(fresh);
    expect(await read(731, signal)).toEqual(fresh);
    expect(service.GetModel).toHaveBeenCalledTimes(2);
    expect(service.GetModel).toHaveBeenLastCalledWith({ id: 731 });
    expect(query.getQueryData(modelKeys.detail(731))).toEqual(fresh);
    expect(query.getQueryCache().findAll({ queryKey: modelKeys.details() })).toHaveLength(1);
    query.clear();
  });

  it('waits for a pre-existing request then starts a separate fresh GetModel without cancelling it', async () => {
    const query = client();
    const old = deferredSessionValue<ReturnType<typeof sessionModelRow>>();
    const prior = query.fetchQuery({ queryKey: modelKeys.detail(731), queryFn: () => old.promise });
    const fresh = { ...sessionModelRow(), updatedAt: 'new-exact-wire-revision' };
    const service = { GetModel: vi.fn(async () => ({ model: fresh })) };
    const cancel = vi.spyOn(query, 'cancelQueries');
    const pending = createSavedModelDisplayedTriangleBodyFreshQueryReaderV2(query, service)(
      731,
      new AbortController().signal,
    );
    expect(service.GetModel).not.toHaveBeenCalled();
    old.resolve(sessionModelRow());
    await prior;
    expect(await pending).toBe(fresh);
    expect(service.GetModel).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    query.clear();
  });

  it.each(['before', 'in-flight'] as const)(
    'aborts the consumer %s while leaving shared query ownership intact',
    async (when) => {
      const query = client();
      const wait = deferredSessionValue<GetModelResponse>();
      const controller = new AbortController();
      const service = { GetModel: vi.fn(() => wait.promise) };
      const cancel = vi.spyOn(query, 'cancelQueries');
      if (when === 'before') controller.abort();
      const read = createSavedModelDisplayedTriangleBodyFreshQueryReaderV2(query, service);
      const pending = read(731, controller.signal);
      if (when === 'in-flight') controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(cancel).not.toHaveBeenCalled();
      expect(service.GetModel).toHaveBeenCalledTimes(when === 'before' ? 0 : 1);
      wait.resolve({ model: sessionModelRow() });
      if (when === 'in-flight')
        await query.getQueryCache().find({ queryKey: modelKeys.detail(731) })!.promise;
      query.clear();
    },
  );

  it('rejects network failures and absent rows without falling back to cached data', async () => {
    const query = client();
    query.setQueryData(modelKeys.detail(731), sessionModelRow());
    const service = {
      GetModel: vi
        .fn<() => Promise<GetModelResponse>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ model: undefined }),
    };
    const read = createSavedModelDisplayedTriangleBodyFreshQueryReaderV2(query, service);
    await expect(read(731, new AbortController().signal)).rejects.toThrow('offline');
    await expect(read(731, new AbortController().signal)).rejects.toThrow('no persisted model');
    query.clear();
  });

  it('production composition consumes genuine callback and fresh GetModel, then revokes immediately on null', async () => {
    const f = await sessionFixture();
    const query = client();
    query.setQueryData(modelKeys.detail(731), {
      ...f.state.model,
      updatedAt: 'stale-cached-revision',
    });
    const service = { GetModel: vi.fn(async () => ({ model: structuredClone(f.state.model!) })) };
    const session = createSavedModelDisplayedTriangleBodyQuerySessionV2(query, service);
    await session.observe(f.input);
    expect(session.getSnapshot()).toMatchObject({
      status: 'observed-body-bound',
      runtimeAuthority: false,
    });
    expect(service.GetModel).toHaveBeenCalledTimes(3);
    session.onDisplayedBodyInputV1(null);
    expect(session.getSnapshot()).toMatchObject({ status: 'idle', binding: null });
    expect(f.input.isCurrent()).toBe(true);
    session.dispose();
    query.clear();
  });
});
