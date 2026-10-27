import { describe, expect, it } from 'vitest';

import { operationHowKind } from './operation-kinds';

describe('operation HOW routing', () => {
  it.each([
    ['G9', '', 'fuse'],
    ['G0', '', 'press-action'],
    ['G1', '', 'none'],
    ['G2', '', 'none'],
    ['G3', '', 'none'],
    ['G4', '', 'none'],
    ['G5', '', 'none'],
    ['G6', '', 'none'],
    ['G7', '', 'none'],
    ['G8', '', 'none'],
    ['A1', '', 'join'],
    ['A2', '', 'topstitch'],
    ['B1', '', 'bind'],
    ['A7', '', 'hem'],
    ['C1', '', 'buttonhole'],
    ['C2', '', 'button'],
    ['B3', '', 'zip'],
    ['C3', '', 'bartack'],
    ['B5', '', 'label'],
    ['B4', '', 'gather'],
  ] as const)('%s / %s routes to %s', (kind, work, expected) => {
    expect(operationHowKind(kind, work)).toBe(expected);
  });

  it('uses catalog-only work identity before a derived machine kind', () => {
    expect(operationHowKind('A1', 'moscow_hem')).toBe('hem');
    expect(operationHowKind('A1', 'hem_turned')).toBe('hem');
    expect(operationHowKind('A1', 'gather')).toBe('gather');
    expect(operationHowKind(undefined, 'ease_in')).toBe('gather');
  });

  it('keeps unlisted kinds out of HOW', () => {
    expect(operationHowKind('H1', 'print_transfer')).toBe('none');
    expect(operationHowKind(undefined, 'future_work')).toBe('none');
  });
});
