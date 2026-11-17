import { describe, expect, it, vi } from 'vitest';
import { entryModuleFromIndexHtml, probeForStaleBuild, staleRecoveryOf } from './stale-reload';

const base = {
  online: true,
  reloadedFromBuild: null,
  build: 'https://admin/assets/index-new.js',
  holdsWork: false,
  windowOpen: true,
};

describe('staleRecoveryOf', () => {
  it('reloads a clean tab', () => {
    expect(staleRecoveryOf(base)).toBe('reload');
  });

  it('never reloads over unsaved work: it asks', () => {
    expect(staleRecoveryOf({ ...base, holdsWork: true })).toBe('ask');
  });

  it('a second failure within seconds of a reload asks instead of looping', () => {
    expect(staleRecoveryOf({ ...base, windowOpen: false })).toBe('ask');
  });

  it('a reload that came back with this same build would bring nothing', () => {
    expect(staleRecoveryOf({ ...base, reloadedFromBuild: base.build })).toBe('none');
    expect(
      staleRecoveryOf({ ...base, reloadedFromBuild: 'https://admin/assets/index-old.js' }),
    ).toBe('reload');
  });

  it('a verified newer remote build can retry after the old build came back', () => {
    expect(
      staleRecoveryOf({
        ...base,
        reloadedFromBuild: base.build,
        remoteBuild: 'https://admin/assets/index-newer.js',
      }),
    ).toBe('reload');
    expect(
      staleRecoveryOf({
        ...base,
        reloadedFromBuild: base.build,
        remoteBuild: 'https://admin/assets/index-newer.js',
        windowOpen: false,
      }),
    ).toBe('ask');
  });

  it('offline: a reload would drop the page itself', () => {
    expect(staleRecoveryOf({ ...base, online: false })).toBe('none');
    expect(staleRecoveryOf({ ...base, online: false, holdsWork: true })).toBe('none');
  });
});

describe('entryModuleFromIndexHtml', () => {
  it('reads the module entry regardless of attribute order and resolves it against the response', () => {
    expect(
      entryModuleFromIndexHtml(
        '<script crossorigin src="/assets/index-new.js" type="module"></script>',
        'https://admin.beta.grbpwr.com/tech-cards/156',
      ),
    ).toBe('https://admin.beta.grbpwr.com/assets/index-new.js');
  });

  it('ignores classic scripts and malformed module URLs', () => {
    expect(
      entryModuleFromIndexHtml(
        '<script src="/classic.js"></script><script type="module" src="http://[bad"></script>',
        'https://admin.beta.grbpwr.com/',
      ),
    ).toBeNull();
  });
});

describe('probeForStaleBuild', () => {
  const currentEntry = 'https://admin.beta.grbpwr.com/assets/index-old.js';
  const indexUrl = 'https://admin.beta.grbpwr.com/';

  function response(entry: string, ok = true) {
    return {
      ok,
      url: indexUrl,
      text: async () => `<script type='module' src='${entry}'></script>`,
    };
  }

  it('runs the shared recovery when the deployed entry changed', async () => {
    const recover = vi.fn(() => 'reload' as const);
    await expect(
      probeForStaleBuild({
        online: true,
        currentEntry,
        indexUrl,
        fetchIndex: async () => response('/assets/index-new.js'),
        recover,
      }),
    ).resolves.toBe('reload');
    expect(recover).toHaveBeenCalledWith('https://admin.beta.grbpwr.com/assets/index-new.js');
  });

  it.each([
    ['same build', true, response('/assets/index-old.js')],
    ['offline', false, response('/assets/index-new.js')],
    ['failed response', true, response('/assets/index-new.js', false)],
  ])('does nothing for %s', async (_label, online, fetched) => {
    const recover = vi.fn(() => 'reload' as const);
    await expect(
      probeForStaleBuild({
        online,
        currentEntry,
        indexUrl,
        fetchIndex: async () => fetched,
        recover,
      }),
    ).resolves.toBe('none');
    expect(recover).not.toHaveBeenCalled();
  });

  it('fails closed on fetch and parsing errors', async () => {
    const recover = vi.fn(() => 'reload' as const);
    await expect(
      probeForStaleBuild({
        online: true,
        currentEntry,
        indexUrl,
        fetchIndex: async () => {
          throw new Error('network unavailable');
        },
        recover,
      }),
    ).resolves.toBe('none');
    expect(recover).not.toHaveBeenCalled();
  });
});
