import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import { ANNOTATION_COLOR_KEYS, COLOR_LABEL, kindDef } from './kinds';
import { CALLOUT_COLOR_HEX } from './shapes';

// ЦВЕТ · ПУНКТИР · ШТРИХОВКА — ряд оформления указания.
//
// Общий для редактора плашки (снимок шага) и записки эскиза: указание красят одинаково, где бы оно
// ни стояло, и второй ряд свотчей разошёлся бы с первым первой же добавленной краской.
//
// ЧИПЫ ЗДЕСЬ ОБЫЧНЫЕ, А НЕ `nonForm`. `nonForm` заведён ради того, что обязано РАБОТАТЬ на
// выпущенной карточке (изоляция по наведению, зум): такой чип это span, и `<fieldset disabled>` его
// не глушит. Здесь всё наоборот — это ПРАВКА, и на выпущенной карточке она обязана быть глухой.

export function AnnotationStyleRow({
  kind,
  color,
  dashed,
  filled,
  onColor,
  onDashed,
  onFilled,
}: {
  kind: string;
  color: string;
  dashed: boolean;
  filled: boolean;
  onColor: (c: string) => void;
  onDashed: (v: boolean) => void;
  onFilled: (v: boolean) => void;
}) {
  const d = kindDef(kind);
  return (
    <ChipRow>
      {ANNOTATION_COLOR_KEYS.map((c) => (
        <Chip
          key={c || 'ink'}
          dashed={color !== c}
          selected={color === c}
          onClick={() => onColor(c)}
          title={
            c === 'white'
              ? 'white reads on dark fabric; on paper it prints as a hollow line'
              : c
                ? 'colour tells overlapping callouts apart'
                : 'ink — the same as everything else on the sheet'
          }
        >
          {/* Свотч в рамке: белый на белом редакторе иначе не виден вовсе. */}
          <span
            aria-hidden
            className='inline-block size-2 border border-borderColor'
            style={{ background: c ? CALLOUT_COLOR_HEX[c] : 'currentColor' }}
          />
          {COLOR_LABEL[c]}
        </Chip>
      ))}
      {d.dashable && (
        <Chip
          dashed={!dashed}
          selected={dashed}
          onClick={() => onDashed(!dashed)}
          title='dashed — a construction line, a seam allowance, a line under a layer; solid — what is actually done'
        >
          dashed
        </Chip>
      )}
      {d.fillable && (
        <Chip
          dashed={!filled}
          selected={filled}
          onClick={() => onFilled(!filled)}
          title='hatching says “this area”; a bare contour says “this border”'
        >
          hatching
        </Chip>
      )}
      {!d.dashable && !d.fillable && (
        <Text size='nano' variant='label' component='span'>
          {d.key === 'pin' || d.key === 'label' || d.key === 'multi'
            ? 'a label has one style only: a leader with an arrow'
            : ''}
        </Text>
      )}
    </ChipRow>
  );
}
