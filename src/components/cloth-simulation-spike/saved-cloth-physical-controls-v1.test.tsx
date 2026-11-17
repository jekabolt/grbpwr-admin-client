import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { SavedClothPhysicalControlsV1 } from './saved-cloth-physical-controls-v1';

// Presentation-only SSR. Effect ownership and actual private handoff have separate tests.
vi.mock('ui', () => ({
  GroupLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children, role }: { children: ReactNode; role?: string }) => (
    <span role={role}>{children}</span>
  ),
  Select: ({
    items,
    value,
    disabled,
  }: {
    items: { value: string; label: string }[];
    value: string;
    disabled: boolean;
  }) => (
    <select defaultValue={value} disabled={disabled}>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  ),
}));
type Props = ComponentProps<typeof SavedClothPhysicalControlsV1>;
const row: NonNullable<Props['row']> = {
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern:main',
  revision: 7,
  cardLockVersion: 19,
  url: 'https://example.test/pattern.dxf',
  sizeBytes: 2048,
  sha256: 'a'.repeat(64),
};
function host(patch: Partial<Props['host']> = {}): Props['host'] {
  return {
    profile: '',
    setProfile: vi.fn(),
    bodySession: null,
    onDisplayedBodyInputV1: vi.fn(),
    selected: null,
    sourceStatus: 'idle',
    sourceError: null,
    ...patch,
  };
}
describe('explicit cloth profile before source handoff', () => {
  it('starts with no implicit canonical or personalized source', () => {
    const state = host();
    const html = renderToStaticMarkup(<SavedClothPhysicalControlsV1 host={state} row={row} />);
    expect(html).toContain('value="" selected=""');
    expect(html).toContain('Selected saved mannequin');
    expect(html).toContain('Canonical reference mannequin');
    expect(html).not.toContain('disabled=""');
    expect(state.setProfile).not.toHaveBeenCalled();
  });
  it('leaves mannequin viewing available when the assembly is not qualified', () => {
    const html = renderToStaticMarkup(<SavedClothPhysicalControlsV1 host={host()} row={null} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('You can still view the mannequin.');
    expect(html).not.toContain('Simulate 16 / 32');
  });
  it('shows source loading or failure without fabricating a compiled selection', () => {
    const loading = renderToStaticMarkup(
      <SavedClothPhysicalControlsV1
        host={host({ profile: 'observed-saved-model', sourceStatus: 'loading' })}
        row={row}
      />,
    );
    expect(loading).toContain('Preparing cloth source');
    const blocked = renderToStaticMarkup(
      <SavedClothPhysicalControlsV1
        host={host({
          profile: 'observed-saved-model',
          sourceStatus: 'blocked',
          sourceError: 'Cloth module could not load.',
        })}
        row={row}
      />,
    );
    expect(blocked).toContain('role="alert"');
    expect(blocked).toContain('Cloth module could not load.');
    expect(blocked).not.toContain('Preparing cloth source');
  });
});
