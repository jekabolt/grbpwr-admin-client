import { common_AdminColorwayRef } from 'api/proto-http/admin';
import { MaterialPickerDialog } from 'components/managers/materials/components/material-picker';
import { findInDictionary } from 'lib/features/findInDictionary';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState, useSyncExternalStore } from 'react';
import { Button, Chip, ChipRow, Section, HeaderNote, Tile, Tiles } from 'ui';
import { colorwayLabel } from './design/colorway-picker';
import { MaterialTile } from './material-tile';
import { findPantone, pantoneVersion, subscribePantone } from './pantone-swatches';
import type { AutoCreateSample } from './use-auto-create-sample';
import { wireInt } from './wire-int';

/** A colourway's swatch square for a chip — the studio strip's own rule: devHex → pantone → white. */
export function ColourwayDot({
  colorway,
  className,
}: {
  colorway?: common_AdminColorwayRef;
  className?: string;
}) {
  useSyncExternalStore(subscribePantone, pantoneVersion, pantoneVersion);
  const hex = colorway
    ? (colorway.devHex ?? '').trim() || findPantone(colorway.pantone)?.hex || '#fff'
    : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-[9px] shrink-0 border border-borderColor bg-pageBg',
        className,
      )}
      style={hex ? { background: hex } : undefined}
    />
  );
}

const QUIZ_TITLE = {
  size: 'size',
  colourway: 'colourway',
  material: 'main fabric · cut from',
} as const;

/**
 * The create quiz: replaces the board inline, one question per block, one click answers and moves
 * on. Asked only for what the card cannot decide (no base size, several colourways for a final
 * sample, the first stand-in of a card).
 */
export function SampleQuiz({ auto }: { auto: AutoCreateSample }) {
  const { dictionary } = useDictionary();
  const [searching, setSearching] = useState(false);
  const step = auto.quiz;
  if (!step) return null;

  return (
    <Section
      title={QUIZ_TITLE[step.kind]}
      action={
        <>
          <HeaderNote>
            #{auto.previewNumber} {auto.purpose}
          </HeaderNote>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            onClick={auto.cancel}
          >
            cancel
          </Button>
        </>
      }
    >
      {step.kind === 'size' && (
        <ChipRow>
          {step.sizeIds.map((id) => (
            <Chip key={id} disabled={auto.busy} onClick={() => auto.answer({ sizeId: id })}>
              {String(findInDictionary(dictionary, id, 'size') || id)}
            </Chip>
          ))}
        </ChipRow>
      )}

      {step.kind === 'colourway' && (
        <ChipRow>
          {step.colorways.map((c) => (
            <Chip
              key={c.colorwayId}
              disabled={auto.busy}
              onClick={() => auto.answer({ colorwayId: c.colorwayId ?? 0 })}
            >
              <ColourwayDot colorway={c} />
              {colorwayLabel(c)}
            </Chip>
          ))}
        </ChipRow>
      )}

      {step.kind === 'material' && (
        <>
          <Tiles min={128}>
            {step.options.map((o) => (
              <MaterialTile
                key={wireInt(o.material.id)}
                material={o.material}
                onHand={o.onHand}
                tag={o.tag}
                onClick={() => auto.answer({ standInId: wireInt(o.material.id) })}
              />
            ))}
            {step.own && (
              <MaterialTile
                material={step.own.material}
                name='own fabric'
                onHand={step.own.onHand}
                onClick={() => auto.answer({ standInId: wireInt(step.own!.material.id) })}
              />
            )}
            <Tile dashed onClick={() => setSearching(true)}>
              <span className='flex min-h-[128px] items-center justify-center text-micro uppercase tracking-label'>
                search catalog
              </span>
            </Tile>
          </Tiles>
          <MaterialPickerDialog
            open={searching}
            title='main fabric · cut from'
            confirmLabel='cut from this'
            onClose={() => setSearching(false)}
            onPick={(m) => {
              setSearching(false);
              const id = wireInt(m?.id);
              if (id) auto.answer({ standInId: id });
            }}
          />
        </>
      )}
    </Section>
  );
}
