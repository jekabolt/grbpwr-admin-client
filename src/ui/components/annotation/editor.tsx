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
  extra,
  onDemote,
  sameKey = (a, b) => a === b,
  style = true,
  maxLength = 500,
  anchors,
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
  /**
   * Поля, которые есть только у ЭТОГО владельца. У карточного указания это привязка размера
   * («14 × 16»), которую печатает тех-пак; у снимка шага её нет.
   *
   * СЛОТ, А НЕ ВТОРОЙ РЕДАКТОР: форма правки одна на все экраны, и различие в одном поле не повод
   * разводить их — разведённые, они разойдутся и во всём остальном, как уже разошлись однажды.
   */
  extra?: ReactNode;
  /**
   * Разжаловать фигуру обратно в нумерованную точку. Отсутствует — чипа нет.
   *
   * Нужен там, где номер выноски АДРЕСУЕТ её снаружи: удалить и поставить заново означало бы новый
   * номер и повисшие ссылки. У выноски снимка шага номера-адреса нет, и разжаловать её незачем —
   * проще стереть.
   */
  onDemote?: () => void;
  /**
   * Совпадают ли два ключа детали. По умолчанию — точное равенство: у выноски снимка шага это
   * ULID, и «почти равно» там не бывает.
   *
   * Эскиз хранит ИМЕНА, и имя из эпохи свободного текста отличается от каталожного регистром —
   * точное сравнение давало бы два чипа на одну деталь и «клик по выбранной добавляет вторую».
   */
  sameKey?: (a: string, b: string) => boolean;
  /**
   * Показывать ряд оформления. Выключается там, где владельцу негде хранить цвет: ряд свотчей,
   * который ничего не пишет, хуже отсутствующего — он обещает, что нажатие что-то изменит.
   */
  style?: boolean;
  /**
   * Потолок длины записки. ЗАДАЁТ ВЛАДЕЛЕЦ, потому что он же владеет ВТОРЫМ полем на ту же
   * запись: у примерки текст правится и здесь, и в списке заметок, и разные потолки означали, что
   * набранная в списке заметка здесь не дописывается — браузер отказывает во вставке МОЛЧА.
   * Умолчание — прежние 500: у карточного указания второго поля нет, и менять ей потолок незачем.
   */
  maxLength?: number;
  /**
   * Сколько якорей у фигуры НА САМОМ ДЕЛЕ. Не задан — подсказка про ручки решается по реестру, как
   * и раньше (поведение карточных поверхностей не меняется).
   *
   * Нужен потому, что «у вида есть ручки» и «у ЭТОЙ фигуры есть за что взяться» — разные вещи: у
   * пина примерки якорей нет вовсе (его единственная точка живёт в маркере), и подсказка обещала
   * ручки, которых не появится ни при каком клике.
   */
  anchors?: number;
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
          placeholder={d.key === 'dim' ? 'a value with units — “6 mm”' : 'what to do here'}
          maxLength={maxLength}
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
            pieces:
          </Text>
          <ChipRow>
            {pieceKeys.map((k) => {
              const name = pieceLabel?.(k);
              return (
                <Chip
                  key={k}
                  tone={name ? 'default' : 'error'}
                  title={
                    name ? 'remove the piece from the callout' : 'no piece with this key any more'
                  }
                  onRemove={() => onPieces(pieceKeys.filter((x) => !sameKey(x, k)))}
                >
                  {/* ИМЯ ВИДНО ДАЖЕ У НЕИЗВЕСТНОЙ ДЕТАЛИ: без него не понять, что именно было
                      привязано, и восстановить связь можно только угадав. */}
                  {name ?? `${k} — not among the pieces`}
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
                  pieceKeys.some((x) => sameKey(x, lineKey))
                    ? pieceKeys.filter((x) => !sameKey(x, lineKey))
                    : [...pieceKeys, lineKey],
                );
              },
            })}
          </ChipRow>
        </div>
      )}

      {extra}

      {style && (
        <AnnotationStyleRow
          kind={kind}
          color={color}
          dashed={dashed}
          filled={filled}
          onColor={onColor}
          onDashed={onDashed}
          onFilled={onFilled}
        />
      )}

      <ChipRow>
        <Chip dashed onClick={onRemove} title='delete the whole callout'>
          delete
        </Chip>
        {onDemote && (
          <Chip dashed onClick={onDemote} title='drop the shape, keep the numbered point'>
            make it a point
          </Chip>
        )}
        <Chip dashed onClick={onClose} title='close the editor (Esc or ⌘Enter)'>
          done
        </Chip>
        {/* ПОДСКАЗКА ПРО РУЧКИ — ТОЛЬКО КОГДА ЯКОРЯ ЕСТЬ. `d.handles` отвечает на вопрос «правится
            ли ВИД ручками», а не «есть ли у ЭТОЙ фигуры хоть одна точка». У пина примерки якорей
            нет по построению, и на кадре не появляется ни одной ручки — подсказка обещала жест,
            которого нет. Владелец, который про свои якоря молчит, получает прежнее поведение. */}
        {d.handles && (anchors ?? 1) > 0 && (
          <Text size='nano' variant='label' component='span'>
            points are edited by the handles on the frame; click a handle and press Delete to drop
            the point
          </Text>
        )}
      </ChipRow>
    </div>
  );
}
