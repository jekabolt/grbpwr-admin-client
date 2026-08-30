import { useId, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { importSvg, type SvgImportReading } from './svg-import';
import { MAX_STROKES_BYTES, writeLayer, type VectorStroke } from './vector-strokes';

/**
 * THE RETURN DOOR — a file goes in, and nothing happens to the layer until a person has read what
 * came back out.
 *
 * TWO STEPS, NOT ONE, AND THAT IS THE WHOLE DESIGN. A one-click importer has to choose, silently,
 * between dropping what it did not understand and refusing a file somebody spent an evening on.
 * Splitting the gesture removes the choice: the file is READ first — counted, measured, compared
 * against this plate — and only then does somebody press a button that changes the drawing. A
 * refusal at that point costs nothing, because nothing has happened yet, which is what lets the
 * importer refuse instead of guess.
 *
 * ADD OR REPLACE, BOTH SPELLED OUT. «Add» is the safe one and is offered first: it cannot lose a
 * line. «Replace» is what the round trip actually wants — the file already contains everything that
 * was downloaded — and it is undoable with ⌘Z like every other gesture in this editor, because the
 * caller records history before applying.
 */
export function SvgImportDoor({
  disabled,
  frameRatio,
  existing,
  onApply,
}: {
  disabled?: boolean;
  /** The plate's own width ÷ height, so a file drawn on another shape can be called out. */
  frameRatio: number;
  /** What is on the layer now — for the size arithmetic, which has to include it. */
  existing: VectorStroke[];
  onApply: (strokes: VectorStroke[], mode: 'add' | 'replace') => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [reading, setReading] = useState<SvgImportReading | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [name, setName] = useState('');

  const clear = () => {
    setReading(null);
    setRefusal(null);
    setName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setName(file.name);
    setReading(null);
    setRefusal(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRefusal('the file could not be read from disk. Nothing was imported.');
      return;
    }
    const result = importSvg(text);
    if (!result.ok) {
      setRefusal(result.where ? `${result.reason} (${result.where})` : result.reason);
      return;
    }
    setReading(result);
  };

  // THE CEILING IS CHECKED AGAINST THE MERGED DRAWING, not against the file alone. «Add» is the one
  // that can push a layer over 512 KB while each half sits comfortably under it, and finding that
  // out from the server's refusal after the strokes are already on screen is the wrong order.
  const mergedBytes = reading
    ? new TextEncoder().encode(writeLayer([...existing, ...reading.strokes], frameRatio)).length
    : 0;
  const addWouldOverflow = mergedBytes > MAX_STROKES_BYTES;
  const ratioOff = reading ? Math.abs(reading.ratio - frameRatio) / (frameRatio || 1) : 0;

  return (
    <div className='space-y-1'>
      <input
        ref={inputRef}
        id={inputId}
        type='file'
        accept='.svg,image/svg+xml'
        disabled={disabled}
        className='hidden'
        onChange={(event) => void pick(event.currentTarget.files?.[0])}
      />
      <Button
        variant='secondary'
        size='xs'
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        upload SVG
      </Button>

      {refusal && (
        <CalloutBox tone='error'>
          <Text size='micro' component='p'>
            <b>{name || 'that file'} was not imported.</b> {refusal}
          </Text>
          <div className='mt-1'>
            <Button variant='secondary' size='xs' onClick={clear}>
              try another file
            </Button>
          </div>
        </CalloutBox>
      )}

      {reading && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>
              {name}: {reading.elements} shape{reading.elements === 1 ? '' : 's'} →{' '}
              {reading.strokes.length} line{reading.strokes.length === 1 ? '' : 's'}
            </b>
            , {reading.anchors} point{reading.anchors === 1 ? '' : 's'}, {reading.curves} curved
            segment{reading.curves === 1 ? '' : 's'} · {Math.max(1, Math.round(reading.bytes / 1024))}{' '}
            KB of the {MAX_STROKES_BYTES / 1024} KB a layer holds.
          </Text>
          {reading.notes.map((note) => (
            <Text key={note} size='nano' variant='label' component='p'>
              · {note}
            </Text>
          ))}
          {ratioOff > 0.02 && (
            <Text size='nano' variant='label' component='p'>
              · <b>the file is a different shape from this plate</b> ({reading.ratio.toFixed(2)}{' '}
              against {frameRatio.toFixed(2)}) — the lines will be stretched onto it. Export from the
              same artboard the download opened with if that is not what you want.
            </Text>
          )}
          {addWouldOverflow && (
            <Text size='nano' variant='label' component='p'>
              · adding these to what is already drawn comes to{' '}
              {Math.round(mergedBytes / 1024)} KB, past the {MAX_STROKES_BYTES / 1024} KB ceiling —
              only <b>replace</b> is offered.
            </Text>
          )}
          <div className='mt-1 flex flex-wrap items-center gap-1.5'>
            <Button
              variant='secondary'
              size='xs'
              disabled={disabled || addWouldOverflow}
              onClick={() => {
                onApply(reading.strokes, 'add');
                clear();
              }}
            >
              add to the drawing
            </Button>
            <Button
              variant='secondary'
              size='xs'
              disabled={disabled}
              onClick={() => {
                onApply(reading.strokes, 'replace');
                clear();
              }}
            >
              replace the drawing
            </Button>
            <Button variant='secondary' size='xs' onClick={clear}>
              cancel
            </Button>
            <Text size='nano' variant='label' component='span'>
              ⌘Z takes either one back
            </Text>
          </div>
        </CalloutBox>
      )}
    </div>
  );
}
