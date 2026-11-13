import { describe, expect, it } from 'vitest';
import { seamDeleteRetryKeys } from './reupload-session';

describe('U1 #3: a DXF seam delete retry asks the holders first', () => {
  it('sends only keys no step and no strip holds; the held ones leave the retry', () => {
    const plan = seamDeleteRetryKeys(['s-free', 's-step', 's-strip'], {
      operations: [{ seamKeys: ['s-step'] }],
      cutStrips: [{ seamKey: 's-strip' }],
    });
    expect(plan.send).toEqual(['s-free']);
    expect(plan.held).toEqual(['s-step', 's-strip']);
  });

  it('a pose link holds its row too', () => {
    const plan = seamDeleteRetryKeys(['p-1'], { operations: [{ poseKeys: ['p-1'] }] });
    expect(plan.send).toEqual([]);
    expect(plan.held).toEqual(['p-1']);
  });
});
