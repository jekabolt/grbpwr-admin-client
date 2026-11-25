import { useId, useRef } from 'react';
import { cn } from 'lib/utility';
import { Text } from 'ui';
import { gridStep, screenToWorld } from '../model/camera';
import { ToolDock } from './tool-dock';
import { useCamera } from './use-camera';
import { ZoomControl } from './zoom-control';

/**
 * The infinite canvas: a dot grid that moves with the camera, one SVG world layer under a single
 * transform (empty in PR 01), and the chrome floating above it — readout, dock, zoom.
 */
export function Canvas() {
  const viewport = useRef<HTMLDivElement>(null);
  const cam = useCamera(viewport);
  // useId's characters (colons, guillemets) vary by React version; url(#…) wants a plain name.
  const gridId = `wb-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { camera } = cam;

  // The grid is one SVG pattern tile, not a dot per cell: thousands of dots for the price of one,
  // and nothing to re-lay out. Its offset is the world origin's screen position, wrapped into a cell.
  const step = gridStep(camera.zoom);
  const ox = (((-camera.x * camera.zoom) % step) + step) % step;
  const oy = (((-camera.y * camera.zoom) % step) + step) % step;

  // The readout follows the cursor; with the cursor off the canvas it shows the view's centre.
  const at = screenToWorld(camera, cam.cursor ?? { x: cam.size.width / 2, y: cam.size.height / 2 });

  return (
    <div
      ref={viewport}
      data-testid='whiteboard-canvas'
      className={cn(
        'relative flex-1 touch-none select-none overflow-hidden bg-pageBg',
        cam.dragging ? 'cursor-grabbing' : cam.panning ? 'cursor-grab' : 'cursor-default',
      )}
      {...cam.handlers}
    >
      <svg className='absolute inset-0 h-full w-full' aria-hidden>
        <defs>
          <pattern
            id={gridId}
            width={step}
            height={step}
            x={ox - step / 2}
            y={oy - step / 2}
            patternUnits='userSpaceOnUse'
          >
            <circle cx={step / 2} cy={step / 2} r={1} className='fill-borderColor' />
          </pattern>
        </defs>
        <rect width='100%' height='100%' fill={`url(#${gridId})`} />
        <g
          transform={`scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`}
          data-testid='whiteboard-world'
        />
      </svg>

      <div className='pointer-events-none absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center'>
        <Text size='micro' variant='label' tracking='label' className='uppercase'>
          empty whiteboard
        </Text>
        <Text size='micro' variant='label'>
          Space + drag to pan · ⌘ + wheel to zoom · Shift+1 to fit
        </Text>
      </div>

      <div
        data-testid='whiteboard-readout'
        className='pointer-events-none absolute left-4 top-4 border border-borderColor bg-bgColor px-1.5 py-0.5 text-nano text-labelColor'
      >
        x {Math.round(at.x)} · y {Math.round(at.y)}
      </div>

      <ToolDock tool={cam.tool} onTool={cam.setTool} />
      <ZoomControl
        zoom={camera.zoom}
        onStep={cam.zoomStep}
        onReset={() => cam.zoomTo(1)}
        onFit={cam.fit}
      />
    </div>
  );
}
