import { canMoveSavedDartTipV1 } from './draft-cad-saved-dart-tip-v1';
import { useState, type ChangeEvent } from 'react';
import { Button, Input } from 'ui';
import type { PtMm } from 'lib/pattern-import/types';
type Props = { apexMm: PtMm; onMove: (point: PtMm) => void };
export function SavedDartTipControlV1({ apexMm, onMove }: Props) {
  const [x, setX] = useState(String(apexMm.x)),
    [y, setY] = useState(String(apexMm.y));
  const point = { x: Number(x), y: Number(y) };
  const available = x.trim() !== '' && y.trim() !== '' && canMoveSavedDartTipV1(apexMm, point);
  return (
    <details>
      <summary className='cursor-pointer text-micro'>Move dart tip</summary>
      <div className='flex items-end gap-2'>
        <label className='text-micro'>
          X (mm)
          <Input
            type='number'
            step='0.000001'
            value={x}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setX(event.target.value)}
          />
        </label>
        <label className='text-micro'>
          Y (mm)
          <Input
            type='number'
            step='0.000001'
            value={y}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setY(event.target.value)}
          />
        </label>
        <Button type='button' size='xs' disabled={!available} onClick={() => onMove(point)}>
          Record tip position
        </Button>
      </div>
    </details>
  );
}
