import { useEffect, useRef, type ReactNode } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import { kindDef } from './kinds';
import { AnnotationStyleRow } from './style-row';

// РЕДАКТОР ВЫНОСКИ (режим плашки) — текст, детали, оформление, удаление.
//
// ТЕКСТ ВСЕГДА ЧЁРНЫМ ПО БЕЛОМУ, независимо от цвета указания. Цветной текст в девять пикселей
// нечитаем, цветная рамка вокруг плашки — шум, а боковая цветная кромка запрещена системой.
// Принадлежность плашки читается ПО ЛИДЕРУ, который в неё упирается, и по самой фигуре: правило
// одно — «цвет красит геометрию, никогда текст и номер».
//
// ПОЛЕ МНОГОСТРОЧНОЕ. Указание вроде «настрочить отделочной 6 мм, закрепки в начале и конце» в одну
// строку не помещается, а Enter в однострочном поле раньше закрывал редактор — то есть перенос
// строки был физически невыразим. Теперь Enter переносит; закрывают Esc и ⌘Enter.

export function AnnotationEditor({
  kind,
  number,
  text,
  color,
  dashed,
  filled,
  pieceKeys,
  pieceLabel,
  onText,
  onColor,
  onDashed,
  onFilled,
  onPieces,
  onRemove,
  onClose,
  renderPiecePicker,
}: {
  kind: string;
  /** Номер пина; у прочих видов не показывается — у них подпись стоит на самой картинке. */
  number?: number;
  text: string;
  color: string;
  dashed: boolean;
  filled: boolean;
  pieceKeys: string[];
  pieceLabel?: (lineKey: string) => string | undefined;
  onText: (v: string) => void;
  onColor: (v: string) => void;
  onDashed: (v: boolean) => void;
  onFilled: (v: boolean) => void;
  onPieces: (keys: string[]) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Пикер детали с силуэтами. Отсутствует — строки деталей нет вовсе (печать, архив). */
  renderPiecePicker?: (opts: { selected: string[]; onPick: (lineKey: string) => void }) => ReactNode;
}) {
  const d = kindDef(kind);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Поле растёт под текст: фиксированные две строки прячут третью, а скроллбар в поле высотой
  // сорок пикселей не находят.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  return (
    <div className='flex flex-col gap-1 border border-borderColor p-1.5'>
      <div className='flex items-start gap-1.5'>
        <Text size='micro' variant='label' component='span' className='mt-0.5 shrink-0 uppercase'>
          {d.label}
          {d.key === 'pin' && number ? ` · ${number}` : ''}
        </Text>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            // Enter ПЕРЕНОСИТ. Закрывают Esc (как записку эскиза) и ⌘Enter — привычка «отправить».
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder={d.key === 'dim' ? 'значение с единицами — «6 мм»' : 'что тут делать'}
          maxLength={500}
          className='min-w-0 flex-1 resize-none border border-borderColor bg-bgColor px-1 py-px text-micro leading-snug text-textColor focus:border-textColor focus:outline-none'
        />
      </div>

      {/* ДЕТАЛИ КРОЯ, О КОТОРЫХ УКАЗАНИЕ — СПИСОК, а не одна. Узел законно собирает несколько
          деталей сразу: «втачать рукав в пройму» это и рукав, и полочка, и спинка, и выбирать из
          них главную у шва не у кого. Ссылка советующая: деталь могли удалить на вкладке выкроек,
          и тогда чип честно говорит «деталь удалена» — молча спрятать связь нельзя, иначе она
          висит в данных вечно, потому что перевыбрать её никто не догадается. */}
      {renderPiecePicker && (
        <div className='flex flex-wrap items-center gap-1'>
          <Text size='micro' variant='label' component='span' className='shrink-0 uppercase'>
            детали:
          </Text>
          <ChipRow>
            {pieceKeys.map((k) => {
              const name = pieceLabel?.(k);
              return (
                <Chip
                  key={k}
                  tone={name ? 'default' : 'error'}
                  title={name ? 'убрать деталь из указания' : 'детали с таким ключом больше нет'}
                  onRemove={() => onPieces(pieceKeys.filter((x) => x !== k))}
                >
                  {name ?? 'деталь удалена'}
                </Chip>
              );
            })}
            {renderPiecePicker({
              // ПИКЕР ЗНАЕТ ПРО УЖЕ ВЫБРАННЫЕ. Без этого список не помечает добавленные детали, а
              // клик по такой их СНИМАЕТ — то есть выбор ведёт себя противоположно тому, что
              // показано, и понять это можно только попробовав.
              selected: pieceKeys,
              onPick: (lineKey) => {
                if (!lineKey) return;
                onPieces(
                  pieceKeys.includes(lineKey)
                    ? pieceKeys.filter((x) => x !== lineKey)
                    : [...pieceKeys, lineKey],
                );
              },
            })}
          </ChipRow>
        </div>
      )}

      <AnnotationStyleRow
        kind={kind}
        color={color}
        dashed={dashed}
        filled={filled}
        onColor={onColor}
        onDashed={onDashed}
        onFilled={onFilled}
      />

      <ChipRow>
        <Chip dashed onClick={onRemove} title='удалить указание целиком'>
          удалить
        </Chip>
        <Chip dashed onClick={onClose} title='закрыть правку (Esc или ⌘Enter)'>
          готово
        </Chip>
        {d.handles && (
          <Text size='nano' variant='label' component='span'>
            точки правятся ручками на кадре; клик по ручке и Delete убирают точку
          </Text>
        )}
      </ChipRow>
    </div>
  );
}
