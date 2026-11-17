import { describe, expect, it, vi } from 'vitest';
import type { common_Model } from 'api/proto-http/admin';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import {
  createSavedModelDisplayedTriangleBodySessionV2,
  buildCurrentSavedModelDisplayedTriangleBodyPairV2,
  parseSavedModelDisplayedIdentityIdV2,
  type SavedModelDisplayedTriangleBodyFreshReaderV2,
} from './saved-model-displayed-triangle-body-session-v2';
import {
  deferredSessionValue,
  sessionFixture,
} from './saved-model-displayed-triangle-body-session-v2.test-fixture';

describe('production-shaped displayed-body consumer session', () => {
  it('genuine dispatcher rejects fake/copied/proxy sessions without exposing a private saved owner to getters or methods', async () => {
    const session = createSavedModelDisplayedTriangleBodySessionV2(async () => null);
    const steal = vi.fn();
    const getter = vi.fn(() => steal);
    const fake = Object.defineProperty({}, 'buildCurrentSavedPlacementPair', {
      enumerable: true,
      get: getter,
    });
    const privateSavedOwner = Object.freeze({ opaquePrivateGarment: true });
    for (const input of [
      fake,
      { buildCurrentSavedPlacementPair: steal },
      { ...session },
      new Proxy(session, {}),
      null,
    ]) {
      expect(
        await buildCurrentSavedModelDisplayedTriangleBodyPairV2(input, privateSavedOwner),
      ).toMatchObject({ ok: false, owner: null, code: 'invalid-observed-body-session' });
    }
    expect(getter).not.toHaveBeenCalled();
    expect(steal).not.toHaveBeenCalled();
    expect(
      await buildCurrentSavedModelDisplayedTriangleBodyPairV2(session, privateSavedOwner),
    ).toMatchObject({ ok: false, code: 'observed-body-unbound' });
    session.dispose();
  });

  it('requires the entire literal id and rejects trailing line endings or whitespace', () => {
    expect(parseSavedModelDisplayedIdentityIdV2('tech-card-base-model:731')).toBe(731);
    for (const id of [
      'tech-card-base-model:731\n',
      'tech-card-base-model:731\r',
      'tech-card-base-model:731 ',
      ' tech-card-base-model:731',
    ])
      expect(parseSavedModelDisplayedIdentityIdV2(id)).toBeNull();
  });

  it.each(['replace', 'dispose'] as const)(
    'retains correct ownership during reentrant %s from abort listeners',
    async (kind) => {
      const first = await sessionFixture(731);
      const second = await sessionFixture(732);
      const wait = deferredSessionValue<common_Model | null>();
      const read = vi.fn<SavedModelDisplayedTriangleBodyFreshReaderV2>(async (id) =>
        id === 731 ? wait.promise : structuredClone(second.state.model),
      );
      const session = createSavedModelDisplayedTriangleBodySessionV2(read);
      const old = session.observe(first.input);
      const signal = read.mock.calls[0][1];
      let replacement: Promise<void> | null = null;
      signal.addEventListener('abort', () => {
        replacement = session.observe(second.input);
      });
      if (kind === 'replace') await session.observe(null);
      else session.dispose();
      await replacement;
      expect(session.getSnapshot().status).toBe(
        kind === 'replace' ? 'observed-body-bound' : 'disposed',
      );
      if (kind === 'replace') expect(session.getSnapshot().binding?.persistedModel.id).toBe(732);
      else expect(read).toHaveBeenCalledTimes(1);
      const snapshot = session.getSnapshot();
      wait.resolve(first.state.model);
      await old;
      expect(session.getSnapshot()).toBe(snapshot);
      expect(first.input.isCurrent()).toBe(true);
      expect(second.input.isCurrent()).toBe(true);
      session.dispose();
    },
  );

  it('binds a borrowed input after three independent saved-row reads and projects with two new reads', async () => {
    const f = await sessionFixture();
    const read = vi.fn<SavedModelDisplayedTriangleBodyFreshReaderV2>(async () =>
      structuredClone(f.state.model),
    );
    const session = createSavedModelDisplayedTriangleBodySessionV2(read);
    const initial = session.getSnapshot();
    expect(session.getSnapshot()).toBe(initial);
    const notify = vi.fn();
    session.subscribe(notify);
    await session.observe(f.input);
    const bound = session.getSnapshot();
    expect(bound).toMatchObject({
      status: 'observed-body-bound',
      generation: 1,
      runtimeAuthority: false,
      collisionAuthority: false,
    });
    expect(read).toHaveBeenCalledTimes(3);
    for (const call of read.mock.calls) expect(call[0]).toBe(731);
    expect(session.getSnapshot()).toBe(bound);
    await session.observe(f.input);
    expect(read).toHaveBeenCalledTimes(3);
    expect(session.getSnapshot()).toBe(bound);
    const body = await session.projectCurrentBody();
    expect(body.status).toBe('projected');
    expect(read).toHaveBeenCalledTimes(5);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(session).not.toHaveProperty('owner');
    expect(session).not.toHaveProperty('getOwner');
    session.dispose();
    expect(f.input.isCurrent()).toBe(true);
  });

  it.each([
    'tech-card-base-model:0',
    'tech-card-base-model:01',
    'tech-card-base-model:-1',
    'tech-card-base-model:1.2',
    'tech-card-base-model:1e3',
    '731',
    'tech-card-base-model:9007199254740992',
  ])('rejects nonexact saved identity %s without a network read', async (identity) => {
    expect(parseSavedModelDisplayedIdentityIdV2(identity)).toBeNull();
    const f = await sessionFixture(731, 0, identity);
    const read = vi.fn(async () => f.state.model);
    const session = createSavedModelDisplayedTriangleBodySessionV2(read);
    await session.observe(f.input);
    expect(read).not.toHaveBeenCalled();
    expect(session.getSnapshot().status).toBe('blocked');
  });

  it('rejects another module structural input without invoking its methods or reading cached model data', async () => {
    const input = { project: vi.fn(), isCurrent: vi.fn(() => true), dispose: vi.fn() };
    const read = vi.fn(async () => null);
    const session = createSavedModelDisplayedTriangleBodySessionV2(read);
    await session.observe(input as unknown as ModelDisplayedTriangleBodyOwnedInputV1);
    expect(session.getSnapshot()).toMatchObject({
      status: 'blocked',
      blocker: { code: 'genuine-displayed-input-required' },
    });
    expect(input.project).not.toHaveBeenCalled();
    expect(input.isCurrent).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it.each(['null', 'dispose', 'source-dispose', 'source-abort'] as const)(
    'revokes synchronously on %s during the first read; late completion never publishes',
    async (kind) => {
      const f = await sessionFixture();
      const wait = deferredSessionValue<common_Model | null>();
      const read = vi.fn<SavedModelDisplayedTriangleBodyFreshReaderV2>(() => wait.promise);
      const session = createSavedModelDisplayedTriangleBodySessionV2(read);
      const pending = session.observe(f.input);
      const signal = read.mock.calls[0][1];
      expect(session.getSnapshot().status).toBe('binding');
      if (kind === 'null') session.onDisplayedBodyInputV1(null);
      if (kind === 'dispose') session.dispose();
      if (kind === 'source-dispose') f.input.dispose();
      if (kind === 'source-abort') f.abort.abort();
      expect(signal.aborted).toBe(true);
      const revoked = session.getSnapshot();
      expect(revoked.status).not.toBe('observed-body-bound');
      wait.resolve(f.state.model);
      await pending;
      expect(session.getSnapshot()).toBe(revoked);
      if (kind === 'null' || kind === 'dispose') expect(f.input.isCurrent()).toBe(true);
    },
  );

  it('keeps replacement ownership when an older in-flight row returns', async () => {
    const first = await sessionFixture(731);
    const second = await sessionFixture(732);
    const wait = deferredSessionValue<common_Model | null>();
    const read = vi.fn(async (id: number) =>
      id === 731 ? wait.promise : structuredClone(second.state.model),
    );
    const session = createSavedModelDisplayedTriangleBodySessionV2(read);
    const old = session.observe(first.input);
    await session.observe(second.input);
    const latest = session.getSnapshot();
    expect(latest.binding?.persistedModel.id).toBe(732);
    wait.resolve(first.state.model);
    await old;
    expect(session.getSnapshot()).toBe(latest);
    expect(first.input.isCurrent()).toBe(true);
    expect(second.input.isCurrent()).toBe(true);
  });

  it.each(['updatedAt', 'form', 'wrong-id', 'missing'] as const)(
    'rejects %s drift after initial identity lookup',
    async (kind) => {
      const f = await sessionFixture();
      let count = 0;
      const read = vi.fn(async () => {
        if (++count === 2) {
          if (kind === 'updatedAt') f.state.model!.updatedAt = '2026-11-17T00:00:00.123457Z';
          if (kind === 'form') f.state.model!.model!.measurements![0].valueMm = 1730;
          if (kind === 'wrong-id') f.state.model!.id = 732;
          if (kind === 'missing') f.state.model = null;
        }
        return structuredClone(f.state.model);
      });
      const session = createSavedModelDisplayedTriangleBodySessionV2(read);
      await session.observe(f.input);
      expect(session.getSnapshot().status).toBe('blocked');
      expect(f.input.isCurrent()).toBe(true);
    },
  );

  it('fresh projection detects same-form updatedAt drift and clears the external-store binding', async () => {
    const f = await sessionFixture();
    const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
      structuredClone(f.state.model),
    );
    await session.observe(f.input);
    f.state.model!.updatedAt = '2026-11-17T00:00:00.123457Z';
    expect((await session.projectCurrentBody()).status).toBe('blocked');
    expect(session.getSnapshot()).toMatchObject({ status: 'blocked', binding: null });
  });

  it('caller read cancellation before admission preserves the shared observed body', async () => {
    const f = await sessionFixture();
    const read = vi.fn(async () => structuredClone(f.state.model));
    const session = createSavedModelDisplayedTriangleBodySessionV2(read);
    await session.observe(f.input);
    const bound = session.getSnapshot();
    const reads = read.mock.calls.length;
    const caller = new AbortController();
    caller.abort();
    expect((await session.projectCurrentBody(caller.signal)).status).toBe('blocked');
    expect(read).toHaveBeenCalledTimes(reads);
    expect(session.getSnapshot()).toBe(bound);
    expect((await session.projectCurrentBody()).status).toBe('projected');
    session.dispose();
  });

  it('caller read cancellation returns promptly and preserves the shared body through a late read', async () => {
    const f = await sessionFixture();
    const pending = deferredSessionValue<common_Model | null>();
    let hold = false;
    let pendingSignal: AbortSignal | null = null;
    const session = createSavedModelDisplayedTriangleBodySessionV2(async (_id, signal) => {
      if (hold) {
        hold = false;
        pendingSignal = signal;
        return pending.promise;
      }
      return structuredClone(f.state.model);
    });
    await session.observe(f.input);
    const bound = session.getSnapshot();
    hold = true;
    const caller = new AbortController();
    const reading = session.projectCurrentBody(caller.signal);
    caller.abort();
    expect((await reading).status).toBe('blocked');
    expect((pendingSignal as AbortSignal | null)?.aborted).toBe(false);
    expect(session.getSnapshot()).toBe(bound);
    pending.resolve(structuredClone(f.state.model));
    await Promise.resolve();
    expect((await session.projectCurrentBody()).status).toBe('projected');
    expect(session.getSnapshot()).toBe(bound);
    expect(f.input.isCurrent()).toBe(true);
    session.dispose();
  });

  it('handles reentrant null from store notification before any row read', async () => {
    const f = await sessionFixture();
    const read = vi.fn(async () => f.state.model);
    const session = createSavedModelDisplayedTriangleBodySessionV2(read);
    session.subscribe(() => {
      if (session.getSnapshot().status === 'binding') session.onDisplayedBodyInputV1(null);
    });
    await session.observe(f.input);
    expect(read).not.toHaveBeenCalled();
    expect(session.getSnapshot().status).toBe('idle');
    expect(f.input.isCurrent()).toBe(true);
  });

  it('a failed saved-placement handoff never exposes raw observed owner or admits runtime', async () => {
    const f = await sessionFixture();
    const session = createSavedModelDisplayedTriangleBodySessionV2(async () =>
      structuredClone(f.state.model),
    );
    await session.observe(f.input);
    const pair = await session.buildCurrentSavedPlacementPair({});
    expect(pair).toMatchObject({ ok: false, owner: null });
    expect(session.getSnapshot()).toMatchObject({
      status: 'observed-body-bound',
      runtimeAuthority: false,
      productionAuthority: false,
    });
    expect((await session.projectCurrentBody()).status).toBe('projected');
    session.dispose();
    expect(session.dispose()).toBe(false);
  });
});
