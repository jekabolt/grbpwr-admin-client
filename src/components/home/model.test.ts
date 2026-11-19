import { describe, expect, it } from 'vitest';
import { agoWord, dueWord, fittingWhen, inNextWeek, sortOpenTasks, visibleBlocks } from './model';

const all = () => true;

describe('visibleBlocks', () => {
  it('shows every block when the team has the features and the person reads the sections', () => {
    expect([...visibleBlocks(all, all)]).toEqual(['tasks', 'fittings', 'production', 'files']);
  });

  it('hides a block whose team feature is off', () => {
    const on = (f: string) => f !== 'fittings' && f !== 'files';
    expect([...visibleBlocks(on, all)]).toEqual(['tasks', 'production']);
  });

  it('hides a block whose section the person cannot read', () => {
    const can = (s: string) => s !== 'production';
    expect([...visibleBlocks(all, can)]).toEqual(['tasks', 'fittings', 'files']);
  });

  it('needs both: feature on and read right', () => {
    const on = (f: string) => f === 'tasks' || f === 'files';
    const can = (s: string) => s === 'files' || s === 'fittings';
    expect([...visibleBlocks(on, can)]).toEqual(['files']);
  });

  it('is empty when nothing is allowed', () => {
    expect(visibleBlocks(all, () => false).size).toBe(0);
  });
});

describe('date words', () => {
  const now = new Date(2026, 10, 19, 15, 0); // thu nov 19, 15:00 local

  it('due: today ink, past red, later grey, none a dash', () => {
    expect(dueWord(new Date(2026, 10, 19, 9).toISOString(), now)).toEqual({
      text: 'today',
      tone: 'ink',
    });
    expect(dueWord(new Date(2026, 10, 18).toISOString(), now)).toEqual({
      text: 'nov 18',
      tone: 'warn',
    });
    expect(dueWord(new Date(2026, 10, 25).toISOString(), now)).toEqual({
      text: 'nov 25',
      tone: 'mut',
    });
    expect(dueWord(undefined, now)).toEqual({ text: '—', tone: 'mut' });
    expect(dueWord('0001-01-01T00:00:00Z', now)).toEqual({ text: '—', tone: 'mut' });
  });

  it('fittings: the next seven days from today', () => {
    expect(inNextWeek(new Date(2026, 10, 19, 11).toISOString(), now)).toBe(true);
    expect(inNextWeek(new Date(2026, 10, 25).toISOString(), now)).toBe(true);
    expect(inNextWeek(new Date(2026, 10, 26).toISOString(), now)).toBe(false);
    expect(inNextWeek(new Date(2026, 10, 18).toISOString(), now)).toBe(false);
  });

  it('fitting time: weekday + time, or weekday + day without a time', () => {
    expect(fittingWhen(new Date(2026, 10, 19, 11, 0).toISOString())).toBe('thu 11:00');
    expect(fittingWhen(new Date(2026, 10, 24).toISOString())).toBe('tue 24');
  });

  it('ago: minutes, hours, yesterday, weekday, date', () => {
    expect(agoWord(new Date(2026, 10, 19, 13, 0).toISOString(), now)).toBe('2h');
    expect(agoWord(new Date(2026, 10, 18, 9).toISOString(), now)).toBe('yesterday');
    expect(agoWord(new Date(2026, 10, 16, 9).toISOString(), now)).toBe('mon');
    expect(agoWord(new Date(2026, 10, 2).toISOString(), now)).toBe('nov 2');
  });
});

describe('sortOpenTasks', () => {
  it('drops done tasks and orders by due date, undated last', () => {
    const t = (id: number, status: string, dueDate?: string) => ({ id, status, task: { dueDate } });
    const out = sortOpenTasks([
      t(1, 'TASK_STATUS_TODO'),
      t(2, 'TASK_STATUS_DONE', '2026-11-01T00:00:00Z'),
      t(3, 'TASK_STATUS_REVIEW', '2026-11-25T00:00:00Z'),
      t(4, 'TASK_STATUS_IN_PROGRESS', '2026-11-18T00:00:00Z'),
    ]);
    expect(out.map((x) => x.id)).toEqual([4, 3, 1]);
  });
});
