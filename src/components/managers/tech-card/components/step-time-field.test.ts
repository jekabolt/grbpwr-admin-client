import { describe, expect, it } from 'vitest';
import { steppedTime } from './step-time-field';

describe('steppedTime', () => {
  it('starts an empty tolerance from its default', () => {
    expect(steppedTime('', -1, 1)).toBe('0');
    expect(steppedTime('', 1, 1)).toBe('2');
    expect(steppedTime('0', -1, 1)).toBe('0');
  });

  it('steps by the delta in the same string form', () => {
    expect(steppedTime('1.2', 0.1)).toBe('1.3');
    expect(steppedTime('1.2', -0.1)).toBe('1.1');
    expect(steppedTime('1.2', 1)).toBe('2.2');
    expect(steppedTime('0.2', 0.1)).toBe('0.3');
    expect(steppedTime('0.25', 0.1)).toBe('0.35');
  });

  it('never goes below zero', () => {
    expect(steppedTime('0.1', -0.1)).toBe('0');
    expect(steppedTime('0.5', -1)).toBe('0');
    expect(steppedTime('0', -0.1)).toBe('0');
  });

  it('starts an empty field from zero going up and leaves it empty going down', () => {
    expect(steppedTime('', 0.1)).toBe('0.1');
    expect(steppedTime(undefined, 1)).toBe('1');
    expect(steppedTime('', -0.1)).toBe('');
  });

  it('reads a comma as a point', () => {
    expect(steppedTime('1,5', 0.1)).toBe('1.6');
  });
});
