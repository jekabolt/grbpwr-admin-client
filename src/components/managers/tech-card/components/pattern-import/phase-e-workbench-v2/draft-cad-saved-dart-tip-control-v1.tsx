import { canMoveSavedDartTipV1 } from './draft-cad-saved-dart-tip-v1';
import { useState, type ChangeEvent } from 'react';
import { Button, Input } from 'ui';
import type { PtMm } from 'lib/pattern-import/types';
type Props = { kind?: 'dart-tip' | 'fish-eye'; positionMm: PtMm; onMove: (point: PtMm) => void };
export function SavedDartTipControlV1({ kind = 'dart-tip', positionMm, onMove }: Props) {
  const [x, setX] = useState(String(positionMm.x)),
    [y, setY] = useState(String(positionMm.y));
  const point = { x: Number(x), y: Number(y) };
  const available = x.trim() !== '' && y.trim() !== '' && canMoveSavedDartTipV1(positionMm, point);
  return (
    <details>
      <summary className='cursor-pointer text-micro'>
        {kind === 'fish-eye' ? 'Move fish-eye' : 'Move dart tip'}
      </summary>
      <div className='flex items-end gap-2'>
        <label className='text-micro'>
          {kind === 'fish-eye' ? 'Centre X (mm)' : 'X (mm)'}
          <Input
            type='number'
            step='0.000001'
            value={x}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setX(event.target.value)}
          />
        </label>
        <label className='text-micro'>
          {kind === 'fish-eye' ? 'Centre Y (mm)' : 'Y (mm)'}
          <Input
            type='number'
            step='0.000001'
            value={y}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setY(event.target.value)}
          />
        </label>
        <Button type='button' size='xs' disabled={!available} onClick={() => onMove(point)}>
          {kind === 'fish-eye' ? 'Record centre position' : 'Record tip position'}
        </Button>
      </div>
    </details>
  );
}
