import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button, Input } from 'ui';

import {
  alignSelectedCadTablePiecesV1,
  rotateSelectedCadTablePiecesV1,
  type CadTablePieceAlignmentV1,
} from './cad-table-piece-layout-session-v1';
import type { CadTableZeroCanvasOwner } from './cad-table-zero-connect-canvas-v1';
import { PatternImportDxfPhaseECadWorkbenchToolButtonV1 } from './cad-workbench-tool-button-v1';

const ALIGNMENTS = [
  { key: 'left', label: 'Left' },
  { key: 'center-x', label: 'Center horizontally' },
  { key: 'right', label: 'Right' },
  { key: 'top', label: 'Top' },
  { key: 'center-y', label: 'Center vertically' },
  { key: 'bottom', label: 'Bottom' },
] as const satisfies readonly { key: CadTablePieceAlignmentV1; label: string }[];

export function CadTableLayoutTools({ owner }: Readonly<{ owner: CadTableZeroCanvasOwner }>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [angleText, setAngleText] = useState('90');
  const angle = Number(angleText.trim());
  const selectedCount = owner.session.layout.selectedPieceKeys.length;

  const rotate = () => {
    if (!selectedCount || !Number.isFinite(angle) || angle === 0) return;
    owner.update((current) => ({
      ...current,
      layout: rotateSelectedCadTablePiecesV1(current.layout, angle),
    }));
  };

  return (
    <div
      className='absolute right-14 top-2 z-20'
      onKeyDown={(event) => {
        if (!open || event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
      }}
    >
      <PatternImportDxfPhaseECadWorkbenchToolButtonV1
        icon='ellipse'
        label='Arrange selected pieces'
        expanded={open}
        disabled={selectedCount === 0}
        onClick={() => setOpen((value) => !value)}
        dataAttributes={{ 'aria-controls': id }}
      />
      {open && selectedCount > 0 ? (
        <div
          id={id}
          className='absolute right-11 top-0 z-30 w-48 space-y-2 border border-borderColor bg-bgColor p-2'
        >
          <label className='block text-micro' htmlFor={`${id}-angle`}>
            Rotation (°)
          </label>
          <div className='flex gap-1'>
            <Input
              id={`${id}-angle`}
              inputMode='decimal'
              value={angleText}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setAngleText(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  rotate();
                }
              }}
            />
            <Button
              type='button'
              size='xs'
              onClick={rotate}
              disabled={!Number.isFinite(angle) || angle === 0}
            >
              Rotate
            </Button>
          </div>
          {selectedCount > 1 ? (
            <div className='grid grid-cols-2 gap-1' aria-label='Align selected pieces'>
              {ALIGNMENTS.map(({ key, label }) => (
                <Button
                  key={key}
                  type='button'
                  size='xs'
                  variant='default'
                  onClick={() =>
                    owner.update((current) => ({
                      ...current,
                      layout: alignSelectedCadTablePiecesV1(current.layout, key),
                    }))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
