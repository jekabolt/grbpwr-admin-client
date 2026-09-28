// ДЫРЫ — нижняя зона экрана составников (дизайн §4, план §9.5). Блоки сверху, затем предупреждения
// и подсказки; у каждой строки — адрес (колорвей, часть, волокно, язык) и дверь туда, где чинят.
// Предупреждения уходят и в README.txt архива — строка здесь говорит об этом.
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import type { CareLabelColorway } from './adapter';
import type { Hole } from './holes';
import { holeDoor, type Readiness } from './readiness';

const TONE = { block: 'warn', warn: 'attention', info: 'mut' } as const;

/** Адрес дыры словами: `RC27-99999-OFW · SHELL · COT · PL`. */
export function holeAddress(h: Hole, colorways: readonly CareLabelColorway[]): string {
  const cw =
    h.ref.colorwayId !== undefined ? colorways.find((c) => c.id === h.ref.colorwayId) : undefined;
  return [
    cw ? cw.baseSku || `colourway #${cw.id}` : '',
    h.ref.part ?? '',
    h.ref.fiberCode ?? '',
    h.ref.lang ? h.ref.lang.toUpperCase() : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function HolesPanel({
  readiness,
  colorways,
  techCardId,
}: {
  readiness: Readiness;
  colorways: readonly CareLabelColorway[];
  techCardId: number;
}) {
  const { shown, blockers, warnings } = readiness;
  return (
    <div className='flex flex-col gap-2' data-care-zone='holes'>
      <Text size='micro' variant='label' data-care-gate={readiness.canExport ? 'open' : 'blocked'}>
        {blockers.length > 0
          ? `${blockers.length} blocking — the zip stays closed until they are fixed or their colourway is unticked`
          : 'nothing blocks the zip'}
        {warnings.length > 0 ? ` · ${warnings.length} warnings go into README.txt` : ''}
      </Text>
      {shown.length > 0 && (
        <div className='flex flex-col'>
          {shown.map((h, i) => {
            const door = holeDoor(h, techCardId);
            const address = holeAddress(h, colorways);
            return (
              <div
                key={`${h.code}-${i}`}
                className='flex items-center gap-2 border-b border-hairline py-1 last:border-b-0'
                data-hole={h.code}
                data-hole-level={h.level}
                data-hole-colorway={h.ref.colorwayId ?? ''}
              >
                <Pill tone={TONE[h.level]}>{h.level}</Pill>
                {address && (
                  <Text size='micro' variant='label' className='shrink-0 uppercase'>
                    {address}
                  </Text>
                )}
                <Text size='micro' className='min-w-0 flex-1'>
                  {h.message}
                </Text>
                {door && (
                  <a
                    href={door.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='shrink-0 text-micro uppercase underline'
                  >
                    {door.label} ›
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
