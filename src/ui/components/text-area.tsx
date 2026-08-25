import { cn } from 'lib/utility';
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export interface TextareaProps {
  className?: string;
  name: string;
  variant?: 'default' | 'secondary';
  /**
   * Поле само держит высоту «текст + 3 пустые строки» (по умолчанию — везде). Опт-аут нужен там,
   * где высотой распоряжается вёрстка вокруг: поле, растянутое на всю колонку, или тесный
   * поповер, который прыгал бы вслед за ростом.
   */
  autoGrow?: boolean;
  [k: string]: any;
}

/**
 * Запас под кареткой. Читается буквально: «высота всегда больше текста на 3 строки» — при наборе
 * текст никогда не упирается в нижний край, впереди всегда видно место. Пустое поле = 1 строка
 * каретки + 3 = 4 строки.
 */
const SPARE_LINES = 3;
/**
 * Потолок роста. Без него поле на 2000 знаков (столько разрешает CONCEPT) съедает экран целиком и
 * прячет кнопку сохранения; выше потолка поле прокручивается внутри себя.
 */
const MAX_AUTO_HEIGHT = 480;

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, name, variant = 'default', autoGrow = true, onInput, ...props }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    // СЛИЯНИЕ РЕФОВ. Примитиву нужен свой ref (он меряет и правит высоту), но в тот же ref пишет
    // RHF (`field.ref` через {...field} у TextareaField) — им ищут поле для фокуса при ошибке
    // валидации. Потерять прокинутый ref = молча сломать «перейти к ошибке» во всех формах
    // админки, и ни одна проверка типов этого не увидит.
    //
    // Держим прокинутый ref в ЯЩИКЕ, а наружу отдаём НЕИЗМЕННЫЙ колбэк: RHF пересоздаёт свой
    // `field.ref` каждый рендер, и колбэк с зависимостью от `ref` заставлял бы React на каждом
    // рендере звать старый ref с null и новый с элементом — то есть дёргать регистрацию поля
    // впустую. DOM-узел при этом один и тот же, поэтому одного вызова на монтаже достаточно.
    const forwardedRef = useRef(ref);
    forwardedRef.current = ref;
    const setRef = useCallback((el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      const outer = forwardedRef.current;
      if (typeof outer === 'function') outer(el);
      else if (outer) (outer as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }, []);

    const resize = useCallback(() => {
      const el = innerRef.current;
      if (!el || !autoGrow) return;
      // Спрятанное поле (вкладка под `hidden`, свёрнутый <details>) меряется в НОЛЬ, и записанная
      // сейчас высота была бы ложью, которая доживёт до показа. Ширина — самый дешёвый признак
      // «нас не раскладывают»: у видимого поля она всегда больше нуля. Пересчёт приедет от
      // ResizeObserver ниже, как только поле покажут.
      if (!el.clientWidth) return;
      const cs = window.getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || 1.5 * (parseFloat(cs.fontSize) || 12);
      // scrollHeight включает падинги, но НЕ рамку; при border-box высоту надо задавать вместе с
      // рамкой, иначе последняя строка обрезается на 2px и поле показывает лишний скроллбар.
      const borders =
        cs.boxSizing === 'border-box'
          ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
          : 0;
      // Меряем от НУЛЯ, а не от 'auto': при height:auto высота берётся из атрибута `rows`, и
      // scrollHeight у поля с rows={3} и одной строкой текста вернул бы три строки — запас стал бы
      // не «+3 строки», а «+3 к трём».
      //
      // min-height на время замера тоже снимается. scrollHeight никогда не меньше видимой части, а
      // видимую часть держит пол (min-h-[44px] у примитива, min-h-24 у AI-описания операций) — то
      // есть пустое поле мерялось бы «в два с половиной ряда», и запас в 3 строки уезжал бы вверх
      // ровно на высоту пола. Замерено: пустое поле выходило 98px вместо 80, а с min-h-24 — 150.
      // На КОНЕЧНУЮ высоту пол по-прежнему действует: он остаётся полом, каким и задуман.
      const prevMinHeight = el.style.minHeight;
      el.style.minHeight = '0px';
      el.style.height = '0px';
      const content = el.scrollHeight + borders;
      el.style.height = `${Math.min(content + SPARE_LINES * lh, MAX_AUTO_HEIGHT)}px`;
      el.style.minHeight = prevMinHeight;
    }, [autoGrow]);

    // Контролируемое значение (RHF, form.reset, восстановление черновика) меняется мимо жестов
    // пользователя — эффект отвечает за них, `onInput` ниже за живой набор.
    useLayoutEffect(() => {
      resize();
    }, [resize, props.value, props.defaultValue]);

    // Показ спрятанной вкладки и смена ширины колонки. Наблюдатель реагирует ТОЛЬКО на ширину:
    // высоту в этом же поле меняем мы сами, и реакция на неё была бы петлёй.
    const lastWidth = useRef(-1);
    useEffect(() => {
      const el = innerRef.current;
      if (!el || !autoGrow || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w === lastWidth.current) return;
        lastWidth.current = w;
        resize();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [autoGrow, resize]);

    return (
      <textarea
        id={name}
        ref={setRef}
        className={cn(
          // Same box as Input. It used to be min-h-56 (224px) with a 40px bottom
          // margin and no border, which is why every notes field dominated its section.
          'block min-h-[44px] w-full appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none',
          // Ручной драг за уголок дерётся с автовысотой: следующий же символ затирает высоту,
          // которую человек только что выставил рукой. Без автовысоты уголок остаётся.
          autoGrow ? 'resize-none overflow-y-auto' : 'resize-y',
          'aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error',
          'placeholder:text-textInactiveColor disabled:bg-bgZebra disabled:text-labelColor',
          {
            'border-textInactiveColor': variant === 'secondary',
          },
          className,
        )}
        {...props}
        onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
          // Живой набор. Отдельно от эффекта на props.value НЕ ради страховки, а потому что
          // неконтролируемое поле (их среди голых <Textarea> хватает) вообще не меняет props.
          resize();
          onInput?.(e);
        }}
      />
    );
  },
);

Textarea.displayName = 'Textarea';

export default Textarea;
