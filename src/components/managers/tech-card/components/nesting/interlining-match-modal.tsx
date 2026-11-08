import { useEffect, useState } from 'react';
import { ConfirmationModal, DataTable, EmptyCell, Text, Tile, Tiles } from 'ui';
import type { PieceDTO } from 'lib/nesting/types';
import type { InterliningShapeMatch, InterliningShapePair } from './interlining-shape-match';

function ShapeThumb({
  piece,
  label,
  large = false,
}: {
  piece: PieceDTO;
  label: string;
  large?: boolean;
}) {
  const pad = Math.max(piece.bboxW, piece.bboxH, 1) * 0.08;
  const points = piece.poly.map((point) => `${point.x},${-point.y}`).join(' ');
  return (
    <svg
      viewBox={`${-pad} ${-piece.bboxH - pad} ${piece.bboxW + 2 * pad} ${piece.bboxH + 2 * pad}`}
      className={large ? 'block h-64 w-full' : 'block h-12 w-16'}
      role='img'
      aria-label={label}
    >
      <polygon
        points={points}
        fill='var(--color-pageBg)'
        stroke='var(--color-textColor)'
        strokeWidth='1'
        vectorEffect='non-scaling-stroke'
        strokeLinejoin='round'
      />
    </svg>
  );
}

export function InterliningMatchModal({
  fileName,
  matches,
  onClose,
  onKeep,
  onMatch,
}: {
  fileName: string;
  matches: readonly InterliningShapeMatch[];
  onClose: () => void;
  onKeep: () => void;
  onMatch: () => void;
}) {
  return (
    <ConfirmationModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCancel={onKeep}
      onConfirm={onMatch}
      title={`Match pieces · ${fileName}`}
      cancelLabel='Keep file'
      confirmLabel='Match'
      width='lg'
      closeOnConfirm={false}
    >
      <DataTable>
        <thead>
          <tr>
            <th data-align='left'>shape</th>
            <th data-align='left'>file name</th>
            <th aria-label='maps to'>→</th>
            <th data-align='left'>piece name(s)</th>
            <th data-align='left'>by</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.identity}>
              <td data-align='left'>
                <ShapeThumb piece={match.shape} label={match.identity} />
              </td>
              <td data-align='left'>{match.identity}</td>
              <td>→</td>
              <td data-align='left'>
                {match.pairs.length > 0 ? (
                  match.pairs.map((pair) => pair.pieceName).join(', ')
                ) : (
                  <EmptyCell />
                )}
              </td>
              <td data-align='left'>
                <Text
                  component='span'
                  className={match.by === 'no pair' ? 'text-error' : undefined}
                >
                  {match.by}
                </Text>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </ConfirmationModal>
  );
}

export function InterliningPlaceModal({
  match,
  pieces,
  onSkip,
  onPlace,
}: {
  match: InterliningShapeMatch;
  pieces: readonly InterliningShapePair[];
  onSkip: () => void;
  onPlace: (piece: InterliningShapePair) => void;
}) {
  const [selected, setSelected] = useState('');
  useEffect(() => setSelected(''), [match.identity]);
  const selectedPiece = pieces.find((piece) => piece.pieceLineKey === selected);
  return (
    <ConfirmationModal
      open
      onOpenChange={(open) => {
        if (!open) onSkip();
      }}
      onConfirm={() => {
        if (selectedPiece) onPlace(selectedPiece);
      }}
      title={`Which piece? · ${match.identity}`}
      cancelLabel='Skip'
      confirmLabel='Place'
      confirmDisabled={!selectedPiece}
      width='lg'
      closeOnConfirm={false}
    >
      <div className='grid gap-gutter lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'>
        <ShapeThumb piece={match.shape} label={match.identity} large />
        <Tiles min={120}>
          {pieces.map((piece) => (
            <Tile
              key={piece.pieceLineKey}
              selected={selected === piece.pieceLineKey}
              onClick={() => setSelected(piece.pieceLineKey)}
              title={piece.pieceName}
              name={piece.pieceName}
              media={<ShapeThumb piece={piece.piece} label={piece.pieceName} />}
            />
          ))}
        </Tiles>
      </div>
    </ConfirmationModal>
  );
}
