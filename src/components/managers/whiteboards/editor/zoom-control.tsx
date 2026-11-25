import { Button } from 'ui';
import { MAX_ZOOM, MIN_ZOOM } from '../model/camera';

const BUTTON =
  'h-8 min-w-8 px-2 hover:bg-textColor hover:text-bgColor disabled:text-borderColor disabled:hover:bg-bgColor disabled:hover:text-borderColor';

export function ZoomControl({
  zoom,
  onStep,
  onReset,
  onFit,
}: {
  zoom: number;
  onStep: (dir: 1 | -1) => void;
  onReset: () => void;
  onFit: () => void;
}) {
  return (
    <div
      role='group'
      aria-label='Zoom'
      className='absolute bottom-4 right-4 flex items-center border border-borderColor bg-bgColor'
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button
        variant='simpleReverse'
        className={BUTTON}
        aria-label='Zoom out'
        disabled={zoom <= MIN_ZOOM}
        onClick={() => onStep(-1)}
      >
        −
      </Button>
      <Button
        variant='simpleReverse'
        className='h-8 min-w-12 text-center hover:bg-pageBg'
        title='Zoom to 100% (Shift+0)'
        onClick={onReset}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button
        variant='simpleReverse'
        className={BUTTON}
        aria-label='Zoom in'
        disabled={zoom >= MAX_ZOOM}
        onClick={() => onStep(1)}
      >
        +
      </Button>
      <span aria-hidden className='h-5 w-px bg-hairline' />
      <Button
        variant='simpleReverse'
        className={`${BUTTON} text-micro uppercase tracking-label`}
        title='Zoom to fit (Shift+1)'
        onClick={onFit}
      >
        fit
      </Button>
    </div>
  );
}
