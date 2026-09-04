import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import {
  ANNOTATION_COLOR_KEYS,
  CAPS_HINT,
  CAPS_LABEL,
  capsChoices,
  capsStorage,
  COLOR_LABEL,
  effectiveCaps,
  kindDef,
  type AnnotationCapsKey,
  type AnnotationKindKey,
} from './kinds';
import { CALLOUT_COLOR_HEX } from './shapes';

// ЦВЕТ · НАКОНЕЧНИКИ · ПУНКТИР · ШТРИХОВКА — ряд оформления указания.
//
// Общий для редактора плашки (снимок шага) и записки эскиза: указание красят одинаково, где бы оно
// ни стояло, и второй ряд свотчей разошёлся бы с первым первой же добавленной краской.
//
// ЧИПЫ ЗДЕСЬ ОБЫЧНЫЕ, А НЕ `nonForm`. `nonForm` заведён ради того, что обязано РАБОТАТЬ на
// выпущенной карточке (изоляция по наведению, зум): такой чип это span, и `<fieldset disabled>` его
// не глушит. Здесь всё наоборот — это ПРАВКА, и на выпущенной карточке она обязана быть глухой.
//
// НАКОНЕЧНИКИ СТОЯТ В ЭТОМ ЖЕ РЯДУ (круг 18, D-19/D-20), а не отдельной строкой. Редактор —
// полоса ФИКСИРОВАННОЙ высоты (см. `ANNOTATION_EDITOR_H`), и ещё одна строка чипов уехала бы под
// прокрутку ровно у мудборда, где полоса самая узкая, — то есть наконечники были бы там, где их
// не видно. Один переносимый ряд отдаёт им место, когда оно есть, и переносится, когда его нет.
// Группа отделена от цветов и пунктира ВОЛОСЯНОЙ ЛИНИЕЙ, а не отступом: ступени внутри блока в
// этой системе рисуются линиями (DESIGN.md, «лестница линий»).
//
// КАЖДЫЙ ЧИП НЕСЁТ ГЛИФ И СЛОВО. Глиф — потому что наконечник это форма, и «bracket» словом
// узнают медленнее, чем ⌐¬ рисунком; слово — потому что состояние никогда не несут одной формой
// (читалка, печать, монохром).

/** Глиф наконечника — восемнадцать на восемь пикселей, тем же цветом, что текст чипа. */
function CapGlyph({ caps }: { caps: AnnotationCapsKey }) {
  return (
    <svg
      aria-hidden
      width={18}
      height={8}
      viewBox='0 0 18 8'
      fill='none'
      stroke='currentColor'
      strokeWidth={1}
      className='shrink-0'
    >
      {caps === '' && <line x1={1} y1={4} x2={17} y2={4} />}
      {caps === 'tick' && (
        <>
          <line x1={1} y1={4} x2={17} y2={4} />
          <line x1={1} y1={0.5} x2={1} y2={7.5} />
          <line x1={17} y1={0.5} x2={17} y2={7.5} />
        </>
      )}
      {caps === 'bracket' && <path d='M1,7.5 L1,1.5 L17,1.5 L17,7.5' />}
      {caps === 'bullet' && (
        <>
          <line x1={3} y1={4} x2={15} y2={4} />
          <circle cx={2.5} cy={4} r={2} fill='currentColor' stroke='none' />
          <circle cx={15.5} cy={4} r={2} fill='currentColor' stroke='none' />
        </>
      )}
      {caps === 'arrow' && (
        <>
          <line x1={4} y1={4} x2={14} y2={4} />
          <path d='M0.5,4 L5,1.25 L5,6.75 Z' fill='currentColor' stroke='none' />
          <path d='M17.5,4 L13,1.25 L13,6.75 Z' fill='currentColor' stroke='none' />
        </>
      )}
    </svg>
  );
}

/** Волосяная линия между группами ряда — ступень внутри блока, не отступ. */
function RuleSep() {
  return <span aria-hidden className='mx-0.5 inline-block h-3 w-px bg-borderColor' />;
}

export function AnnotationStyleRow({
  kind,
  color,
  dashed,
  filled,
  caps = '',
  onColor,
  onDashed,
  onFilled,
  onCaps,
}: {
  kind: string;
  color: string;
  dashed: boolean;
  filled: boolean;
  /** Наконечник КАК ХРАНИТСЯ (`''` = не задан); что показать выбранным, решает `effectiveCaps`. */
  caps?: string;
  onColor: (c: string) => void;
  onDashed: (v: boolean) => void;
  onFilled: (v: boolean) => void;
  /**
   * ВЫБОР НАКОНЕЧНИКА ОТДАЁТ ПАРУ «ВИД ХРАНЕНИЯ + caps», А НЕ ОДИН КЛЮЧ. У линии засечки и скоба
   * это два ВИДА (`dim`/`bracket`), и владелец, получивший только ключ, обязан был бы знать это
   * правило сам; здесь оно применено (`capsStorage`), владельцу остаётся записать оба поля.
   * `chosen` — то, что нажал человек: им помнит перо (`rememberPen({ caps: chosen })`), потому
   * что «скоба» в хранении выглядит как `bracket` без caps, и помнить `''` значило бы забыть выбор.
   * Отсутствует — чипов наконечников нет вовсе (владелец их не хранит).
   */
  onCaps?: (next: { kind: AnnotationKindKey; caps: AnnotationCapsKey }, chosen: AnnotationCapsKey) => void;
}) {
  const d = kindDef(kind);
  const choices = d.capped && onCaps ? capsChoices(kind) : [];
  const current = effectiveCaps(kind, caps);
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
      {choices.length > 0 && (
        <>
          <RuleSep />
          {choices.map((k) => {
            const on = current === k;
            return (
              <Chip
                key={`caps:${k || 'plain'}`}
                data-caps={k || 'plain'}
                dashed={!on}
                selected={on}
                pressed={on}
                onClick={() => onCaps?.(capsStorage(kind, k), k)}
                title={CAPS_HINT[k]}
              >
                <CapGlyph caps={k} />
                {CAPS_LABEL[k]}
              </Chip>
            );
          })}
          {(d.dashable || d.fillable) && <RuleSep />}
        </>
      )}
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
            ? 'a note has one style only: a leader with an arrow'
            : ''}
        </Text>
      )}
    </ChipRow>
  );
}
